import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { emit } from '@/lib/notifications'
import { sendMail } from '@/lib/email'
import { apiSuccess, apiBadRequest, apiNotFound, withAuth } from '@/lib/api'

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
  return apiSuccess(comments)
})

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')

  const { content, parentId } = await request.json()
  if (!content?.trim()) return apiBadRequest('Comment content is required')

  const todo = await prisma.todo.findUnique({
    where: { id: todoId },
    select: { id: true, title: true, assigneeId: true, creatorId: true },
  })
  if (!todo) return apiNotFound('To-do not found')

  const comment = await prisma.todoComment.create({
    data: { todoId, authorId: session.user.id, content, parentId: parentId ?? null },
    include: {
      author: { select: { id: true, name: true, avatar: true } },
      replies: { include: { author: { select: { id: true, name: true, avatar: true } } } },
    },
  })

  // @mention notifications + email
  const mentionedIds = extractMentions(content).filter((uid) => uid !== session.user.id)
  if (mentionedIds.length > 0) {
    const mentionedUsers = await prisma.user.findMany({
      where: { id: { in: mentionedIds }, isActive: true },
      select: { id: true, name: true, email: true },
    })
    await emit('TODO_ASSIGNED', {  // repurpose TODO_ASSIGNED for @mention — closest event with correct recipients
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

  return apiSuccess(comment, { status: 201 })
})
