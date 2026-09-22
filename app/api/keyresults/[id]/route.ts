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
    // Reparent ("Move"). Undefined = leave where it is; the route previously
    // ignored this field entirely, so the Move menu item had nothing to call.
    objectiveId: rawTargetObjectiveId,
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

  // ── Move to another objective ──────────────────────────────────────────────
  // Permission is checked against BOTH ends: being allowed to edit a key result
  // where it currently sits does not imply being allowed to file it under an
  // objective you could not otherwise touch.
  const targetObjectiveId =
    rawTargetObjectiveId === undefined || rawTargetObjectiveId === null || rawTargetObjectiveId === ''
      ? null
      : String(rawTargetObjectiveId)
  const isMove = targetObjectiveId !== null && targetObjectiveId !== existingKeyResult.objectiveId

  if (isMove) {
    const target = await prisma.objective.findUnique({
      where: { id: targetObjectiveId },
      select: {
        id: true, status: true, level: true, ownerId: true,
        departmentId: true, timeframeId: true,
      },
    })
    if (!target) return apiBadRequest('Invalid target objective')
    if (target.status !== 'ACTIVE') {
      return apiBadRequest('Target objective must be active (not archived or closed)')
    }
    // Mirrors the constraint the objective route applies to re-parenting: a key
    // result that jumped timeframes would move its progress out of the period it
    // was committed in, and the rollup it feeds is per-timeframe.
    if (target.timeframeId !== existingKeyResult.objective.timeframeId) {
      return apiBadRequest('Target objective must be in the same timeframe')
    }
    const canEditTarget = await canEditKeyResultWithObjectiveContext(
      session.user.role as any,
      session.user.id,
      { ownerId: existingKeyResult.ownerId, objectiveId: target.id },
      { level: target.level, ownerId: target.ownerId, departmentId: target.departmentId },
    )
    if (!canEditTarget) {
      return apiForbidden('Insufficient permissions on the target objective')
    }
  }

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
        ...(isMove && { objectiveId: targetObjectiveId as string }),
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
      },
    })

    // Invariant #9 — rollup runs in the same transaction as the mutation. A move
    // changes two trees, so BOTH must be recalculated here: recomputing only the
    // old parent would leave the new one showing a percentage that does not
    // include the key result it now owns.
    await recalcNodeAndAncestors(tx, existingKeyResult.objectiveId)
    if (isMove) await recalcNodeAndAncestors(tx, targetObjectiveId as string)
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
