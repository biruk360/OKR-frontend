/**
 * Card comment attachments on the shared comment-attachment path (ATT-4).
 *
 * Card comments used to upload each file as a card attachment
 * (POST /api/todos/[id]/attachments) and store the ids as JSON on the comment.
 * They now stage through POST /api/comment-attachments with
 * `commentType: 'TODO'` — the same endpoint, validation, storage, claim and
 * authenticated serve route as OKR comments — and the comment POST claims them.
 *
 * Kept as plain functions (no hooks) so TodoCardModal's optimistic flow
 * (CPF-1..6) stays where it is and only the upload target changes.
 */

import toast from 'react-hot-toast'
import type { AttachmentData } from './cardModalTypes'

export const COMMENT_ATTACHMENT_URL_PREFIX = '/api/comment-attachments/'

/** True for a `CommentAttachment` row's URL (as opposed to a legacy card-attachment one). */
export function isCommentAttachmentUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && url.startsWith(COMMENT_ATTACHMENT_URL_PREFIX)
}

/**
 * Where a comment attachment is read from: its own authenticated URL when it is
 * a `CommentAttachment` row, otherwise the card route for a legacy
 * `TodoAttachment` id (never the stored `/uploads/...` path — NRG-1).
 */
export function cardCommentAttachmentSrc(
  att: { id: string; url?: string | null },
  legacyUrl: (attachmentId: string) => string,
): string {
  return isCommentAttachmentUrl(att.url) ? att.url : legacyUrl(att.id)
}

/**
 * Stage `files` for a comment on card `todoId`, concurrently (CPF-5). Each
 * rejection is toasted naming the file and the server's reason (CMP-4); the
 * others still stage. Returns the staged rows in the thread's attachment shape.
 */
export async function stageCardCommentFiles(
  todoId: string,
  files: File[],
  uploader: { id: string; name: string },
): Promise<AttachmentData[]> {
  const staged = await Promise.all(files.map(async (file): Promise<AttachmentData | null> => {
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('commentType', 'TODO')
      body.append('entityId', todoId)
      const res = await fetch('/api/comment-attachments', { method: 'POST', body })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        toast.error(json.error ?? `Could not attach ${file.name}`)
        return null
      }
      const d = json.data as {
        id: string; filename: string; url: string; mimeType: string; size: number; createdAt: string
      }
      return {
        id: d.id, filename: d.filename, url: d.url, mimeType: d.mimeType, size: d.size,
        createdAt: d.createdAt, uploadedBy: uploader,
      }
    } catch {
      toast.error(`Could not attach ${file.name}`)
      return null
    }
  }))
  return staged.filter((a): a is AttachmentData => a !== null)
}

/**
 * Drop staged uploads whose comment was not posted, so a failed post does not
 * leak storage or eat into the per-comment staging cap (CMP-3). The files go
 * back into the composer and are staged afresh on retry. Best-effort: the
 * server refuses to drop anything already claimed by a comment.
 */
export async function discardStagedCardCommentFiles(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) =>
    fetch(`/api/comment-attachments?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null),
  ))
}
