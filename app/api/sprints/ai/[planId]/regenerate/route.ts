import { withAuth } from '@/lib/api'
import { apiSuccess, apiNotFound, apiForbidden, apiBadRequest, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import type { UserRole } from '@/types'
import { getAiOrgConfig, AI_PROVIDERS, type AiProviderId } from '@/lib/ai/config'
import { runSprintPlanPipeline } from '@/lib/ai/pipeline'
import { ProviderCallError, ProviderNotConfiguredError } from '@/lib/ai/providers'
import { InvalidScopeError } from '@/lib/ai/context-bundler'

const BodyZ = z.object({
  feedback: z.string().min(1).max(2000),
  provider: z.enum(AI_PROVIDERS).optional(),
})

/**
 * POST /api/sprints/ai/:planId/regenerate
 *
 * Marks the existing DRAFT plan SUPERSEDED, removes its draft sprint + AI todos,
 * and re-runs the pipeline with the user's feedback baked into the prompt.
 * Same idempotency key (subject, startDate) so a refresh-bug doesn't double-spend.
 */
export const POST = withAuth(async (req, { session, params }) => {
  const cfg = await getAiOrgConfig()
  if (!cfg.enabled) return apiNotFound('AI Sprint Planning is not enabled for this organization')
  const planId = (params as { planId?: string }).planId
  if (!planId) return apiNotFound('Plan id required')

  const body = await req.json().catch(() => ({}))
  const parsed = BodyZ.safeParse(body)
  if (!parsed.success) return apiBadRequest('Invalid body', parsed.error.flatten())

  const plan = await prisma.aiSprintPlan.findUnique({
    where: { id: planId },
    include: { sprint: true },
  })
  if (!plan) return apiNotFound('Plan not found')
  if (plan.status !== 'DRAFT') return apiBadRequest(`Plan is in state ${plan.status}; cannot regenerate`)

  const role = session.user.role as UserRole
  const requesterId = session.user.id
  if (
    requesterId !== plan.subjectUserId &&
    requesterId !== plan.generatedById &&
    role !== 'ADMIN' &&
    role !== 'EXECUTIVE'
  ) {
    return apiForbidden('Not your plan')
  }

  const startDate = plan.sprint.startDate ?? new Date()
  const endDate = plan.sprint.endDate ?? new Date(startDate.getTime() + 14 * 86400000)
  const durationDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000))

  // Mark old plan superseded, drop its draft sprint + AI todos, detach carryover.
  await prisma.$transaction(async (tx) => {
    await tx.todo.updateMany({
      where: { sprintId: plan.sprintId, aiSuggested: false },
      data: { sprintId: null, carryoverDisposition: null },
    })
    await tx.todo.deleteMany({ where: { sprintId: plan.sprintId, aiSuggested: true } })
    await tx.aiSprintPlan.update({ where: { id: plan.id }, data: { status: 'SUPERSEDED' } })
    await tx.sprint.delete({ where: { id: plan.sprintId } })
  })

  const provider: AiProviderId = parsed.data.provider ?? (plan.provider as AiProviderId)
  try {
    const result = await runSprintPlanPipeline({
      subjectUserId: plan.subjectUserId!,
      requester: { userId: requesterId, role: role as 'ADMIN' | 'EXECUTIVE' | 'DEPARTMENT_LEAD' | 'EMPLOYEE' },
      // Regenerate always uses AUTO scope today — manual would require persisting the original
      // ids on the plan row, which we don't yet. Follow-up.
      mode: 'AUTO',
      startDate,
      durationDays,
      feedback: parsed.data.feedback,
      provider,
    })
    return apiSuccess({ planId: result.planId, sprintId: result.sprintId, supersededPlanId: plan.id })
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return apiError(`Provider not configured: ${err.provider}`, {
        status: 503,
        code: 'PROVIDER_NOT_CONFIGURED',
      })
    }
    if (err instanceof ProviderCallError) {
      return apiError(err.message, { status: 502, code: 'PROVIDER_CALL_FAILED' })
    }
    if (err instanceof InvalidScopeError) {
      return apiForbidden(`Invalid scope: ${err.invalidIds.join(', ')}`)
    }
    throw err
  }
})
