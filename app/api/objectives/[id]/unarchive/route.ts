import { prisma } from '@/lib/prisma'
import { canEditObjective } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { objectiveLockResponse } from '@/lib/okr/lock-guard'
import { recordActivity } from '@/lib/activity-log'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'
import { broadcastKeyResultEvent, broadcastObjectiveEvent } from '@/lib/pusher'
import { OKR_REALTIME_EVENTS } from '@/lib/okr/realtime'

export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid objective id')

  const existing = await prisma.objective.findUnique({ where: { id } })
  if (!existing) return apiNotFound('Objective not found')

  const locked = await objectiveLockResponse(id)
  if (locked) return locked
  if (existing.status !== 'ARCHIVED') {
    return apiBadRequest('Objective is not archived')
  }

  const allowed = await canEditObjective(
    session.user.role as any,
    session.user.id,
    {
      level: existing.level,
      ownerId: existing.ownerId,
      departmentId: existing.departmentId,
    },
  )
  if (!allowed) return apiForbidden('Insufficient permissions to restore this objective')

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.objective.update({
      where: { id },
      data: { status: 'ACTIVE', archivedAt: null },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
      },
    })
    // Note: we do NOT auto-unarchive KRs — the caller re-enables them selectively.
    if (existing.parentObjectiveId) {
      await recalcNodeAndAncestors(tx, existing.parentObjectiveId)
    }
    return updated
  })

  await recordActivity({
    entityType: 'OBJECTIVE',
    objectiveId: id,
    action: 'UNARCHIVED',
    actorId: session.user.id,
    metadata: { title: existing.title, level: existing.level },
  })

  broadcastObjectiveEvent(id, OKR_REALTIME_EVENTS.UNARCHIVED, session.user.id)
  // Child KR pages show this objective's state too: signal each KR channel
  // (ids only, KR channel only — the objective channel was signalled above).
  void prisma.keyResult
    .findMany({ where: { objectiveId: id, status: { not: 'DELETED' } }, select: { id: true } })
    .then((krs) => {
      for (const kr of krs) broadcastKeyResultEvent(kr.id, null, OKR_REALTIME_EVENTS.UPDATED, session.user.id)
    })
    .catch((error: unknown) => console.error('[objective unarchive] KR broadcast failed:', error))
  return apiSuccess(result, { message: 'Objective restored.' })
})
