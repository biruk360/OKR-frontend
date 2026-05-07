/**
 * GET    /api/dtp/plans/:id — read a plan + stops + audit summary.
 * PATCH  /api/dtp/plans/:id — edit plan-level fields.
 *   - Requester can edit while DRAFT or RETURNED (FR-01).
 *   - Coordinator can edit while SUBMITTED / MANAGER_ENDORSED / UNDER_REVIEW
 *     (FR-07). Their edits flag the plan `adjusted = true` for the diff banner.
 * DELETE /api/dtp/plans/:id — soft-delete (only DRAFT or WITHDRAWN; requester or admin).
 */

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiForbidden } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { isCoordinatorEditable, isRequesterEditable } from '@/lib/dtp/state-machine'
import { canActAsCoordinator } from '@/lib/dtp/permissions'
import { recordDtpEvent } from '@/lib/dtp/audit'
import { loadReadablePlan, readJson } from '@/lib/dtp/api-helpers'
import type { DtpStatus } from '@/types/dtp'

interface PatchBody {
  priority?: 'NORMAL' | 'URGENT'
  defaultModeOfMovement?: string
  emergencyReason?: string | null
  linkedObjectiveId?: string | null
  linkedKeyResultId?: string | null
  linkedInitiativeId?: string | null
}

export const GET = withAuth<{ id: string }>(async (_req, { session, params }) => {
  const r = await loadReadablePlan(params.id, session)
  if (!r.ok) return r.error
  const events = await prisma.dtpEvent.findMany({
    where: { planId: r.plan.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { actor: { select: { id: true, name: true } } },
  })
  return apiSuccess({ plan: r.plan, events })
})

export const PATCH = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const body = (await readJson<PatchBody>(req)) ?? {}
  const r = await loadReadablePlan(params.id, session)
  if (!r.ok) return r.error
  const plan = r.plan
  const isOwner = plan.requesterId === session.user.id
  const isCoord = await canActAsCoordinator(session, plan.departmentId)
  const status = plan.status as DtpStatus
  const canRequesterEdit = isOwner && isRequesterEditable(status)
  const canCoordEdit = isCoord && isCoordinatorEditable(status)
  if (!canRequesterEdit && !canCoordEdit) return apiForbidden('Plan is not editable in its current state')

  const data: Record<string, unknown> = {}
  if (body.priority === 'NORMAL' || body.priority === 'URGENT') data.priority = body.priority
  if (typeof body.defaultModeOfMovement === 'string') data.defaultModeOfMovement = body.defaultModeOfMovement
  if (body.emergencyReason !== undefined) data.emergencyReason = body.emergencyReason
  if ('linkedObjectiveId' in body) data.linkedObjectiveId = body.linkedObjectiveId
  if ('linkedKeyResultId' in body) data.linkedKeyResultId = body.linkedKeyResultId
  if ('linkedInitiativeId' in body) data.linkedInitiativeId = body.linkedInitiativeId
  if (Object.keys(data).length === 0) return apiBadRequest('No editable fields provided')

  if (canCoordEdit && !isOwner) data.adjusted = true

  const updated = await prisma.dailyTripPlan.update({ where: { id: plan.id }, data })
  await recordDtpEvent({
    planId: plan.id,
    actorId: session.user.id,
    action: 'EDIT',
    fromStatus: status,
    toStatus: status,
    payload: { changedFields: Object.keys(data), by: isCoord && !isOwner ? 'coordinator' : 'requester' },
  })
  return apiSuccess(updated)
})

export const DELETE = withAuth<{ id: string }>(async (_req, { session, params }) => {
  const r = await loadReadablePlan(params.id, session)
  if (!r.ok) return r.error
  const plan = r.plan
  if (plan.requesterId !== session.user.id && session.user.role !== 'ADMIN') {
    return apiForbidden('Only the requester or an admin can delete this plan')
  }
  if (plan.status !== 'DRAFT' && plan.status !== 'WITHDRAWN') {
    return apiBadRequest('Only DRAFT or WITHDRAWN plans can be deleted')
  }
  await prisma.dailyTripPlan.update({ where: { id: plan.id }, data: { deletedAt: new Date() } })
  await recordDtpEvent({
    planId: plan.id,
    actorId: session.user.id,
    action: 'EDIT',
    fromStatus: plan.status as DtpStatus,
    toStatus: plan.status as DtpStatus,
    payload: { event: 'soft_delete' },
  })
  return apiSuccess({ id: plan.id })
})
