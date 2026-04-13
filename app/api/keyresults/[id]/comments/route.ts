import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiNotFound, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { resolveMentions, fanOutCommentNotifications } from '@/lib/comments'

export const GET = withAuth<RouteIdParams>(async (_req, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid id')
  const comments = await prisma.comment.findMany({
    where: { keyResultId: id },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, name: true, avatar: true, email: true } } },
  })
  return apiSuccess(comments)
})

export const POST = withAuth<RouteIdParams>(async (req, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid id')

  const body = (await req.json().catch(() => ({}))) as { content?: string }
  const content = (body.content ?? '').trim()
  if (!content) return apiBadRequest('Comment cannot be empty')

  const kr = await prisma.keyResult.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      ownerId: true,
      objectiveId: true,
      objective: {
        select: {
          title: true,
          ownerId: true,
          contributors: { select: { userId: true } },
        },
      },
    },
  })
  if (!kr) return apiNotFound('Key result not found')

  const comment = await prisma.comment.create({
    data: {
      content,
      authorId: session.user.id,
      keyResultId: id,
    },
    include: { author: { select: { id: true, name: true, avatar: true, email: true } } },
  })

  const mentionedIds = await resolveMentions(content)
  const recipientIds = [
    kr.ownerId,
    kr.objective.ownerId,
    ...kr.objective.contributors.map((c) => c.userId),
    ...mentionedIds,
  ]

  await fanOutCommentNotifications({
    commentId: comment.id,
    content,
    authorId: session.user.id,
    authorName: session.user.name ?? 'Someone',
    entityType: 'KEY_RESULT',
    entityId: id,
    entityTitle: kr.title,
    recipientIds,
  })

  await recordActivity({
    entityType: 'KEY_RESULT',
    keyResultId: id,
    action: 'COMMENTED',
    actorId: session.user.id,
    metadata: { commentId: comment.id, mentionCount: mentionedIds.length },
  })

  return apiSuccess(comment, { message: 'Comment added.' })
})
