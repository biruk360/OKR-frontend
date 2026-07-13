import { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
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
  return apiSuccess(view, { status: 201 })
})

export const DELETE = withAuth(async (request: NextRequest, { session }) => {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return apiNotFound('Saved view not found')
  await prisma.scrumSavedView.deleteMany({ where: { id, userId: session.user.id } })
  return apiSuccess({ id })
})
