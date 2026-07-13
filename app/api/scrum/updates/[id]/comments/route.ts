import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { emit } from '@/lib/notifications'
import { apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { scrumCommentSchema } from '@/features/scrum/services/schemas'

export const GET = withAuth<{ id: string }>(async (_request, { params }) => {
  const comments = await prisma.scrumComment.findMany({ where: { updateId: params.id }, orderBy: { createdAt: 'asc' } })
  return apiSuccess(comments)
})

export const POST = withAuth<{ id: string }>(async (request: NextRequest, { session, params }) => {
  const json = await request.json().catch(() => null)
  const parsed = scrumCommentSchema.safeParse(json)
  if (!parsed.success) return apiValidationError('Invalid comment', parsed.error.flatten())
  const update = await prisma.scrumUpdate.findUnique({ where: { id: params.id } })
  if (!update) return apiNotFound('Scrum update not found')
  const comment = await prisma.scrumComment.create({
    data: {
      updateId: params.id,
      authorId: session.user.id,
      body: parsed.data.body,
      mentions: parsed.data.mentions ?? [],
    },
  })
  await recordActivity({ entityType: 'SCRUM_UPDATE', action: 'COMMENTED', actorId: session.user.id, metadata: { updateId: params.id, commentId: comment.id } })
  await emit('SCRUM_COMMENT', {
    actorId: session.user.id,
    entityType: 'SCRUM_UPDATE',
    entityId: params.id,
    explicitRecipients: [...new Set([update.userId, ...comment.mentions].filter((id) => id !== session.user.id))],
    data: { commentPreview: parsed.data.body.replace(/<[^>]+>/g, ' ').slice(0, 160) },
  })
  return apiSuccess(comment, { status: 201, message: 'Comment added' })
})
