import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

type CommentParams =
  | { id: string; actId: string; commentId: string }
  | Promise<{ id: string; actId: string; commentId: string }>

export const PATCH = withAuth<CommentParams>(async (request: NextRequest, { session, params }) => {
  const { commentId } = await resolveParams(params)
  if (!commentId) return apiBadRequest('Invalid id')

  const body = await request.json()
  const content = (body.content || '').trim()
  if (!content) return apiBadRequest('Content is required')

  const existing = await prisma.sprintActivityComment.findUnique({
    where: { id: commentId },
    select: { authorId: true },
  })
  if (!existing) return apiNotFound('Comment not found')
  if (existing.authorId !== session.user.id && session.user.role !== 'ADMIN') {
    return apiForbidden('Only the author can edit this comment')
  }

  const comment = await prisma.sprintActivityComment.update({
    where: { id: commentId },
    data: { content },
    include: { author: { select: { id: true, name: true, avatar: true } } },
  })
  return apiSuccess(comment)
})

export const DELETE = withAuth<CommentParams>(async (_request, { session, params }) => {
  const { commentId } = await resolveParams(params)
  if (!commentId) return apiBadRequest('Invalid id')

  const existing = await prisma.sprintActivityComment.findUnique({
    where: { id: commentId },
    select: { authorId: true },
  })
  if (!existing) return apiNotFound('Comment not found')
  if (existing.authorId !== session.user.id && session.user.role !== 'ADMIN') {
    return apiForbidden('Only the author can delete this comment')
  }

  await prisma.sprintActivityComment.delete({ where: { id: commentId } })
  return apiSuccess(null)
})
