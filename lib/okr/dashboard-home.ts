/**
 * Pure helpers for the home dashboard (`app/dashboard/page.tsx`).
 *
 * Kept free of Prisma so they can be unit-tested with `tsx --test`
 * (see `dashboard-home.test.ts`). Check-in due dates reuse the cadence rules
 * in `lib/check-in-cadence.ts` — the same ones the digests and reminder jobs use.
 */

import { nextCheckInDue, normalizeCadence } from '@/lib/check-in-cadence'

const DAY_MS = 24 * 60 * 60 * 1000

// ─── Check-in due ───────────────────────────────────────────────────────────

export type CheckInDueState = 'overdue' | 'due'

export interface CheckInDueInput {
  id: string
  /** KeyResult.checkInCadence (WEEKLY | BIWEEKLY | MONTHLY | QUARTERLY); unknown → WEEKLY. */
  checkInCadence: string | null | undefined
  /** When the KR was created — the baseline before its first check-in. */
  createdAt: Date
  /** Most recent KeyResultCheckIn.createdAt for this KR, or null if never checked in. */
  lastCheckInAt: Date | null
}

/**
 * `overdue` when the next check-in (last check-in, or creation, + cadence) is
 * already in the past; `due` when it falls within the next `windowDays`;
 * otherwise null.
 */
export function classifyCheckInDue(
  kr: Omit<CheckInDueInput, 'id'>,
  now: Date = new Date(),
  windowDays = 7,
): CheckInDueState | null {
  const baseline = kr.lastCheckInAt ?? kr.createdAt
  const next = nextCheckInDue(normalizeCadence(kr.checkInCadence), baseline).getTime()
  const t = now.getTime()
  if (next < t) return 'overdue'
  if (next <= t + windowDays * DAY_MS) return 'due'
  return null
}

export interface CheckInDueSummary {
  overdueCount: number
  dueThisWeekCount: number
  /** Only the KRs that need a check-in, overdue first. */
  items: Array<{ id: string; state: CheckInDueState }>
}

export function summarizeCheckInsDue(
  krs: CheckInDueInput[],
  now: Date = new Date(),
  windowDays = 7,
): CheckInDueSummary {
  const overdue: string[] = []
  const due: string[] = []
  for (const kr of krs) {
    const state = classifyCheckInDue(kr, now, windowDays)
    if (state === 'overdue') overdue.push(kr.id)
    else if (state === 'due') due.push(kr.id)
  }
  return {
    overdueCount: overdue.length,
    dueThisWeekCount: due.length,
    items: [
      ...overdue.map((id) => ({ id, state: 'overdue' as const })),
      ...due.map((id) => ({ id, state: 'due' as const })),
    ],
  }
}

// ─── Hero stats ─────────────────────────────────────────────────────────────

export interface ConfidenceGroup {
  confidence: string
  count: number
  /** Sum of KeyResult.progress within the group. */
  progressSum: number
}

export interface HeroConfidenceStats {
  total: number
  onTrack: number
  atRisk: number
  offTrack: number
  avgProgress: number
  /** ON_TRACK = 100, AT_RISK = 50, anything else = 0, averaged over all KRs. */
  confidenceScore: number
}

/** Fold a `keyResult.groupBy({ by: ['confidence'] })` result into the hero numbers. */
export function heroFromConfidenceGroups(groups: ConfidenceGroup[]): HeroConfidenceStats {
  let total = 0
  let progressSum = 0
  let onTrack = 0
  let atRisk = 0
  let offTrack = 0
  for (const g of groups) {
    total += g.count
    progressSum += g.progressSum
    if (g.confidence === 'ON_TRACK') onTrack += g.count
    else if (g.confidence === 'AT_RISK') atRisk += g.count
    else if (g.confidence === 'OFF_TRACK') offTrack += g.count
  }
  return {
    total,
    onTrack,
    atRisk,
    offTrack,
    avgProgress: total > 0 ? Math.round(progressSum / total) : 0,
    confidenceScore: total > 0 ? Math.round((onTrack * 100 + atRisk * 50) / total) : 0,
  }
}

// ─── Team feed visibility ───────────────────────────────────────────────────
//
// Mirrors the redaction rules of `canViewObjective` / `canViewKeyResult` in
// `lib/permissions.ts` for a viewer who is not ADMIN/EXECUTIVE, given the set of
// owners the viewer sees in full (themselves + their active direct reports).

export interface FeedObjectiveVisibility {
  ownerId: string
  isPrivate: boolean
}

export function isObjectiveRedactedFor(fullAccessOwnerIds: ReadonlySet<string>, obj: FeedObjectiveVisibility): boolean {
  return obj.isPrivate && !fullAccessOwnerIds.has(obj.ownerId)
}

export function isKeyResultRedactedFor(
  fullAccessOwnerIds: ReadonlySet<string>,
  kr: FeedObjectiveVisibility & { objective: FeedObjectiveVisibility | null },
): boolean {
  if (fullAccessOwnerIds.has(kr.ownerId)) return false
  if (kr.objective && isObjectiveRedactedFor(fullAccessOwnerIds, kr.objective)) return true
  return kr.isPrivate
}

// ─── Momentum sparkline ─────────────────────────────────────────────────────

export interface PeriodAverage {
  periodStart: string
  avgScore: number | null
}

/**
 * Turn per-period average scores fetched NEWEST FIRST (orderBy periodStart
 * desc + take) into chronological points for the sparkline, keeping only the
 * latest `limit` periods.
 */
export function momentumFromPeriodAverages(
  newestFirst: PeriodAverage[],
  limit = 7,
): Array<{ date: string; progress: number }> {
  return newestFirst
    .filter((row) => typeof row.avgScore === 'number' && Number.isFinite(row.avgScore))
    .slice(0, limit)
    .reverse()
    .map((row) => ({ date: row.periodStart, progress: Math.round(row.avgScore as number) }))
}
