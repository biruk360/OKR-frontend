import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { emit, resolveTodoStakeholders } from '@/lib/notifications'
import { sendMail } from '@/lib/email'
import { apiSuccess, apiBadRequest, apiNotFound, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'

// Extract @mention user ids from Tiptap HTML (data-mention-id attribute)
function extractMentions(html: string): string[] {
  const re = /data-mention-id="([^"]+)"/g
  const ids: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) { if (!ids.includes(m[1])) ids.push(m[1]) }
  return ids
}

export const GET = withAuth<RouteIdParams>(async (_req, { params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')

  const todo = await prisma.todo.findUnique({ where: { id: todoId }, select: { id: true } })
  if (!todo) return apiNotFound('To-do not found')

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

  // Collect referenced attachment ids and fetch in one query
  const allIds = new Set<string>()
  const parseIds = (raw: string | null): string[] => {
    if (!raw) return []
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [] } catch { return [] }
  }
  for (const c of comments) {
    parseIds(c.commentAttachments).forEach((id) => allIds.add(id))
    for (const r of c.replies) parseIds((r as { commentAttachments: string | null }).commentAttachments).forEach((id) => allIds.add(id))
  }
  const attachmentRows = allIds.size > 0
    ? await prisma.todoAttachment.findMany({
        where: { id: { in: Array.from(allIds) }, todoId },
        include: { uploadedBy: { select: { id: true, name: true } } },
      })
    : []
  const attMap = new Map(attachmentRows.map((a) => [a.id, a]))
  const hydrated = comments.map((c) => ({
    ...c,
    attachments: parseIds(c.commentAttachments).map((id) => attMap.get(id)).filter(Boolean),
    replies: c.replies.map((r) => ({
      ...r,
      attachments: parseIds((r as { commentAttachments: string | null }).commentAttachments).map((id) => attMap.get(id)).filter(Boolean),
    })),
  }))
  return apiSuccess(hydrated)
})

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')

  const { content, parentId, attachmentIds } = await request.json()
  if (!content?.trim()) return apiBadRequest('Comment content is required')

  const todo = await prisma.todo.findUnique({
    where: { id: todoId },
    select: { id: true, title: true, assigneeId: true, creatorId: true },
  })
  if (!todo) return apiNotFound('To-do not found')

  const validAttachmentIds: string[] = Array.isArray(attachmentIds)
    ? (attachmentIds as unknown[]).filter((x): x is string => typeof x === 'string')
    : []

  const created = await prisma.todoComment.create({
    data: {
      todoId,
      authorId: session.user.id,
      content,
      parentId: parentId ?? null,
      commentAttachments: validAttachmentIds.length > 0 ? JSON.stringify(validAttachmentIds) : null,
    },
    include: {
      author: { select: { id: true, name: true, avatar: true } },
      replies: { include: { author: { select: { id: true, name: true, avatar: true } } } },
    },
  })

  // Hydrate attachments for response
  const attachments = validAttachmentIds.length > 0
    ? await prisma.todoAttachment.findMany({
        where: { id: { in: validAttachmentIds }, todoId },
        include: { uploadedBy: { select: { id: true, name: true } } },
      })
    : []
  const comment = { ...created, attachments }

  await recordActivity({
    entityType: 'TODO', todoId, action: 'INITIATIVE_COMMENTED',
    actorId: session.user.id,
    metadata: { commentId: created.id, attachmentCount: attachments.length },
  })

  // @mention notifications + email
  const mentionedIds = extractMentions(content).filter((uid) => uid !== session.user.id)
  if (mentionedIds.length > 0) {
    const mentionedUsers = await prisma.user.findMany({
      where: { id: { in: mentionedIds }, isActive: true },
      select: { id: true, name: true, email: true },
    })
    await emit('USER_MENTIONED', {
      actorId: session.user.id,
      entityType: 'TODO',
      entityId: todoId,
      entityTitle: todo.title,
      explicitRecipients: mentionedUsers.map((u) => u.id),
      data: {
        actorName: session.user.name,
        commentSnippet: content.replace(/<[^>]+>/g, '').slice(0, 200),
        deepLink: `/dashboard/todos?open=${todoId}`,
        isMention: true,
      },
    })
    // Send email to each mentioned user
    for (const u of mentionedUsers) {
      await sendMail({
        to: u.email,
        subject: `${session.user.name} mentioned you in "${todo.title}"`,
        html: `<p><strong>${session.user.name}</strong> mentioned you in a comment on <strong>${todo.title}</strong>.</p>
               <blockquote>${content.replace(/<[^>]+>/g, '').slice(0, 300)}</blockquote>
               <p><a href="${process.env.NEXTAUTH_URL}/dashboard/todos?open=${todoId}">View card →</a></p>`,
        text: `${session.user.name} mentioned you in "${todo.title}". Open: ${process.env.NEXTAUTH_URL}/dashboard/todos?open=${todoId}`,
      })
    }
  }

  // Fan out a generic "new comment" notification to all interactors not already
  // covered by an @mention. COMMENT_ON_OWNED_ENTITY's default cadence is DAILY
  // so this coalesces into the digest rather than sending one email per reply.
  const mentionedSet = new Set(mentionedIds)
  const stakeholders = (await resolveTodoStakeholders(todoId)).filter(
    (id) => id !== session.user.id && !mentionedSet.has(id),
  )
  if (stakeholders.length > 0) {
    await emit('COMMENT_ON_OWNED_ENTITY', {
      actorId: session.user.id,
      entityType: 'TODO',
      entityId: todoId,
      entityTitle: todo.title,
      explicitRecipients: stakeholders,
      data: {
        actorName: session.user.name,
        commentSnippet: content.replace(/<[^>]+>/g, '').slice(0, 200),
        deepLink: `/dashboard/todos?open=${todoId}`,
      },
    })
  }

  return apiSuccess(comment, { status: 201 })
})
