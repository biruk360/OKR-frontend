import { prisma } from '@/lib/prisma'
import { apiSuccess, withAuth } from '@/lib/api'

export const GET = withAuth(async () => {
  const users = await prisma.user.findMany({
    where: { isActive: true },
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
