import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  canEditKeyResultWithObjectiveContext,
  canViewKeyResult,
  redactKeyResult,
} from '@/lib/permissions'
import { parseStartAndTarget } from '@/lib/keyResultNumbers'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { keyResultLockResponse } from '@/lib/okr/lock-guard'
import { recordActivity, recordUpdateIfChanged } from '@/lib/activity-log'
import { normalizeCadence } from '@/lib/check-in-cadence'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'
import { filterFieldsByPermLevel } from '@/lib/field-filter'

export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid key result id')

  const keyResult = await prisma.keyResult.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      objective: {
        select: {
          id: true,
          title: true,
          level: true,
          ownerId: true,
          departmentId: true,
          isPrivate: true,
          timeframe: { select: { name: true, startDate: true, endDate: true } },
        },
      },
      todos: {
        include: {
          assignee: { select: { id: true, name: true, avatar: true } },
        },
      },
    },
  })

  if (!keyResult) return apiNotFound('Key result not found')

  const visibility = await canViewKeyResult(
    session.user.role as any,
    session.user.id,
    {
      ownerId: keyResult.ownerId,
      objectiveId: keyResult.objectiveId,
      isPrivate: keyResult.isPrivate,
    }
  )

  if (!visibility.canView) return apiForbidden('Access denied')

  let processedKeyResult = keyResult
  if (visibility.isRedacted) {
    processedKeyResult = redactKeyResult(keyResult) as any
  }

  const filtered = await filterFieldsByPermLevel(
    processedKeyResult as unknown as Record<string, unknown>,
    'key_result',
    session.user.id,
  )
  return apiSuccess(filtered)
})

export const PUT = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id: keyResultId } = await resolveParams(params)
  if (!keyResultId) return apiBadRequest('Invalid key result id')

  const {
    title,
    description,
    ownerId,
    startValue,
    targetValue,
    unit,
    isPrivate,
    checkInCadence: rawCadence,
  } = await request.json()
  const cadencePatch = rawCadence !== undefined ? { checkInCadence: normalizeCadence(rawCadence) } : null

  if (!title || !ownerId || targetValue === undefined || targetValue === null || targetValue === '') {
    return apiBadRequest('Title, owner, and target value are required')
  }

  const bounds = parseStartAndTarget(startValue, targetValue)
  if (!bounds.ok) return apiBadRequest(bounds.message)

  const existingKeyResult = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    include: {
      objective: {
        include: { owner: { select: { id: true, name: true } } },
      },
      owner: { select: { id: true, name: true } },
    },
  })

  if (!existingKeyResult) return apiNotFound('Key result not found')

  const locked = await keyResultLockResponse(keyResultId)
  if (locked) return locked

  const canEdit = await canEditKeyResultWithObjectiveContext(
    session.user.role as any,
    session.user.id,
    {
      ownerId: existingKeyResult.ownerId,
      objectiveId: existingKeyResult.objectiveId,
    },
    {
      level: existingKeyResult.objective.level,
      ownerId: existingKeyResult.objective.ownerId,
      departmentId: existingKeyResult.objective.departmentId,
    }
  )

  if (!canEdit) {
    return apiForbidden('Insufficient permissions to edit this key result')
  }

  const owner = await prisma.user.findUnique({ where: { id: ownerId } })
  if (!owner) return apiBadRequest('Invalid owner')

  const result = await prisma.$transaction(async (tx) => {
    const updatedKeyResult = await tx.keyResult.update({
      where: { id: keyResultId },
      data: {
        title,
        description: description || '',
        ownerId,
        startValue: bounds.start,
        targetValue: bounds.target,
        unit: unit || '%',
        ...(isPrivate !== undefined && { isPrivate }),
        ...(cadencePatch && cadencePatch),
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
      },
    })

    await recalcNodeAndAncestors(tx, existingKeyResult.objectiveId)
    return updatedKeyResult
  })

  await recordUpdateIfChanged(
    'KEY_RESULT',
    { keyResultId, objectiveId: existingKeyResult.objectiveId },
    existingKeyResult as unknown as Record<string, unknown>,
    result as unknown as Record<string, unknown>,
    session.user.id,
  )

  return apiSuccess(result, { message: 'Key Result updated successfully.' })
})

export const DELETE = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id: keyResultId } = await resolveParams(params)
  if (!keyResultId) return apiBadRequest('Invalid key result id')

  const existingKeyResult = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    include: {
      objective: {
        include: { owner: { select: { id: true, name: true } } },
      },
      owner: { select: { id: true, name: true } },
    },
  })

  if (!existingKeyResult) return apiNotFound('Key result not found')

  const locked = await keyResultLockResponse(keyResultId)
  if (locked) return locked

  // Only objective owner or admin can delete — KR owners cannot.
  const canDelete =
    session.user.role === 'ADMIN' ||
    session.user.id === existingKeyResult.objective.ownerId

  if (!canDelete) {
    return apiForbidden('Only objective owners and system administrators can delete key results')
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.keyResult.delete({ where: { id: keyResultId } })
    await recalcNodeAndAncestors(tx, existingKeyResult.objectiveId)
    const remainingKeyResults = await tx.keyResult.count({
      where: {
        objectiveId: existingKeyResult.objectiveId,
        status: 'ACTIVE',
      },
    })
    return { remainingKeyResults }
  })

  await recordActivity({
    entityType: 'KEY_RESULT',
    objectiveId: existingKeyResult.objectiveId,
    action: 'DELETED',
    actorId: session.user.id,
    metadata: { keyResultId, title: existingKeyResult.title },
  })

  return apiSuccess(result, { message: 'Key Result deleted successfully.' })
})
