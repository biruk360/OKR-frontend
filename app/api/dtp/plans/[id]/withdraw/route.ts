/**
 * POST /api/dtp/plans/:id/withdraw — requester pulls back a Submitted/Endorsed plan.
 */

import { apiSuccess, apiForbidden } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { transitionPlan, loadReadablePlan, badStatus } from '@/lib/dtp/api-helpers'
import { resolveApprovalRouting } from '@/lib/dtp/settings'
import { notifyDtpEvent } from '@/lib/dtp/notifier'
import type { DtpStatus } from '@/types/dtp'

export const POST = withAuth<{ id: string }>(async (_req, { session, params }) => {
  const r = await loadReadablePlan(params.id, session)
  if (!r.ok) return r.error
  const plan = r.plan
  if (plan.requesterId !== session.user.id) return apiForbidden('Only the requester can withdraw this plan')
  const status = plan.status as DtpStatus
  if (status !== 'SUBMITTED' && status !== 'MANAGER_ENDORSED' && status !== 'DRAFT' && status !== 'RETURNED' && status !== 'UNDER_REVIEW') return badStatus()
  const updated = await transitionPlan({
    planId: plan.id,
    from: status,
    to: 'WITHDRAWN',
    action: 'WITHDRAW',
    actorId: session.user.id,
    payload: null,
  })
  if (!updated) return badStatus()
  const routing = await resolveApprovalRouting(plan.departmentId)
  await notifyDtpEvent({
    eventKey: 'TRAVEL_PLAN_WITHDRAWN',
    recipientIds: [routing.primaryCoordinatorId, routing.alternateCoordinatorId].filter(Boolean) as string[],
    subject: 'Trip plan withdrawn',
    message: `${session.user.name} withdrew their trip plan for ${plan.tripDate.toISOString().slice(0, 10)}.`,
    metadata: { planId: plan.id },
    deepLinkPath: `/dashboard/travel/console`,
  })
  return apiSuccess(updated)
})
