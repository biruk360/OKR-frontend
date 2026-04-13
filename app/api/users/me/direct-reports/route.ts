import { prisma } from '@/lib/prisma'
import { apiSuccess, withAuth } from '@/lib/api'

export const GET = withAuth(async (_request, { session }) => {
  const directReports = await prisma.managerRelationship.findMany({
    where: {
      managerId: session.user.id,
      endedAt: null,
    },
    include: {
      directReport: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          role: true,
        },
      },
    },
  })

  const users = directReports.map((rel) => rel.directReport)
  return apiSuccess(users)
})
