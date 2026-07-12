import type { NextRequest } from 'next/server'
import { apiBadRequest, apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { canFinalizeEvaluation, finalizeEvaluation, isPerformanceAdmin, resolvePerformanceAdmins } from '@/lib/performance'
import { emit } from '@/lib/notifications/dispatcher'
import { recordActivity } from '@/lib/activity-log'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canFinalizeEvaluation(actor, id)) return apiForbidden('You do not have permission to finalize this evaluation')
  const body = await request.json().catch(() => ({}))
  const overrideReason = typeof body.overrideReason === 'string' ? body.overrideReason.trim() : ''
  if (overrideReason && !await isPerformanceAdmin(actor)) {
    return apiForbidden('Only a performance administrator can override employee acknowledgement')
  }
  try {
    const evaluation = await finalizeEvaluation(id, session.user.id, overrideReason || undefined)
    const [actions, detail] = await Promise.all([
      prisma.developmentAction.findMany({
        where: { evaluationId: id, status: 'RECOMMENDED' },
        select: { type: true },
      }),
      prisma.evaluation.findUnique({
        where: { id },
        select: { employee: { select: { name: true } }, cycle: { select: { name: true } } },
      }),
    ])
    await recordActivity({
      entityType: 'EVALUATION',
      evaluationId: id,
      action: 'EVALUATION_FINALIZED',
      actorId: session.user.id,
      metadata: {
        overrideReason: overrideReason || null,
        recommendedActionTypes: actions.map((action) => action.type),
      },
    })
    if (actions.length > 0 && detail) {
      await emit('PERF_ACTION_RECOMMENDED', {
        actorId: session.user.id,
        explicitRecipients: await resolvePerformanceAdmins(),
        data: {
          evaluationId: id,
          employeeName: detail.employee.name,
          cycleName: detail.cycle.name,
          actionCount: actions.length,
          actionTypes: actions.map((action) => action.type).join(', '),
        },
      })
    }
    return apiSuccess(evaluation)
  } catch (error) {
    return apiBadRequest(error instanceof Error ? error.message : 'Evaluation could not be finalized')
  }
})
