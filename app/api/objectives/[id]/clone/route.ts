import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiConflict,
  withAuth,
} from '@/lib/api'

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  if (!['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD'].includes(session.user.role)) {
    return apiForbidden('Insufficient permissions to clone objectives')
  }

  const { id: objectiveId } = await resolveParams(params)
  if (!objectiveId) return apiBadRequest('Invalid objective id')

  const { title, timeframeId, includeKeyResults } = await request.json()

  if (!title || !timeframeId) {
    return apiBadRequest('Title and timeframe are required')
  }

  const originalObjective = await prisma.objective.findUnique({
    where: { id: objectiveId },
    include: {
      keyResults: { where: { status: 'ACTIVE' } },
      owner: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
    },
  })

  if (!originalObjective) return apiNotFound('Original objective not found')

  const timeframe = await prisma.timeframe.findUnique({ where: { id: timeframeId } })
  if (!timeframe) return apiBadRequest('Invalid timeframe')

  const existingObjective = await prisma.objective.findFirst({
    where: { title, timeframeId, status: 'ACTIVE' },
  })
  if (existingObjective) {
    return apiConflict('An objective with this title already exists in the selected timeframe')
  }

  const result = await prisma.$transaction(async (tx) => {
    const clonedObjective = await tx.objective.create({
      data: {
        title,
        description: originalObjective.description,
        level: originalObjective.level,
        ownerId: originalObjective.ownerId,
        timeframeId,
        departmentId: originalObjective.departmentId,
        status: 'ACTIVE',
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        timeframe: true,
        department: { select: { id: true, name: true } },
      },
    })

    if (includeKeyResults && originalObjective.keyResults.length > 0) {
      const keyResultsToCreate = originalObjective.keyResults.map((kr) => ({
        title: kr.title,
        description: kr.description,
        targetValue: kr.targetValue,
        currentValue: 0,
        unit: kr.unit,
        objectiveId: clonedObjective.id,
        ownerId: kr.ownerId,
        status: 'ACTIVE',
      }))

      await tx.keyResult.createMany({ data: keyResultsToCreate })
    }

    return clonedObjective
  })

  const completeClonedObjective = await prisma.objective.findUnique({
    where: { id: result.id },
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      timeframe: true,
      department: { select: { id: true, name: true } },
      keyResults: {
        include: { owner: { select: { id: true, name: true, avatar: true } } },
      },
      _count: { select: { keyResults: true, childObjectives: true } },
    },
  })

  return apiSuccess(completeClonedObjective, {
    status: 201,
    message: 'Objective cloned successfully.',
  })
})
