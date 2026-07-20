import { unlink } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { listActivityAttachments } from '@/lib/projects/activity-comments'
import { getWritableProject } from '@/lib/projects/access'

export const DELETE = withAuth<{ id: string; activityId: string; attachmentId: string }>(async (_req, { session, params }) => {
  if (!await getWritableProject(session, params.id)) return apiForbidden()
  const attachment = await prisma.activityAttachment.findFirst({
    where: {
      id: params.attachmentId,
      activityId: params.activityId,
      activity: { milestone: { phase: { projectId: params.id } } },
    },
  })
  if (!attachment) return apiNotFound('Attachment not found')

  const uploadsRoot = path.resolve(process.cwd(), 'public', 'uploads', 'project-activities')
  const filePath = path.resolve(process.cwd(), 'public', attachment.storagePath.replace(/^\/+/, ''))
  if (filePath.startsWith(`${uploadsRoot}${path.sep}`)) await unlink(filePath).catch(() => undefined)

  await prisma.activityAttachment.delete({ where: { id: attachment.id } })
  await recordActivity({
    entityType: 'PROJECT_ACTIVITY',
    projectId: params.id,
    action: 'UPDATED',
    actorId: session.user.id,
    metadata: { kind: 'ATTACHMENT_DELETED', activityId: params.activityId, fileName: attachment.fileName },
  })
  return apiSuccess(await listActivityAttachments(prisma, params.activityId))
})
