import { prisma } from '@/lib/prisma'
import { canEditObjective } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

/**
 * Mark an objective (and all its active KRs) complete. Sets progress=100,
 * goalStatus=CLOSED, and completes each active KR (currentValue=targetValue,
 * progress=100, confidence=ON_TRACK). Parent ancestors cascade.
 */
export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid objective id')

  const existing = await prisma.objective.findUnique({ where: { id } })
  if (!existing) return apiNotFound('Objective not found')

  const allowed = await canEditObjective(
    session.user.role as any,
    session.user.id,
    {
      level: existing.level,
      ownerId: existing.ownerId,
      departmentId: existing.departmentId,
    },
  )
  if (!allowed) return apiForbidden('Insufficient permissions to complete this objective')

  const result = await prisma.$transaction(async (tx) => {
    // Complete all active key results.
    await tx.keyResult.updateMany({
      where: { objectiveId: id, status: 'ACTIVE' },
      data: { progress: 100, confidence: 'ON_TRACK' },
    })
    // updateMany can't reference other columns (targetValue) — do currentValue per-row.
    const activeKrs = await tx.keyResult.findMany({
      where: { objectiveId: id, status: 'ACTIVE' },
      select: { id: true, targetValue: true },
    })
    for (const kr of activeKrs) {
      await tx.keyResult.update({
        where: { id: kr.id },
        data: { currentValue: kr.targetValue },
      })
    }

    const updated = await tx.objective.update({
      where: { id },
      data: { progress: 100, goalStatus: 'CLOSED' },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        timeframe: true,
      },
    })

    await recalcNodeAndAncestors(tx, id)
    return updated
  })

  await recordActivity({
    entityType: 'OBJECTIVE',
    objectiveId: id,
    action: 'COMPLETED',
    actorId: session.user.id,
    metadata: { title: existing.title, level: existing.level },
  })

  return apiSuccess(result, { message: 'Objective marked complete.' })
})
