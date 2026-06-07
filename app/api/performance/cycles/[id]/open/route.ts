import { apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { canManageCycles, openReviewCycle } from '@/lib/performance'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canManageCycles(actor, 'button.performance.cycle.open')) return apiForbidden('You do not have permission to open review cycles')
  const { id } = await resolveParams(params)
  const exists = await prisma.reviewCycle.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return apiNotFound('Review cycle not found')
  const result = await openReviewCycle(id)
  return apiSuccess(result, { message: result.alreadyOpen ? 'Cycle was already open' : 'Cycle opened' })
})
