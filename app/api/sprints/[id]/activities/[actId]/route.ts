import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  withAuth,
} from '@/lib/api'

type ActParams = { id: string; actId: string } | Promise<{ id: string; actId: string }>

export const PATCH = withAuth<ActParams>(async (request: NextRequest, { params }) => {
  const { id: sprintId, actId } = await resolveParams(params)
  if (!sprintId || !actId) return apiBadRequest('Invalid id')

  const body = await request.json()

  const existing = await prisma.sprintActivity.findUnique({
    where: { id: actId },
    select: { sprintId: true, columnId: true, position: true },
  })
  if (!existing || existing.sprintId !== sprintId) {
    return apiNotFound('Activity not found')
  }

  const data: any = {}
  if (typeof body.title === 'string') data.title = body.title.trim()
  if (typeof body.description === 'string' || body.description === null) data.description = body.description
  if (typeof body.ownerId === 'string') data.ownerId = body.ownerId
  if (body.keyResultId === null) data.keyResultId = null
  else if (typeof body.keyResultId === 'string') data.keyResultId = body.keyResultId
  if (body.objectiveId === null) data.objectiveId = null
  else if (typeof body.objectiveId === 'string') data.objectiveId = body.objectiveId
  if (body.dueDate === null) data.dueDate = null
  else if (typeof body.dueDate === 'string') data.dueDate = new Date(body.dueDate)

  // Move support: { columnId, position }
  if (typeof body.columnId === 'string') {
    const col = await prisma.sprintColumn.findUnique({
      where: { id: body.columnId },
      select: { sprintId: true },
    })
    if (!col || col.sprintId !== sprintId) {
      return apiBadRequest('Invalid column for this sprint')
    }
    data.columnId = body.columnId
  }
  if (typeof body.position === 'number') {
    data.position = body.position
  }

  const activity = await prisma.sprintActivity.update({
    where: { id: actId },
    data,
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      keyResult: { select: { id: true, title: true, objective: { select: { id: true, title: true } } } },
      objective: { select: { id: true, title: true } },
    },
  })

  return apiSuccess(activity)
})

export const DELETE = withAuth<ActParams>(async (_request, { params }) => {
  const { id: sprintId, actId } = await resolveParams(params)
  if (!sprintId || !actId) return apiBadRequest('Invalid id')

  const existing = await prisma.sprintActivity.findUnique({
    where: { id: actId },
    select: { sprintId: true, ownerId: true },
  })
  if (!existing || existing.sprintId !== sprintId) {
    return apiNotFound('Activity not found')
  }

  await prisma.sprintActivity.delete({ where: { id: actId } })
  return apiSuccess(null)
})
