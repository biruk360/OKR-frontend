import { prisma } from '@/lib/prisma'
import { canViewObjective } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { trackObjectiveView } from '@/lib/view-tracking'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

/** POST is fire-and-forget — the client beacons this when an objective detail page mounts. */
export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid objective id')

  const objective = await prisma.objective.findUnique({
    where: { id },
    select: { id: true, level: true, ownerId: true, departmentId: true, isPrivate: true },
  })
  if (!objective) return apiNotFound('Not found')

  const visibility = await canViewObjective(session.user.role as any, session.user.id, objective)
  if (!visibility.canView) return apiForbidden('Access denied')

  await trackObjectiveView(id, session.user.id)
  return apiSuccess(null)
})
