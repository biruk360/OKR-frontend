import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isScrumDraft } from '@/features/scrum/services/drafts'
import { recordActivity } from '@/lib/activity-log'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { linkCreateSchema } from '@/features/scrum/services/schemas'
import { deriveLinkType, validateLinkOwnership } from '@/features/scrum/services/scrum-links'
import { canActOnScrumUpdate } from '@/features/scrum/services/access'

export const POST = withAuth(async (request: NextRequest, { session }) => {
  const json = await request.json().catch(() => null)
  const parsed = linkCreateSchema.safeParse(json)
  if (!parsed.success) return apiValidationError('Invalid link', parsed.error.flatten())
  const update = await prisma.scrumUpdate.findUnique({ where: { id: parsed.data.updateId }, select: { id: true, userId: true, status: true } })
  // Links feed OKR attention analytics — a draft gets them when it is submitted.
  if (!update || isScrumDraft(update.status)) return apiNotFound('Scrum update not found')
  if (!await canActOnScrumUpdate(session, update)) return apiForbidden('You cannot link items to this scrum update')
  const ownership = await validateLinkOwnership(update.userId, [parsed.data])
  if (!ownership.valid) return apiBadRequest(ownership.reason ?? 'Linked item does not belong to this user')
  const link = await prisma.scrumUpdateLink.create({
    data: {
      updateId: parsed.data.updateId,
      objectiveId: parsed.data.objectiveId ?? null,
      keyResultId: parsed.data.keyResultId ?? null,
      todoId: parsed.data.todoId ?? null,
      linkType: deriveLinkType(parsed.data),
      context: parsed.data.context,
      progressNote: parsed.data.progressNote ?? null,
      createdById: session.user.id,
    },
  })
  await recordActivity({
    entityType: 'SCRUM_LINK',
    action: 'CREATED',
    actorId: session.user.id,
    objectiveId: link.objectiveId,
    keyResultId: link.keyResultId,
    todoId: link.todoId,
    metadata: { updateId: update.id, linkId: link.id, linkType: link.linkType, context: link.context },
  })
  return apiSuccess(link, { status: 201 })
})

export const DELETE = withAuth(async (request: NextRequest, { session }) => {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return apiNotFound('Link not found')
  const link = await prisma.scrumUpdateLink.findUnique({
    where: { id },
    select: { id: true, updateId: true, objectiveId: true, keyResultId: true, todoId: true, linkType: true, context: true, update: { select: { userId: true } } },
  })
  if (!link) return apiNotFound('Link not found')
  if (!await canActOnScrumUpdate(session, link.update)) return apiForbidden('You cannot remove links from this scrum update')
  await prisma.scrumUpdateLink.delete({ where: { id } })
  await recordActivity({
    entityType: 'SCRUM_LINK',
    action: 'DELETED',
    actorId: session.user.id,
    metadata: {
      updateId: link.updateId,
      linkId: link.id,
      linkType: link.linkType,
      context: link.context,
      objectiveId: link.objectiveId,
      keyResultId: link.keyResultId,
      todoId: link.todoId,
    },
  })
  return apiSuccess({ id })
})
