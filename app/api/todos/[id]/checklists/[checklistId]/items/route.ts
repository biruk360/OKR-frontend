import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiNotFound, withAuth } from '@/lib/api'
import { checklistBelongsToTodo, todoWriteGuard } from '@/lib/todos/access'

type Params = { id: string; checklistId: string }

/**
 * POST — the checklist must belong to the card in the URL (404), then
 * 404 / 403 canWriteTodo / 409 SPRINT_CLOSED via todoWriteGuard.
 */
export const POST = withAuth<Params>(async (request: NextRequest, { session, params }) => {
  const { id: todoId, checklistId } = await resolveParams(params)
  if (!todoId || !checklistId) return apiBadRequest('Invalid checklist id')

  const checklist = await prisma.todoChecklist.findFirst({
    where: { id: checklistId, todoId },
    select: { id: true, todoId: true },
  })
  if (!checklistBelongsToTodo(checklist, todoId)) return apiNotFound('Checklist not found')

  const denied = await todoWriteGuard(todoId, session.user)
  if (denied) return denied

  const { title, assigneeId, dueDate } = await request.json()
  if (!title?.trim()) return apiBadRequest('Title required')

  const count = await prisma.todoChecklistItem.count({ where: { checklistId } })
  const item = await prisma.todoChecklistItem.create({
    data: {
      checklistId,
      title,
      position: count,
      ...(assigneeId && { assigneeId }),
      ...(dueDate && { dueDate: new Date(dueDate) }),
    },
    include: { assignee: { select: { id: true, name: true, avatar: true } } },
  })
  return apiSuccess(item, { status: 201 })
})
