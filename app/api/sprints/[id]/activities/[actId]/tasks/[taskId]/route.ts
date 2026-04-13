import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  withAuth,
} from '@/lib/api'

type TaskParams =
  | { id: string; actId: string; taskId: string }
  | Promise<{ id: string; actId: string; taskId: string }>

export const PATCH = withAuth<TaskParams>(async (request: NextRequest, { params }) => {
  const { actId, taskId } = await resolveParams(params)
  if (!actId || !taskId) return apiBadRequest('Invalid id')

  const existing = await prisma.sprintActivityTask.findUnique({
    where: { id: taskId },
    select: { activityId: true, status: true },
  })
  if (!existing || existing.activityId !== actId) {
    return apiNotFound('Task not found')
  }

  const body = await request.json()
  const data: any = {}
  if (typeof body.title === 'string') data.title = body.title.trim()
  if (body.assigneeId === null) data.assigneeId = null
  else if (typeof body.assigneeId === 'string') {
    const user = await prisma.user.findUnique({ where: { id: body.assigneeId }, select: { id: true } })
    if (!user) return apiBadRequest('Invalid assignee')
    data.assigneeId = user.id
  }
  if (typeof body.status === 'string') {
    if (body.status !== 'PENDING' && body.status !== 'COMPLETED') {
      return apiBadRequest('Invalid status')
    }
    data.status = body.status
    data.completedAt = body.status === 'COMPLETED' ? new Date() : null
  }
  if (typeof body.position === 'number') data.position = body.position

  const task = await prisma.sprintActivityTask.update({
    where: { id: taskId },
    data,
    include: { assignee: { select: { id: true, name: true, avatar: true } } },
  })
  return apiSuccess(task)
})

export const DELETE = withAuth<TaskParams>(async (_request, { params }) => {
  const { actId, taskId } = await resolveParams(params)
  if (!actId || !taskId) return apiBadRequest('Invalid id')

  const existing = await prisma.sprintActivityTask.findUnique({
    where: { id: taskId },
    select: { activityId: true },
  })
  if (!existing || existing.activityId !== actId) {
    return apiNotFound('Task not found')
  }

  await prisma.sprintActivityTask.delete({ where: { id: taskId } })
  return apiSuccess(null)
})
