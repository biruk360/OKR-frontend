/**
 * POST /api/dtp/plans/:id/stops — append a new stop to the plan.
 * Validates: at-most reasonable stop count; HH:MM time; dwell ≥ 5 min.
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiForbidden, apiValidationError } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { isCoordinatorEditable, isRequesterEditable } from '@/lib/dtp/state-machine'
import { canActAsCoordinator } from '@/lib/dtp/permissions'
import { recordDtpEvent } from '@/lib/dtp/audit'
import { loadReadablePlan, readJson } from '@/lib/dtp/api-helpers'
import { isHHMM } from '@/lib/dtp/time'
import type { DtpStatus } from '@/types/dtp'

interface CreateStopBody {
  destinationName: string
  destinationAddress: string
  destinationLat?: number
  destinationLng?: number
  destinationPlaceId?: string
  contactPerson?: string
  contactPhone?: string
  plannedStart: string // HH:MM
  dwellMinutes: number
  flexibility?: string
  tripMode?: string
  modeOfMovement?: string
  pickupBackTo?: string
  pickupBackAddress?: string
  pickupBackLat?: number
  pickupBackLng?: number
  requiresVehicle?: boolean
  requiresCashAdvance?: boolean
  cashAdvanceAmount?: number
  reason: string
  expectedOutcome?: string
  withWhom?: string[]
  tripTypeId?: string
  purposeCode?: string
}

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const body = await readJson<CreateStopBody>(req)
  if (!body) return apiBadRequest('Invalid JSON body')
  const r = await loadReadablePlan(params.id, session)
  if (!r.ok) return r.error
  const plan = r.plan
  const status = plan.status as DtpStatus
  const isOwner = plan.requesterId === session.user.id
  const canCoord = await canActAsCoordinator(session, plan.departmentId)
  if (!((isOwner && isRequesterEditable(status)) || (canCoord && isCoordinatorEditable(status)))) {
    return apiForbidden('Plan is not editable in its current state')
  }

  const errs: Record<string, string> = {}
  if (!body.destinationName?.trim()) errs.destinationName = 'Required'
  if (!body.destinationAddress?.trim()) errs.destinationAddress = 'Required'
  if (!body.plannedStart || !isHHMM(body.plannedStart)) errs.plannedStart = 'Time must be HH:MM (24h)'
  if (typeof body.dwellMinutes !== 'number' || body.dwellMinutes < 5) errs.dwellMinutes = 'Dwell must be at least 5 minutes'
  if (!body.reason?.trim()) errs.reason = 'Required'
  if (Object.keys(errs).length > 0) return apiValidationError('Validation failed', errs)

  // Resolve trip type / purpose code.
  let purposeCode = body.purposeCode ?? 'OTHER'
  if (body.tripTypeId) {
    const tt = await prisma.dtpTripType.findUnique({ where: { id: body.tripTypeId } })
    if (tt) purposeCode = tt.code
  }

  const lastSeq = await prisma.tripStop.findFirst({
    where: { planId: plan.id },
    orderBy: { seq: 'desc' },
    select: { seq: true },
  })
  const seq = (lastSeq?.seq ?? -1) + 1

  const stop = await prisma.tripStop.create({
    data: {
      planId: plan.id,
      seq,
      tripTypeId: body.tripTypeId ?? null,
      purposeCode,
      destinationName: body.destinationName.trim(),
      destinationAddress: body.destinationAddress.trim(),
      destinationLat: body.destinationLat ?? null,
      destinationLng: body.destinationLng ?? null,
      destinationPlaceId: body.destinationPlaceId ?? null,
      contactPerson: body.contactPerson ?? null,
      contactPhone: body.contactPhone ?? null,
      plannedStart: body.plannedStart,
      dwellMinutes: body.dwellMinutes,
      flexibility: body.flexibility ?? 'FIXED',
      tripMode: body.tripMode ?? 'ROUND_TRIP',
      modeOfMovement: body.modeOfMovement ?? null,
      pickupBackTo: body.pickupBackTo ?? (body.tripMode === 'ONE_WAY' ? null : 'OFFICE'),
      pickupBackAddress: body.pickupBackAddress ?? null,
      pickupBackLat: body.pickupBackLat ?? null,
      pickupBackLng: body.pickupBackLng ?? null,
      requiresVehicle: body.requiresVehicle ?? true,
      requiresCashAdvance: body.requiresCashAdvance ?? false,
      cashAdvanceAmount: body.cashAdvanceAmount ?? null,
      reason: body.reason.trim(),
      expectedOutcome: body.expectedOutcome ?? null,
      withWhom: (body.withWhom ?? []).join(','),
    },
  })
  await recordDtpEvent({
    planId: plan.id,
    actorId: session.user.id,
    action: 'EDIT',
    fromStatus: status,
    toStatus: status,
    payload: { event: 'stop_added', stopId: stop.id, by: !isOwner && canCoord ? 'coordinator' : 'requester' },
  })
  return apiSuccess(stop, { status: 201 })
})
