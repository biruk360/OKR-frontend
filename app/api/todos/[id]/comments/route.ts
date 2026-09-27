import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveMentions } from '@/lib/comments'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { emit, resolveTodoStakeholders } from '@/lib/notifications'
import { apiSuccess, apiBadRequest, apiNotFound, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { runAfterResponse } from '@/lib/background'
import { todoReadGuard, todoWriteGuard } from '@/lib/todos/access'
import { claimAttachments } from '@/lib/attachments/claim'
import { MAX_ATTACHMENTS_PER_COMMENT } from '@/lib/attachments/file-types'
import { hydrateTodoCommentAttachments, TODO_COMMENT_TYPE } from '@/lib/attachments/todo-comments'

/**
 * Card comment thread. Reading requires the card read rule (`canReadTodo`);
 * posting is a card write (`todoWriteGuard`: `canWriteTodo`, 409 SPRINT_CLOSED
 * once the card's sprint is closed — CDM-11 / STA-7). A card the caller cannot
 * read answers 404 like a missing one, so ids cannot be probed.
 *
 * Attachments live on `CommentAttachment` (commentType 'TODO') like every other
 * comment surface — see lib/attachments/todo-comments.ts (ATT-4).
 */
export const GET = withAuth<RouteIdParams>(async (_req, { session, params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')
  const denied = await todoReadGuard(todoId, session.user)
  if (denied) return denied

  const comments = await prisma.todoComment.findMany({
    where: { todoId, parentId: null },
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, name: true, avatar: true } },
      replies: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, name: true, avatar: true } } },
      },
    },
  })

  // Both storage shapes (NRG-3): CommentAttachment rows, and — for comments
  // not yet migrated (ATT-4) — the legacy TodoAttachment ids in the JSON column.
  const attachmentsBy = await hydrateTodoCommentAttachments(
    todoId,
    comments.flatMap((c) => [c, ...c.replies]),
  )
  const hydrated = comments.map((c) => ({
    ...c,
    attachments: attachmentsBy.get(c.id) ?? [],
    replies: c.replies.map((r) => ({ ...r, attachments: attachmentsBy.get(r.id) ?? [] })),
  }))
  return apiSuccess(hydrated)
})

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')
  const denied = await todoWriteGuard(todoId, session.user, 'You do not have access to this card')
  if (denied) return denied

  const { content, parentId, attachmentIds } = await request.json().catch(() => ({}))
  if (typeof content !== 'string' || !content.trim()) return apiBadRequest('Comment content is required')

  const todo = await prisma.todo.findUnique({
    where: { id: todoId },
    select: { id: true, title: true, assigneeId: true, creatorId: true },
  })
  if (!todo) return apiNotFound('To-do not found')

  // A reply must hang off a top-level comment of *this* card. Without the pin a
  // reply could be attached to another card's thread (and notify this card's
  // stakeholders about it); the thread is one level deep, so a reply to a reply
  // would never be rendered by GET.
  if (parentId != null) {
    if (typeof parentId !== 'string') return apiBadRequest('Invalid parentId')
    const parent = await prisma.todoComment.findUnique({
      where: { id: parentId },
      select: { todoId: true, parentId: true },
    })
    if (!parent || parent.todoId !== todoId) return apiNotFound('Parent comment not found')
    if (parent.parentId !== null) return apiBadRequest('Replies can only be added to top-level comments')
  }

  const requestedAttachmentIds: string[] = Array.isArray(attachmentIds)
    ? Array.from(new Set((attachmentIds as unknown[]).filter((x): x is string => typeof x === 'string')))
        .slice(0, MAX_ATTACHMENTS_PER_COMMENT)
    : []
  // New composers send CommentAttachment ids staged through
  // POST /api/comment-attachments (ATT-4); those are claimed below, scoped to
  // this uploader, this card and still-unclaimed rows. A client built before
  // ATT-4 may still send TodoAttachment ids: only this card's are accepted —
  // a foreign id must not be stored in the comment's JSON, even though
  // hydration would drop it — and they keep rendering through the legacy JSON
  // path until scripts/migrate-todo-comment-attachments.ts moves them.
  const ownedAttachmentIds = requestedAttachmentIds.length > 0
    ? new Set((await prisma.todoAttachment.findMany({
        where: { id: { in: requestedAttachmentIds }, todoId },
        select: { id: true },
      })).map((a) => a.id))
    : new Set<string>()
  const legacyAttachmentIds = requestedAttachmentIds.filter((id) => ownedAttachmentIds.has(id))
  const stagedAttachmentIds = requestedAttachmentIds.filter((id) => !ownedAttachmentIds.has(id))

  const created = await prisma.todoComment.create({
    data: {
      todoId,
      authorId: session.user.id,
      content,
      parentId: parentId ?? null,
      commentAttachments: legacyAttachmentIds.length > 0 ? JSON.stringify(legacyAttachmentIds) : null,
    },
    include: {
      author: { select: { id: true, name: true, avatar: true } },
      replies: { include: { author: { select: { id: true, name: true, avatar: true } } } },
    },
  })

  // Same claim as OKR comments: only this caller's unclaimed uploads for this
  // card attach; anything else in the list is ignored.
  if (stagedAttachmentIds.length > 0) {
    await claimAttachments({
      ids: stagedAttachmentIds,
      commentType: TODO_COMMENT_TYPE,
      commentId: created.id,
      entityId: todoId,
      uploaderId: session.user.id,
    })
  }

  // Hydrate attachments for the response — the same shape GET returns.
  const attachments = requestedAttachmentIds.length > 0
    ? (await hydrateTodoCommentAttachments(todoId, [created])).get(created.id) ?? []
    : []
  const comment = { ...created, attachments }

  await recordActivity({
    entityType: 'TODO', todoId, action: 'INITIATIVE_COMMENTED',
    actorId: session.user.id,
    metadata: { commentId: created.id, attachmentCount: attachments.length },
  })

  // Notifications run after the response (CPF-7). They were awaited inline —
  // two emit() fan-outs plus an SMTP send per mention — so the author waited on
  // every recipient's email before their own comment appeared. Same events,
  // recipients and payloads as before (CPF-8); only the timing moved.
  const actor = { id: session.user.id, name: session.user.name }
  runAfterResponse('todo-comment-notify', () =>
    notifyTodoComment({ todoId, todoTitle: todo.title, content, actor }),
  )

  return apiSuccess(comment, { status: 201 })
})

