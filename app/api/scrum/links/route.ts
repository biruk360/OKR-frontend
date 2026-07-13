import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { linkCreateSchema } from '@/features/scrum/services/schemas'
import { deriveLinkType } from '@/features/scrum/services/scrum-links'

export const POST = withAuth(async (request: NextRequest, { session }) => {
  const json = await request.json().catch(() => null)
  const parsed = linkCreateSchema.safeParse(json)
  if (!parsed.success) return apiValidationError('Invalid link', parsed.error.flatten())
  const update = await prisma.scrumUpdate.findUnique({ where: { id: parsed.data.updateId }, select: { id: true } })
  if (!update) return apiNotFound('Scrum update not found')
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
  return apiSuccess(link, { status: 201 })
})

export const DELETE = withAuth(async (request: NextRequest) => {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return apiNotFound('Link not found')
  await prisma.scrumUpdateLink.delete({ where: { id } })
  return apiSuccess({ id })
})
