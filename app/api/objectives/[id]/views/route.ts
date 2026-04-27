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

  // Skip self-view spam — owner viewing their own objective shouldn't be logged.
  if (objective.ownerId === session.user.id) return apiSuccess(null)

  await trackObjectiveView(id, session.user.id)
  return apiSuccess(null)
})

/** GET — list of viewers for the Viewers tab, ordered by lastViewAt desc, limit 50. */
export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid objective id')

  const objective = await prisma.objective.findUnique({
    where: { id },
    select: { id: true, level: true, ownerId: true, departmentId: true, isPrivate: true },
  })
  if (!objective) return apiNotFound('Not found')

  const visibility = await canViewObjective(session.user.role as any, session.user.id, objective)
  if (!visibility.canView) return apiForbidden('Access denied')

  // Aggregate per-day view rows into per-user totals.
  const rows = await prisma.objectiveView.findMany({
    where: { objectiveId: id },
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