async function notifyTodoComment({ todoId, todoTitle, content, actor }: {
  todoId: string
  todoTitle: string
  content: string
  actor: { id: string; name: string | null | undefined }
}): Promise<void> {
  // @mention notifications (in-app + email, via the dispatcher)
  // Shared with every other comment surface (lib/comments.ts). The local regex
  // this replaced only read `data-mention-id`, which the editor wrote empty, so
  // it always returned [] and USER_MENTIONED never fired.
  const mentionedIds = (await resolveMentions(content)).filter((uid) => uid !== actor.id)
  if (mentionedIds.length > 0) {
    const mentionedUsers = await prisma.user.findMany({
      where: { id: { in: mentionedIds }, isActive: true },
      select: { id: true },
    })
    await emit('USER_MENTIONED', {
      actorId: actor.id,
      entityType: 'TODO',
      entityId: todoId,
      entityTitle: todoTitle,
      explicitRecipients: mentionedUsers.map((u) => u.id),
      data: {
        actorName: actor.name,
        commentSnippet: content.replace(/<[^>]+>/g, '').slice(0, 200),
        deepLink: `/dashboard/todos?open=${todoId}`,
        isMention: true,
      },
    })
    // No direct sendMail here. emit() already emails every mentioned user,
    // honouring their COMMENT preference (IMMEDIATE sends now, BATCHED/DAILY
    // queue for the digest drain, DISABLED/email-off sends nothing). The direct
    // send that used to follow bypassed those prefs and double-emailed anyone on
    // IMMEDIATE.
  }

  // Fan out a generic "new comment" notification to all interactors not already
  // covered by an @mention. COMMENT_ON_OWNED_ENTITY's default cadence is DAILY
  // so this coalesces into the digest rather than sending one email per reply.
  const mentionedSet = new Set(mentionedIds)
  const stakeholders = (await resolveTodoStakeholders(todoId)).filter(
    (id) => id !== actor.id && !mentionedSet.has(id),
  )
  if (stakeholders.length > 0) {
    await emit('COMMENT_ON_OWNED_ENTITY', {
      actorId: actor.id,
      entityType: 'TODO',
      entityId: todoId,
      entityTitle: todoTitle,
      explicitRecipients: stakeholders,
      data: {
        actorName: actor.name,
        commentSnippet: content.replace(/<[^>]+>/g, '').slice(0, 200),
        deepLink: `/dashboard/todos?open=${todoId}`,
      },
    })
  }
}
