import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/api'
import { apiSuccess, apiBadRequest, apiForbidden, apiError, apiNotFound } from '@/lib/api/apiResponse'
import { getAiOrgConfig, AI_PROVIDERS, type AiProviderId } from '@/lib/ai/config'
import { isDailyCapReached } from '@/lib/ai/generation-log'
import { runSprintPlanPipeline } from '@/lib/ai/pipeline'
import { ProviderCallError, ProviderNotConfiguredError } from '@/lib/ai/providers'
import { InvalidScopeError } from '@/lib/ai/context-bundler'
import { AI_FEATURE_KEYS } from '@/lib/ai/config'
import type { UserRole } from '@/types'
import { prisma } from '@/lib/prisma'

const BodyZ = z.object({
  subjectUserId: z.string().min(1),
  /** The existing team sprint to attach proposed todos to. The sprint must be in PLANNING. */
  sprintId: z.string().min(1),
  mode: z.enum(['AUTO', 'MANUAL']).default('AUTO'),
  objectiveIds: z.array(z.string()).optional(),
  keyResultIds: z.array(z.string()).optional(),
  feedback: z.string().max(2000).optional(),
  provider: z.enum(AI_PROVIDERS).optional(),
})

/**
 * POST /api/sprints/ai/generate
 *
 * Body: { subjectUserId, sprintId, mode, objectiveIds?, keyResultIds?, feedback?, provider? }
 *
 * The target sprint must already exist in PLANNING state with startDate/endDate
 * set — the AI no longer creates the sprint. Use this to fill an existing team
 * sprint with AI-proposed todos for a specific user; one team sprint can have
 * multiple plans (one per subjectUserId).
 *
 * Returns the AiSprintPlan id, the proposed todos created (so the review screen
 * can fetch them), and the carryover out-of-scope warning array (MANUAL mode).
 *
 * Idempotency: a duplicate call with the same (subjectUserId, sprintId) and an
 * existing DRAFT plan returns the existing plan instead of regenerating.
 */
export const POST = withAuth(async (req: NextRequest, { session }) => {
  const cfg = await getAiOrgConfig()
  if (!cfg.enabled) return apiNotFound('AI Sprint Planning is not enabled for this organization')

  const body = await req.json().catch(() => ({}))
  const parsed = BodyZ.safeParse(body)
  if (!parsed.success) {
    return apiBadRequest('Invalid request body', parsed.error.flatten())
  }
  const data = parsed.data
  const provider: AiProviderId = data.provider ?? cfg.preferredProvider

  // RBAC: subject is self for EMPLOYEE, member of led dept for DEPT_LEAD, anyone for ADMIN/EXEC.
  const requesterRole = session.user.role as UserRole
  const requesterId = session.user.id
  if (data.subjectUserId !== requesterId) {
    if (requesterRole === 'EMPLOYEE') {
      return apiForbidden('Employees can only generate sprints for themselves')
    }
    if (requesterRole === 'DEPARTMENT_LEAD') {
      const sharesDept = await leadsSubjectDepartment(requesterId, data.subjectUserId)
      if (!sharesDept) return apiForbidden('Subject is not in your department')
    }
  }

  // Cap check.
  const cap = await isDailyCapReached(AI_FEATURE_KEYS.SPRINT_PLAN)
  if (cap.reached) {
    return apiError(`Daily AI generation cap reached (${cap.used}/${cap.cap})`, {
      status: 429,
      code: 'CAP_REACHED',
      details: cap,
    })
  }

  // MANUAL requires non-empty keyResultIds.
  if (data.mode === 'MANUAL' && (!data.keyResultIds || data.keyResultIds.length === 0)) {
    return apiBadRequest('MANUAL mode requires non-empty keyResultIds[]')
  }

  // Sprint must exist and be PLANNING with dates.
  const targetSprint = await prisma.sprint.findUnique({
    where: { id: data.sprintId },
    select: { id: true, state: true, startDate: true, endDate: true },
  })
  if (!targetSprint) return apiNotFound('Sprint not found')
  if (targetSprint.state !== 'PLANNING') {
    return apiBadRequest('AI generation only allowed on sprints in PLANNING state')
  }
  if (!targetSprint.startDate || !targetSprint.endDate) {
    return apiBadRequest('Sprint must have start and end dates set before AI generation')
  }

  // Idempotency — same (subject, sprint) with an open DRAFT returns it.
  const existing = await prisma.aiSprintPlan.findFirst({
    where: {
      sprintId: data.sprintId,
      subjectUserId: data.subjectUserId,
      status: 'DRAFT',
    },
  })
  if (existing) {
    return apiSuccess({ planId: existing.id, sprintId: existing.sprintId, deduped: true })
  }

  // Run pipeline — bundle → math → carryover → AI → persist.
  try {
    const result = await runSprintPlanPipeline({
      subjectUserId: data.subjectUserId,
      requester: { userId: requesterId, role: requesterRole as 'ADMIN' | 'EXECUTIVE' | 'DEPARTMENT_LEAD' | 'EMPLOYEE' },
      mode: data.mode,
      objectiveIds: data.objectiveIds,
      keyResultIds: data.keyResultIds,
      sprintId: data.sprintId,
      feedback: data.feedback ?? null,
      provider,
    })
    return apiSuccess({
      planId: result.planId,
      sprintId: result.sprintId,
      proposedTodoIds: result.proposedTodoIds,
      outOfScopeCarryover: result.outOfScopeCarryover,
      provider: result.provider,
      modelId: result.modelId,
      mode: data.mode,
    })
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return apiError(`Provider not configured: ${err.provider}`, {
        status: 503,
        code: 'PROVIDER_NOT_CONFIGURED',
        details: { provider: err.provider },
      })
    }
    if (err instanceof ProviderCallError) {
      return apiError(err.message, {
        status: 502,
        code: 'PROVIDER_CALL_FAILED',
        details: { provider: err.provider, modelId: err.modelId },
      })
    }
    if (err instanceof InvalidScopeError) {
      return apiForbidden(`Invalid scope: ${err.invalidIds.join(', ')}`)
    }
    throw err
  }
})

async function leadsSubjectDepartment(leadUserId: string, subjectUserId: string): Promise<boolean> {
  const leadDeptIds = await prisma.departmentMembership.findMany({
    where: { userId: leadUserId, role: 'HEAD', endedAt: null },
    select: { departmentId: true },
  })
  if (!leadDeptIds.length) return false
  const ids = leadDeptIds.map((d) => d.departmentId)
  const overlap = await prisma.departmentMembership.findFirst({
    where: { userId: subjectUserId, departmentId: { in: ids }, endedAt: null },
    select: { id: true },
  })
  return Boolean(overlap)
}
