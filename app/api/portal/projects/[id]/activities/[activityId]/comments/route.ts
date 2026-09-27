import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { apiBadRequest, apiNotFound, apiSuccess, apiValidationError } from '@/lib/api'
import { withPortalProject } from '@/lib/api/withPortalAuth'
import { listActivityComments } from '@/lib/projects/activity-comments'
import { emit } from '@/lib/notifications'
import {
  loadPortalForbiddenNames,
  portalActivityCommentWhere,
  portalProjectWhere,
  serializeCommentForClient,
} from '@/features/projects/services/portal-serializer'

const commentSchema = z.object({
  content: z.string().trim().min(1).max(20000),
  parentId: z.string().nullable().optional(),
})

/**
 * Client-portal activity comments. Only CLIENT_VISIBLE rows are read (SQL
 * filter, invariant 5) and every response goes through
 * `serializeCommentForClient` with the full employee-name list, so internal
 * authors, @mentions and names typed into comment text never reach the client
 * (invariant 4).
 */
async function serializedThread(activityId: string) {
  const [comments, forbiddenEmployeeNames] = await Promise.all([
    listActivityComments(prisma, activityId, { portal: true }),
    loadPortalForbiddenNames(prisma),
  ])
  return comments.map((comment) => serializeCommentForClient(comment, { forbiddenEmployeeNames }))
}

export const GET = withPortalProject<{ id: string; activityId: string }>(async (_req, { session, params }) => {
  const activity = await findPortalActivity(session.user.projectIds, params.id, params.activityId)
  if (!activity) return apiNotFound('Activity not found')

  return apiSuccess(await serializedThread(params.activityId))
})

export const POST = withPortalProject<{ id: string; activityId: string }>(async (req: NextRequest, { session, params }) => {
  const parsed = commentSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid comment payload', parsed.error.flatten())
  const input = parsed.data

  const activity = await findPortalActivity(session.user.projectIds, params.id, params.activityId)
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

  // Invariant #10. ActivityLog.actorId references User, and a portal client is
  // a ClientPortalUser, so the actor is recorded in metadata instead.
  await recordActivity({
    entityType: 'PROJECT_ACTIVITY',
    projectId: params.id,
    action: 'COMMENTED',
    actorId: null,
    metadata: {
      activityId: params.activityId,
      commentId: comment.id,
      visibility: 'CLIENT_VISIBLE',
      source: 'CLIENT_PORTAL',
      clientPortalUserId: session.user.id,
      parentId: input.parentId ?? null,
    },
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
        deepLink: `/projects/${params.id}?activity=${params.activityId}`,
      },
    })
  }

  return apiSuccess(await serializedThread(params.activityId), { status: 201, message: 'Comment added.' })
})

/**
 * The activity, pinned in SQL to a project this portal user may see *now*:
 * in their scope, portal-enabled and not archived — the same rule as the
 * project routes, so disabling the portal also closes the comment thread.
 */
function findPortalActivity(projectIds: readonly string[], projectId: string, activityId: string) {
  return prisma.activity.findFirst({
    where: {
      id: activityId,
      milestone: { phase: { project: { AND: [portalProjectWhere(projectIds), { id: projectId }] } } },
    },
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
