import { prisma } from '@/lib/prisma'
import { canEditKeyResultWithObjectiveContext } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { recordActivity } from '@/lib/activity-log'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

/**
 * Mark a Key Result as "done": currentValue = targetValue, progress = 100,
 * confidence = ON_TRACK. Parent objective progress cascades.
 */
export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id: keyResultId } = await resolveParams(params)
  if (!keyResultId) return apiBadRequest('Invalid key result id')

  const existing = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    include: {
      objective: {
        select: { id: true, ownerId: true, level: true, departmentId: true },
      },
    },
  })

  if (!existing) return apiNotFound('Key result not found')

  const allowed = await canEditKeyResultWithObjectiveContext(
    session.user.role as any,
    session.user.id,
    { ownerId: existing.ownerId, objectiveId: existing.objectiveId },
    {
      level: existing.objective.level,
      ownerId: existing.objective.ownerId,
      departmentId: existing.objective.departmentId,
    }
  )
  if (!allowed) return apiForbidden('Insufficient permissions to complete this key result')

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.keyResult.update({
      where: { id: keyResultId },
      data: {
        currentValue: existing.targetValue,
        progress: 100,
        confidence: 'ON_TRACK',
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
      },
    })
    await recalcNodeAndAncestors(tx, existing.objectiveId)
    return updated
  })

  await recordActivity({
    entityType: 'KEY_RESULT',
    keyResultId,
    objectiveId: existing.objectiveId,
    action: 'COMPLETED',
    actorId: session.user.id,
    metadata: { title: existing.title },
  })

  return apiSuccess(result, { message: 'Key result marked complete.' })
})
