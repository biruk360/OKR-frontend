import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'
import { getWritableProject } from '@/lib/projects/access'
import { recalcProjectRollup, computeSlipDays } from '@/lib/projects/rollup'
import { applyApprovalClock, recordSlipDelayEvent, type ApprovalClockResult } from '@/lib/projects/delay-ledger'
import { hasBaselineFieldWrite } from '@/lib/projects/baseline'
import { findBlockingStageGateForActivity } from '@/lib/projects/stage-gates'
import { markPaymentMilestonesReady, resolveFinanceRecipients, shouldTriggerPaymentMilestone, type PaymentMilestoneReadyResult } from '@/lib/projects/payment-milestones'
import { emit } from '@/lib/notifications'
import { selectableSystemUserEmailWhere } from '@/lib/users/selectable-system-users'
import { apiSuccess, apiForbidden, apiNotFound, apiBadRequest, apiConflict, apiValidationError, withAuth } from '@/lib/api'

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
  milestoneId: z.string().min(1).optional(),
  description: z.string().max(20000).nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  parentActivityId: z.string().nullable().optional(),
  ownerParty: z.enum(['360GROUND', 'CLIENT', 'SHARED']).optional(),
  currentStart: z.string().nullable().optional(),
  currentEnd: z.string().nullable().optional(),
  status: z.enum(['NOT_STARTED', 'STARTED', 'FINISHED', 'APPROVAL_REQUESTED', 'APPROVED', 'REJECTED']).optional(),
  percentComplete: z.number().min(0).max(100).optional(),
  weight: z.number().min(0).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).nullable().optional(),
  risk: z.enum(['LOW', 'MEDIUM', 'HIGH']).nullable().optional(),
  isBlocked: z.boolean().optional(),
  estimatedHours: z.number().min(0).nullable().optional(),
  actualHours: z.number().min(0).nullable().optional(),
  estimatedCost: z.number().min(0).nullable().optional(),
  actualCost: z.number().min(0).nullable().optional(),
  isMilestone: z.boolean().optional(),
  color: z.string().nullable().optional(),
  jiraIssueKeys: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  jiraAutoRollup: z.boolean().optional(),
  // Slip attribution — required when moving dates on a baselined project (C4).
  slipReason: z.string().optional(),
  slipOwner: z.enum(['360GROUND', 'CLIENT', 'SHARED']).optional(),
  slipDetail: z.string().max(2000).optional(),
  // H3 gate override — required when starting a phase whose previous phase gate is unpassed.
  gateOverrideReason: z.string().trim().max(2000).optional(),
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

  if (input.assigneeId) {
    const assignee = await prisma.user.findFirst({ where: { id: input.assigneeId, isActive: true, ...selectableSystemUserEmailWhere() }, select: { id: true } })
    if (!assignee) return apiBadRequest('Assignee must be an active 360Ground user')
  }

  if (input.milestoneId && input.milestoneId !== existing.milestoneId) {
    const target = await prisma.milestone.findFirst({
      where: { id: input.milestoneId, phase: { projectId: params.id } },
      select: { id: true },
    })
    if (!target) return apiBadRequest('Target section does not belong to this project')
  }

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

  if (input.parentActivityId !== undefined && input.parentActivityId !== existing.parentActivityId) {
    if (input.parentActivityId === params.activityId) return apiBadRequest('An activity cannot be its own parent')
    if (input.parentActivityId) {
      const parent = await prisma.activity.findFirst({
        where: {
          id: input.parentActivityId,
          milestoneId: existing.milestoneId,
          parentActivityId: null,
        },
        select: { id: true },
      })
      if (!parent) return apiBadRequest('Sub-activities can only be nested one level under a sibling activity')
    }
    if (existing.parentActivityId && input.parentActivityId) return apiBadRequest('Sub-activities cannot be nested under another sub-activity')
  }

  const stageGateBlock = input.status === 'STARTED' && existing.status !== 'STARTED'
    ? await findBlockingStageGateForActivity(prisma, params.id, params.activityId)
    : null
  if (stageGateBlock && !input.gateOverrideReason?.trim()) {
    return apiConflict(`${stageGateBlock.gateName} has not passed. Proceed anyway?`, stageGateBlock)
  }

  const data: any = {}
  for (const k of ['title', 'description', 'assigneeId', 'parentActivityId', 'ownerParty', 'status', 'percentComplete', 'weight', 'priority', 'risk', 'estimatedHours', 'actualHours', 'estimatedCost', 'actualCost', 'isMilestone', 'color', 'jiraIssueKeys', 'jiraAutoRollup', 'isBlocked'] as const) {
    if (input[k] !== undefined) data[k] = input[k]
  }
  if (input.ownerParty === 'CLIENT') data.assigneeId = null
  if (input.assigneeId && input.ownerParty === undefined && existing.ownerParty === 'CLIENT') data.ownerParty = '360GROUND'
  if (input.milestoneId && input.milestoneId !== existing.milestoneId) {
    const maxPosition = await prisma.activity.aggregate({ where: { milestoneId: input.milestoneId, parentActivityId: null }, _max: { position: true } })
    data.milestoneId = input.milestoneId
    data.parentActivityId = null
    data.position = (maxPosition._max.position ?? -1) + 1
  }
  if (input.isBlocked !== undefined && input.isBlocked !== existing.isBlocked) {
    data.blockedSince = input.isBlocked ? (existing.blockedSince ?? new Date()) : null
  }
  // G3: manual progress edits win over Jira auto-rollup.
  if (input.percentComplete !== undefined) data.jiraAutoRollup = false
  if (input.currentStart !== undefined) data.currentStart = nextStart
  if (input.currentEnd !== undefined) data.currentEnd = nextEnd
  if (access.baselineCommittedAt && dateChanged) {
    data.slipReason = input.slipReason
    data.slipOwner = input.slipOwner
  }

  let paymentMilestonesReady: PaymentMilestoneReadyResult[] = []
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
    if (input.status !== undefined && shouldTriggerPaymentMilestone(existing.status, input.status)) {
      paymentMilestonesReady = await markPaymentMilestonesReady(tx, { projectId: params.id, activityId: params.activityId })
    }
    await recalcProjectRollup(tx, params.id)
    return result
  })

  // Post-commit side effects: approval-clock notifications (Standing Rule #1).
  for (const n of clockResult?.notifications ?? []) {
    await emit(n.eventKey, n.payload)
  }
  if (paymentMilestonesReady.length > 0) {
    const project = await prisma.project.findUnique({ where: { id: params.id }, select: { name: true, projectManagerId: true } })
    const recipients = await resolveFinanceRecipients(prisma, project?.projectManagerId)
    for (const milestone of paymentMilestonesReady) {
      await emit('PAYMENT_MILESTONE_READY', {
        actorId: session.user.id,
        entityType: 'PROJECT',
        entityId: params.id,
        entityTitle: project?.name ?? 'Project',
        explicitRecipients: recipients,
        data: {
          paymentMilestoneId: milestone.id,
          paymentMilestoneName: milestone.name,
          activityId: params.activityId,
          activityTitle: existing.title,
          amount: milestone.amount,
          currency: milestone.currency,
          deepLink: `/projects/${params.id}`,
        },
      })
    }
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
    metadata: {
      activityId: params.activityId,
      paymentMilestonesReady: paymentMilestonesReady.map((m) => ({ id: m.id, name: m.name, amount: m.amount, currency: m.currency })),
      ...(stageGateBlock && input.gateOverrideReason?.trim()
        ? { gateOverride: { ...stageGateBlock, reason: input.gateOverrideReason.trim() } }
        : {}),
    },
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
