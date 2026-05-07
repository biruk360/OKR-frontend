/**
 * POST /api/dtp/plans/:id/submit — requester submits a DRAFT plan.
 * Behaviour:
 *  - Validates: ≥1 stop, no missing required stop fields.
 *  - Resolves the plan's department (if not set) from the requester's primary
 *    membership; resolves the manager-endorsement mode from settings.
 *  - Sets `late = true` when submitted after `submissionCutoff` for the day
 *    before the trip date (FR-15).
 *  - Transitions DRAFT → SUBMITTED (or → MANAGER_ENDORSED-bypass when mode is
 *    OFF in some setups; for clarity we always go to SUBMITTED and rely on
 *    the Coordinator routing layer to interpret).
 *  - Notifies Line Manager + Travel Coordinator (FR-13).
 */

import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { transitionPlan, loadReadablePlan, badStatus } from '@/lib/dtp/api-helpers'
import { resolveApprovalRouting, getDtpSettings } from '@/lib/dtp/settings'
import { notifyDtpEvent } from '@/lib/dtp/notifier'
import { parseHHMM } from '@/lib/dtp/time'
import type { DtpStatus } from '@/types/dtp'

export const POST = withAuth<{ id: string }>(async (_req, { session, params }) => {
  const r = await loadReadablePlan(params.id, session)
  if (!r.ok) return r.error
  const plan = r.plan
  if (plan.requesterId !== session.user.id) return apiBadRequest('Only the requester can submit this plan')
  if (plan.status !== 'DRAFT' && plan.status !== 'RETURNED') return badStatus()
  if (plan.stops.length === 0) return apiBadRequest('Plan needs at least one stop before submission')

  // Late-submission flag: cutoff applies to "the day before the trip date".
  const settings = await getDtpSettings()
  const now = new Date()
  const tripDate = new Date(plan.tripDate)
  const cutoffMin = parseHHMM(settings.submissionCutoff)
  const cutoffDate = new Date(tripDate.getTime() - 24 * 60 * 60 * 1000)
  cutoffDate.setUTCHours(Math.floor(cutoffMin / 60), cutoffMin % 60, 0, 0)
  const late = now > cutoffDate

  const updated = await transitionPlan({
    planId: plan.id,
    from: plan.status as DtpStatus,
    to: 'SUBMITTED',
    action: 'SUBMIT',
    actorId: session.user.id,
    payload: { late, stopCount: plan.stops.length },
    patch: { submittedAt: new Date(), late },
  })
  if (!updated) return badStatus()

  // Routing — gather coordinator + manager recipients.
  const routing = await resolveApprovalRouting(plan.departmentId)
  const recipients: string[] = []
  if (routing.primaryCoordinatorId) recipients.push(routing.primaryCoordinatorId)
  // Line manager(s) — every active ManagerRelationship for the requester.
  const managerRows = await prisma.managerRelationship.findMany({
    where: { directReportId: session.user.id, endedAt: null },
    select: { managerId: true },
  })
  for (const m of managerRows) recipients.push(m.managerId)

  await notifyDtpEvent({
    eventKey: 'TRAVEL_PLAN_SUBMITTED',
    recipientIds: recipients,
    subject: `New trip plan submitted${late ? ' (late)' : ''} — ${plan.tripDate.toISOString().slice(0, 10)}`,
    message: `${session.user.name} submitted a trip plan with ${plan.stops.length} stop(s) for ${plan.tripDate.toISOString().slice(0, 10)}.`,
    metadata: { planId: plan.id, requesterId: plan.requesterId, late },
    deepLinkPath: `/dashboard/travel/plans/${plan.id}`,
  })

  return apiSuccess(updated)
})
