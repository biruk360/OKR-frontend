import type { NextRequest } from 'next/server'
import { apiBadRequest, apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import { canFinalizeEvaluation, finalizeEvaluation, isPerformanceAdmin } from '@/lib/performance'
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
    return apiSuccess(evaluation)
  } catch (error) {
    return apiBadRequest(error instanceof Error ? error.message : 'Evaluation could not be finalized')
  }
})
