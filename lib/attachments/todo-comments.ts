/**
 * Card (to-do) comment attachments on the shared `CommentAttachment` model.
 *
 * Card comments used to keep their files as a JSON string of `TodoAttachment`
 * ids in `TodoComment.commentAttachments` — not a relation, so it could not be
 * joined, counted or cascaded, and the files were the card's own attachments
 * served from the card route. New card comments stage and claim files through
 * the same path as OKR comments (POST /api/comment-attachments with
 * `commentType: 'TODO'`, claimed on post, served by
 * GET /api/comment-attachments/[id] under the card read rule).
 *
 * The JSON column is kept, unread once a comment is migrated, as the one-release
 * rollback path (ATT-4). Until scripts/migrate-todo-comment-attachments.ts has
 * run, old comments still render from it:
 *
 *   a comment that has ANY `CommentAttachment` rows renders those rows only;
 *   a comment with none renders its legacy JSON ids (scoped to its own card).
 *
 * The migration is all-or-nothing per comment, which is what makes that rule
 * safe: a migrated comment never shows a half-set.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md ATT-1..ATT-4, XCT-5;
 *       docs/attachment_viewer_REQUIREMENTS.md NRG-3.
 */

import { prisma } from '@/lib/prisma'
import { deleteAttachmentsForComment } from './claim'

/** `CommentAttachment.commentType` for card comments. */
export const TODO_COMMENT_TYPE = 'TODO' as const

export const COMMENT_ATTACHMENT_URL_PREFIX = '/api/comment-attachments/'

/** The authenticated URL a comment attachment is read through. */
export function commentAttachmentUrl(id: string): string {
  return `${COMMENT_ATTACHMENT_URL_PREFIX}${id}`
}

/**
 * Ids in a legacy `commentAttachments` JSON value. Anything that is not a JSON
 * array of non-empty strings yields nothing (the column was never validated).
 */
export function parseLegacyAttachmentIds(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    const out: string[] = []
    for (const x of v) if (typeof x === 'string' && x && !out.includes(x)) out.push(x)
    return out
  } catch {
    return []
  }
}

/** One attachment as the card thread renders it (both storage shapes). */
export interface TodoCommentAttachmentView {
  id: string
  filename: string
  /** `/api/comment-attachments/<id>` for migrated/new rows; the card-attachment url for legacy ones. */
  url: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
  uploadedBy: { id: string; name: string | null }
  createdAt: Date | string
  /** `comment` = CommentAttachment row; `legacy` = TodoAttachment via the JSON column. */
  source: 'comment' | 'legacy'
}

/**
 * Pure: the attachments one comment renders. Rows win over the legacy JSON;
 * legacy ids resolve only against the lookup the caller built for this card,
 * and unknown ids are dropped.
 */
export function resolveCommentAttachments(
  rows: TodoCommentAttachmentView[] | undefined,
  legacyRaw: string | null | undefined,
  legacyById: Map<string, TodoCommentAttachmentView>,
): TodoCommentAttachmentView[] {
  if (rows && rows.length > 0) return rows
  return parseLegacyAttachmentIds(legacyRaw)
    .map((id) => legacyById.get(id))
    .filter((a): a is TodoCommentAttachmentView => !!a)
}

interface HydratableComment {
  id: string
  commentAttachments: string | null
}

/**
 * Attachments for a set of comments on one card, keyed by comment id.
 * Two queries at most: the comment rows, and the legacy rows for comments
 * that have none.
 */
export async function hydrateTodoCommentAttachments(
  todoId: string,
  comments: HydratableComment[],
): Promise<Map<string, TodoCommentAttachmentView[]>> {
  const out = new Map<string, TodoCommentAttachmentView[]>()
  if (comments.length === 0) return out

  const rows = await prisma.commentAttachment.findMany({
    // entityId pins the rows to this card, so a doctored commentId from
    // another card can never surface here.
    where: { commentType: TODO_COMMENT_TYPE, entityId: todoId, commentId: { in: comments.map((c) => c.id) } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, commentId: true, filename: true, mimeType: true, size: true,
      width: true, height: true, createdAt: true,
      uploadedBy: { select: { id: true, name: true } },
    },
  })
  const byComment = new Map<string, TodoCommentAttachmentView[]>()
  for (const r of rows) {
    if (!r.commentId) continue
    const list = byComment.get(r.commentId) ?? []
    list.push({
      id: r.id, filename: r.filename, url: commentAttachmentUrl(r.id), mimeType: r.mimeType,
      size: r.size, width: r.width, height: r.height, uploadedBy: r.uploadedBy,
      createdAt: r.createdAt, source: 'comment',
    })
    byComment.set(r.commentId, list)
  }

  // Legacy ids only for comments that have not been migrated.
  const legacyIds = new Set<string>()
  for (const c of comments) {
    if (byComment.has(c.id)) continue
    for (const id of parseLegacyAttachmentIds(c.commentAttachments)) legacyIds.add(id)
  }
  const legacyById = new Map<string, TodoCommentAttachmentView>()
  if (legacyIds.size > 0) {
    const legacy = await prisma.todoAttachment.findMany({
      where: { id: { in: Array.from(legacyIds) }, todoId },
      select: {
        id: true, filename: true, url: true, mimeType: true, size: true, createdAt: true,
        uploadedBy: { select: { id: true, name: true } },
      },
    })
    for (const a of legacy) {
      legacyById.set(a.id, { ...a, width: null, height: null, source: 'legacy' })
    }
  }

  for (const c of comments) {
    out.set(c.id, resolveCommentAttachments(byComment.get(c.id), c.commentAttachments, legacyById))
  }
  return out
}

/** ATT-3 — a deleted card comment takes its CommentAttachment rows and bytes with it. */
export function deleteTodoCommentAttachments(commentId: string): Promise<void> {
  return deleteAttachmentsForComment(TODO_COMMENT_TYPE, commentId)
}
