/**
 * The Approval Clock (Epic C3) — the automatic client-delay ledger.
 *
 * When an activity transitions into APPROVAL_REQUESTED the clock starts
 * (`waitingSince = now`, `ownerParty` forced to CLIENT) and the client/PM are
 * notified. When it resolves (APPROVED or REJECTED) the clock stops and the
 * wait is recorded as an auto-detected `DelayEvent` in business days; if the
 * project's APPROVAL-type `ClientObligation` SLA was exceeded, an
 * `ApprovalSlaBreach` is created and `obligation.breachCount` is incremented.
 * Rejection still records the delay — "rejection is not free".
 *
 * The decision logic (`decideApprovalClockTransition`) is pure and unit-tested
 * without a DB; `applyApprovalClock` is the persistence wrapper that must run
 * inside the caller's transaction (Critical Invariant: the approval clock is
 * automatic and uses business days — `business-days.ts`, never reinvented here).
 *
 * Side-effect rule: `applyApprovalClock` performs ONLY transactional reads/writes.
 * Notification intents are returned on the result (`notifications`) and the caller
 * fires `emit()` AFTER the transaction commits (never inside `prisma.$transaction`).
 *
 * Build spec: docs/project_management_module_BUILD_SPEC.md §C3.
 */

import type { Prisma } from '@prisma/client'
import { businessDaysBetween } from './business-days'
import { updateApprovalObligationCompliance } from './client-obligations'
import type { EventPayload } from '@/lib/notifications/events'

/**
 * Pure: days lost attributable to a baselined date move = the increase in slip
 * (never negative — moving a date earlier records 0, not a credit).
 */
export function computeSlipDaysLost(oldSlipDays: number, newSlipDays: number): number {
  return Math.max(0, newSlipDays - oldSlipDays)
}

/** Escalation thresholds for an approval sitting past its SLA (spec §C3): SLA, +3, +7. */
export type ApprovalEscalationLevel = 0 | 1 | 2 | 3
export const APPROVAL_ESCALATION_OFFSETS = [0, 3, 7] as const

/**
 * Pure: which escalation threshold (if any) a wait of `daysWaited` business days
 * has crossed against an SLA of `slaBusinessDays`. The cron fires each level once
 * (tracked on `Activity.approvalEscalationLevel`, reset when the clock resolves).
 */
export function approvalEscalationLevel(daysWaited: number, slaBusinessDays: number): ApprovalEscalationLevel {
  if (daysWaited >= slaBusinessDays + APPROVAL_ESCALATION_OFFSETS[2]) return 3
  if (daysWaited >= slaBusinessDays + APPROVAL_ESCALATION_OFFSETS[1]) return 2
  if (daysWaited >= slaBusinessDays + APPROVAL_ESCALATION_OFFSETS[0]) return 1
  return 0
}

export interface RecordSlipDelayParams {
  projectId: string
  activityId: string
  slipOwner: string
  slipReason: string
  slipDetail?: string | null
  /** slipDays before the move (from the activity row). */
  oldSlipDays: number
  /** slipDays after the move — recompute with rollup's computeSlipDays(baselineEnd, nextEnd). */
  newSlipDays: number
  /** Original committed end (delay start); falls back to now when unbaselined-dated. */
  baselineEnd: Date | null
  /** The new current end (delay end); null when the date was cleared. */
  newEnd: Date | null
  recordedById?: string | null
  now?: Date
}

/**
 * C4 slip attribution: record a PM-tagged `DelayEvent` for a baselined date move.
 * MUST run inside the caller's transaction (the gate that requires slipReason +
 * slipOwner lives in the activity PATCH route — Invariant #2).
 */
export async function recordSlipDelayEvent(
  tx: Prisma.TransactionClient,
  params: RecordSlipDelayParams
): Promise<{ id: string; daysLost: number; phaseAtTime: string | null }> {
  const now = params.now ?? new Date()
  const ctx = await tx.activity.findUnique({
    where: { id: params.activityId },
    select: { milestone: { select: { phase: { select: { name: true } } } } },
  })
  const phaseAtTime = ctx?.milestone?.phase?.name ?? null
  const daysLost = computeSlipDaysLost(params.oldSlipDays, params.newSlipDays)

  const event = await tx.delayEvent.create({
    data: {
      projectId: params.projectId,
      activityId: params.activityId,
      eventType: 'BASELINE_SLIP',
      daysLost,
      owner: params.slipOwner,
      reason: params.slipReason,
      reasonDetail: params.slipDetail ?? null,
      phaseAtTime,
      startedAt: params.baselineEnd ?? now,
      endedAt: params.newEnd,
      isAutoDetected: false,
      recordedById: params.recordedById ?? null,
    },
    select: { id: true },
  })
  return { id: event.id, daysLost, phaseAtTime }
}

