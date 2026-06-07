/**
 * POST /api/dtp/plans/:id/reject — Coordinator rejects a plan outright.
 * Body: { note: string }. Plan moves to RETURNED with the note (the spec uses
 * "Rejected" + "Returned for Edit" interchangeably for non-emergency cases —
 * RETURNED is the lifecycle bucket; this endpoint exists so the UI can use a
 * stronger "Reject" verb when appropriate).
 */

import type { NextRequest } from 'next/server'
import { apiSuccess, apiBadRequest, apiForbidden } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { transitionPlan, loadReadablePlan, readJson, badStatus } from '@/lib/dtp/api-helpers'
import { canActAsCoordinator } from '@/lib/dtp/permissions'
import { notifyDtpEvent } from '@/lib/dtp/notifier'
import { canFeature } from '@/lib/rbac'
import type { DtpStatus } from '@/types/dtp'

interface Body { note: string }

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const r = await loadReadablePlan(params.id, session)
  if (!r.ok) return r.error
  const plan = r.plan
  if (!(await canActAsCoordinator(session, plan.departmentId))) return apiForbidden('Only the Travel Coordinator can reject this plan')
  const hasFeatureAccess = await canFeature(session.user.id, 'button.dtp.reject')
  const hasRoleAccess = ['ADMIN', 'DEPARTMENT_LEAD'].includes(session.user.role)
  if (!hasFeatureAccess && !hasRoleAccess) return apiForbidden('Not permitted to reject trips')
  const body = await readJson<Body>(req)
  if (!body?.note?.trim()) return apiBadRequest('A rejection note is required')
  const status = plan.status as DtpStatus
  if (status !== 'SUBMITTED' && status !== 'MANAGER_ENDORSED' && status !== 'UNDER_REVIEW') return badStatus()
  const updated = await transitionPlan({
    planId: plan.id,
    from: status,
    to: 'RETURNED',
    action: 'REJECT',
    actorId: session.user.id,
    payload: { note: body.note },
    patch: { decisionNote: body.note, decisionById: session.user.id, decisionAt: new Date() },
  })
  if (!updated) return badStatus()
  await notifyDtpEvent({
    eventKey: 'TRAVEL_PLAN_REJECTED',
    recipientIds: [plan.requesterId],
    subject: 'Trip plan rejected',
    message: body.note,
    metadata: { planId: plan.id },
    deepLinkPath: `/dashboard/travel/plans/${plan.id}`,
  })
  return apiSuccess(updated)
})
