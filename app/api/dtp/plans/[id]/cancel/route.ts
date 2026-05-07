/**
 * POST /api/dtp/plans/:id/cancel — Coordinator (or Operations Manager) cancels
 * an already-approved plan. Removes scheduled legs from the run sheet (FR-14,
 * AC-18). Body: { reason: string }.
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiForbidden } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { transitionPlan, loadReadablePlan, readJson, badStatus } from '@/lib/dtp/api-helpers'
import { canActAsCoordinator, isOperationsManager } from '@/lib/dtp/permissions'
import { notifyDtpEvent } from '@/lib/dtp/notifier'
import type { DtpStatus } from '@/types/dtp'

interface Body { reason: string }

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const r = await loadReadablePlan(params.id, session)
  if (!r.ok) return r.error
  const plan = r.plan
  const allowed = (await canActAsCoordinator(session, plan.departmentId)) || (await isOperationsManager(session.user.id))
  if (!allowed) return apiForbidden('Only the Travel Coordinator or Operations Manager can cancel an approved plan')
  const body = await readJson<Body>(req)
  if (!body?.reason?.trim()) return apiBadRequest('A cancellation reason is required')
  const status = plan.status as DtpStatus
  if (status !== 'APPROVED' && status !== 'DRIVER_ASSIGNED' && status !== 'IN_PROGRESS') return badStatus()

  // Collect leg drivers/passengers BEFORE deleting so we can notify them.
  const legs = await prisma.tripLeg.findMany({
    where: { planId: plan.id, status: 'SCHEDULED' },
    select: { driverId: true, passengerIds: true },
  })
  const driverIds = Array.from(new Set(legs.map((l) => l.driverId).filter(Boolean) as string[]))
  const passengerIds = Array.from(new Set(legs.flatMap((l) => l.passengerIds.split(',').filter(Boolean))))

  const updated = await transitionPlan({
    planId: plan.id,
    from: status,
    to: 'CANCELLED',
    action: 'CANCEL',
    actorId: session.user.id,
    payload: { reason: body.reason },
    patch: { decisionNote: body.reason, decisionById: session.user.id, decisionAt: new Date() },
  })
  if (!updated) return badStatus()
  await prisma.tripLeg.deleteMany({ where: { planId: plan.id, status: 'SCHEDULED' } })

  // Notify driver users (via Driver→User) + passengers + requester.
  const driverUsers = driverIds.length > 0 ? await prisma.driver.findMany({
    where: { id: { in: driverIds } },
    select: { userId: true },
  }) : []
  const recipients = [
    plan.requesterId,
    ...passengerIds,
    ...driverUsers.map((d) => d.userId).filter(Boolean) as string[],
  ]
  await notifyDtpEvent({
    eventKey: 'TRAVEL_PLAN_CANCELLED',
    recipientIds: recipients,
    subject: 'Trip plan cancelled',
    message: body.reason,
    metadata: { planId: plan.id },
    deepLinkPath: `/dashboard/travel/plans/${plan.id}`,
  })
  return apiSuccess(updated)
})