/** A notification the caller must fire post-commit (never inside the txn). */
export interface ApprovalClockNotification {
  eventKey: 'CLIENT_APPROVAL_PENDING' | 'CLIENT_APPROVAL_SLA_BREACH'
  payload: EventPayload
}

/** Result of applying the clock: the decision + post-commit notification intents. */
export interface ApprovalClockResult {
  decision: ApprovalClockDecision
  notifications: ApprovalClockNotification[]
}

/** What the clock decided for a status transition. */
export type ApprovalClockDecision =
  | { kind: 'START' }
  | { kind: 'RESOLVED'; startedAt: Date; daysWaited: number; daysOverSla: number }
  | { kind: 'NOOP' }

export interface ApprovalClockTransitionInput {
  /** Status before the transition. */
  from: string
  /** Status after the transition. */
  to: string
  /** When the clock started (set on →APPROVAL_REQUESTED). */
  waitingSince: Date | null
  /** Resolution/start instant — injectable for tests. */
  now: Date
  /** SLA in business days from the project's APPROVAL ClientObligation (null = none). */
  slaBusinessDays: number | null
  /** Optional holiday calendar (YYYY-MM-DD keys) forwarded to business-day math. */
  holidays?: ReadonlySet<string>
}

/**
 * Pure decision for the Approval Clock state machine. No I/O — unit-testable.
 *
 * - `→ APPROVAL_REQUESTED` (from anything else): START.
 * - `APPROVAL_REQUESTED → APPROVED | REJECTED`: RESOLVED with the business-day
 *   wait and any SLA overrun (`daysOverSla > 0` ⇒ breach). A missing
 *   `waitingSince` (data anomaly) resolves as 0 days starting at `now`.
 * - Anything else: NOOP.
 */
export function decideApprovalClockTransition(input: ApprovalClockTransitionInput): ApprovalClockDecision {
  const { from, to, waitingSince, now, slaBusinessDays, holidays } = input

  if (to === 'APPROVAL_REQUESTED' && from !== 'APPROVAL_REQUESTED') {
    return { kind: 'START' }
  }

  if (from === 'APPROVAL_REQUESTED' && (to === 'APPROVED' || to === 'REJECTED')) {
    const startedAt = waitingSince ?? now
    const daysWaited = businessDaysBetween(startedAt, now, holidays)
    const daysOverSla =
      slaBusinessDays != null && daysWaited > slaBusinessDays ? daysWaited - slaBusinessDays : 0
    return { kind: 'RESOLVED', startedAt, daysWaited, daysOverSla }
  }

  return { kind: 'NOOP' }
}

/** Minimal activity shape the clock needs (a plain `Activity` row satisfies this). */
export interface ApprovalClockActivity {
  id: string
  status: string
  waitingSince: Date | null
}

export interface ApplyApprovalClockOptions {
  /** Actor performing the transition (audit/notification metadata). */
  actorId?: string | null
  /** Clock instant — injectable for tests/dry runs; defaults to `new Date()`. */
  now?: Date
  /** Optional holiday calendar (YYYY-MM-DD keys). */
  holidays?: ReadonlySet<string>
}

/**
 * Apply the Approval Clock rules for an activity status transition. MUST be
 * called inside the caller's `prisma.$transaction` — all reads/writes use `tx`.
 *
 * Returns the decision (so the caller can record the matching audit action
 * `APPROVAL_REQUESTED` / `APPROVAL_RESOLVED` and metadata) plus the notification
 * intents to fire AFTER the transaction commits.
 */
