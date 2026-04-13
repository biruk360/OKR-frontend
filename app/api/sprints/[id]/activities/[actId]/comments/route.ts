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

/** List comments on a sprint activity (chronological). */
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

  const comments = await prisma.sprintActivityComment.findMany({
    where: { activityId: actId },
    include: { author: { select: { id: true, name: true, avatar: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return apiSuccess(comments)
})

/** Create a comment. */
export const POST = withAuth<ActParams>(async (request: NextRequest, { session, params }) => {
  const { id: sprintId, actId } = await resolveParams(params)
  if (!sprintId || !actId) return apiBadRequest('Invalid id')

  const body = await request.json()
  const content = (body.content || '').trim()
  if (!content) return apiBadRequest('Comment content is required')
  if (content.length > 10000) return apiBadRequest('Comment is too long')

  const activity = await prisma.sprintActivity.findUnique({
    where: { id: actId },
    select: { sprintId: true },
  })
  if (!activity || activity.sprintId !== sprintId) {
    return apiNotFound('Activity not found')
  }

  const comment = await prisma.sprintActivityComment.create({
    data: { activityId: actId, authorId: session.user.id, content },
    include: { author: { select: { id: true, name: true, avatar: true } } },
  })
  return apiSuccess(comment, { status: 201 })
})
