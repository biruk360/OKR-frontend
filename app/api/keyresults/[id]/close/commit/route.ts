import { prisma } from '@/lib/prisma'
import { canEditKeyResultWithObjectiveContext } from '@/lib/permissions'
import { recordActivity } from '@/lib/activity-log'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { buildKeyResultEvidence } from '@/lib/okr/evidence'
import { validateRetrospectiveForCommit } from '@/lib/okr/period-close'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiBadRequest, apiConflict, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'

export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid key result id')
  const keyResult = await prisma.keyResult.findUnique({
    where: { id },
    include: {
      retrospective: true,
      objective: { select: { ownerId: true, level: true, departmentId: true, isLocked: true } },
    },
  })
  if (!keyResult) return apiNotFound('Key Result not found')
  if (keyResult.objective.isLocked) return apiConflict('Reopen the parent Objective before closing this Key Result')
  if (keyResult.closureStatus !== 'CLOSING' || keyResult.isLocked) return apiConflict('This Key Result is not ready to commit its close')
  if (!await canEditKeyResultWithObjectiveContext(session.user.role as any, session.user.id, keyResult, keyResult.objective)) return apiForbidden('Insufficient permissions')
  const validationError = validateRetrospectiveForCommit(keyResult.retrospective)
  if (validationError) return apiBadRequest(validationError)

  const closedAt = new Date()
  const result = await prisma.$transaction(async (tx) => {
    const evidence = await buildKeyResultEvidence(tx, id)
    await tx.okrRetrospective.update({ where: { keyResultId: id }, data: { autoStatsJson: evidence } })
    await tx.okrReopenLog.updateMany({
      where: { entityType: 'KEY_RESULT', entityId: id, reclosedAt: null },
      data: { reclosedAt: closedAt },
    })
    const updated = await tx.keyResult.update({
      where: { id },
      data: {
        closureStatus: 'CLOSED',
        isLocked: true,
        closedAt,
        lockedAt: closedAt,
        closedById: session.user.id,
        currentValue: keyResult.finalValue ?? keyResult.currentValue,
        progress: keyResult.finalProgress ?? keyResult.progress,
      },
      include: { retrospective: true, owner: { select: { id: true, name: true, avatar: true } } },
    })
    await recalcNodeAndAncestors(tx, keyResult.objectiveId)
    return updated
  })
  await recordActivity({ entityType: 'KEY_RESULT', keyResultId: id, objectiveId: keyResult.objectiveId, action: 'CLOSED', actorId: session.user.id, metadata: { outcome: keyResult.outcome, finalGrade: keyResult.finalGrade } })
  return apiSuccess(result, { message: 'Key Result closed and locked.' })
})
