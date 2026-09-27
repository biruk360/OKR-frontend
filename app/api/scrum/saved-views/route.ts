import { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { savedViewSchema } from '@/features/scrum/services/schemas'

export const GET = withAuth(async (_request, { session }) => {
  return apiSuccess(await prisma.scrumSavedView.findMany({ where: { userId: session.user.id }, orderBy: { updatedAt: 'desc' } }))
})

export const POST = withAuth(async (request: NextRequest, { session }) => {
  const json = await request.json().catch(() => null)
  const parsed = savedViewSchema.safeParse(json)
  if (!parsed.success) return apiValidationError('Invalid saved view', parsed.error.flatten())
  const view = await prisma.scrumSavedView.create({
    data: { userId: session.user.id, name: parsed.data.name, filtersJson: parsed.data.filtersJson as Prisma.InputJsonValue, isDefault: parsed.data.isDefault ?? false },
  })
  await recordActivity({
    entityType: 'SCRUM_SAVED_VIEW',
    action: 'CREATED',
    actorId: session.user.id,
    metadata: { savedViewId: view.id, name: view.name },
  })
  return apiSuccess(view, { status: 201 })
})

export const DELETE = withAuth(async (request: NextRequest, { session }) => {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return apiNotFound('Saved view not found')
  const result = await prisma.scrumSavedView.deleteMany({ where: { id, userId: session.user.id } })
  if (result.count === 0) return apiNotFound('Saved view not found')
  await recordActivity({
    entityType: 'SCRUM_SAVED_VIEW',
    action: 'DELETED',
    actorId: session.user.id,
    metadata: { savedViewId: id },
  })
  return apiSuccess({ id })
})
