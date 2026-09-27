/**
 * Take a deleted card's files with it.
 *
 * Deleting a `Todo` cascades its `TodoAttachment` rows and `TodoComment`s in
 * the database, but nothing removed the bytes on disk, and the card's
 * `CommentAttachment` rows (not a relation — `entityId` is a plain string)
 * outlived it entirely: claimed ones pointing at comments that no longer
 * exist, staged ones waiting for a post that can never happen.
 *
 * Two steps because the cascade erases the only record of where the card's
 * own files are:
 *   1. `snapshotTodoAttachmentFiles(todoId)` — BEFORE the delete;
 *   2. `purgeDeletedTodoAttachments(todoId, snapshot)` — only AFTER the delete
 *      succeeded, so a failed delete never costs the card its files.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md ATT-3, CMP-3.
 */

import { prisma } from '@/lib/prisma'
import { deleteFile } from './storage'
import { deleteTodoFile, type TodoAttachmentLocationRow } from './todo-storage'
import { TODO_COMMENT_TYPE } from './todo-comments'

export interface TodoAttachmentSnapshot {
  /** The card's own attachments — their rows go with the cascade. */
  cardFiles: TodoAttachmentLocationRow[]
}

export interface TodoAttachmentPurgeResult {
  commentRows: number
  commentFiles: number
  cardFiles: number
}

export async function snapshotTodoAttachmentFiles(todoId: string): Promise<TodoAttachmentSnapshot> {
  const cardFiles = await prisma.todoAttachment.findMany({
    where: { todoId },
    select: { id: true, todoId: true, url: true },
  })
  return { cardFiles }
}

export async function purgeDeletedTodoAttachments(
  todoId: string,
  snapshot: TodoAttachmentSnapshot,
): Promise<TodoAttachmentPurgeResult> {
  // Every comment attachment on the card, claimed or still staged.
  const rows = await prisma.commentAttachment.findMany({
    where: { commentType: TODO_COMMENT_TYPE, entityId: todoId },
    select: { id: true, storedName: true },
  })
  if (rows.length > 0) {
    await prisma.commentAttachment.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } })
  }
  // Best-effort deletes: a missing file is not an error.
  await Promise.all(rows.map((r) => deleteFile(r.storedName)))
  await Promise.all(snapshot.cardFiles.map((row) => deleteTodoFile(row)))
  return { commentRows: rows.length, commentFiles: rows.length, cardFiles: snapshot.cardFiles.length }
}
