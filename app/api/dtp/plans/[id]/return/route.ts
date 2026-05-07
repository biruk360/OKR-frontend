/**
 * POST /api/dtp/plans/:id/return — Coordinator returns a plan for edits.
 * Body: { note: string } (note is required by the spec).
 * Plan moves into RETURNED → requester re-edits → re-submits.
 */

import type { NextRequest } from 'next/server'
import { apiSuccess, apiBadRequest, apiForbidden } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { transitionPlan, loadReadablePlan, readJson, badStatus } from '@/lib/dtp/api-helpers'
import { canActAsCoordinator } from '@/lib/dtp/permissions'
import { notifyDtpEvent } from '@/lib/dtp/notifier'
import type { DtpStatus } from '@/types/dtp'

interface Body { note: string }

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const r = await loadReadablePlan(params.id, session)
  if (!r.ok) return r.error
  const plan = r.plan
  if (!(await canActAsCoordinator(session, plan.departmentId))) return apiForbidden('Only the Travel Coordinator can return this plan')
  const body = await readJson<Body>(req)
  if (!body?.note?.trim()) return apiBadRequest('A note explaining what to fix is required')
  const status = plan.status as DtpStatus
  if (status !== 'SUBMITTED' && status !== 'MANAGER_ENDORSED' && status !== 'UNDER_REVIEW' && status !== 'ADJUSTED') {
    return badStatus()
  }
  const updated = await transitionPlan({
    planId: plan.id,
    from: status,
    to: 'RETURNED',
    action: 'RETURN',
    actorId: session.user.id,
    payload: { note: body.note },
    patch: { decisionNote: body.note, decisionById: session.user.id, decisionAt: new Date() },
  })
  if (!updated) return badStatus()
  await notifyDtpEvent({
    eventKey: 'TRAVEL_PLAN_RETURNED',
    recipientIds: [plan.requesterId],
    subject: 'Trip plan returned for edits',
    message: body.note,
    metadata: { planId: plan.id },
    deepLinkPath: `/dashboard/travel/plans/${plan.id}`,
  })
  return apiSuccess(updated)
})
