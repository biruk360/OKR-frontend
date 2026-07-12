import { prisma } from '@/lib/prisma'
import { apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { canViewCalibration, isPerformanceAdmin } from '@/lib/performance'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

/**
 * Audit trail for one evaluation. Restricted to performance administrators and
 * lead evaluators with calibration access — regular evaluators and the employee
 * must not see the full trail (it includes other evaluators' actions).
 */
export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  const actor = { userId: session.user.id, role: session.user.role }
  const allowed = await isPerformanceAdmin(actor) || await canViewCalibration(actor, id)
  if (!allowed) return apiForbidden('Evaluation activity is restricted to the lead evaluator and performance administrators')
  const evaluation = await prisma.evaluation.findUnique({ where: { id }, select: { id: true } })
  if (!evaluation) return apiNotFound('Evaluation not found')
  const logs = await prisma.activityLog.findMany({
    where: { evaluationId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { actor: { select: { id: true, name: true, avatar: true } } },
  })
  return apiSuccess(logs)
})
