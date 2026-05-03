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
  startDate: z.string(),
  durationDays: z.number().int().min(7).max(28).default(14),
  mode: z.enum(['AUTO', 'MANUAL']).default('AUTO'),
  objectiveIds: z.array(z.string()).optional(),
  keyResultIds: z.array(z.string()).optional(),
  feedback: z.string().max(2000).optional(),
  provider: z.enum(AI_PROVIDERS).optional(),
})

/**
 * POST /api/sprints/ai/generate
 *
 * Body: { subjectUserId, startDate (ISO), durationDays, mode, objectiveIds?,
 *         keyResultIds?, feedback?, provider? }
 *
 * Returns the persisted draft sprint + AiSprintPlan id, the proposed todos
 * created (so the review screen can immediately fetch them), and the carryover
 * out-of-scope warning array (MANUAL mode only).
 *
 * Idempotency: a duplicate call with the same (subjectUserId, startDate) and an
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

  // Idempotency — same (subject, startDate) returning DRAFT plan.
  const startDate = new Date(data.startDate)
  if (Number.isNaN(startDate.getTime())) return apiBadRequest('startDate is not a valid ISO date')
  const existing = await prisma.aiSprintPlan.findFirst({
    where: {
      subjectUserId: data.subjectUserId,
      status: 'DRAFT',
      sprint: { startDate },
    },
    include: { sprint: { select: { id: true } } },
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
      startDate,
      durationDays: data.durationDays,
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
