import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiForbidden, apiNotFound, withAuth } from '@/lib/api'
import { todoWriteGuard } from '@/lib/todos/access'
import { deleteTodoCommentAttachments } from '@/lib/attachments/todo-comments'

type Params = { id: string; commentId: string }

/**
 * Who may edit or delete a comment: its author, or an ADMIN/EXECUTIVE acting as
 * a moderator. EXECUTIVE was previously excluded here while being treated as
 * ADMIN-equivalent everywhere else (see lib/permissions.ts), so moderation
 * silently failed for them.
 *
 * Enforced server-side: the UI hides the controls, but hiding is not a gate.
 * Spec: docs/trello_parity_sprint_board_REQUIREMENTS.md CDM-7 / SEC-3.
 */
function canModerateComment(authorId: string, actor: { id: string; role: string }): boolean {
  return authorId === actor.id || actor.role === 'ADMIN' || actor.role === 'EXECUTIVE'
}

/**
 * Before moderation: editing or deleting a comment is a card write — the
 * caller must still pass `canWriteTodo` (an author removed from the card loses
 * edit rights with it; 404 when they can no longer even read it), and a card
 * in a closed sprint is read-only (409 SPRINT_CLOSED, CDM-11 / STA-7).
 */
async function cardGuard(todoId: string, session: { user: { id: string; role: string; userType?: string | null } }) {
  return todoWriteGuard(todoId, session.user, 'You do not have access to this card')
}

export const PATCH = withAuth<Params>(async (request: NextRequest, { session, params }) => {
  const { id: todoId, commentId } = await resolveParams(params)
  if (!todoId || !commentId) return apiBadRequest('Invalid params')
  const denied = await cardGuard(todoId, session)
  if (denied) return denied
  const { content } = await request.json().catch(() => ({}))
  if (typeof content !== 'string' || !content.trim()) return apiBadRequest('Content required')

  const comment = await prisma.todoComment.findUnique({ where: { id: commentId } })
  if (!comment || comment.todoId !== todoId) return apiNotFound('Comment not found')
  if (!canModerateComment(comment.authorId, { id: session.user.id, role: session.user.role })) {
    return apiForbidden('Not your comment')
  }

  const updated = await prisma.todoComment.update({
    where: { id: commentId },
    data: { content },
    include: { author: { select: { id: true, name: true, avatar: true } }, replies: { include: { author: { select: { id: true, name: true, avatar: true } } } } },
  })
  return apiSuccess(updated)
})

export const DELETE = withAuth<Params>(async (_req, { session, params }) => {
  const { id: todoId, commentId } = await resolveParams(params)
  if (!todoId || !commentId) return apiBadRequest('Invalid params')
  const denied = await cardGuard(todoId, session)
  if (denied) return denied

  const comment = await prisma.todoComment.findUnique({ where: { id: commentId } })
  if (!comment || comment.todoId !== todoId) return apiNotFound('Comment not found')
  if (!canModerateComment(comment.authorId, { id: session.user.id, role: session.user.role })) {
    return apiForbidden('Not your comment')
  }

  await prisma.todoComment.delete({ where: { id: commentId } })
  // ATT-3 — the comment's CommentAttachment rows and their bytes go with it.
  // (Legacy JSON ids point at card attachments, which outlive the comment.)
  await deleteTodoCommentAttachments(commentId)
  return apiSuccess(null)
})
