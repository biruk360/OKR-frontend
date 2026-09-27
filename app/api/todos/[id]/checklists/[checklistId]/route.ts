import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiNotFound, withAuth } from '@/lib/api'
import { checklistBelongsToTodo, todoWriteGuard } from '@/lib/todos/access'

type Params = { id: string; checklistId: string }

/**
 * Shared preamble: the checklist must belong to the card in the URL (404),
 * then the card guard applies (404 / 403 canWriteTodo / 409 SPRINT_CLOSED).
 */
async function guardChecklist(todoId: string, checklistId: string, actor: { id: string; role: string }) {
  const checklist = await prisma.todoChecklist.findFirst({
    where: { id: checklistId, todoId },
    select: { id: true, todoId: true },
  })
  if (!checklistBelongsToTodo(checklist, todoId)) return apiNotFound('Checklist not found')
  return todoWriteGuard(todoId, actor)
}

export const PATCH = withAuth<Params>(async (request: NextRequest, { session, params }) => {
  const { id: todoId, checklistId } = await resolveParams(params)
  if (!todoId || !checklistId) return apiBadRequest('Invalid checklist id')

  const denied = await guardChecklist(todoId, checklistId, session.user)
  if (denied) return denied

  const { title } = await request.json()
  const updated = await prisma.todoChecklist.update({
    where: { id: checklistId },
    data: { ...(title !== undefined && { title }) },
    include: { items: { orderBy: { position: 'asc' }, include: { assignee: { select: { id: true, name: true, avatar: true } } } } },
  })
  return apiSuccess(updated)
})

export const DELETE = withAuth<Params>(async (_req, { session, params }) => {
  const { id: todoId, checklistId } = await resolveParams(params)
  if (!todoId || !checklistId) return apiBadRequest('Invalid checklist id')

  const denied = await guardChecklist(todoId, checklistId, session.user)
  if (denied) return denied

  await prisma.todoChecklist.delete({ where: { id: checklistId } })
  return apiSuccess(null)
})
