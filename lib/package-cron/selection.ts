/**
 * Package daily cron — pure selection rules (no Prisma, no I/O).
 *
 * The runner (./runner.ts) loads rows, asks these helpers what is due, checks
 * what was already sent, then writes and emits. Every rule here is unit-tested
 * in ./selection.test.ts.
 *
 *   KPI-3  auto-fill a reading from the linked KR's currentValue for the
 *          period that just ended (never backfills old periods, never
 *          overwrites an existing reading)
 *   KPI-5  KPI_READING_DUE once per overdue period (the latest one)
 *   DEP-2  DEPENDENCY_DUE_SOON once per needed-by date (due within 7 days);
 *          DEPENDENCY_LATE on the first day late, then once a week
 *   DEV-4  DEV_ITEM_DUE once per due date, 14 days before it
 *   KRX    KR_CHECKPOINT_DUE once per checkpoint due date, 7 days before it
 *
 * Idempotency model: every candidate carries a `since` instant. It is sent
 * only when no notification for the same (event, entity) exists at or after
 * `since` (see `isAlreadySent`). `since` encodes the window: the start of the
 * reminder window for "due soon" events, the period end for KPI readings, and
 * "seven days ago, but not before this lateness episode began" for late
 * dependencies.
 *
 * Dates: "today" is a `YYYY-MM-DD` key in the organisation's timezone (the
 * KPI calendar, lib/kpi/periods.ts). Stored due dates are date-only values at
 * UTC day edges, so their UTC date is the due date (`storedDateKey`).
 */
import { dependencyTiming, DUE_SOON_DAYS } from '@/lib/connections/flags'
import {
  addDaysToKey,
  compareDateKeys,
  findOverduePeriods,
  isPeriodEnded,
  isPeriodScored,
  kpiPeriodForKey,
  maxDateKey,
  periodEndDate,
  previousKpiPeriod,
  resolveReadingRag,
  storedDateKey,
  type KpiPeriod,
  type KpiTargetSpec,
} from '@/lib/kpi'
import { isKpiFrequency, type KpiFrequency, type KpiRag } from '@/types/package'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** KPI-3: the cron fills the period that just ended, but tolerates missed runs for this many days. */
export const KPI_AUTOFILL_MAX_LAG_DAYS = 7
/** KPI-5: stop reminding about a missing period once it ended this long ago (notification retention is 90 days). */
export const KPI_DUE_MAX_AGE_DAYS = 60
/** DEV-4: development items are announced this many days before their due date. */
export const DEV_ITEM_DUE_DAYS = 14
/** KR checkpoints are announced this many days before their due date. */
export const KR_CHECKPOINT_DUE_DAYS = 7
/** DEP-2: a late dependency is re-announced once per this many days. */
export const DEPENDENCY_LATE_REPEAT_DAYS = 7

