import { prisma } from '@/lib/prisma'
import { canEditKeyResultWithObjectiveContext } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { keyResultLockResponse } from '@/lib/okr/lock-guard'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { recordActivity } from '@/lib/activity-log'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id: keyResultId } = await resolveParams(params)
  if (!keyResultId) return apiBadRequest('Invalid key result id')

  const existingKeyResult = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    include: {
      objective: {
        select: { id: true, ownerId: true, title: true, level: true, departmentId: true },
      },
    },
  })

  if (!existingKeyResult) return apiNotFound('Key result not found')

  const locked = await keyResultLockResponse(keyResultId)
  if (locked) return locked

  if (existingKeyResult.status !== 'ARCHIVED') {
    return apiBadRequest('Key result is not archived')
  }

  const canUnarchive = await canEditKeyResultWithObjectiveContext(
    session.user.role as any,
    session.user.id,
    { ownerId: existingKeyResult.ownerId, objectiveId: existingKeyResult.objectiveId },
    {
      level: existingKeyResult.objective.level,
      ownerId: existingKeyResult.objective.ownerId,
      departmentId: existingKeyResult.objective.departmentId,
    }
  )
  if (!canUnarchive) return apiForbidden('Insufficient permissions to restore this key result')

  const result = await prisma.$transaction(async (tx) => {
    const restoredKeyResult = await tx.keyResult.update({
      where: { id: keyResultId },
      data: { status: 'ACTIVE', archivedAt: null },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        objective: { select: { id: true, title: true } },
      },
    })

    await recalcNodeAndAncestors(tx, existingKeyResult.objectiveId)

    const updatedObj = await tx.objective.findUnique({
      where: { id: existingKeyResult.objectiveId },
      select: { progress: true },
    })

    return {
      ...restoredKeyResult,
      newObjectiveProgress: updatedObj?.progress ?? 0,
    }
  })

  await recordActivity({
    entityType: 'KEY_RESULT',
    keyResultId,
    objectiveId: existingKeyResult.objectiveId,
    action: 'UNARCHIVED',
    actorId: session.user.id,
  })

  return apiSuccess(result, { message: 'Key Result restored.' })
})
