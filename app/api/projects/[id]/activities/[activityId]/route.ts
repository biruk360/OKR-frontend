import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'
import { getWritableProject } from '@/lib/projects/access'
import { recalcProjectRollup, computeSlipDays } from '@/lib/projects/rollup'
import { applyApprovalClock, recordSlipDelayEvent, type ApprovalClockResult } from '@/lib/projects/delay-ledger'
import { hasBaselineFieldWrite } from '@/lib/projects/baseline'
import { emit } from '@/lib/notifications'
import { apiSuccess, apiForbidden, apiNotFound, apiBadRequest, apiValidationError, withAuth } from '@/lib/api'

/**
 * PATCH  /api/projects/[id]/activities/[activityId] — update an activity + roll up (B1).
 * DELETE /api/projects/[id]/activities/[activityId] — delete an activity + roll up.
 *
 * Critical Invariant #2: on a *baselined* project, any change to currentStart/currentEnd
 * requires a slip reason + owner (the C4 hard gate). Baseline dates are never writable here
 * (Invariant #1). The DelayEvent side-effect is created by the delay-ledger service (C4).
 */

const patchSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().max(20000).nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  ownerParty: z.enum(['360GROUND', 'CLIENT', 'SHARED']).optional(),
  currentStart: z.string().nullable().optional(),
  currentEnd: z.string().nullable().optional(),
  status: z.enum(['NOT_STARTED', 'STARTED', 'FINISHED', 'APPROVAL_REQUESTED', 'APPROVED', 'REJECTED']).optional(),
  percentComplete: z.number().min(0).max(100).optional(),
  weight: z.number().min(0).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).nullable().optional(),
  risk: z.enum(['LOW', 'MEDIUM', 'HIGH']).nullable().optional(),
  estimatedHours: z.number().min(0).nullable().optional(),
  actualHours: z.number().min(0).nullable().optional(),
  estimatedCost: z.number().min(0).nullable().optional(),
  actualCost: z.number().min(0).nullable().optional(),
  isMilestone: z.boolean().optional(),
  color: z.string().nullable().optional(),
  // Slip attribution — required when moving dates on a baselined project (C4).
  slipReason: z.string().optional(),
  slipOwner: z.enum(['360GROUND', 'CLIENT', 'SHARED']).optional(),
  slipDetail: z.string().max(2000).optional(),
})

