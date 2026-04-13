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

  const parsed = logs.map((log) => ({
    ...log,
    changes: log.changes ? safeParse(log.changes) : null,
    metadata: log.metadata ? safeParse(log.metadata) : null,
  }))

  return apiSuccess({ logs: parsed, views })
})

function safeParse(s: string): unknown {
  try { return JSON.parse(s) } catch { return s }
}
