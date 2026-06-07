import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { assertCycleTransition, canManageCycles } from '@/lib/performance'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canManageCycles(actor, 'button.performance.cycle.close')) return apiForbidden('You do not have permission to close review cycles')
  const { id } = await resolveParams(params)
  const cycle = await prisma.reviewCycle.findUnique({
    where: { id },
    include: { evaluations: { select: { id: true, status: true } } },
  })
  if (!cycle) return apiNotFound('Review cycle not found')
  try {
    assertCycleTransition(cycle.status, 'CLOSED')
  } catch (error) {
    return apiBadRequest(error instanceof Error ? error.message : 'Cycle cannot be closed')
  }
  const incomplete = cycle.evaluations.filter((evaluation) => !['FINALIZED', 'EXCUSED'].includes(evaluation.status))
  const body = await request.json().catch(() => ({}))
  const overrideReason = typeof body.overrideReason === 'string' ? body.overrideReason.trim() : ''
  if (incomplete.length > 0 && !overrideReason) {
    return apiBadRequest('Incomplete evaluations require an override reason', {
      evaluationIds: incomplete.map((evaluation) => evaluation.id),
    })
  }
  const closed = await prisma.reviewCycle.update({
    where: { id },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      closedById: session.user.id,
      closeOverrideReason: overrideReason || null,
    },
  })
  return apiSuccess(closed)
})
