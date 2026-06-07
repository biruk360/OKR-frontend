/**
 * POST /api/dtp/plans/:id/endorse — Line Manager endorses a SUBMITTED plan.
 * Body: { decision: 'ENDORSE' | 'REJECT', note?: string }
 * Visible to: managers of the requester (resolved via ManagerRelationship).
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiForbidden } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { transitionPlan, loadReadablePlan, readJson, badStatus } from '@/lib/dtp/api-helpers'
import { resolveApprovalRouting } from '@/lib/dtp/settings'
import { notifyDtpEvent } from '@/lib/dtp/notifier'
import { canFeature } from '@/lib/rbac'
import type { DtpStatus } from '@/types/dtp'

interface EndorseBody {
  decision: 'ENDORSE' | 'REJECT'
  note?: string
}

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const r = await loadReadablePlan(params.id, session)
  if (!r.ok) return r.error
  const plan = r.plan
  const body = (await readJson<EndorseBody>(req)) ?? ({} as EndorseBody)
  if (body.decision !== 'ENDORSE' && body.decision !== 'REJECT') return apiBadRequest('decision must be ENDORSE or REJECT')

  // Authz: must be an active manager of the requester.
  const isManager = await prisma.managerRelationship.findFirst({
    where: { managerId: session.user.id, directReportId: plan.requesterId, endedAt: null },
    select: { id: true },
  })
  if (!isManager) return apiForbidden('Only the requester\'s line manager can endorse')
  const hasFeatureAccess = await canFeature(session.user.id, 'button.dtp.endorse')
  const hasRoleAccess = ['ADMIN', 'DEPARTMENT_LEAD'].includes(session.user.role)
  if (!hasFeatureAccess && !hasRoleAccess) return apiForbidden('Not permitted to endorse trips')
  if (plan.status !== 'SUBMITTED') return badStatus()

  if (body.decision === 'REJECT') {
    const updated = await transitionPlan({
      planId: plan.id,
      from: plan.status as DtpStatus,
      to: 'RETURNED',
      action: 'REJECT',
      actorId: session.user.id,
      payload: { by: 'manager', note: body.note ?? null },
      patch: { decisionNote: body.note ?? null },
    })
    if (!updated) return badStatus()
    await notifyDtpEvent({
      eventKey: 'TRAVEL_PLAN_REJECTED',
      recipientIds: [plan.requesterId],
      subject: `Trip plan rejected by your manager`,
      message: body.note ?? 'Your line manager has rejected the plan and asked for revisions.',
      metadata: { planId: plan.id },
      deepLinkPath: `/dashboard/travel/plans/${plan.id}`,
    })
    return apiSuccess(updated)
  }

  const updated = await transitionPlan({
    planId: plan.id,
    from: plan.status as DtpStatus,
    to: 'MANAGER_ENDORSED',
    action: 'ENDORSE',
    actorId: session.user.id,
    payload: { by: 'manager', note: body.note ?? null },
    patch: { managerEndorsedAt: new Date(), managerEndorsedById: session.user.id },
  })
  if (!updated) return badStatus()

  // Notify Coordinator + requester.
  const routing = await resolveApprovalRouting(plan.departmentId)
  await notifyDtpEvent({
    eventKey: 'TRAVEL_PLAN_ENDORSED',
    recipientIds: [plan.requesterId, routing.primaryCoordinatorId, routing.alternateCoordinatorId].filter(Boolean) as string[],
    subject: 'Trip plan endorsed by manager',
    message: `${session.user.name} endorsed the plan${body.note ? ': ' + body.note : '.'}`,
    metadata: { planId: plan.id },
    deepLinkPath: `/dashboard/travel/plans/${plan.id}`,
  })
  return apiSuccess(updated)
})
