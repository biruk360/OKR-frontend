import { prisma } from '@/lib/prisma'
import { apiSuccess, withAuth } from '@/lib/api'

export const GET = withAuth(async (_request, { session }) => {
  const userDepartments = await prisma.departmentMembership.findMany({
    where: { userId: session.user.id },
    include: {
      department: { select: { id: true, name: true } },
    },
  })

  const departments = userDepartments.map((membership) => membership.department)
  return apiSuccess(departments)
})
