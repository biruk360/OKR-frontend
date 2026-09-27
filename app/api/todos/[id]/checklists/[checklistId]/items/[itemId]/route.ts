import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiNotFound, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { checklistItemBelongsToTodo, todoWriteGuard } from '@/lib/todos/access'

type Params = { id: string; checklistId: string; itemId: string }

/**
 * Shared preamble: the item must belong to the checklist and card in the URL
 * (404), then the card guard applies (404 / 403 canWriteTodo / 409 SPRINT_CLOSED).
 */
async function guardItem(
  todoId: string,
  checklistId: string,
  itemId: string,
  actor: { id: string; role: string },
) {
  const item = await prisma.todoChecklistItem.findFirst({
    where: { id: itemId, checklistId, checklist: { todoId } },
    select: { id: true, completed: true, checklistId: true, checklist: { select: { todoId: true } } },
  })
  if (!checklistItemBelongsToTodo(item, todoId, checklistId)) {
    return { denied: apiNotFound('Item not found'), item: null }
  }
  const denied = await todoWriteGuard(todoId, actor)
  return { denied, item }
}

export const PATCH = withAuth<Params>(async (request: NextRequest, { session, params }) => {
  const { id: todoId, checklistId, itemId } = await resolveParams(params)
  if (!todoId || !checklistId || !itemId) return apiBadRequest('Invalid item id')

  const { denied, item } = await guardItem(todoId, checklistId, itemId, session.user)
  if (denied) return denied
  if (!item) return apiNotFound('Item not found')

  const { title, completed, assigneeId, dueDate } = await request.json()

  const updated = await prisma.todoChecklistItem.update({
    where: { id: itemId },
    data: {
      ...(title !== undefined && { title }),
      ...(completed !== undefined && {
        completed,
        completedAt: completed ? new Date() : null,
      }),
      ...(assigneeId !== undefined && { assigneeId: assigneeId || null }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
    },
    include: { assignee: { select: { id: true, name: true, avatar: true } } },
  })

  if (completed !== undefined && completed !== item.completed) {
    await recordActivity({
      entityType: 'TODO', todoId, action: 'INITIATIVE_CHECKLIST_ITEM_TOGGLED',
      actorId: session.user.id,
      metadata: { itemId, title: updated.title, completed },
    })
  }

  return apiSuccess(updated)
})

export const DELETE = withAuth<Params>(async (_req, { session, params }) => {
  const { id: todoId, checklistId, itemId } = await resolveParams(params)
  if (!todoId || !checklistId || !itemId) return apiBadRequest('Invalid item id')

  const { denied } = await guardItem(todoId, checklistId, itemId, session.user)
  if (denied) return denied

  await prisma.todoChecklistItem.delete({ where: { id: itemId } })
  return apiSuccess(null)
})
