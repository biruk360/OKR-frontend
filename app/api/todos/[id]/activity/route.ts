import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, withAuth } from '@/lib/api'
import { todoReadGuard } from '@/lib/todos/access'

/**
 * GET — the card's activity log. Card read rule (`canReadTodo`); a card the
 * caller cannot read answers 404 exactly like a missing one.
 */
export const GET = withAuth<RouteIdParams>(async (_req, { session, params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')

  const denied = await todoReadGuard(todoId, session.user)
  if (denied) return denied

  const logs = await prisma.activityLog.findMany({
    where: { entityType: 'TODO', todoId },
    orderBy: { createdAt: 'desc' },
    include: { actor: { select: { id: true, name: true, avatar: true } } },
    take: 200,
  })
  return apiSuccess(logs)
})
