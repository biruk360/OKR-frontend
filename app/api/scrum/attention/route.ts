import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiSuccess, withAuth } from '@/lib/api'
import { serializeScrumUpdates } from '@/features/scrum/services/scrum-serializer'

export const GET = withAuth(async (request: NextRequest, { session }) => {
  const q = new URL(request.url).searchParams
  const objectiveId = q.get('objectiveId')
  const keyResultId = q.get('keyResultId')
  const todoId = q.get('todoId')
  if (!objectiveId && !keyResultId && !todoId) return apiBadRequest('objectiveId, keyResultId, or todoId is required')
  const links = await prisma.scrumUpdateLink.findMany({
    where: {
      ...(objectiveId ? { objectiveId } : {}),
      ...(keyResultId ? { keyResultId } : {}),
      ...(todoId ? { todoId } : {}),
    },
    include: { update: { include: { links: true, celebrations: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const updates = links.map((link) => link.update)
  return apiSuccess({
    count: updates.length,
    contextCounts: links.reduce<Record<string, number>>((acc, link) => {
      acc[link.context] = (acc[link.context] ?? 0) + 1
      return acc
    }, {}),
    updates: await serializeScrumUpdates(updates as any[], { id: session.user.id, role: session.user.role }),
  })
})
