import { prisma } from '@/lib/prisma'
import { apiSuccess, withAuth } from '@/lib/api'
import { serializeScrumUpdates } from '@/features/scrum/services/scrum-serializer'

export const GET = withAuth(async (_request, { session }) => {
  const wins = await prisma.scrumUpdate.findMany({
    where: { hasWin: true },
    include: { celebrations: true, links: true },
    orderBy: { scrumDate: 'desc' },
    take: 100,
  })
  return apiSuccess(await serializeScrumUpdates(wins as any[], { id: session.user.id, role: session.user.role }))
})
