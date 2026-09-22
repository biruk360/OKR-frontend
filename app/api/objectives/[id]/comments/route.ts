import { prisma } from '@/lib/prisma'
import { claimAttachments, attachmentsForComments } from '@/lib/attachments/claim'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiNotFound, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { resolveMentions, fanOutCommentNotifications } from '@/lib/comments'
import { emit } from '@/lib/notifications'

export const GET = withAuth<RouteIdParams>(async (_req, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid id')
  const comments = await prisma.comment.findMany({
    where: { objectiveId: id },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, name: true, avatar: true, email: true } } },
  })
  // One query for the whole thread rather than one per comment.
  const byComment = await attachmentsForComments('OKR', comments.map((c) => c.id))
  return apiSuccess(comments.map((c) => ({ ...c, attachments: byComment.get(c.id) ?? [] })))
})

export const POST = withAuth<RouteIdParams>(async (req, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid id')

  const body = await req.json().catch(() => ({})) as { content?: string; attachmentIds?: unknown }
  const content = (body.content ?? '').trim()
  if (!content) return apiBadRequest('Comment cannot be empty')

  const objective = await prisma.objective.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      ownerId: true,
      contributors: { select: { userId: true } },
      keyResults: { select: { ownerId: true } },
    },
  })
  if (!objective) return apiNotFound('Objective not found')

  const comment = await prisma.comment.create({
    data: {
      content,
      authorId: session.user.id,
      objectiveId: id,
    },
    include: { author: { select: { id: true, name: true, avatar: true, email: true } } },
  })

  const mentionedIds = await resolveMentions(content)
  const recipientIds = [
    objective.ownerId,
    ...objective.contributors.map((c) => c.userId),
    ...objective.keyResults.map((k) => k.ownerId),
    ...mentionedIds,
  ]

  await fanOutCommentNotifications({
    commentId: comment.id,
    content,
    authorId: session.user.id,
    authorName: session.user.name ?? 'Someone',
    entityType: 'OBJECTIVE',
    entityId: id,
    entityTitle: objective.title,
    recipientIds,
  })

  await recordActivity({
    entityType: 'OBJECTIVE',
    objectiveId: id,
    action: 'COMMENTED',
    actorId: session.user.id,
    metadata: { commentId: comment.id, mentionCount: mentionedIds.length },
  })

  const snippet = content.slice(0, 140)
  if (mentionedIds.length > 0) {
    await emit('USER_MENTIONED', {
      actorId: session.user.id,
      entityType: 'OBJECTIVE', entityId: id, entityTitle: objective.title,
      explicitRecipients: mentionedIds,
      data: { actorName: session.user.name, snippet, deepLink: `/dashboard/objectives/${id}` },
    })
  }
  await emit('COMMENT_ON_OWNED_ENTITY', {
    actorId: session.user.id,
    entityType: 'OBJECTIVE', entityId: id, entityTitle: objective.title,
    data: {
      actorName: session.user.name, snippet,
      ownedEntityType: 'OBJECTIVE', ownedEntityId: id,
      deepLink: `/dashboard/objectives/${id}`,
    },
  })

  // Staged uploads are claimed only now, scoped to this uploader and entity,
  // so a caller cannot attach someone else's file to their comment.
  const attachments = await claimAttachments({
    ids: Array.isArray(body.attachmentIds) ? (body.attachmentIds as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    commentType: 'OKR',
    commentId: comment.id,
    entityId: id,
    uploaderId: session.user.id,
  })

  return apiSuccess({ ...comment, attachments }, { message: 'Comment added.' })
})
