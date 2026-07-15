import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { getReadableProject } from '@/lib/projects/access'
import { extractMentionIds, listActivityComments } from '@/lib/projects/activity-comments'
import { resolveMentions } from '@/lib/comments'
import { emit } from '@/lib/notifications'

const commentSchema = z.object({
  content: z.string().trim().min(1).max(20000),
  parentId: z.string().nullable().optional(),
  visibility: z.enum(['INTERNAL', 'CLIENT_VISIBLE']).default('INTERNAL'),
})

export const GET = withAuth<{ id: string; activityId: string }>(async (_req, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()

  const activity = await prisma.activity.findFirst({
    where: { id: params.activityId, milestone: { phase: { projectId: params.id } } },
    select: { id: true },
  })
  if (!activity) return apiNotFound('Activity not found')

  const comments = await listActivityComments(prisma, params.activityId)
  return apiSuccess(comments)
})

export const POST = withAuth<{ id: string; activityId: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = commentSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid comment payload', parsed.error.flatten())
  const input = parsed.data

  const activity = await prisma.activity.findFirst({
    where: { id: params.activityId, milestone: { phase: { projectId: params.id } } },
    select: { id: true, title: true },
  })
  if (!activity) return apiNotFound('Activity not found')

  if (input.parentId) {
    const parent = await prisma.activityComment.findFirst({
      where: { id: input.parentId, activityId: params.activityId },
      select: { id: true },
    })
    if (!parent) return apiBadRequest('Parent comment does not belong to this activity')
  }

  const mentionedIds = Array.from(new Set([
    ...extractMentionIds(input.content),
    ...(await resolveMentions(input.content)),
  ].filter((id) => id !== session.user.id)))

  const comment = await prisma.activityComment.create({
    data: {
      activityId: params.activityId,
      authorId: session.user.id,
      content: input.content,
      parentId: input.parentId ?? null,
      visibility: input.visibility,
      mentions: mentionedIds,
      isClientAuthor: false,
    },
    select: { id: true },
  })

  await recordActivity({
    entityType: 'PROJECT_ACTIVITY',
    projectId: params.id,
    action: 'COMMENTED',
    actorId: session.user.id,
    metadata: { activityId: params.activityId, commentId: comment.id, visibility: input.visibility, mentionCount: mentionedIds.length },
  })

  if (mentionedIds.length > 0) {
    await emit('USER_MENTIONED', {
      actorId: session.user.id,
      entityType: 'PROJECT',
      entityId: params.id,
      entityTitle: activity.title,
      explicitRecipients: mentionedIds,
      data: {
        actorName: session.user.name,
        snippet: stripHtml(input.content).slice(0, 140),
        activityId: params.activityId,
        commentId: comment.id,
        deepLink: `/dashboard/projects/${params.id}?activity=${params.activityId}`,
      },
    })
  }

  const comments = await listActivityComments(prisma, params.activityId)
  return apiSuccess(comments, { status: 201, message: 'Comment added.' })
})

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
