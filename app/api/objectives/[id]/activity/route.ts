import { prisma } from '@/lib/prisma'
import { canViewObjective } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'
import { hydrateActivityLogs } from '@/lib/activity-log-hydrate'

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

  const [logs, views] = await Promise.all([
    prisma.activityLog.findMany({
      where: { objectiveId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { actor: { select: { id: true, name: true, avatar: true } } },
    }),
    prisma.objectiveView.findMany({
      where: { objectiveId: id },
      orderBy: { lastViewAt: 'desc' },
      take: 50,
      include: { user: { select: { id: true, name: true, avatar: true } } },
    }),
  ])

  // changes/metadata are JSONB now — Prisma returns parsed objects directly.
  // hydrateActivityLogs replaces reference ids (ownerId, parentObjectiveId, …) with
  // { __ref, label, href } envelopes so the UI can render names + links.
  const hydrated = await hydrateActivityLogs(logs as any)

  return apiSuccess({ logs: hydrated, views })
})
