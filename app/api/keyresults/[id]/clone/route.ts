import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseStartAndTarget } from '@/lib/keyResultNumbers'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
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
    return apiForbidden('Insufficient permissions to clone key results')
  }

  const { id: keyResultId } = await resolveParams(params)
  if (!keyResultId) return apiBadRequest('Invalid key result id')

  const { title, description, ownerId, startValue, targetValue, unit, objectiveId } = await request.json()

  if (!title || !ownerId || targetValue === undefined || targetValue === null || targetValue === '' || !objectiveId) {
    return apiBadRequest('Title, owner, target value, and objective are required')
  }

  const bounds = parseStartAndTarget(startValue, targetValue)
  if (!bounds.ok) return apiBadRequest(bounds.message)

  const originalKeyResult = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    include: {
      objective: { include: { owner: { select: { id: true, name: true } } } },
      owner: { select: { id: true, name: true } },
    },
  })

  if (!originalKeyResult) return apiNotFound('Original key result not found')

  const canClone =
    session.user.role === 'ADMIN' ||
    session.user.id === originalKeyResult.objective.ownerId

  if (!canClone) {
    return apiForbidden('Insufficient permissions to clone this key result')
  }

  const objective = await prisma.objective.findUnique({ where: { id: objectiveId } })
  if (!objective) return apiNotFound('Objective not found')

  const owner = await prisma.user.findUnique({ where: { id: ownerId } })
  if (!owner) return apiBadRequest('Invalid owner')

  const existingKeyResult = await prisma.keyResult.findFirst({
    where: { title, objectiveId, status: 'ACTIVE' },
  })
  if (existingKeyResult) {
    return apiConflict('A key result with this title already exists in this objective')
  }

  const result = await prisma.$transaction(async (tx) => {
    const clonedKeyResult = await tx.keyResult.create({
      data: {
        title,
        description: description || '',
        ownerId,
        startValue: bounds.start,
        targetValue: bounds.target,
        currentValue: bounds.start,
        unit: unit || '%',
        objectiveId,
        status: 'ACTIVE',
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
      },
    })

    await recalcNodeAndAncestors(tx, objectiveId)
    return clonedKeyResult
  })

  return apiSuccess(result, { status: 201, message: 'Key Result cloned successfully.' })
})
