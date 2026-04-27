import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiNotFound, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'

type Params = { id: string; checklistId: string; itemId: string }

export const PATCH = withAuth<Params>(async (request: NextRequest, { session, params }) => {
  const { id: todoId, itemId } = await resolveParams(params)
  if (!itemId) return apiBadRequest('Invalid item id')
  const { title, completed, assigneeId, dueDate } = await request.json()

  const item = await prisma.todoChecklistItem.findUnique({ where: { id: itemId } })
  if (!item) return apiNotFound('Item not found')

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

  if (todoId && completed !== undefined && completed !== item.completed) {
    await recordActivity({
      entityType: 'TODO', todoId, action: 'INITIATIVE_CHECKLIST_ITEM_TOGGLED',
      actorId: session.user.id,
      metadata: { itemId, title: updated.title, completed },
    })
  }

  return apiSuccess(updated)
})

export const DELETE = withAuth<Params>(async (_req, { params }) => {
  const { itemId } = await resolveParams(params)
  if (!itemId) return apiBadRequest('Invalid item id')
  await prisma.todoChecklistItem.delete({ where: { id: itemId } })
  return apiSuccess(null)
})
