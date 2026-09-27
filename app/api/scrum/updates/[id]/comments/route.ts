import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { emit } from '@/lib/notifications'
import { apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { scrumCommentSchema } from '@/features/scrum/services/schemas'
import { canViewScrumUser } from '@/features/scrum/services/access'
import { sanitizeScrumRichText } from '@/features/scrum/services/html'
import { isScrumDraft } from '@/features/scrum/services/drafts'
import { attachmentsForComments, claimAttachments } from '@/lib/attachments/claim'

/** `CommentAttachment.commentType` for scrum comments; entityId = the update id. */
const SCRUM_COMMENT_TYPE = 'SCRUM' as const

export const GET = withAuth<{ id: string }>(async (_request, { session, params }) => {
  const update = await prisma.scrumUpdate.findUnique({ where: { id: params.id }, select: { id: true, userId: true, status: true } })
  // Drafts are unsent working state — no comment thread until submitted.
  if (!update || isScrumDraft(update.status)) return apiNotFound('Scrum update not found')
  if (!await canViewScrumUser(session, update.userId)) return apiForbidden('Insufficient permissions')
  const comments = await prisma.scrumComment.findMany({ where: { updateId: params.id }, orderBy: { createdAt: 'asc' }, take: 200 })
  const authorIds = [...new Set(comments.map((c) => c.authorId))]
  const authors = authorIds.length
    ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, avatar: true } })
    : []
  const byId = new Map(authors.map((a) => [a.id, a]))
  // One query for the whole thread, pinned to this update.
  const files = await attachmentsForComments(SCRUM_COMMENT_TYPE, comments.map((c) => c.id), { entityId: params.id })
  return apiSuccess(comments.map((c) => ({ ...c, author: byId.get(c.authorId) ?? null, attachments: files.get(c.id) ?? [] })))
})

export const POST = withAuth<{ id: string }>(async (request: NextRequest, { session, params }) => {
  const json = await request.json().catch(() => null)
  const parsed = scrumCommentSchema.safeParse(json)
  if (!parsed.success) return apiValidationError('Invalid comment', parsed.error.flatten())
  const update = await prisma.scrumUpdate.findUnique({ where: { id: params.id } })
  if (!update || isScrumDraft(update.status)) return apiNotFound('Scrum update not found')
  if (!await canViewScrumUser(session, update.userId)) return apiForbidden('Insufficient permissions')
  const body = sanitizeScrumRichText(parsed.data.body)
  if (!body) return apiValidationError('Comment cannot be empty')
  // Only notify mentioned users who exist and are active.
  const requestedMentions = [...new Set(parsed.data.mentions ?? [])]
  const mentions = requestedMentions.length
    ? (await prisma.user.findMany({ where: { id: { in: requestedMentions }, isActive: true }, select: { id: true } })).map((u) => u.id)
    : []
  const comment = await prisma.scrumComment.create({
    data: {
      updateId: params.id,
      authorId: session.user.id,
      body,
      mentions,
    },
  })
  // Staged via POST /api/comment-attachments (SCRUM, entityId = update id).
  // Scoped to this uploader, this update and still-unclaimed rows, so another
  // person's (or another update's) attachment id is ignored.
  const attachmentIds = [...new Set(parsed.data.attachmentIds ?? [])]
  const attachments = attachmentIds.length
    ? await claimAttachments({
      ids: attachmentIds,
      commentType: SCRUM_COMMENT_TYPE,
      commentId: comment.id,
      entityId: params.id,
      uploaderId: session.user.id,
    })
    : []
  await recordActivity({ entityType: 'SCRUM_UPDATE', action: 'COMMENTED', actorId: session.user.id, metadata: { updateId: params.id, commentId: comment.id, attachmentCount: attachments.length } })
  await emit('SCRUM_COMMENT', {
    actorId: session.user.id,
    entityType: 'SCRUM_UPDATE',
    entityId: params.id,
    explicitRecipients: [...new Set([update.userId, ...comment.mentions].filter((id) => id !== session.user.id))],
    data: { commentPreview: body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) },
  })
  return apiSuccess({ ...comment, attachments }, { status: 201, message: 'Comment added' })
})
