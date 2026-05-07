/**
 * POST /api/dtp/plans/:id/clone — copy a plan to a new tripDate as a fresh
 * DRAFT, including all stops (FR-17 templates / repeat-tomorrow).
 * Body: { tripDate: 'YYYY-MM-DD' }.
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiConflict } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { loadReadablePlan, readJson } from '@/lib/dtp/api-helpers'
import { recordDtpEvent } from '@/lib/dtp/audit'

interface Body { tripDate: string }

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const r = await loadReadablePlan(params.id, session)
  if (!r.ok) return r.error
  const plan = r.plan
  const body = await readJson<Body>(req)
  if (!body?.tripDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.tripDate)) return apiBadRequest('tripDate (YYYY-MM-DD) is required')
  const tripDate = new Date(`${body.tripDate}T00:00:00Z`)

  // Reuse single-plan-per-day rule.
  const existing = await prisma.dailyTripPlan.findFirst({
    where: { requesterId: session.user.id, tripDate, deletedAt: null },
  })
  if (existing) return apiConflict('A plan already exists for that date', { planId: existing.id })

  const cloned = await prisma.dailyTripPlan.create({
    data: {
      requesterId: session.user.id,
      tripDate,
      departmentId: plan.departmentId,
      priority: plan.priority,
      defaultModeOfMovement: plan.defaultModeOfMovement,
      status: 'DRAFT',
      stops: {
        create: plan.stops.map((s) => ({
          seq: s.seq,
          tripTypeId: s.tripTypeId,
          purposeCode: s.purposeCode,
          destinationName: s.destinationName,
          destinationAddress: s.destinationAddress,
          destinationLat: s.destinationLat,
          destinationLng: s.destinationLng,
          destinationPlaceId: s.destinationPlaceId,
          contactPerson: s.contactPerson,
          contactPhone: s.contactPhone,
          plannedStart: s.plannedStart,
          dwellMinutes: s.dwellMinutes,
          flexibility: s.flexibility,
          tripMode: s.tripMode,
          modeOfMovement: s.modeOfMovement,
          pickupBackTo: s.pickupBackTo,
          pickupBackAddress: s.pickupBackAddress,
          pickupBackLat: s.pickupBackLat,
          pickupBackLng: s.pickupBackLng,
          requiresVehicle: s.requiresVehicle,
          requiresCashAdvance: s.requiresCashAdvance,
          cashAdvanceAmount: s.cashAdvanceAmount,
          reason: s.reason,
          expectedOutcome: s.expectedOutcome,
          withWhom: s.withWhom,
        })),
      },
    },
  })
  await recordDtpEvent({
    planId: cloned.id,
    actorId: session.user.id,
    action: 'CLONE',
    toStatus: 'DRAFT',
    payload: { sourcePlanId: plan.id, sourceTripDate: plan.tripDate.toISOString().slice(0, 10) },
  })
  return apiSuccess(cloned, { status: 201 })
})
