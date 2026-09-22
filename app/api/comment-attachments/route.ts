import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiForbidden, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import type { UserRole } from '@/types'
import {
  validateUpload, readImageDimensions, MAX_ATTACHMENTS_PER_COMMENT,
} from '@/lib/attachments/file-types'
import { generateStoredName, persistFile, deleteFile } from '@/lib/attachments/storage'
import { canAccessAttachmentScope, isCommentScope } from '@/lib/attachments/access'

/**
 * POST /api/comment-attachments — stage a file for a comment.
 *
 * Body: multipart with `file`, `commentType`, `entityId`.
 *
 * The file is staged against the parent entity, not the comment, because while
 * composing the comment does not exist yet. Posting the comment claims the
 * staged rows; abandoned ones are swept by the cleanup job.
 *
 * Three things the old to-do uploader did not do, each of which was a hole:
 *   - it checked only that the entity existed, so anyone could attach anywhere;
 *   - it accepted any type and kept the caller's extension;
 *   - it wrote into public/, where the origin serves and executes it.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md UPL-1..UPL-6.
 */
export const POST = withAuth(async (request: NextRequest, { session }) => {
  const form = await request.formData()
  const file = form.get('file')
  const commentType = String(form.get('commentType') ?? '')
  const entityId = String(form.get('entityId') ?? '')

  if (!(file instanceof File)) return apiBadRequest('No file provided')
  if (!isCommentScope(commentType)) return apiBadRequest('Unknown commentType')
  if (!entityId) return apiBadRequest('entityId is required')

  const actor = { id: session.user.id, role: session.user.role as UserRole }
  const allowed = await canAccessAttachmentScope(commentType, entityId, actor)
  // Same answer for "no such entity" and "not yours", so an id cannot be probed.
  if (!allowed) return apiForbidden('You do not have access to this item')

  const staged = await prisma.commentAttachment.count({
    where: { entityId, commentType, commentId: null, uploadedById: actor.id },
  })
  if (staged >= MAX_ATTACHMENTS_PER_COMMENT) {
    return apiBadRequest(`You can attach at most ${MAX_ATTACHMENTS_PER_COMMENT} files to one comment.`)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const verdict = validateUpload({
    filename: file.name,
    declaredMime: file.type,
    size: buffer.byteLength,
    head: new Uint8Array(buffer.subarray(0, 64)),
  })
  if (!verdict.ok) return apiBadRequest(verdict.message)

  const dims = verdict.type.kind === 'IMAGE'
    ? readImageDimensions(new Uint8Array(buffer), verdict.type.mime)
    : null

  // Extension comes from the validated type, never from the upload.
  const storedName = generateStoredName(verdict.extension)
  await persistFile(storedName, buffer)

  try {
    const row = await prisma.commentAttachment.create({
      data: {
        commentType,
        commentId: null,
        entityId,
        uploadedById: actor.id,
        filename: file.name.slice(0, 255),
        storedName,
        mimeType: verdict.type.mime,
        size: buffer.byteLength,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
      },
      select: {
        id: true, filename: true, mimeType: true, size: true,
        width: true, height: true, createdAt: true,
      },
    })
    return apiSuccess({ ...row, url: `/api/comment-attachments/${row.id}`, kind: verdict.type.kind }, { status: 201 })
  } catch (err) {
    // Never leave bytes on disk with no row pointing at them.
    await deleteFile(storedName)
    throw err
  }
})

/**
 * DELETE /api/comment-attachments?id=… — drop a staged file.
 *
 * Only the uploader, and only while still staged: once the comment is posted
 * the attachment is part of it and is removed with the comment (CMP-3).
 */
export const DELETE = withAuth(async (request: NextRequest, { session }) => {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return apiBadRequest('id is required')

  const row = await prisma.commentAttachment.findUnique({
    where: { id },
    select: { id: true, storedName: true, uploadedById: true, commentId: true },
  })
  if (!row || row.uploadedById !== session.user.id || row.commentId !== null) {
    return apiForbidden('Cannot remove this attachment')
  }

  await prisma.commentAttachment.delete({ where: { id } })
  await deleteFile(row.storedName)
  await recordActivity({
    entityType: 'TODO',
    action: 'COMMENT_ATTACHMENT_REMOVED',
    actorId: session.user.id,
    metadata: { attachmentId: id },
  })
  return apiSuccess({ removed: true })
})
