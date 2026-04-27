import { prisma } from '@/lib/prisma'
import { canViewKeyResult } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { trackKeyResultView } from '@/lib/view-tracking'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid key result id')

  const keyResult = await prisma.keyResult.findUnique({
    where: { id },
    select: { id: true, ownerId: true, objectiveId: true, isPrivate: true },
  })
  if (!keyResult) return apiNotFound('Not found')

  const visibility = await canViewKeyResult(session.user.role as any, session.user.id, keyResult)
  if (!visibility.canView) return apiForbidden('Access denied')

  // Skip self-view — KR owner viewing their own KR shouldn't be logged.
  if (keyResult.ownerId === session.user.id) return apiSuccess(null)

  await trackKeyResultView(id, session.user.id)
  return apiSuccess(null)
})

/** GET — list of viewers for this KR, ordered by lastViewAt desc, limit 50. */
export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid key result id')

  const keyResult = await prisma.keyResult.findUnique({
    where: { id },
    select: { id: true, ownerId: true, objectiveId: true, isPrivate: true },
  })
  if (!keyResult) return apiNotFound('Not found')

  const visibility = await canViewKeyResult(session.user.role as any, session.user.id, keyResult)
  if (!visibility.canView) return apiForbidden('Access denied')

  const rows = await prisma.keyResultView.findMany({
    where: { keyResultId: id },
    orderBy: { lastViewAt: 'desc' },
    take: 200,
    include: { user: { select: { id: true, name: true, avatar: true } } },
  })

  const byUser = new Map<string, { id: string; name: string; avatar: string | null; viewedAt: Date; viewCount: number }>()
  for (const r of rows) {
    const existing = byUser.get(r.userId)
    if (existing) {
      existing.viewCount += r.viewCount
      if (r.lastViewAt > existing.viewedAt) existing.viewedAt = r.lastViewAt
    } else {
      byUser.set(r.userId, {
        id: r.user.id,
        name: r.user.name,
        avatar: r.user.avatar ?? null,
        viewedAt: r.lastViewAt,
        viewCount: r.viewCount,
      })
    }
  }

  const viewers = Array.from(byUser.values())
    .sort((a, b) => b.viewedAt.getTime() - a.viewedAt.getTime())
    .slice(0, 50)
  return apiSuccess(viewers)
})
