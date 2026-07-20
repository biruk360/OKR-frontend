import { prisma } from '@/lib/prisma'
import { canEditObjective } from '@/lib/permissions'
import { recordActivity } from '@/lib/activity-log'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { buildObjectiveEvidence } from '@/lib/okr/evidence'
import { validateRetrospectiveForCommit } from '@/lib/okr/period-close'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiBadRequest, apiConflict, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'

export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid objective id')
  const objective = await prisma.objective.findUnique({
    where: { id },
    include: { retrospective: true, keyResults: { where: { status: 'ACTIVE' }, select: { id: true, title: true, closureStatus: true } } },
  })
  if (!objective) return apiNotFound('Objective not found')
  if (objective.closureStatus !== 'CLOSING' || objective.isLocked) return apiConflict('This Objective is not ready to commit its close')
  if (!await canEditObjective(session.user.role as any, session.user.id, objective)) return apiForbidden('Insufficient permissions')
  const unfinished = objective.keyResults.filter((kr) => kr.closureStatus !== 'CLOSED')
  if (unfinished.length > 0) return apiConflict('Close every active Key Result first', { keyResults: unfinished })
  const validationError = validateRetrospectiveForCommit(objective.retrospective)
  if (validationError) return apiBadRequest(validationError)

  const closedAt = new Date()
  const result = await prisma.$transaction(async (tx) => {
    const evidence = await buildObjectiveEvidence(tx, id)
    await tx.okrRetrospective.update({ where: { objectiveId: id }, data: { autoStatsJson: evidence } })
    await tx.okrReopenLog.updateMany({
      where: { entityType: 'OBJECTIVE', entityId: id, reclosedAt: null },
      data: { reclosedAt: closedAt },
    })
    const updated = await tx.objective.update({
      where: { id },
      data: {
        closureStatus: 'CLOSED',
        isLocked: true,
        closedAt,
        lockedAt: closedAt,
        closedById: session.user.id,
        goalStatus: 'CLOSED',
        progress: objective.finalProgress ?? objective.progress,
      },
      include: { retrospective: true, timeframe: true },
    })
    await recalcNodeAndAncestors(tx, id)
    return updated
  })
  await recordActivity({ entityType: 'OBJECTIVE', objectiveId: id, action: 'CLOSED', actorId: session.user.id, metadata: { outcome: objective.outcome, finalGrade: objective.finalGrade } })
  return apiSuccess(result, { message: 'Objective closed and locked.' })
})
