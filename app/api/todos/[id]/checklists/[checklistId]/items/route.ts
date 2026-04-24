import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, withAuth } from '@/lib/api'

type Params = { id: string; checklistId: string }

export const POST = withAuth<Params>(async (request: NextRequest, { params }) => {
  const { checklistId } = await resolveParams(params)
  if (!checklistId) return apiBadRequest('Invalid checklist id')
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
