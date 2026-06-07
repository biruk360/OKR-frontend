import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, withAuth } from '@/lib/api'

/**
 * GET /api/sprints/active — Sprint v2 picker source.
 *
 * Returns sprints with state=ACTIVE that the user can see (own / participating /
 * dept member / admin). Ordered by endDate ASC.
 */
export const GET = withAuth(async (_request: NextRequest, { session }) => {
  const role = session.user.role
  const userId = session.user.id

  let where: any
  if (role === 'ADMIN' || role === 'EXECUTIVE') {
    where = { state: 'ACTIVE' }
  } else {
    const memberships = await prisma.departmentMembership.findMany({
      where: { userId },
      select: { departmentId: true },
    })
    const departmentIds = memberships.map(m => m.departmentId)
    where = {
      state: 'ACTIVE',
      OR: [
        { ownerId: userId },
        { participants: { some: { userId } } },
        ...(departmentIds.length > 0 ? [{ departmentId: { in: departmentIds } }] : []),
      ],
    }
  }

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
