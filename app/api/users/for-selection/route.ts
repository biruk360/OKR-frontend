import { prisma } from '@/lib/prisma'
import { apiSuccess, withAuth } from '@/lib/api'
import { selectableSystemUserEmailWhere } from '@/lib/users/selectable-system-users'

export const GET = withAuth(async () => {
  const users = await prisma.user.findMany({
    where: { isActive: true, ...selectableSystemUserEmailWhere() },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
    orderBy: { name: 'asc' },
  })
  return apiSuccess(users)
})
