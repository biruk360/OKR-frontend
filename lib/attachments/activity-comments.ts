/**
 * Project activity comment attachments on the shared `CommentAttachment` model.
 *
 * Files stage and claim through the same path as OKR and card comments
 * (POST /api/comment-attachments with `commentType: 'ACTIVITY'` and the
 * activity id as `entityId`; claimed on comment POST; served by
 * GET /api/comment-attachments/[id] under the project read rule in
 * lib/attachments/access.ts).
 *
 * INTERNAL ONLY. Only the internal comment routes decorate their tree with
 * these — the portal comment reads never call this, and the serve route refuses
 * portal sessions — so a CLIENT_VISIBLE comment's files are not shown to the
 * client (project invariant 5). Exposing them would need a per-file visibility
 * flag and a portal serve route filtered by it.
 *
 * Spec: docs/comment_attachments_REQUIREMENTS.md CMP-5, ATT-2, ATT-3, A4.
 */

import { attachmentsForComments, type AttachmentDto } from './claim'

export const ACTIVITY_COMMENT_TYPE = 'ACTIVITY' as const

interface CommentTreeNode {
  id: string
  replies: CommentTreeNode[]
}

export type WithAttachments<T> = T & { attachments: AttachmentDto[] }

function collectIds(nodes: CommentTreeNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    out.push(n.id)
    collectIds(n.replies, out)
  }
  return out
}

/**
 * Adds `attachments` to every node of an activity comment tree (roots and
 * replies), in place. One query; rows are pinned to this activity.
 */
export async function withActivityCommentAttachments<T extends CommentTreeNode>(
  activityId: string,
  roots: T[],
): Promise<Array<WithAttachments<T>>> {
  const byComment = await attachmentsForComments(ACTIVITY_COMMENT_TYPE, collectIds(roots), { entityId: activityId })
  const decorate = (nodes: CommentTreeNode[]) => {
    for (const n of nodes) {
      ;(n as WithAttachments<CommentTreeNode>).attachments = byComment.get(n.id) ?? []
      decorate(n.replies)
    }
  }
  decorate(roots)
  return roots as Array<WithAttachments<T>>
}
