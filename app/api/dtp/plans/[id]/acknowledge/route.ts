/**
 * POST /api/dtp/plans/:id/acknowledge — requester acknowledges Coordinator
 * adjustments. Moves ADJUSTED → APPROVED + generates legs (FR-08, AC-10).
 */

import { prisma } from '@/lib/prisma'
import { apiSuccess, apiForbidden } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { transitionPlan, loadReadablePlan, badStatus } from '@/lib/dtp/api-helpers'
import { rebuildLegsForPlan } from '@/lib/dtp/legs'
import { notifyDtpEvent } from '@/lib/dtp/notifier'
import { getDtpSettings, parseCsvIds } from '@/lib/dtp/settings'
import type { DtpStatus } from '@/types/dtp'

export const POST = withAuth<{ id: string }>(async (_req, { session, params }) => {
  const r = await loadReadablePlan(params.id, session)
  if (!r.ok) return r.error
  const plan = r.plan
  if (plan.requesterId !== session.user.id) return apiForbidden('Only the requester can acknowledge')
  if (plan.status !== 'ADJUSTED') return badStatus()

  const updated = await transitionPlan({
    planId: plan.id,
    from: plan.status as DtpStatus,
    to: 'APPROVED',
    action: 'ACK',
    actorId: session.user.id,
    payload: null,
    patch: { acknowledgedAt: new Date() },
  })
  if (!updated) return badStatus()

  await rebuildLegsForPlan(plan.id)

  const settings = await getDtpSettings()
  const managerRows = await prisma.managerRelationship.findMany({
    where: { directReportId: plan.requesterId, endedAt: null },
    select: { managerId: true },
  })
  await notifyDtpEvent({
    eventKey: 'TRAVEL_PLAN_APPROVED',
    recipientIds: [plan.decisionById, ...managerRows.map((m) => m.managerId), ...parseCsvIds(settings.poolCoordinatorIds)].filter(Boolean) as string[],
    subject: 'Trip plan acknowledged and approved',
    message: `${session.user.name} acknowledged the Coordinator's adjustments — plan is now approved.`,
    metadata: { planId: plan.id },
    deepLinkPath: `/dashboard/travel/plans/${plan.id}`,
  })
  return apiSuccess(updated)
})