export async function applyApprovalClock(
  tx: Prisma.TransactionClient,
  activity: ApprovalClockActivity,
  nextStatus: string,
  opts: ApplyApprovalClockOptions = {}
): Promise<ApprovalClockResult> {
  const now = opts.now ?? new Date()

  // Resolve the phase name (Pareto analysis) + project context in one read.
  const ctx = await tx.activity.findUnique({
    where: { id: activity.id },
    select: {
      title: true,
      milestone: {
        select: { phase: { select: { name: true, projectId: true, project: { select: { name: true } } } } },
      },
    },
  })
  const phaseName = ctx?.milestone?.phase?.name ?? null
  const projectId = ctx?.milestone?.phase?.projectId ?? null

  // SLA comes from the project's APPROVAL-type client obligation (if any).
  const obligation = projectId
    ? await tx.clientObligation.findFirst({
        where: { projectId, type: 'APPROVAL' },
        orderBy: { slaBusinessDays: 'asc' },
        select: { id: true, slaBusinessDays: true },
      })
    : null

  const decision = decideApprovalClockTransition({
    from: activity.status,
    to: nextStatus,
    waitingSince: activity.waitingSince,
    now,
    slaBusinessDays: obligation?.slaBusinessDays ?? null,
    holidays: opts.holidays,
  })

  const notifications: ApprovalClockNotification[] = []

  if (decision.kind === 'START') {
    await tx.activity.update({
      where: { id: activity.id },
      data: { waitingSince: now, ownerParty: 'CLIENT' },
    })
    if (projectId) {
      notifications.push({
        eventKey: 'CLIENT_APPROVAL_PENDING',
        payload: {
          actorId: opts.actorId ?? undefined,
          entityType: 'PROJECT',
          entityId: projectId,
          entityTitle: ctx?.milestone?.phase?.project?.name ?? undefined,
          data: {
            activityId: activity.id,
            activityTitle: ctx?.title,
            phase: phaseName,
            deepLink: `/dashboard/projects/${projectId}`,
          },
        },
      })
    }
    return { decision, notifications }
  }

  if (decision.kind === 'RESOLVED') {
    if (projectId) {
      await tx.delayEvent.create({
        data: {
          projectId,
          activityId: activity.id,
          eventType: 'APPROVAL_WAIT',
          daysLost: decision.daysWaited,
          owner: 'CLIENT',
          reason: 'CLIENT_APPROVAL_DELAY',
          isAutoDetected: true,
          phaseAtTime: phaseName,
          startedAt: decision.startedAt,
          endedAt: now,
        },
      })

      if (decision.daysOverSla > 0 && obligation) {
        await tx.approvalSlaBreach.create({
          data: {
            projectId,
            activityId: activity.id,
            obligationId: obligation.id,
            sentForApprovalAt: decision.startedAt,
            slaBusinessDays: obligation.slaBusinessDays,
            approvedAt: now,
            daysOverSla: decision.daysOverSla,
          },
        })
        await tx.clientObligation.update({
          where: { id: obligation.id },
          data: { breachCount: { increment: 1 } },
        })
        notifications.push({
          eventKey: 'CLIENT_APPROVAL_SLA_BREACH',
          payload: {
            actorId: opts.actorId ?? undefined,
            entityType: 'PROJECT',
            entityId: projectId,
            entityTitle: ctx?.milestone?.phase?.project?.name ?? undefined,
            data: {
              activityId: activity.id,
              activityTitle: ctx?.title,
              phase: phaseName,
              daysWaited: decision.daysWaited,
              daysOverSla: decision.daysOverSla,
              slaBusinessDays: obligation.slaBusinessDays,
              deepLink: `/dashboard/projects/${projectId}`,
            },
          },
        })
      }
      if (obligation) {
        await updateApprovalObligationCompliance(tx, projectId, obligation.id)
      }
    }

    // Clock stops regardless of outcome (rejection is not free); escalation state
    // resets so a future wait on this activity escalates afresh.
    await tx.activity.update({
      where: { id: activity.id },
      data: { waitingSince: null, approvalEscalationLevel: 0 },
    })
    return { decision, notifications }
  }

  return { decision, notifications }
}

/* ============================================================================
 * C5 — Delay Ledger query + pure presentation helpers
 * ========================================================================== */

import type { PrismaClient } from '@prisma/client'

/** Minimal DB surface for the ledger query — satisfied by `prisma` or a tx client. */
export type DelayLedgerDb = Pick<PrismaClient, 'delayEvent' | 'approvalSlaBreach'>

export interface DelayLedgerFilters {
  owner?: string
  reason?: string
  phase?: string
}

export interface DelayLedgerRow {
  id: string
  activityId: string | null
  activityTitle: string | null
  phase: string | null
  eventType: string
  baselineDate: string | null
  currentDate: string | null
  slipDays: number
  daysLost: number
  reason: string
  reasonDetail: string | null
  owner: string
  isAutoDetected: boolean
  /** Days over the approval SLA for this activity (null = no breach). */
  slaBreachDays: number | null
  recoveryPlan: string | null
  recoveryOwner: string | null
  recoveryDate: string | null
  startedAt: string
  endedAt: string | null
  createdAt: string
}

export interface DelayOwnerTotals {
  total: number
  /** Always includes the three canonical owners; any other owner key is added. */
  byOwner: Record<string, number>
}

export interface DelayLedgerResult {
  rows: DelayLedgerRow[]
  totals: DelayOwnerTotals
  /** Distinct filter values across ALL of the project's events (unfiltered). */
  facets: { owners: string[]; reasons: string[]; phases: string[] }
}

