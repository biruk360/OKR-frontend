import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  withAuth,
} from '@/lib/api'
import { letterReadGuard } from '@/lib/letter-access'

// Match the response shape consumed by components/shared/ActivityLogPanel:
//   { data: { logs: [...], views: [...] } }
export const GET = withAuth<RouteIdParams>(async (_req, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')

  const denied = await letterReadGuard(session.user.id, id)
  if (denied) return denied

  const logs = await prisma.activityLog.findMany({
    where: { letterId: id },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { actor: { select: { id: true, name: true, avatar: true } } },
  })

  return apiSuccess({ logs, views: [] })
})
