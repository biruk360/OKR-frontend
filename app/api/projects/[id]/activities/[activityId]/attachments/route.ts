import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { listActivityAttachments } from '@/lib/projects/activity-comments'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'

const MAX_SIZE = 20 * 1024 * 1024
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'project-activities')

async function findActivity(projectId: string, activityId: string) {
  return prisma.activity.findFirst({
    where: { id: activityId, milestone: { phase: { projectId } } },
    select: { id: true, title: true },
  })
}

export const GET = withAuth<{ id: string; activityId: string }>(async (_req, { session, params }) => {
  if (!await getReadableProject(session, params.id)) return apiForbidden()
  if (!await findActivity(params.id, params.activityId)) return apiNotFound('Activity not found')
  return apiSuccess(await listActivityAttachments(prisma, params.activityId))
})

export const POST = withAuth<{ id: string; activityId: string }>(async (req: NextRequest, { session, params }) => {
  if (!await getWritableProject(session, params.id)) return apiForbidden()
  const activity = await findActivity(params.id, params.activityId)
  if (!activity) return apiNotFound('Activity not found')

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return apiBadRequest('No file provided')
  if (file.size <= 0) return apiBadRequest('The selected file is empty')
  if (file.size > MAX_SIZE) return apiBadRequest('File exceeds the 20 MB limit')

  await mkdir(UPLOAD_DIR, { recursive: true })
  const extension = path.extname(file.name).slice(0, 12)
  const safeName = `${Date.now()}-${crypto.randomUUID()}${extension}`
  await writeFile(path.join(UPLOAD_DIR, safeName), Buffer.from(await file.arrayBuffer()))

  await prisma.activityAttachment.create({
    data: {
      activityId: params.activityId,
      fileName: file.name.slice(0, 255),
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      storagePath: `/uploads/project-activities/${safeName}`,
      uploadedById: session.user.id,
      visibility: 'INTERNAL',
    },
  })
  await recordActivity({
    entityType: 'PROJECT_ACTIVITY',
    projectId: params.id,
    action: 'UPDATED',
    actorId: session.user.id,
    metadata: { kind: 'ATTACHMENT_ADDED', activityId: params.activityId, fileName: file.name },
  })
  return apiSuccess(await listActivityAttachments(prisma, params.activityId), { status: 201, message: 'File attached.' })
})
