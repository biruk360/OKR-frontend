/**
 * POST /api/dtp/plans/:id/approve — Coordinator approves a plan.
 *
 * Behaviour:
 *  - If the plan was edited by the Coordinator (`adjusted = true`) AND the
 *    `adjustmentRequiresAcknowledgement` setting is on, the plan moves to
 *    ADJUSTED instead of APPROVED, and the requester gets a diff notification.
 *    The plan moves to APPROVED on /acknowledge (FR-08, AC-10).
 *  - On true APPROVED, generates legs from the approved stops (FR-09 / AC-09)
 *    and notifies requester + manager + pool coordinator(s).
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiForbidden } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { transitionPlan, loadReadablePlan, readJson, badStatus } from '@/lib/dtp/api-helpers'
import { canActAsCoordinator } from '@/lib/dtp/permissions'
import { rebuildLegsForPlan } from '@/lib/dtp/legs'
import { getDtpSettings, parseCsvIds } from '@/lib/dtp/settings'
import { notifyDtpEvent } from '@/lib/dtp/notifier'
import { recordDtpEvent } from '@/lib/dtp/audit'
import { canFeature } from '@/lib/rbac'
import type { DtpStatus } from '@/types/dtp'

interface ApproveBody {
  note?: string
}

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const r = await loadReadablePlan(params.id, session)
  if (!r.ok) return r.error
  const plan = r.plan
  if (!(await canActAsCoordinator(session, plan.departmentId))) {
    return apiForbidden('Only the Travel Coordinator can approve this plan')
  }
  const hasFeatureAccess = await canFeature(session.user.id, 'button.dtp.approve')
  const hasRoleAccess = ['ADMIN', 'DEPARTMENT_LEAD'].includes(session.user.role)
  if (!hasFeatureAccess && !hasRoleAccess) return apiForbidden('Not permitted to approve trips')
  const body = (await readJson<ApproveBody>(req)) ?? {}
  const status = plan.status as DtpStatus
  if (status !== 'SUBMITTED' && status !== 'MANAGER_ENDORSED' && status !== 'UNDER_REVIEW' && status !== 'ADJUSTED') {
    return badStatus()
  }

  const settings = await getDtpSettings()
  const adjustedPath = plan.adjusted && settings.adjustmentRequiresAcknowledgement && status !== 'ADJUSTED'

  if (adjustedPath) {
    const updated = await transitionPlan({
      planId: plan.id,
      from: status,
      to: 'ADJUSTED',
      action: 'ADJUST',
      actorId: session.user.id,
      payload: { note: body.note ?? null },
      patch: { decisionNote: body.note ?? null, decidedById: session.user.id },
    })
    if (!updated) return badStatus()
    await notifyDtpEvent({
      eventKey: 'TRAVEL_PLAN_ADJUSTED',
      recipientIds: [plan.requesterId],
      subject: 'Your trip plan was adjusted by the Travel Coordinator',
      message: `${session.user.name} adjusted your plan. Please review and acknowledge to finalize approval.`,
      metadata: { planId: plan.id },
      deepLinkPath: `/dashboard/travel/plans/${plan.id}`,
    })
    return apiSuccess(updated)
  }

  // Direct approval path — set decision audit + clear coordinator-edit flag.
  const updated = await transitionPlan({
    planId: plan.id,
    from: status,
    to: 'APPROVED',
    action: 'APPROVE',
    actorId: session.user.id,
    payload: { note: body.note ?? null, adjusted: plan.adjusted },
    patch: {
      decisionAt: new Date(),
      decisionById: session.user.id,
      decisionNote: body.note ?? null,
    },
  })
  if (!updated) return badStatus()

  // Generate legs (FR-09).
  await rebuildLegsForPlan(plan.id)

  // Notify requester + manager + pool coordinators.
  const managerRows = await prisma.managerRelationship.findMany({
    where: { directReportId: plan.requesterId, endedAt: null },
    select: { managerId: true },
  })
  const recipients = [
    plan.requesterId,
    ...managerRows.map((m) => m.managerId),
    ...parseCsvIds(settings.poolCoordinatorIds),
  ]
  await notifyDtpEvent({
    eventKey: 'TRAVEL_PLAN_APPROVED',
    recipientIds: recipients,
    subject: 'Trip plan approved',
    message: `${session.user.name} approved the trip plan for ${plan.tripDate.toISOString().slice(0, 10)}.`,
    metadata: { planId: plan.id },
    deepLinkPath: `/dashboard/travel/plans/${plan.id}`,
  })

  // Audit the leg generation as a separate row for clarity.
  await recordDtpEvent({
    planId: plan.id,
    actorId: session.user.id,
    action: 'EDIT',
    fromStatus: 'APPROVED',
    toStatus: 'APPROVED',
    payload: { event: 'legs_generated' },
  })
  return apiSuccess(updated)
})
