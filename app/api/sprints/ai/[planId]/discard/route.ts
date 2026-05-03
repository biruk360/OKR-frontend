import { withAuth } from '@/lib/api'
import { apiSuccess, apiNotFound, apiForbidden, apiBadRequest } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'
import { getAiOrgConfig } from '@/lib/ai/config'
import type { UserRole } from '@/types'

/**
 * POST /api/sprints/ai/:planId/discard — drop a draft plan + its draft Sprint
 * + AI-suggested todos. Carryover items belonging to other sprints are NOT
 * deleted (their sprintId pointer is reset).
 */
export const POST = withAuth(async (_req, { session, params }) => {
  const cfg = await getAiOrgConfig()
  if (!cfg.enabled) return apiNotFound('AI Sprint Planning is not enabled for this organization')
  const planId = (params as { planId?: string }).planId
  if (!planId) return apiNotFound('Plan id required')

  const plan = await prisma.aiSprintPlan.findUnique({
    where: { id: planId },
    include: { sprint: { include: { todos: { select: { id: true, aiSuggested: true } } } } },
  })
  if (!plan) return apiNotFound('Plan not found')
  if (plan.status !== 'DRAFT') return apiBadRequest(`Plan is in state ${plan.status}; cannot discard`)

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

  await prisma.$transaction(async (tx) => {
    // Detach carryover items (preserve their data — they can move back to their original sprint).
    await tx.todo.updateMany({
      where: { sprintId: plan.sprintId, aiSuggested: false },
      data: { sprintId: null, carryoverDisposition: null },
    })
    // Delete AI-suggested todos.
    await tx.todo.deleteMany({ where: { sprintId: plan.sprintId, aiSuggested: true } })
    // Mark plan + delete sprint.
    await tx.aiSprintPlan.update({ where: { id: plan.id }, data: { status: 'DISCARDED' } })
    await tx.sprint.delete({ where: { id: plan.sprintId } })
  })

  return apiSuccess({ planId: plan.id, status: 'DISCARDED' })
})
