import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiNotFound, apiSuccess, apiValidationError } from '@/lib/api'
import { withPortalProject } from '@/lib/api/withPortalAuth'
import { listActivityComments } from '@/lib/projects/activity-comments'
import { emit } from '@/lib/notifications'
import {
  portalActivityCommentWhere,
  serializeCommentForClient,
} from '@/features/projects/services/portal-serializer'

const commentSchema = z.object({
  content: z.string().trim().min(1).max(20000),
  parentId: z.string().nullable().optional(),
})

export const GET = withPortalProject<{ id: string; activityId: string }>(async (_req, { params }) => {
  const activity = await findPortalActivity(params.id, params.activityId)
  if (!activity) return apiNotFound('Activity not found')

  const comments = await listActivityComments(prisma, params.activityId, { portal: true })
  return apiSuccess(comments.map((comment) => serializeCommentForClient(comment)))
})

export const POST = withPortalProject<{ id: string; activityId: string }>(async (req: NextRequest, { session, params }) => {
  const parsed = commentSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid comment payload', parsed.error.flatten())
  const input = parsed.data

  const activity = await findPortalActivity(params.id, params.activityId)
  if (!activity) return apiNotFound('Activity not found')

  if (input.parentId) {
    const parent = await prisma.activityComment.findFirst({
      where: { id: input.parentId, ...portalActivityCommentWhere(params.activityId) },
      select: { id: true },
    })
    if (!parent) return apiBadRequest('Parent comment does not belong to this activity')
  }

  const comment = await prisma.activityComment.create({
    data: {
      activityId: params.activityId,
      authorId: session.user.id,
      content: input.content,
      parentId: input.parentId ?? null,
      visibility: 'CLIENT_VISIBLE',
      mentions: [],
      isClientAuthor: true,
    },
    select: { id: true },
  })

  const projectManagerId = activity.milestone.phase.project.projectManagerId
  if (projectManagerId) {
    await emit('CLIENT_COMMENT_POSTED', {
      actorId: session.user.id,
      entityType: 'PROJECT',
      entityId: params.id,
      entityTitle: activity.title,
      explicitRecipients: [projectManagerId],
      data: {
        activityId: params.activityId,
        commentId: comment.id,
        deepLink: `/dashboard/projects/${params.id}?activity=${params.activityId}`,
      },
    })
  }

  const comments = await listActivityComments(prisma, params.activityId, { portal: true })
  return apiSuccess(comments.map((node) => serializeCommentForClient(node)), { status: 201, message: 'Comment added.' })
})

function findPortalActivity(projectId: string, activityId: string) {
  return prisma.activity.findFirst({
    where: { id: activityId, milestone: { phase: { projectId } } },
    select: {
      id: true,
      title: true,
      milestone: {
        select: {
          phase: {
            select: {
              project: { select: { projectManagerId: true } },
            },
          },
        },
      },
    },
  })
}
