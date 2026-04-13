import { prisma } from '@/lib/prisma'
import { canViewKeyResult } from '@/lib/permissions'
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
  if (!id) return apiBadRequest('Invalid key result id')

  const keyResult = await prisma.keyResult.findUnique({
    where: { id },
    select: { id: true, ownerId: true, objectiveId: true, isPrivate: true },
  })
  if (!keyResult) return apiNotFound('Not found')

  const visibility = await canViewKeyResult(session.user.role as any, session.user.id, keyResult)
  if (!visibility.canView) return apiForbidden('Access denied')

  const [logs, views] = await Promise.all([
    prisma.activityLog.findMany({
      where: { keyResultId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { actor: { select: { id: true, name: true, avatar: true } } },
    }),
    prisma.keyResultView.findMany({
      where: { keyResultId: id },
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
