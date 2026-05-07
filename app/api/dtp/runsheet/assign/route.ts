/**
 * POST /api/dtp/runsheet/assign — Pool Coordinator assigns a driver + vehicle
 * to a plan's legs for a given date. Idempotent: re-assigning replaces.
 *
 * Body: { planId: string, driverId: string, vehicleId?: string }
 *
 * Side effects:
 *  - Upserts the DailyRunSheet for (driver, date).
 *  - Updates every TripLeg of the plan with runSheetId/driverId/vehicleId.
 *  - Transitions the plan APPROVED → DRIVER_ASSIGNED (if currently APPROVED).
 *  - Notifies the driver + the requester (FR-13: "Driver assigned").
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiForbidden, apiNotFound } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { isPoolCoordinator, canReadAllDtp } from '@/lib/dtp/permissions'
import { recordDtpEvent } from '@/lib/dtp/audit'
import { notifyDtpEvent } from '@/lib/dtp/notifier'
import { canTransition } from '@/lib/dtp/state-machine'
import { readJson } from '@/lib/dtp/api-helpers'
import type { DtpStatus } from '@/types/dtp'

interface Body {
  planId: string
  driverId: string
  vehicleId?: string
}

export const POST = withAuth(async (req: NextRequest, { session }) => {
  const body = await readJson<Body>(req)
  if (!body?.planId || !body.driverId) return apiBadRequest('planId and driverId are required')
  const allowed = (await isPoolCoordinator(session.user.id)) || (await canReadAllDtp(session))
  if (!allowed) return apiForbidden('Only the Pool Coordinator can assign drivers')

  const [plan, driver, vehicle] = await Promise.all([
    prisma.dailyTripPlan.findUnique({ where: { id: body.planId } }),
    prisma.driver.findUnique({ where: { id: body.driverId } }),
    body.vehicleId ? prisma.vehicle.findUnique({ where: { id: body.vehicleId } }) : Promise.resolve(null),
  ])
  if (!plan || plan.deletedAt) return apiNotFound('Plan not found')
  if (!driver) return apiNotFound('Driver not found')
  if (body.vehicleId && !vehicle) return apiNotFound('Vehicle not found')
  if (plan.status !== 'APPROVED' && plan.status !== 'DRIVER_ASSIGNED') {
    return apiBadRequest('Plan must be APPROVED before assigning a driver')
  }

  const tripDate = new Date(plan.tripDate)
  tripDate.setUTCHours(0, 0, 0, 0)

  const sheet = await prisma.dailyRunSheet.upsert({
    where: { driverId_runDate: { driverId: body.driverId, runDate: tripDate } },
    create: { driverId: body.driverId, runDate: tripDate, vehicleId: body.vehicleId ?? null },
    update: { vehicleId: body.vehicleId ?? null },
  })
  await prisma.tripLeg.updateMany({
    where: { planId: plan.id },
    data: { runSheetId: sheet.id, driverId: body.driverId, vehicleId: body.vehicleId ?? null },
  })

  if (plan.status === 'APPROVED' && canTransition('APPROVED', 'DRIVER_ASSIGNED')) {
    await prisma.dailyTripPlan.update({ where: { id: plan.id }, data: { status: 'DRIVER_ASSIGNED' } })
  }
  await recordDtpEvent({
    planId: plan.id,
    actorId: session.user.id,
    action: 'ASSIGN_DRIVER',
    fromStatus: plan.status as DtpStatus,
    toStatus: 'DRIVER_ASSIGNED',
    payload: { driverId: body.driverId, vehicleId: body.vehicleId ?? null, runSheetId: sheet.id },
  })

  // Notify driver (if linked to a User) + requester.
  await notifyDtpEvent({
    eventKey: 'TRAVEL_PLAN_DRIVER_ASSIGNED',
    recipientIds: [driver.userId, plan.requesterId].filter(Boolean) as string[],
    subject: 'Driver assigned to your trip plan',
    message: `${driver.fullName}${vehicle ? ` (${vehicle.plate})` : ''} will drive on ${tripDate.toISOString().slice(0, 10)}.`,
    metadata: { planId: plan.id, driverId: driver.id, vehicleId: vehicle?.id ?? null },
    deepLinkPath: `/dashboard/travel/plans/${plan.id}`,
  })
  if (driver.userId) {
    await notifyDtpEvent({
      eventKey: 'TRAVEL_RUN_SHEET_READY',
      recipientIds: [driver.userId],
      subject: `Run sheet ready for ${tripDate.toISOString().slice(0, 10)}`,
      message: `Open the run sheet for the day's legs.`,
      metadata: { driverId: driver.id, runSheetId: sheet.id },
      deepLinkPath: `/dashboard/travel/runsheet/${driver.id}/${tripDate.toISOString().slice(0, 10)}`,
    })
  }

  return apiSuccess({ runSheetId: sheet.id, driverId: driver.id, vehicleId: vehicle?.id ?? null })
})
