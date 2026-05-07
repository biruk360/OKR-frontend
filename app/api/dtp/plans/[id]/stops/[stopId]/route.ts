/**
 * PATCH  /api/dtp/plans/:id/stops/:stopId — edit a stop.
 * DELETE /api/dtp/plans/:id/stops/:stopId — remove a stop.
 *
 * If the editor is the Coordinator (not the requester) and the plan is in
 * SUBMITTED / MANAGER_ENDORSED / UNDER_REVIEW, the diff is captured into
 * `coordinator_adjustments` and `original_snapshot` is preserved for the
 * requester's side-by-side review (FR-07, AC-05).
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiForbidden, apiNotFound, apiValidationError } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { isCoordinatorEditable, isRequesterEditable } from '@/lib/dtp/state-machine'
import { canActAsCoordinator } from '@/lib/dtp/permissions'
import { recordDtpEvent } from '@/lib/dtp/audit'
import { loadReadablePlan, readJson } from '@/lib/dtp/api-helpers'
import { isHHMM } from '@/lib/dtp/time'
import { diffStop, hasMaterialChanges, mergeAdjustments } from '@/lib/dtp/diff'
import type { DtpStatus, CoordinatorAdjustments } from '@/types/dtp'

const EDITABLE_FIELDS = [
  'destinationName', 'destinationAddress', 'destinationLat', 'destinationLng', 'destinationPlaceId',
  'contactPerson', 'contactPhone',
  'plannedStart', 'dwellMinutes', 'flexibility',
  'tripMode', 'modeOfMovement', 'pickupBackTo', 'pickupBackAddress', 'pickupBackLat', 'pickupBackLng',
  'requiresVehicle', 'requiresCashAdvance', 'cashAdvanceAmount',
  'reason', 'expectedOutcome', 'withWhom',
  'tripTypeId', 'purposeCode',
  'seq',
] as const

export const PATCH = withAuth<{ id: string; stopId: string }>(async (req: NextRequest, { session, params }) => {
  const r = await loadReadablePlan(params.id, session)
  if (!r.ok) return r.error
  const plan = r.plan
  const status = plan.status as DtpStatus
  const isOwner = plan.requesterId === session.user.id
  const canCoord = await canActAsCoordinator(session, plan.departmentId)
  const editingAsCoordinator = !isOwner && canCoord
  if (!((isOwner && isRequesterEditable(status)) || (editingAsCoordinator && isCoordinatorEditable(status)))) {
    return apiForbidden('Stop is not editable in the plan\'s current state')
  }

  const stop = await prisma.tripStop.findUnique({ where: { id: params.stopId } })
  if (!stop || stop.planId !== plan.id) return apiNotFound('Stop not found')

  const body = await readJson<Record<string, unknown>>(req)
  if (!body) return apiBadRequest('Invalid JSON body')

  const errs: Record<string, string> = {}
  if (typeof body.plannedStart === 'string' && !isHHMM(body.plannedStart)) errs.plannedStart = 'Time must be HH:MM (24h)'
  if (typeof body.dwellMinutes === 'number' && body.dwellMinutes < 5) errs.dwellMinutes = 'Dwell must be ≥ 5 minutes'
  if (typeof body.withWhom !== 'undefined' && !Array.isArray(body.withWhom)) errs.withWhom = 'withWhom must be an array of user ids'
  if (Object.keys(errs).length > 0) return apiValidationError('Validation failed', errs)

  const data: Record<string, unknown> = {}
  for (const f of EDITABLE_FIELDS) {
    if (!(f in body)) continue
    if (f === 'withWhom') {
      data.withWhom = (body[f] as string[]).join(',')
    } else {
      data[f] = body[f]
    }
  }
  if (Object.keys(data).length === 0) return apiBadRequest('No editable fields provided')

  // Coordinator edit path: capture pre-edit snapshot + diff.
  let priorAdjustments: CoordinatorAdjustments | null = null
  if (stop.coordinatorAdjustments) {
    try { priorAdjustments = JSON.parse(stop.coordinatorAdjustments) as CoordinatorAdjustments } catch { /* ignore parse */ }
  }
  let originalSnapshot = stop.originalSnapshot
  if (editingAsCoordinator) {
    if (!originalSnapshot) {
      originalSnapshot = JSON.stringify(stripStopForSnapshot(stop))
    }
  } else if (isOwner) {
    // Requester edits clear coordinator-side annotations.
    priorAdjustments = null
    originalSnapshot = null
  }

  const after = { ...stop, ...data }
  const diff = editingAsCoordinator ? diffStop(stop as unknown as Record<string, unknown>, after as Record<string, unknown>) : {}
  const merged = editingAsCoordinator ? mergeAdjustments(priorAdjustments, diff) : null

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.tripStop.update({
      where: { id: stop.id },
      data: {
        ...data,
        coordinatorAdjustments: merged ? JSON.stringify(merged) : (isOwner ? null : stop.coordinatorAdjustments),
        originalSnapshot: editingAsCoordinator ? originalSnapshot : (isOwner ? null : stop.originalSnapshot),
      },
    })
    if (editingAsCoordinator && hasMaterialChanges(diff)) {
      await tx.dailyTripPlan.update({ where: { id: plan.id }, data: { adjusted: true } })
    }
    return u
  })

  await recordDtpEvent({
    planId: plan.id,
    actorId: session.user.id,
    action: 'EDIT',
    fromStatus: status,
    toStatus: status,
    payload: {
      event: 'stop_edited',
      stopId: stop.id,
      changedFields: Object.keys(data),
      by: editingAsCoordinator ? 'coordinator' : 'requester',
      diff: editingAsCoordinator ? diff : undefined,
    },
  })
  return apiSuccess(updated)
})

export const DELETE = withAuth<{ id: string; stopId: string }>(async (_req, { session, params }) => {
  const r = await loadReadablePlan(params.id, session)
  if (!r.ok) return r.error
  const plan = r.plan
  const status = plan.status as DtpStatus
  const isOwner = plan.requesterId === session.user.id
  const canCoord = await canActAsCoordinator(session, plan.departmentId)
  const editingAsCoordinator = !isOwner && canCoord
  if (!((isOwner && isRequesterEditable(status)) || (editingAsCoordinator && isCoordinatorEditable(status)))) {
    return apiForbidden('Stop is not editable in the plan\'s current state')
  }
  const stop = await prisma.tripStop.findUnique({ where: { id: params.stopId } })
  if (!stop || stop.planId !== plan.id) return apiNotFound('Stop not found')

  await prisma.$transaction([
    prisma.tripStop.delete({ where: { id: stop.id } }),
    ...(editingAsCoordinator ? [prisma.dailyTripPlan.update({ where: { id: plan.id }, data: { adjusted: true } })] : []),
  ])
  await recordDtpEvent({
    planId: plan.id,
    actorId: session.user.id,
    action: 'EDIT',
    fromStatus: status,
    toStatus: status,
    payload: { event: 'stop_removed', stopId: stop.id, by: editingAsCoordinator ? 'coordinator' : 'requester' },
  })
  return apiSuccess({ id: stop.id })
})

function stripStopForSnapshot(s: Record<string, unknown>): Record<string, unknown> {
  const { id: _i, planId: _p, createdAt: _c, updatedAt: _u, coordinatorAdjustments: _ca, originalSnapshot: _os, ...rest } = s as Record<string, unknown>
  void _i; void _p; void _c; void _u; void _ca; void _os
  return rest
}
