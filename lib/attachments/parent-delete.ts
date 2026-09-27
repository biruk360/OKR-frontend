/**
 * Take a deleted parent's comment files with it.
 *
 * `CommentAttachment.entityId` is a plain string, not a relation, so deleting
 * the parent (a scrum update, a project activity) cascades its comments in the
 * database but leaves every attachment row behind: claimed ones pointing at
 * comments that no longer exist, staged ones waiting for a post that can never
 * happen, and the bytes of both on disk.
 *
 * Call `purgeCommentAttachmentsAfterParentDelete` only AFTER the parent delete
 * succeeded, so a failed delete never costs the parent its files. It logs and
 * swallows errors: the parent is gone either way, and leftover bytes are not
 * worth failing the request over.
 *
 * (To-do cards have their own two-step helper in ./todo-delete.ts because the
 * card's own `TodoAttachment` files also need a pre-delete snapshot.)
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md ATT-3, CMP-3.
 */

import { prisma } from '@/lib/prisma'
import type { CommentScope } from './access'
import { deleteFile } from './storage'

/** The slice of Prisma the purge touches — injectable so it is unit-tested. */
export interface ParentDeleteDb {
  commentAttachment: {
    findMany(args: {
      where: { commentType: CommentScope; entityId: string }
      select: { id: true; storedName: true }
    }): Promise<Array<{ id: string; storedName: string }>>
    deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>
  }
}

export interface ParentDeletePurgeResult {
  rows: number
  files: number
}

/**
 * Removes every comment attachment on one parent — claimed or still staged —
 * rows first, then bytes (a missing file is not an error).
 */
export async function purgeCommentAttachmentsForEntity(
  commentType: CommentScope,
  entityId: string,
  opts: { db?: ParentDeleteDb; removeFile?: (storedName: string) => Promise<void> } = {},
): Promise<ParentDeletePurgeResult> {
  const db = opts.db ?? (prisma as unknown as ParentDeleteDb)
  const removeFile = opts.removeFile ?? deleteFile

  const rows = await db.commentAttachment.findMany({
    where: { commentType, entityId },
    select: { id: true, storedName: true },
  })
  if (rows.length === 0) return { rows: 0, files: 0 }

  await db.commentAttachment.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } })
  await Promise.all(rows.map((r) => removeFile(r.storedName)))
  return { rows: rows.length, files: rows.length }
}

/**
 * Post-delete wrapper for route handlers: never throws. Returns null when the
 * cleanup failed (already logged).
 */
export async function purgeCommentAttachmentsAfterParentDelete(
  commentType: CommentScope,
  entityId: string,
  opts: Parameters<typeof purgeCommentAttachmentsForEntity>[2] = {},
): Promise<ParentDeletePurgeResult | null> {
  try {
    return await purgeCommentAttachmentsForEntity(commentType, entityId, opts)
  } catch (err) {
    console.error('[attachments/parent-delete] comment attachment cleanup failed', { commentType, entityId, err })
    return null
  }
}