export const PATCH = withAuth<{ id: string; activityId: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const existing = await prisma.activity.findFirst({
    where: { id: params.activityId, milestone: { phase: { projectId: params.id } } },
  })
  if (!existing) return apiNotFound('Activity not found')

  const raw = await req.json().catch(() => null)
  // Invariant #1: baseline dates are frozen — never writable here (only via C2 re-baseline).
  if (hasBaselineFieldWrite(raw)) return apiForbidden('Baseline fields are frozen and can only change via formal re-baseline')
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) return apiValidationError('Invalid activity payload', parsed.error.flatten())
  const input = parsed.data

  const nextStart = input.currentStart !== undefined ? (input.currentStart ? new Date(input.currentStart) : null) : existing.currentStart
  const nextEnd = input.currentEnd !== undefined ? (input.currentEnd ? new Date(input.currentEnd) : null) : existing.currentEnd
  if (nextStart && nextEnd && nextEnd < nextStart) return apiBadRequest('End date must be on or after start date')

  const dateChanged =
    (input.currentStart !== undefined && +(nextStart ?? 0) !== +(existing.currentStart ?? 0)) ||
    (input.currentEnd !== undefined && +(nextEnd ?? 0) !== +(existing.currentEnd ?? 0))

  // C4 hard gate: baselined project + date move requires reason + owner.
  if (access.baselineCommittedAt && dateChanged && (!input.slipReason || !input.slipOwner)) {
    return apiForbidden('A slip reason and owner are required to change dates on a baselined project')
  }

  // Sub-activity parents derive their % from children — reject a direct % write.
  if (input.percentComplete !== undefined) {
    const hasSubtasks = await prisma.activity.count({ where: { parentActivityId: params.activityId } })
    if (hasSubtasks > 0) return apiBadRequest('This activity has sub-activities; its % is derived and read-only')
  }

  const data: any = {}
  for (const k of ['title', 'description', 'assigneeId', 'ownerParty', 'status', 'percentComplete', 'weight', 'priority', 'risk', 'estimatedHours', 'actualHours', 'estimatedCost', 'actualCost', 'isMilestone', 'color'] as const) {
    if (input[k] !== undefined) data[k] = input[k]
  }
  if (input.currentStart !== undefined) data.currentStart = nextStart
  if (input.currentEnd !== undefined) data.currentEnd = nextEnd
  if (access.baselineCommittedAt && dateChanged) {
    data.slipReason = input.slipReason
    data.slipOwner = input.slipOwner
  }

  const clockResult = await prisma.$transaction(async (tx): Promise<ApprovalClockResult | null> => {
    await tx.activity.update({ where: { id: params.activityId }, data })
    // C3 Approval Clock: status transitions to/from APPROVAL_REQUESTED start/stop
    // the clock, auto-record the DelayEvent, and flag SLA breaches (no-op otherwise).
    // Notifications are returned as intents and fired post-commit (never in-txn).
    const result = input.status !== undefined
      ? await applyApprovalClock(tx, existing, input.status, { actorId: session.user.id })
      : null
    // C4 slip attribution: a gated date move on a baselined project records a
    // PM-tagged DelayEvent (daysLost = slip increase, never negative).
    if (access.baselineCommittedAt && dateChanged) {
      await recordSlipDelayEvent(tx, {
        projectId: params.id,
        activityId: params.activityId,
        slipOwner: input.slipOwner!,
        slipReason: input.slipReason!,
        slipDetail: input.slipDetail,
        oldSlipDays: existing.slipDays,
        newSlipDays: computeSlipDays(existing.baselineEnd, nextEnd),
        baselineEnd: existing.baselineEnd,
        newEnd: nextEnd,
        recordedById: session.user.id,
      })
    }
    await recalcProjectRollup(tx, params.id)
    return result
  })

  // Post-commit side effects: approval-clock notifications (Standing Rule #1).
  for (const n of clockResult?.notifications ?? []) {
    await emit(n.eventKey, n.payload)
  }

  const changes: ChangeMap = {}
  for (const k of Object.keys(data)) {
    const from = (existing as Record<string, any>)[k]
    const to = data[k]
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v)
    if (norm(from) !== norm(to)) changes[k] = { from: norm(from), to: norm(to) }
  }
  const statusChanged = input.status !== undefined && input.status !== existing.status
  const action =
    statusChanged && input.status === 'APPROVAL_REQUESTED'
      ? 'APPROVAL_REQUESTED'
      : statusChanged && existing.status === 'APPROVAL_REQUESTED' && (input.status === 'APPROVED' || input.status === 'REJECTED')
        ? 'APPROVAL_RESOLVED'
        : statusChanged
          ? 'STATUS_CHANGED'
          : 'UPDATED'
  await recordActivity({
    entityType: 'PROJECT_ACTIVITY',
    projectId: params.id,
    action,
    actorId: session.user.id,
    changes: Object.keys(changes).length ? changes : null,
    metadata: { activityId: params.activityId },
  })

  return apiSuccess({ id: params.activityId })
})

export const DELETE = withAuth<{ id: string; activityId: string }>(async (_req, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const existing = await prisma.activity.findFirst({
    where: { id: params.activityId, milestone: { phase: { projectId: params.id } } },
    select: { id: true, title: true },
  })
  if (!existing) return apiNotFound('Activity not found')

  await prisma.$transaction(async (tx) => {
    await tx.activity.delete({ where: { id: params.activityId } })
    await recalcProjectRollup(tx, params.id)
  })

  await recordActivity({
    entityType: 'PROJECT_ACTIVITY',
    projectId: params.id,
    action: 'DELETED',
    actorId: session.user.id,
    metadata: { activityId: params.activityId, title: existing.title },
  })

  return apiSuccess({ id: params.activityId, deleted: true })
})
