import { prisma } from '@/lib/prisma'
import { apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import { canReadDevelopmentActions } from '@/lib/performance'

export const GET = withAuth(async (_request, { session }) => {
  if (!await canReadDevelopmentActions({ userId: session.user.id, role: session.user.role })) {
    return apiForbidden('You do not have access to development actions')
  }
  const actions = await prisma.developmentAction.findMany({
    include: {
      evaluation: {
        select: {
          id: true,
          decisionBand: true,
          normalized: true,
          employee: { select: { id: true, name: true, designation: true } },
          cycle: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
  return apiSuccess(actions)
})
