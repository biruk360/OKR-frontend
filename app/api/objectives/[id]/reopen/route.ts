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
  if (!id) return apiBadRequest('Invalid objective id')
  const body = await request.json().catch(() => ({}))
  const reasonError = validateReopenReason(body.reason)
  if (reasonError) return apiBadRequest(reasonError)
  const objective = await prisma.objective.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true } },
      rolledTo: { select: { id: true, title: true }, take: 1 },
    },
  })
  if (!objective) return apiNotFound('Objective not found')
  if (objective.closureStatus !== 'CLOSED' || !objective.isLocked) return apiConflict('Only a closed Objective can be reopened')

  const privileged = session.user.role === 'ADMIN' || session.user.role === 'EXECUTIVE'
  const settings = await prisma.organizationSettings.findUnique({ where: { id: 'singleton' }, select: { okrReopenWindowDays: true } })
  const windowDays = settings?.okrReopenWindowDays ?? 14
  const manager = !privileged && session.user.id !== objective.ownerId
    ? await prisma.managerRelationship.findFirst({ where: { managerId: session.user.id, directReportId: objective.ownerId, endedAt: null }, select: { id: true } })
    : null
  const ownerOrManager = session.user.id === objective.ownerId || Boolean(manager)
  if (!privileged && (!ownerOrManager || !isWithinReopenWindow(objective.closedAt, windowDays))) {
    return apiForbidden(`Only the owner or manager may reopen within ${windowDays} days; administrators and executives may reopen later`)
  }

  const reopenKeyResults = body.reopenKeyResults === true
  const reopenedAt = new Date()
  const result = await prisma.$transaction(async (tx) => {
    if (reopenKeyResults) {
      const keyResults = await tx.keyResult.findMany({
        where: { objectiveId: id, closureStatus: 'CLOSED' },
        select: { id: true, preCloseConfidence: true, currentValue: true, progress: true, finalValue: true, finalProgress: true },
      })
      for (const kr of keyResults) {
        await tx.keyResult.update({
          where: { id: kr.id },
          data: {
            closureStatus: 'OPEN', isLocked: false, lockedAt: null, closedAt: null, closedById: null,
            confidence: kr.preCloseConfidence || 'ON_TRACK',
            currentValue: kr.finalValue ?? kr.currentValue,
            progress: kr.finalProgress ?? kr.progress,
            lastReopenedAt: reopenedAt, lastReopenedById: session.user.id, reopenCount: { increment: 1 },
          },
        })
        await tx.okrReopenLog.create({ data: { entityType: 'KEY_RESULT', entityId: kr.id, reason: body.reason.trim(), reopenedById: session.user.id } })
      }
    }
    await tx.objective.update({
      where: { id },
      data: {
        closureStatus: 'OPEN', isLocked: false, lockedAt: null, closedAt: null, closedById: null,
        goalStatus: objective.preCloseGoalStatus || 'ON_TRACK', reopenCount: { increment: 1 },
        lastReopenedAt: reopenedAt, lastReopenedById: session.user.id,
      },
    })
    await tx.okrReopenLog.create({ data: { entityType: 'OBJECTIVE', entityId: id, reason: body.reason.trim(), reopenedById: session.user.id, changesJson: { reopenKeyResults } } })
    await recalcNodeAndAncestors(tx, id)
    return tx.objective.update({
      where: { id },
      data: { progress: objective.finalProgress ?? objective.progress },
      include: { rolledTo: { select: { id: true, title: true } } },
    })
  })
  await recordActivity({ entityType: 'OBJECTIVE', objectiveId: id, action: 'REOPENED', actorId: session.user.id, metadata: { reason: body.reason.trim(), reopenKeyResults, hasRolledForwardCopy: objective.rolledTo.length > 0 } })
  const managerIds = await prisma.managerRelationship.findMany({ where: { directReportId: objective.ownerId, endedAt: null }, select: { managerId: true } })
  await emit('OBJECTIVE_EDITED', {
    entityType: 'OBJECTIVE', entityId: id, entityTitle: objective.title, actorId: session.user.id,
    explicitRecipients: Array.from(new Set([objective.ownerId, objective.closedById, ...managerIds.map((row) => row.managerId)].filter(Boolean) as string[])),
    data: { change: 'reopened', reason: body.reason.trim(), deepLink: `/dashboard/objectives/${id}` },
  })
  return apiSuccess(result, { message: 'Objective reopened. The reopen remains permanently visible in its audit history.' })
})
