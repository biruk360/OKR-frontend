import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiNotFound, withAuth } from '@/lib/api'

export const GET = withAuth<RouteIdParams>(async (_request, { params }) => {
  const { id: objectiveId } = await resolveParams(params)
  if (!objectiveId) return apiBadRequest('Invalid objective id')

  const parentObjective = await prisma.objective.findUnique({
    where: { id: objectiveId },
    select: { id: true, title: true, level: true },
  })

  if (!parentObjective) return apiNotFound('Parent objective not found')

  const childObjectives = await prisma.objective.findMany({
    where: { parentObjectiveId: objectiveId, status: 'ACTIVE' },
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      timeframe: true,
      department: { select: { id: true, name: true } },
      _count: { select: { keyResults: true, childObjectives: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return apiSuccess({ parentObjective, childObjectives })
})
