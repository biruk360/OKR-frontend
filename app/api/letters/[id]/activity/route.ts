import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  withAuth,
} from '@/lib/api'

// Match the response shape consumed by components/shared/ActivityLogPanel:
//   { data: { logs: [...], views: [...] } }
export const GET = withAuth<RouteIdParams>(async (_req, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')

  const letter = await prisma.letter.findUnique({ where: { id }, select: { id: true } })
  if (!letter) return apiNotFound('Not found')

  const logs = await prisma.activityLog.findMany({
    where: { letterId: id },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { actor: { select: { id: true, name: true, avatar: true } } },
  })

  return apiSuccess({ logs, views: [] })
})
