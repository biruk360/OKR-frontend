/**
 * POST /api/dtp/legs/:id/status — driver leg-status confirmations.
 * Body: { status: 'EN_ROUTE' | 'COMPLETED' | 'SKIPPED', lat?: number, lng?: number, note?: string }
 *
 * Authz: only the assigned driver (resolved via Driver.userId === caller) or
 * the Pool / Travel Coordinator may update a leg.
 *
 * Side effects:
 *  - Records actualTime + (optional) geo-tag.
 *  - When the FIRST leg of a plan moves to EN_ROUTE, the plan transitions
 *    DRIVER_ASSIGNED → IN_PROGRESS (FR-11).
 *  - When all legs of a plan are COMPLETED, plan transitions IN_PROGRESS →
 *    COMPLETED.
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiForbidden, apiNotFound } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { recordDtpEvent } from '@/lib/dtp/audit'
import { isAnyTravelCoordinator, isPoolCoordinator, canReadAllDtp } from '@/lib/dtp/permissions'
import { canTransition } from '@/lib/dtp/state-machine'
import { notifyDtpEvent } from '@/lib/dtp/notifier'
import { readJson } from '@/lib/dtp/api-helpers'
import type { LegStatus, DtpStatus } from '@/types/dtp'

interface Body {
  status: LegStatus
  lat?: number
  lng?: number
  note?: string
}

const ALLOWED: ReadonlySet<LegStatus> = new Set<LegStatus>(['EN_ROUTE', 'COMPLETED', 'SKIPPED'])

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const body = await readJson<Body>(req)
  if (!body || !ALLOWED.has(body.status)) return apiBadRequest('status must be EN_ROUTE | COMPLETED | SKIPPED')
  const leg = await prisma.tripLeg.findUnique({ where: { id: params.id }, include: { driver: true, plan: true } })
  if (!leg) return apiNotFound('Leg not found')

  const isAssignedDriver = leg.driver?.userId === session.user.id
  const isAuthority =
    (await canReadAllDtp(session)) ||
    (await isPoolCoordinator(session.user.id)) ||
    (await isAnyTravelCoordinator(session.user.id))
  if (!isAssignedDriver && !isAuthority) return apiForbidden('Only the assigned driver or a coordinator can update this leg')

  await prisma.tripLeg.update({
    where: { id: leg.id },
    data: {
      status: body.status,
      actualTime: new Date(),
      actualLat: body.lat ?? null,
      actualLng: body.lng ?? null,
      notes: body.note ?? leg.notes,
    },
  })
  await recordDtpEvent({
    planId: leg.planId,
    actorId: session.user.id,
    action: 'LEG_STATUS',
    payload: { legId: leg.id, status: body.status, lat: body.lat ?? null, lng: body.lng ?? null },
  })

  // Plan-level state machine cascades.
  const plan = leg.plan
  const planStatus = plan.status as DtpStatus
  if (body.status === 'EN_ROUTE' && planStatus === 'DRIVER_ASSIGNED' && canTransition(planStatus, 'IN_PROGRESS')) {
    await prisma.dailyTripPlan.update({ where: { id: plan.id }, data: { status: 'IN_PROGRESS' } })
    await recordDtpEvent({
      planId: plan.id,
      actorId: session.user.id,
      action: 'LEG_STATUS',
      fromStatus: planStatus,
      toStatus: 'IN_PROGRESS',
      payload: { event: 'first_leg_en_route' },
    })
  }
  if (body.status === 'COMPLETED' || body.status === 'SKIPPED') {
    const remaining = await prisma.tripLeg.count({
      where: { planId: plan.id, status: { in: ['SCHEDULED', 'EN_ROUTE'] } },
    })
    if (remaining === 0 && (planStatus === 'IN_PROGRESS' || planStatus === 'DRIVER_ASSIGNED')) {
      await prisma.dailyTripPlan.update({ where: { id: plan.id }, data: { status: 'COMPLETED' } })
      await recordDtpEvent({
        planId: plan.id,
        actorId: session.user.id,
        action: 'LEG_STATUS',
        fromStatus: planStatus,
        toStatus: 'COMPLETED',
        payload: { event: 'all_legs_done' },
      })
      // Notify line manager(s) — "Trip completed" (matrix row).
      const managerRows = await prisma.managerRelationship.findMany({
        where: { directReportId: plan.requesterId, endedAt: null },
        select: { managerId: true },
      })
      await notifyDtpEvent({
        eventKey: 'TRAVEL_PLAN_TRIP_COMPLETED',
        recipientIds: managerRows.map((m) => m.managerId),
        subject: 'Trip completed',
        message: `Trip plan for ${plan.tripDate.toISOString().slice(0, 10)} is fully completed.`,
        metadata: { planId: plan.id },
        deepLinkPath: `/dashboard/travel/plans/${plan.id}`,
      })
    }
  }

  return apiSuccess({ id: leg.id, status: body.status })
})
