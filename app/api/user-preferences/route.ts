import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, withAuth } from '@/lib/api'

export const GET = withAuth(async (_request, { session }) => {
  const pref = await prisma.userPreference.findUnique({
    where: { userId: session.user.id },
  })
  return apiSuccess(pref || { todoViewMode: 'modal' })
})

export const PATCH = withAuth(async (request: NextRequest, { session }) => {
  const body = await request.json()
  const data: any = {}
  if (body.todoViewMode === 'modal' || body.todoViewMode === 'sidebar') {
    data.todoViewMode = body.todoViewMode
  }

  const pref = await prisma.userPreference.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...data },
    update: data,
  })
  return apiSuccess(pref)
})
