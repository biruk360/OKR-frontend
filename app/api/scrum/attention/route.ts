import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { SUBMITTED_SCRUM_UPDATE_WHERE } from '@/features/scrum/services/drafts'
import { apiBadRequest, apiSuccess, withAuth } from '@/lib/api'
import { serializeScrumUpdates } from '@/features/scrum/services/scrum-serializer'
import { canViewScrumUser } from '@/features/scrum/services/access'

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
      update: SUBMITTED_SCRUM_UPDATE_WHERE,
    },
    include: { update: { include: { links: true, celebrations: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  // Only surface updates whose author the viewer may see (same rule as GET /updates/[id]).
  const authorIds = [...new Set(links.map((link) => link.update.userId))]
  const visible = new Set<string>()
  await Promise.all(authorIds.map(async (id) => { if (await canViewScrumUser(session, id)) visible.add(id) }))
  const visibleLinks = links.filter((link) => visible.has(link.update.userId))
  const updates = visibleLinks.map((link) => link.update)
  return apiSuccess({
    count: updates.length,
    contextCounts: visibleLinks.reduce<Record<string, number>>((acc, link) => {
      acc[link.context] = (acc[link.context] ?? 0) + 1
      return acc
    }, {}),
    updates: await serializeScrumUpdates(updates as any[], { id: session.user.id, role: session.user.role }),
  })
})
