import { apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { canManageCycles, openReviewCycle } from '@/lib/performance'
import { emit } from '@/lib/notifications/dispatcher'
import { recordActivity } from '@/lib/activity-log'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canManageCycles(actor, 'button.performance.cycle.open')) return apiForbidden('You do not have permission to open review cycles')
  const { id } = await resolveParams(params)
  const cycle = await prisma.reviewCycle.findUnique({ where: { id }, select: { id: true, name: true } })
  if (!cycle) return apiNotFound('Review cycle not found')
  const result = await openReviewCycle(id)

  if (!result.alreadyOpen) {
    await recordActivity({
      entityType: 'REVIEW_CYCLE',
      action: 'CYCLE_OPENED',
      actorId: session.user.id,
      metadata: { cycleId: id, cycleName: cycle.name, createdEvaluations: result.createdEvaluations, issueCount: result.issueCount },
    })
    // Notify each evaluator once, with their own assignment count.
    const assignments = await prisma.evaluatorAssignment.findMany({
      where: { evaluation: { cycleId: id } },
      select: { evaluatorId: true },
    })
    const countByEvaluator = new Map<string, number>()
    for (const assignment of assignments) {
      countByEvaluator.set(assignment.evaluatorId, (countByEvaluator.get(assignment.evaluatorId) ?? 0) + 1)
    }
    for (const [evaluatorId, evaluationCount] of Array.from(countByEvaluator.entries())) {
      await emit('PERF_CYCLE_OPENED', {
        actorId: session.user.id,
        explicitRecipients: [evaluatorId],
        data: { cycleName: cycle.name, evaluationCount },
      })
    }
  }
  return apiSuccess(result, { message: result.alreadyOpen ? 'Cycle was already open' : 'Cycle opened' })
})