/** Pure: total days lost split by owner. `total === Σ byOwner` always holds. */
export function computeDelayOwnerTotals(events: readonly { owner: string; daysLost: number }[]): DelayOwnerTotals {
  const byOwner: Record<string, number> = { CLIENT: 0, '360GROUND': 0, SHARED: 0 }
  let total = 0
  for (const e of events) {
    const days = e.daysLost || 0
    total += days
    byOwner[e.owner] = (byOwner[e.owner] ?? 0) + days
  }
  return { total, byOwner }
}

/** One flat row of the ledger as exported to CSV. */
export type DelayLedgerCsvRow = DelayLedgerRow

const CSV_HEADERS = [
  'Activity', 'Phase', 'Baseline Date', 'Current Date', 'Slip Days',
  'Reason', 'Owner', 'SLA Breach (days)', 'Recovery Plan', 'Recovery Owner', 'Recovery Date',
] as const

/** RFC-4180-ish cell escaping: quote when the value contains , " or newline. */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Pure: render the visible (filtered) ledger rows as CSV text. */
export function delaysToCsv(rows: readonly DelayLedgerCsvRow[]): string {
  const lines = [CSV_HEADERS.map(csvCell).join(',')]
  for (const r of rows) {
    lines.push([
      r.activityTitle ?? '(deleted activity)',
      r.phase ?? '',
      r.baselineDate ?? '',
      r.currentDate ?? '',
      r.slipDays,
      r.reason,
      r.owner,
      r.slaBreachDays ?? '',
      r.recoveryPlan ?? '',
      r.recoveryOwner ?? '',
      r.recoveryDate ?? '',
    ].map(csvCell).join(','))
  }
  return lines.join('\n')
}

/**
 * Read the project's delay ledger with server-side filtering + owner totals.
 * Totals are computed over the FILTERED set (so the header always matches the
 * visible rows); facets come from the unfiltered set so dropdowns stay stable.
 */
export async function listDelayLedger(
  db: DelayLedgerDb,
  projectId: string,
  filters: DelayLedgerFilters = {}
): Promise<DelayLedgerResult> {
  const where: Prisma.DelayEventWhereInput = { projectId }
  if (filters.owner) where.owner = filters.owner
  if (filters.reason) where.reason = filters.reason
  if (filters.phase) where.phaseAtTime = filters.phase

  const activitySelect = {
    select: { title: true, baselineEnd: true, currentEnd: true, slipDays: true },
  } as const

  const [events, allEvents, breaches] = await Promise.all([
    db.delayEvent.findMany({
      where,
      include: { activity: activitySelect },
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
    }),
    db.delayEvent.findMany({ where: { projectId }, select: { owner: true, reason: true, phaseAtTime: true } }),
    db.approvalSlaBreach.findMany({ where: { projectId }, select: { activityId: true, daysOverSla: true } }),
  ])

  const breachByActivity = new Map<string, number>()
  for (const b of breaches) {
    breachByActivity.set(b.activityId, Math.max(breachByActivity.get(b.activityId) ?? 0, b.daysOverSla))
  }

  const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)
  const rows: DelayLedgerRow[] = events.map((e) => ({
    id: e.id,
    activityId: e.activityId,
    activityTitle: e.activity?.title ?? null,
    phase: e.phaseAtTime,
    eventType: e.eventType,
    baselineDate: iso(e.activity?.baselineEnd ?? null),
    currentDate: iso(e.activity?.currentEnd ?? null),
    slipDays: e.activity?.slipDays ?? 0,
    daysLost: e.daysLost,
    reason: e.reason,
    reasonDetail: e.reasonDetail,
    owner: e.owner,
    isAutoDetected: e.isAutoDetected,
    slaBreachDays: e.activityId ? breachByActivity.get(e.activityId) ?? null : null,
    recoveryPlan: e.recoveryPlan,
    recoveryOwner: e.recoveryOwner,
    recoveryDate: iso(e.recoveryDate),
    startedAt: e.startedAt.toISOString(),
    endedAt: iso(e.endedAt),
    createdAt: e.createdAt.toISOString(),
  }))

  const uniq = (vals: (string | null)[]) => [...new Set(vals.filter((v): v is string => !!v))].sort()
  return {
    rows,
    totals: computeDelayOwnerTotals(events),
    facets: {
      owners: uniq(allEvents.map((e) => e.owner)),
      reasons: uniq(allEvents.map((e) => e.reason)),
      phases: uniq(allEvents.map((e) => e.phaseAtTime)),
    },
  }
}
