import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, withAuth } from '@/lib/api'
import { sprintVisibilityWhere } from '@/lib/permissions'

/**
 * GET /api/sprints/active — Sprint v2 picker source.
 *
 * Returns sprints with state=ACTIVE that the user can see — the invite-only
 * rule `sprintVisibilityWhere` (ADMIN/EXECUTIVE: all; everyone else: sprints
 * they own or participate in). Ordered by endDate ASC.
 */
export const GET = withAuth(async (_request: NextRequest, { session }) => {
  const where = { AND: [{ state: 'ACTIVE' }, sprintVisibilityWhere(session.user)] }

  const sprints = await prisma.sprint.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      _count: { select: { todos: true } },
    },
    orderBy: [{ endDate: 'asc' }, { createdAt: 'desc' }],
  })

  return apiSuccess(sprints)
})
