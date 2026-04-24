import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiNotFound, withAuth } from '@/lib/api'

export const GET = withAuth<RouteIdParams>(async (_req, { params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')
  const todo = await prisma.todo.findUnique({ where: { id: todoId }, select: { id: true } })
  if (!todo) return apiNotFound('To-do not found')

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

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')
  const { title } = await request.json()

  const count = await prisma.todoChecklist.count({ where: { todoId } })
  const checklist = await prisma.todoChecklist.create({
    data: { todoId, title: title || 'Checklist', position: count },
    include: { items: true },
  })
  return apiSuccess(checklist, { status: 201 })
})
