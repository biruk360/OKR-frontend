import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { listActivityAttachments } from '@/lib/projects/activity-comments'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import { validateUpload } from '@/lib/attachments/file-types'
import {
  deleteProjectFile,
  persistProjectFile,
  projectAttachmentApiUrl,
  type ProjectAttachmentLocationRow,
} from '@/lib/attachments/project-storage'

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

/**
 * POST — upload an activity attachment (project write access required).
 *
 * The file must pass `validateUpload` — extension, declared MIME and magic
 * bytes all agree on an allowlisted type, ≤ 20 MB; .html/.svg/.xml/.js and
 * every other script-bearing or unknown type is refused with 400 before
 * anything touches disk (UPL-2, UPL-3, UPL-AC-1). The bytes go to the private
 * PROJECT_UPLOAD_ROOT under the row id — never under public/, which Next
 * serves statically with no session check — and `storagePath` is the
 * authenticated route that streams them back (UPL-4, UPL-7). Visibility stays
 * INTERNAL (invariant 5).
 */
export const POST = withAuth<{ id: string; activityId: string }>(async (req: NextRequest, { session, params }) => {
  if (!await getWritableProject(session, params.id)) return apiForbidden()
  const activity = await findActivity(params.id, params.activityId)
  if (!activity) return apiNotFound('Activity not found')

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return apiBadRequest('No file provided')

  const buffer = Buffer.from(await file.arrayBuffer())
  const verdict = validateUpload({
    filename: file.name,
    declaredMime: file.type,
    size: buffer.byteLength,
    head: new Uint8Array(buffer.subarray(0, 64)),
  })
  if (!verdict.ok) return apiBadRequest(verdict.message)

  // The row and the file land together: the file is named by the row id and
  // written inside the transaction, so a failed write leaves no row, and a
  // failure after the write removes the file.
  const written: { row?: ProjectAttachmentLocationRow } = {}
  await prisma.$transaction(async (tx) => {
    const created = await tx.activityAttachment.create({
      data: {
        activityId: params.activityId,
        fileName: file.name.slice(0, 255),
        fileSize: buffer.byteLength,
        // The canonical allowlisted type, never the uploader's claim.
        mimeType: verdict.type.mime,
        storagePath: '',
        uploadedById: session.user.id,
        visibility: 'INTERNAL',
      },
      select: { id: true },
    })
    const storagePath = projectAttachmentApiUrl(params.id, params.activityId, created.id)
    // Recorded before the write, so a partial file is cleaned too.
    written.row = { id: created.id, activityId: params.activityId, projectId: params.id, storagePath }
    await persistProjectFile(created.id, buffer)
    await tx.activityAttachment.update({ where: { id: created.id }, data: { storagePath } })
  }).catch(async (err) => {
    // Rolled back: never leave bytes on disk with no row pointing at them.
    if (written.row) await deleteProjectFile(written.row)
    throw err
  })

  await recordActivity({
    entityType: 'PROJECT_ACTIVITY',
    projectId: params.id,
    action: 'UPDATED',
    actorId: session.user.id,
    metadata: { kind: 'ATTACHMENT_ADDED', activityId: params.activityId, attachmentId: written.row?.id, fileName: file.name },
  })
  return apiSuccess(await listActivityAttachments(prisma, params.activityId), { status: 201, message: 'File attached.' })
})
