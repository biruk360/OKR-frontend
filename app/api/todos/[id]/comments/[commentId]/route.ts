import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiForbidden, apiNotFound, withAuth } from '@/lib/api'

type Params = { id: string; commentId: string }

export const PATCH = withAuth<Params>(async (request: NextRequest, { session, params }) => {
  const { id: todoId, commentId } = await resolveParams(params)
  if (!todoId || !commentId) return apiBadRequest('Invalid params')
  const { content } = await request.json()
  if (!content?.trim()) return apiBadRequest('Content required')

  const comment = await prisma.todoComment.findUnique({ where: { id: commentId } })
  if (!comment || comment.todoId !== todoId) return apiNotFound('Comment not found')
  if (comment.authorId !== session.user.id && session.user.role !== 'ADMIN')
    return apiForbidden('Not your comment')

  const updated = await prisma.todoComment.update({
    where: { id: commentId },
    data: { content },
    include: { author: { select: { id: true, name: true, avatar: true } }, replies: { include: { author: { select: { id: true, name: true, avatar: true } } } } },
  })
  return apiSuccess(updated)
})

export const DELETE = withAuth<Params>(async (_req, { session, params }) => {
  const { id: todoId, commentId } = await resolveParams(params)
  if (!todoId || !commentId) return apiBadRequest('Invalid params')

  const comment = await prisma.todoComment.findUnique({ where: { id: commentId } })
  if (!comment || comment.todoId !== todoId) return apiNotFound('Comment not found')
  if (comment.authorId !== session.user.id && session.user.role !== 'ADMIN')
    return apiForbidden('Not your comment')

  await prisma.todoComment.delete({ where: { id: commentId } })
  return apiSuccess(null)
})
