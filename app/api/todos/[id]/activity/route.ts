import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiNotFound, withAuth } from '@/lib/api'

export const GET = withAuth<RouteIdParams>(async (_req, { params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')

  const todo = await prisma.todo.findUnique({ where: { id: todoId }, select: { id: true } })
  if (!todo) return apiNotFound('To-do not found')

  const logs = await prisma.activityLog.findMany({
    where: { entityType: 'TODO', todoId },
    orderBy: { createdAt: 'desc' },
    include: { actor: { select: { id: true, name: true, avatar: true } } },
    take: 200,
  })
  return apiSuccess(logs)
})
