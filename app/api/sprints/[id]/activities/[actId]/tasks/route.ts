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

export const GET = withAuth<ActParams>(async (_request, { params }) => {
  const { id: sprintId, actId } = await resolveParams(params)
  if (!sprintId || !actId) return apiBadRequest('Invalid id')

  const activity = await prisma.sprintActivity.findUnique({
    where: { id: actId },
    select: { sprintId: true },
  })
  if (!activity || activity.sprintId !== sprintId) {
    return apiNotFound('Activity not found')
  }

  const tasks = await prisma.sprintActivityTask.findMany({
    where: { activityId: actId },
    include: { assignee: { select: { id: true, name: true, avatar: true } } },
    orderBy: { position: 'asc' },
  })
  return apiSuccess(tasks)
})

export const POST = withAuth<ActParams>(async (request: NextRequest, { params }) => {
  const { id: sprintId, actId } = await resolveParams(params)
  if (!sprintId || !actId) return apiBadRequest('Invalid id')

  const body = await request.json()
  const title = (body.title || '').trim()
  if (!title) return apiBadRequest('Task title is required')

  const activity = await prisma.sprintActivity.findUnique({
    where: { id: actId },
    select: { sprintId: true },
  })
  if (!activity || activity.sprintId !== sprintId) {
    return apiNotFound('Activity not found')
  }

  let assigneeId: string | null = null
  if (body.assigneeId) {
    const user = await prisma.user.findUnique({ where: { id: body.assigneeId }, select: { id: true } })
    if (!user) return apiBadRequest('Invalid assignee')
    assigneeId = user.id
  }

  const last = await prisma.sprintActivityTask.findFirst({
    where: { activityId: actId },
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  const position = (last?.position ?? -1) + 1

  const task = await prisma.sprintActivityTask.create({
    data: { activityId: actId, title, assigneeId, position },
    include: { assignee: { select: { id: true, name: true, avatar: true } } },
  })
  return apiSuccess(task, { status: 201 })
})
