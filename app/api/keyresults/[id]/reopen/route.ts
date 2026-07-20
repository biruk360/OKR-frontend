import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { emit } from '@/lib/notifications'
import { isWithinReopenWindow, validateReopenReason } from '@/lib/okr/period-close'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiBadRequest, apiConflict, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid key result id')
  const body = await request.json().catch(() => ({}))
  const reasonError = validateReopenReason(body.reason)
  if (reasonError) return apiBadRequest(reasonError)
  const keyResult = await prisma.keyResult.findUnique({
    where: { id },
    include: { objective: { select: { id: true, isLocked: true } }, rolledTo: { select: { id: true }, take: 1 } },
  })
  if (!keyResult) return apiNotFound('Key Result not found')
  if (keyResult.objective.isLocked) return apiConflict('Reopen the parent Objective before reopening this Key Result')
  if (keyResult.closureStatus !== 'CLOSED' || !keyResult.isLocked) return apiConflict('Only a closed Key Result can be reopened')

  const privileged = session.user.role === 'ADMIN' || session.user.role === 'EXECUTIVE'
  const settings = await prisma.organizationSettings.findUnique({ where: { id: 'singleton' }, select: { okrReopenWindowDays: true } })
  const windowDays = settings?.okrReopenWindowDays ?? 14
  const manager = !privileged && session.user.id !== keyResult.ownerId
    ? await prisma.managerRelationship.findFirst({ where: { managerId: session.user.id, directReportId: keyResult.ownerId, endedAt: null }, select: { id: true } })
    : null
  if (!privileged && (!(session.user.id === keyResult.ownerId || manager) || !isWithinReopenWindow(keyResult.closedAt, windowDays))) {
    return apiForbidden(`Only the owner or manager may reopen within ${windowDays} days; administrators and executives may reopen later`)
  }

  const reopenedAt = new Date()
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.keyResult.update({
      where: { id },
      data: {
        closureStatus: 'OPEN', isLocked: false, lockedAt: null, closedAt: null, closedById: null,
        confidence: keyResult.preCloseConfidence || 'ON_TRACK', reopenCount: { increment: 1 },
        currentValue: keyResult.finalValue ?? keyResult.currentValue,
        progress: keyResult.finalProgress ?? keyResult.progress,
        lastReopenedAt: reopenedAt, lastReopenedById: session.user.id,
      },
    })
    await tx.okrReopenLog.create({ data: { entityType: 'KEY_RESULT', entityId: id, reason: body.reason.trim(), reopenedById: session.user.id, changesJson: { hadRolledForwardCopy: keyResult.rolledTo.length > 0 } } })
    await recalcNodeAndAncestors(tx, keyResult.objectiveId)
    return updated
  })
  await recordActivity({ entityType: 'KEY_RESULT', keyResultId: id, objectiveId: keyResult.objectiveId, action: 'REOPENED', actorId: session.user.id, metadata: { reason: body.reason.trim(), hasRolledForwardCopy: keyResult.rolledTo.length > 0 } })
  const managerIds = await prisma.managerRelationship.findMany({ where: { directReportId: keyResult.ownerId, endedAt: null }, select: { managerId: true } })
  await emit('KR_PROGRESS_UPDATED', {
    entityType: 'KEY_RESULT', entityId: id, entityTitle: keyResult.title, actorId: session.user.id,
    explicitRecipients: Array.from(new Set([keyResult.ownerId, keyResult.closedById, ...managerIds.map((row) => row.managerId)].filter(Boolean) as string[])),
    data: { change: 'reopened', reason: body.reason.trim(), deepLink: `/dashboard/key-results/${id}` },
  })
  return apiSuccess(result, { message: 'Key Result reopened. The reopen remains permanently visible in its audit history.' })
})
