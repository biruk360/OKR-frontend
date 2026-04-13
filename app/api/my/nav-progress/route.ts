import { prisma } from '@/lib/prisma'
import { apiSuccess, withAuth } from '@/lib/api'

/**
 * Compact OKR summary for the top-nav progress circles.
 * Returns the current user's active objectives (as owner OR contributor) with
 * their KRs inlined so the hover popover can render without a second fetch.
 */
export const GET = withAuth(async (_req, { session }) => {
  const userId = session.user.id

  const objectives = await prisma.objective.findMany({
    where: {
      status: 'ACTIVE',
      OR: [{ ownerId: userId }, { contributors: { some: { userId } } }],
    },
    orderBy: [{ goalStatus: 'asc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      title: true,
      progress: true,
      goalStatus: true,
      level: true,
      keyResults: {
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          title: true,
          progress: true,
          confidence: true,
        },
      },
    },
    take: 16,
  })

  return apiSuccess(objectives)
})
