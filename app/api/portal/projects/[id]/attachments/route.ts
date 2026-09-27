import { prisma } from '@/lib/prisma'
import { apiSuccess } from '@/lib/api'
import { withPortalProject } from '@/lib/api/withPortalAuth'
import {
  loadPortalForbiddenNames,
  portalActivityAttachmentWhere,
  portalProjectActivityWhere,
  serializeProjectAttachmentForClient,
} from '@/features/projects/services/portal-serializer'

/**
 * GET /api/portal/projects/[id]/attachments — the client's documents list.
 * Activities are first pinned to a portal-enabled project in this session's
 * scope; attachments are then read with `portalActivityAttachmentWhere`, so
 * CLIENT_VISIBLE is filtered in SQL (invariant 5). File names and activity
 * titles are scrubbed of employee names and the uploader is never selected
 * (invariant 4).
 */
export const GET = withPortalProject<{ id: string }>(async (_req, { session, params }) => {
  const activities = await prisma.activity.findMany({
    where: portalProjectActivityWhere(params.id, session.user.projectIds),
    select: { id: true },
  })
  if (activities.length === 0) return apiSuccess([])

  const [attachments, forbiddenEmployeeNames] = await Promise.all([
    prisma.activityAttachment.findMany({
      where: portalActivityAttachmentWhere(activities.map((activity) => activity.id)),
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        activityId: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        visibility: true,
        createdAt: true,
        activity: { select: { title: true } },
      },
    }),
    loadPortalForbiddenNames(prisma),
  ])
  return apiSuccess(attachments.map((attachment) => serializeProjectAttachmentForClient(attachment, { forbiddenEmployeeNames })))
})