const OPEN_DEVELOPMENT_STATUSES: ReadonlySet<string> = new Set(['NOT_STARTED', 'IN_PROGRESS'])

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** 00:00:00.000Z of a date key. */
export function keyStart(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`)
}

/** Whole days from `fromKey` to `toKey` (negative when `toKey` is earlier). */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  return Math.round((keyStart(toKey).getTime() - keyStart(fromKey).getTime()) / MS_PER_DAY)
}

function laterOf(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b
}

// ---------------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------------

/** One notification the cron wants to send. */
export interface EmitCandidate<TData extends Record<string, unknown> = Record<string, unknown>> {
  entityId: string
  /** Send only when nothing was sent for (event, entity) at or after this instant. */
  since: Date
  data: TData
}

export interface SentRow {
  metadata: string | null
  at: Date
}

/**
 * Latest send per entity from Notification / EmailDigestQueue rows. Both store
 * `{ entityType, entityId, … }` as JSON in `metadata`. Unparseable rows are ignored.
 */
export function latestSentByEntity(rows: Iterable<SentRow>): Map<string, Date> {
  const out = new Map<string, Date>()
  for (const row of rows) {
    if (!row.metadata) continue
    let entityId: unknown
    try {
      entityId = (JSON.parse(row.metadata) as { entityId?: unknown } | null)?.entityId
    } catch {
      continue
    }
    if (typeof entityId !== 'string' || !entityId) continue
    const prev = out.get(entityId)
    if (!prev || prev.getTime() < row.at.getTime()) out.set(entityId, row.at)
  }
  return out
}

/** True when the entity was already notified inside the candidate's window. */
export function isAlreadySent(candidate: Pick<EmitCandidate, 'entityId' | 'since'>, lastSent: ReadonlyMap<string, Date>): boolean {
  const at = lastSent.get(candidate.entityId)
  return !!at && at.getTime() >= candidate.since.getTime()
}

/** Earliest `since` over the candidates — the lower bound for the sent-rows lookup. */
export function earliestSince(candidates: ReadonlyArray<Pick<EmitCandidate, 'since'>>): Date | null {
  let min: Date | null = null
  for (const c of candidates) if (!min || c.since.getTime() < min.getTime()) min = c.since
  return min
}

/** Split candidates into those to send and those already sent. */
export function partitionUnsent<T extends Pick<EmitCandidate, 'entityId' | 'since'>>(
  candidates: readonly T[],
  lastSent: ReadonlyMap<string, Date>,
): { send: T[]; skipped: T[] } {
  const send: T[] = []
  const skipped: T[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    // One send per entity per run, even if a caller passed duplicates.
    if (seen.has(c.entityId) || isAlreadySent(c, lastSent)) skipped.push(c)
    else {
      seen.add(c.entityId)
      send.push(c)
    }
  }
  return { send, skipped }
}

// ---------------------------------------------------------------------------
// KPIs (KPI-3, KPI-5)
// ---------------------------------------------------------------------------

export interface KpiCronInput extends KpiTargetSpec {
  id: string
  status: string
  frequency: string
  scoredFrom: Date | string | null
  /** Day the KPI was created, as a date key in the org timezone. */
  createdKey: string
  /** Timeframe window (lib/kpi timeframeWindowKeys) and fiscal start month. */
  windowStartKey: string
  windowEndKey: string
  fiscalStartMonth: number
  /** periodStart keys that already have a reading. */
  readingStartKeys: ReadonlySet<string>
}

function frequencyOf(kpi: Pick<KpiCronInput, 'frequency'>): KpiFrequency {
  return isKpiFrequency(kpi.frequency) ? kpi.frequency : 'MONTHLY'
}

/** First day readings are expected: the later of the timeframe start and the KPI's creation day. */
export function kpiExpectedFromKey(kpi: Pick<KpiCronInput, 'windowStartKey' | 'createdKey'>): string {
  return maxDateKey(kpi.windowStartKey, kpi.createdKey)
}

export interface KpiAutoFillPlan {
  kpiId: string
  period: KpiPeriod
  value: number
  rag: KpiRag | null
}

/**
 * KPI-3: the reading to auto-fill from the linked KR, or null.
 *
 * Only the period that ended most recently (the one before today's) is
 * filled, and only within KPI_AUTOFILL_MAX_LAG_DAYS of its end: the KR's
 * current value says nothing about a period that closed months ago. The period
 * must overlap the KPI's window (timeframe ∩ since creation), and an existing
 * reading — manual, imported or an earlier auto-fill — is never touched.
 */
export function planKpiAutoFill(
  kpi: KpiCronInput & { krValue: number | null | undefined; krActive: boolean },
  todayKey: string,
): KpiAutoFillPlan | null {
  if (kpi.status !== 'ACTIVE' || !kpi.krActive) return null
  if (typeof kpi.krValue !== 'number' || !Number.isFinite(kpi.krValue)) return null
  const opts = { fiscalStartMonth: kpi.fiscalStartMonth }
  // The period before the one containing today: the latest one that has ended.
  const period = previousKpiPeriod(kpiPeriodForKey(frequencyOf(kpi), todayKey, opts), opts)
  if (!isPeriodEnded(period, todayKey)) return null
  if (daysBetweenKeys(period.endKey, todayKey) > KPI_AUTOFILL_MAX_LAG_DAYS) return null
  // Overlaps [expectedFrom, windowEnd]?
  if (compareDateKeys(period.endKey, kpiExpectedFromKey(kpi)) < 0) return null
  if (compareDateKeys(period.startKey, kpi.windowEndKey) > 0) return null
  if (kpi.readingStartKeys.has(period.startKey)) return null
  const scored = isPeriodScored(kpi.scoredFrom, periodEndDate(period.endKey))
  const { rag } = resolveReadingRag({ spec: kpi, value: kpi.krValue, scored })
  return { kpiId: kpi.id, period, value: kpi.krValue, rag }
}

export interface KpiReadingDueData extends Record<string, unknown> {
  periodLabel: string
  periodStart: string
  periodEnd: string
  daysOverdue: number
  /** Number of overdue periods (the email names the latest). */
  overdueCount: number
}

/**
 * KPI-5: KPI_READING_DUE for the latest overdue period (ended more than 3
 * working days ago without a reading), or null. `since` is the day after that
 * period ended, so each period is announced once; a newer overdue period
 * starts a new window.
 */
export function planKpiReadingDue(
  kpi: KpiCronInput,
  todayKey: string,
  holidays: ReadonlySet<string> = new Set(),
): EmitCandidate<KpiReadingDueData> | null {
  if (kpi.status !== 'ACTIVE') return null
  const overdue = findOverduePeriods({
    frequency: frequencyOf(kpi),
    fiscalStartMonth: kpi.fiscalStartMonth,
    windowStartKey: kpiExpectedFromKey(kpi),
    windowEndKey: kpi.windowEndKey,
    todayKey,
    readingStartKeys: kpi.readingStartKeys,
    holidays,
  })
  if (overdue.length === 0) return null
  const latest = overdue[overdue.length - 1]
  const daysOverdue = daysBetweenKeys(latest.endKey, todayKey)
  if (daysOverdue > KPI_DUE_MAX_AGE_DAYS) return null
  return {
    entityId: kpi.id,
    since: keyStart(addDaysToKey(latest.endKey, 1)),
    data: {
      periodLabel: latest.label,
      periodStart: latest.startKey,
      periodEnd: latest.endKey,
      daysOverdue,
      overdueCount: overdue.length,
    },
  }
}

// ---------------------------------------------------------------------------
// Dependencies (DEP-2)
// ---------------------------------------------------------------------------

export interface DependencyCronInput {
  id: string
  status: string
  neededByDate: Date | string | null
}

export interface DependencyDueData extends Record<string, unknown> {
  neededByDate: string
  daysLeft?: number
  daysLate?: number
}

/**
 * DEPENDENCY_DUE_SOON: open and due within 7 days (DEP-2, `dependencyTiming`).
 * Announced once per needed-by date: `since` is the start of the 7-day window,
 * so moving the date out restarts the reminder.
 */
export function planDependencyDueSoon(
  dep: DependencyCronInput,
  todayKey: string,
  now: Date,
): EmitCandidate<DependencyDueData> | null {
  if (!dep.neededByDate || !dependencyTiming(dep, now).dueSoon) return null
  const dueKey = storedDateKey(dep.neededByDate)
  return {
    entityId: dep.id,
    since: keyStart(addDaysToKey(dueKey, -DUE_SOON_DAYS)),
    data: { neededByDate: dueKey, daysLeft: Math.max(0, daysBetweenKeys(todayKey, dueKey)) },
  }
}

/**
 * DEPENDENCY_LATE: open and past its needed-by date (DEP-2). Sent on the first
 * day late, then once every DEPENDENCY_LATE_REPEAT_DAYS ("immediate, then
 * weekly"). `since` is seven days ago — but never before the needed-by date,
 * so a dependency that was rescheduled and is late again starts a new episode.
 */
export function planDependencyLate(
  dep: DependencyCronInput,
  todayKey: string,
  now: Date,
): EmitCandidate<DependencyDueData> | null {
  if (!dep.neededByDate || !dependencyTiming(dep, now).late) return null
  const dueKey = storedDateKey(dep.neededByDate)
  const weekAgo = keyStart(addDaysToKey(todayKey, -(DEPENDENCY_LATE_REPEAT_DAYS - 1)))
  const episodeStart = keyStart(addDaysToKey(dueKey, 1))
  return {
    entityId: dep.id,
    since: laterOf(weekAgo, episodeStart),
    data: { neededByDate: dueKey, daysLate: Math.max(1, daysBetweenKeys(dueKey, todayKey)) },
  }
}

// ---------------------------------------------------------------------------
// Development items (DEV-4) and KR checkpoints
// ---------------------------------------------------------------------------

export interface DueSoonData extends Record<string, unknown> {
  dueDate: string
  daysLeft: number
}

/** Shared "due within N days, once per due date" rule. */
export function planDueWithin(
  entityId: string,
  dueDate: Date | string | null,
  todayKey: string,
  windowDays: number,
): EmitCandidate<DueSoonData> | null {
  if (!dueDate) return null
  const dueKey = storedDateKey(dueDate)
  const daysLeft = daysBetweenKeys(todayKey, dueKey)
  if (daysLeft < 0 || daysLeft > windowDays) return null
  return {
    entityId,
    since: keyStart(addDaysToKey(dueKey, -windowDays)),
    data: { dueDate: dueKey, daysLeft },
  }
}

/** DEV-4: DEV_ITEM_DUE 14 days before the due date, for items not DONE or DROPPED. */
export function planDevItemDue(
  item: { id: string; status: string; dueDate: Date | string | null },
  todayKey: string,
): EmitCandidate<DueSoonData> | null {
  if (!OPEN_DEVELOPMENT_STATUSES.has(item.status)) return null
  return planDueWithin(item.id, item.dueDate, todayKey, DEV_ITEM_DUE_DAYS)
}

/** KR_CHECKPOINT_DUE 7 days before a PENDING checkpoint of an ACTIVE key result. */
export function planCheckpointDue(
  checkpoint: { id: string; status: string; dueDate: Date | string; krStatus: string },
  todayKey: string,
): EmitCandidate<DueSoonData> | null {
  if (checkpoint.status !== 'PENDING' || checkpoint.krStatus !== 'ACTIVE') return null
  return planDueWithin(checkpoint.id, checkpoint.dueDate, todayKey, KR_CHECKPOINT_DUE_DAYS)
}

/** "Ana, Bekele and 2 more" — names for email details. */
export function joinNames(names: ReadonlyArray<string | null | undefined>, max = 3): string {
  const clean = names.map((n) => (n ?? '').trim()).filter(Boolean)
  if (clean.length <= max) {
    return clean.length <= 1 ? (clean[0] ?? '') : `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`
  }
  return `${clean.slice(0, max).join(', ')} and ${clean.length - max} more`
}
