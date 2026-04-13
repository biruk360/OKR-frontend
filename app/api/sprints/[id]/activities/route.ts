import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, withAuth } from '@/lib/api'

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id: sprintId } = await resolveParams(params)
  if (!sprintId) return apiBadRequest('Invalid sprint id')

  const body = await request.json()
  const title = (body.title || '').trim()
  if (!title) return apiBadRequest('Activity title is required')

  const columnId: string | undefined = body.columnId
  if (!columnId) return apiBadRequest('Column is required')

  const column = await prisma.sprintColumn.findUnique({
    where: { id: columnId },
    select: { sprintId: true },
  })
  if (!column || column.sprintId !== sprintId) {
    return apiBadRequest('Invalid column for this sprint')
  }

  const ownerId: string = body.ownerId || session.user.id
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } })
  if (!owner) return apiBadRequest('Invalid owner')

  let keyResultId: string | null = null
  if (body.keyResultId) {
    const kr = await prisma.keyResult.findUnique({ where: { id: body.keyResultId }, select: { id: true } })
    if (!kr) return apiBadRequest('Invalid key result link')
    keyResultId = kr.id
  }

  let objectiveId: string | null = null
  if (body.objectiveId) {
    const obj = await prisma.objective.findUnique({ where: { id: body.objectiveId }, select: { id: true } })
    if (!obj) return apiBadRequest('Invalid objective link')
    objectiveId = obj.id
  }

  const last = await prisma.sprintActivity.findFirst({
    where: { sprintId, columnId },
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  const position = (last?.position ?? -1) + 1

  const activity = await prisma.sprintActivity.create({
    data: {
      sprintId,
      columnId,
      title,
      description: body.description?.trim() || null,
      ownerId,
      keyResultId,
      objectiveId,
      position,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
    },
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      keyResult: { select: { id: true, title: true, objective: { select: { id: true, title: true } } } },
      objective: { select: { id: true, title: true } },
    },
  })

  return apiSuccess(activity, { status: 201 })
})
