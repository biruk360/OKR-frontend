import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiNotFound, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { canReadTodo, todoWriteGuard } from '@/lib/todos/access'

/**
 * GET — read rule is `canReadTodo`, the same rule GET /api/todos/[id] enforces
 * (the card GET returns these checklists too). Unreadable answers 404.
 */
export const GET = withAuth<RouteIdParams>(async (_req, { session, params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')
  if (!(await canReadTodo(session.user, todoId))) return apiNotFound('To-do not found')

  const checklists = await prisma.todoChecklist.findMany({
    where: { todoId },
    orderBy: { position: 'asc' },
    include: {
      items: {
        orderBy: { position: 'asc' },
        include: { assignee: { select: { id: true, name: true, avatar: true } } },
      },
    },
  })
  return apiSuccess(checklists)
})

/** POST — 404 missing card, 403 without canWriteTodo, 409 SPRINT_CLOSED. */
export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')

  const denied = await todoWriteGuard(todoId, session.user)
  if (denied) return denied

  const { title } = await request.json()

  const count = await prisma.todoChecklist.count({ where: { todoId } })
  const checklist = await prisma.todoChecklist.create({
    data: { todoId, title: title || 'Checklist', position: count },
    include: { items: true },
  })
  await recordActivity({
    entityType: 'TODO', todoId, action: 'INITIATIVE_CHECKLIST_CREATED',
    actorId: session.user.id,
    metadata: { checklistId: checklist.id, title: checklist.title },
  })
  return apiSuccess(checklist, { status: 201 })
})
