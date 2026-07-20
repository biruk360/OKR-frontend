import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'
import { apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import { extractMentionIds, listActivityComments } from '@/lib/projects/activity-comments'
import { resolveMentions } from '@/lib/comments'
import { emit } from '@/lib/notifications'

const patchSchema = z.object({
  content: z.string().trim().min(1).max(20000).optional(),
  visibility: z.enum(['INTERNAL', 'CLIENT_VISIBLE']).optional(),
})

export const PATCH = withAuth<{ id: string; activityId: string; commentId: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid comment payload', parsed.error.flatten())
  const input = parsed.data

  const existing = await prisma.activityComment.findFirst({
    where: { id: params.commentId, activityId: params.activityId, activity: { milestone: { phase: { projectId: params.id } } } },
    select: { id: true, authorId: true, content: true, visibility: true },
  })
  if (!existing) return apiNotFound('Comment not found')

  const writable = existing.authorId === session.user.id ? access : await getWritableProject(session, params.id)
  if (!writable) return apiForbidden()

  const data: { content?: string; visibility?: string; mentions?: string[] } = {}
  if (input.content !== undefined) {
    data.content = input.content
    data.mentions = Array.from(new Set([
      ...extractMentionIds(input.content),
      ...(await resolveMentions(input.content)),
    ].filter((id) => id !== session.user.id)))
  }
  if (input.visibility !== undefined) data.visibility = input.visibility

  await prisma.activityComment.update({ where: { id: params.commentId }, data })

  const changes: ChangeMap = {}
  if (data.content !== undefined && data.content !== existing.content) changes.content = { from: existing.content, to: data.content }
  if (data.visibility !== undefined && data.visibility !== existing.visibility) changes.visibility = { from: existing.visibility, to: data.visibility }
  if (Object.keys(changes).length > 0) {
    await recordActivity({
      entityType: 'PROJECT_ACTIVITY',
      projectId: params.id,
      action: 'UPDATED',
      actorId: session.user.id,
      changes,
      metadata: { activityId: params.activityId, commentId: params.commentId },
    })
  }

  if (data.mentions && data.mentions.length > 0) {
    await emit('USER_MENTIONED', {
      actorId: session.user.id,
      entityType: 'PROJECT',
      entityId: params.id,
      entityTitle: 'Project activity',
      explicitRecipients: data.mentions,
      data: {
        actorName: session.user.name,
        snippet: stripHtml(data.content ?? '').slice(0, 140),
        activityId: params.activityId,
        commentId: params.commentId,
        deepLink: `/projects/${params.id}?activity=${params.activityId}`,
      },
    })
  }

  return apiSuccess(await listActivityComments(prisma, params.activityId))
})

export const DELETE = withAuth<{ id: string; activityId: string; commentId: string }>(async (_req, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()

  const existing = await prisma.activityComment.findFirst({
    where: { id: params.commentId, activityId: params.activityId, activity: { milestone: { phase: { projectId: params.id } } } },
    select: { id: true, authorId: true },
  })
  if (!existing) return apiNotFound('Comment not found')

  const writable = existing.authorId === session.user.id ? access : await getWritableProject(session, params.id)
  if (!writable) return apiForbidden()

  await prisma.activityComment.delete({ where: { id: params.commentId } })
  await recordActivity({
    entityType: 'PROJECT_ACTIVITY',
    projectId: params.id,
    action: 'DELETED',
    actorId: session.user.id,
    metadata: { activityId: params.activityId, commentId: params.commentId },
  })

  return apiSuccess(await listActivityComments(prisma, params.activityId))
})

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
