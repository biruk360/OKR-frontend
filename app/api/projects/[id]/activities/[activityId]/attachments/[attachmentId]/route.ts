import { readFile } from 'fs/promises'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { listActivityAttachments } from '@/lib/projects/activity-comments'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import { deleteProjectFile, resolveProjectAttachmentPath } from '@/lib/attachments/project-storage'
import { attachmentResponseHeaders, serveTypeFor } from '@/lib/attachments/serve'

type Params = { id: string; activityId: string; attachmentId: string }

/** The attachment, pinned in SQL to the activity and project in the URL. */
function findAttachment(params: Params) {
  return prisma.activityAttachment.findFirst({
    where: {
      id: params.attachmentId,
      activityId: params.activityId,
      activity: { milestone: { phase: { projectId: params.id } } },
    },
  })
}

/**
 * GET — stream an activity attachment (internal users only).
 *
 * This route is the only way to read one. It runs the same project read rule
 * as the activity routes (`getReadableProject`) on every request; new uploads
 * live in the private PROJECT_UPLOAD_ROOT, and rows from before that still
 * point at `public/uploads/project-activities/` until
 * scripts/migrate-project-attachments-private.ts moves them (middleware 404s
 * that static path meanwhile). The path is resolved by
 * `resolveProjectAttachmentPath` (one segment, contained in its root), and the
 * bytes are re-verified against the allowlist before a type is chosen — a
 * legacy row recorded whatever MIME the uploader claimed.
 *
 * Client-portal sessions never reach this route (withAuth reads the internal
 * session only). Clients read CLIENT_VISIBLE files through
 * /api/portal/projects/[id]/attachments/[attachmentId], filtered in SQL with
 * `portalProjectAttachmentWhere` (invariant 5).
 *
 * Headers (lib/attachments/serve.ts): canonical Content-Type, nosniff,
 * private caching, sandboxed CSP, `attachment` for anything not an image/PDF.
 */
export const GET = withAuth<Params>(async (_req, { session, params }) => {
  // Same answer for no access, missing and foreign ids, so ids cannot be probed.
  if (!await getReadableProject(session, params.id)) return apiNotFound('Attachment not available')
  const attachment = await findAttachment(params)
  if (!attachment) return apiNotFound('Attachment not available')

  const location = resolveProjectAttachmentPath({ ...attachment, projectId: params.id })
  if (!location) return apiNotFound('Attachment not available')

  let bytes: Buffer
  try {
    bytes = await readFile(location.path)
  } catch {
    return apiNotFound('Attachment not available')
  }

  const type = serveTypeFor({
    filename: attachment.fileName,
    mimeType: attachment.mimeType,
    bytes: new Uint8Array(bytes),
  })
  return new NextResponse(new Uint8Array(bytes), {
    headers: attachmentResponseHeaders({ type, filename: attachment.fileName, size: bytes.byteLength }),
  })
})

export const DELETE = withAuth<Params>(async (_req, { session, params }) => {
  if (!await getWritableProject(session, params.id)) return apiForbidden()
  const attachment = await findAttachment(params)
  if (!attachment) return apiNotFound('Attachment not found')

  // Row first, then bytes: a stray file is harmless, a row whose file is gone
  // is a broken link. The bytes are removed from wherever this row keeps them
  // (private root or the legacy public dir) via the same contained resolver as
  // GET — `storagePath` is never joined onto a path directly.
  await prisma.activityAttachment.delete({ where: { id: attachment.id } })
  await deleteProjectFile({ ...attachment, projectId: params.id })
  await recordActivity({
    entityType: 'PROJECT_ACTIVITY',
    projectId: params.id,
    action: 'UPDATED',
    actorId: session.user.id,
    metadata: { kind: 'ATTACHMENT_DELETED', activityId: params.activityId, attachmentId: attachment.id, fileName: attachment.fileName },
  })
  return apiSuccess(await listActivityAttachments(prisma, params.activityId))
})

const visibilitySchema = z.object({ visibility: z.enum(['INTERNAL', 'CLIENT_VISIBLE']) })

/**
 * PATCH — share a file with the client portal (CLIENT_VISIBLE) or make it
 * INTERNAL again. New uploads are always INTERNAL (fail-safe, invariant 5);
 * this explicit, audited PM action is the only way a file reaches a client.
 */
export const PATCH = withAuth<Params>(async (req: NextRequest, { session, params }) => {
  if (!await getWritableProject(session, params.id)) return apiForbidden()
  const parsed = visibilitySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid attachment visibility', parsed.error.flatten())
  const attachment = await findAttachment(params)
  if (!attachment) return apiNotFound('Attachment not found')
  if (attachment.visibility !== parsed.data.visibility) {
    await prisma.$transaction(async (tx) => {
      await tx.activityAttachment.update({ where: { id: attachment.id }, data: { visibility: parsed.data.visibility } })
      await recordActivity({
        entityType: 'PROJECT_ACTIVITY',
        projectId: params.id,
        action: 'UPDATED',
        actorId: session.user.id,
        changes: { visibility: { from: attachment.visibility, to: parsed.data.visibility } },
        metadata: { kind: 'ATTACHMENT_VISIBILITY_CHANGED', activityId: params.activityId, attachmentId: attachment.id, fileName: attachment.fileName },
      }, { client: tx, required: true })
    })
  }
  return apiSuccess(await listActivityAttachments(prisma, params.activityId))
})
