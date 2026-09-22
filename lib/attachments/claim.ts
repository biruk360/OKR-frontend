/**
 * Link staged uploads to the comment that was just posted, and read them back.
 *
 * Staging is per parent entity because the comment does not exist while the
 * user is composing. Posting claims the rows; anything never claimed is an
 * abandoned draft and is swept later.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md CMP-2, ATT-2, ATT-3.
 */

import { prisma } from '@/lib/prisma'
import type { CommentScope } from './access'
import { deleteFile } from './storage'

export interface AttachmentDto {
  id: string
  filename: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
  url: string
}

function toDto(row: {
  id: string; filename: string; mimeType: string; size: number
  width: number | null; height: number | null
}): AttachmentDto {
  // The URL is always the authenticated route — never a path under public/.
  return { ...row, url: `/api/comment-attachments/${row.id}` }
}

/**
 * Attach staged rows to a comment.
 *
 * Scoped to this uploader, this entity and unclaimed rows, so a caller cannot
 * pass someone else's attachment id — or one already attached elsewhere — and
 * have it appear on their comment.
 */
export async function claimAttachments(args: {
  ids: string[]
  commentType: CommentScope
  commentId: string
  entityId: string
  uploaderId: string
}): Promise<AttachmentDto[]> {
  const { ids, commentType, commentId, entityId, uploaderId } = args
  if (ids.length === 0) return []

  await prisma.commentAttachment.updateMany({
    where: { id: { in: ids }, commentType, entityId, uploadedById: uploaderId, commentId: null },
    data: { commentId },
  })

  const rows = await prisma.commentAttachment.findMany({
    where: { commentId, commentType },
    orderBy: { createdAt: 'asc' },
    select: { id: true, filename: true, mimeType: true, size: true, width: true, height: true },
  })
  return rows.map(toDto)
}

/** Attachments for a set of comments, keyed by comment id. */
export async function attachmentsForComments(
  commentType: CommentScope,
  commentIds: string[],
): Promise<Map<string, AttachmentDto[]>> {
  const out = new Map<string, AttachmentDto[]>()
  if (commentIds.length === 0) return out

  const rows = await prisma.commentAttachment.findMany({
    where: { commentType, commentId: { in: commentIds } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, commentId: true, filename: true, mimeType: true,
      size: true, width: true, height: true,
    },
  })
  for (const r of rows) {
    if (!r.commentId) continue
    const list = out.get(r.commentId) ?? []
    list.push(toDto(r))
    out.set(r.commentId, list)
  }
  return out
}

/** ATT-3 — deleting a comment takes its files with it, rows and bytes. */
export async function deleteAttachmentsForComment(
  commentType: CommentScope,
  commentId: string,
): Promise<void> {
  const rows = await prisma.commentAttachment.findMany({
    where: { commentType, commentId },
    select: { id: true, storedName: true },
  })
  if (rows.length === 0) return
  await prisma.commentAttachment.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } })
  await Promise.all(rows.map((r) => deleteFile(r.storedName)))
}
