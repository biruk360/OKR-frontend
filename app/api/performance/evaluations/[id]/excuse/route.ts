import type { NextRequest } from 'next/server'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { assertEvaluationTransition, isPerformanceAdmin } from '@/lib/performance'
import { recordActivity } from '@/lib/activity-log'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

/**
 * Excuse an evaluation from the current cycle (admin-only). Valid from any
 * non-terminal status per the state machine; records excusedAt/excusedReason
 * and an EVALUATION_EXCUSED audit entry.
 */
export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await isPerformanceAdmin(actor)) return apiForbidden('Only a performance administrator can excuse an evaluation')

  const body = await request.json().catch(() => ({})) as { reason?: unknown }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!reason) return apiBadRequest('A reason is required to excuse an evaluation')

  const evaluation = await prisma.evaluation.findUnique({ where: { id }, select: { status: true } })
  if (!evaluation) return apiNotFound('Evaluation not found')
  try {
    assertEvaluationTransition(evaluation.status, 'EXCUSED')
  } catch (error) {
    return apiBadRequest(error instanceof Error ? error.message : 'Invalid evaluation transition')
  }

  const updated = await prisma.evaluation.update({
    where: { id },
    data: { status: 'EXCUSED', excusedAt: new Date(), excusedReason: reason },
  })
  await recordActivity({
    entityType: 'EVALUATION',
    evaluationId: id,
    action: 'EVALUATION_EXCUSED',
    actorId: session.user.id,
    changes: { status: { from: evaluation.status, to: 'EXCUSED' } },
    metadata: { reason },
  })
  return apiSuccess(updated)
})
