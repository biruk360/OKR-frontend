/**
 * Employee OKR profile — pure helpers (no Prisma, no React). Client- and
 * server-safe; unit-tested in `okr-profile-utils.test.ts`.
 *
 *   - PRF-9 buckets and filters (level, commitment, status, blocked, checkpoint ≤ 30 d)
 *   - PRF-8 header strip maths
 *   - PRF-10 successor labels and the "Retired — no successor" disposition
 *   - PRF-11 action verdicts. The edit rule is the in-memory mirror of
 *     `canEditObjective` / `canEditKeyResultWithObjectiveContext` in
 *     lib/permissions.ts (which cost 1–2 queries per row); the routes that act
 *     (check-in, close, initiative create) still enforce the real rule.
 */
import type { ConnectionItem, ConnectionVia } from '@/lib/connections/types'
import { KR_COMMITMENT_SHORT, OKR_LINK_SUB_KIND_LABELS, isKrCommitment, isOkrLinkSubKind } from '@/types/package'
import type {
  OkrProfileCheckpoint,
  OkrProfileDisposition,
  OkrProfileFilters,
  OkrProfileHeader,
  OkrProfileKeyResult,
  OkrProfileLevelBucket,
  OkrProfileObjective,
  OkrProfileStatusKey,
} from './types'

const DAY_MS = 24 * 60 * 60 * 1000
/** PRF-9 "checkpoint due in 30 days". */
export const CHECKPOINT_DUE_WINDOW_DAYS = 30

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------

export const LEVEL_BUCKET_LABELS: Record<OkrProfileLevelBucket, string> = {
  company: 'Company-owned',
  department: 'Department-owned',
  individual: 'Individual',
  contributed: 'Contributed',
}

export const STATUS_KEY_LABELS: Record<OkrProfileStatusKey, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  off_track: 'Off track',
  closed: 'Closed',
}

export function levelBucket(involvement: 'OWNED' | 'CONTRIBUTED', level: string): OkrProfileLevelBucket {
  if (involvement === 'CONTRIBUTED') return 'contributed'
  if (level === 'COMPANY') return 'company'
  if (level === 'DEPARTMENT') return 'department'
  return 'individual'
}

function statusFromTier(tier: string | null | undefined): OkrProfileStatusKey {
  switch (tier) {
    case 'AT_RISK':
      return 'at_risk'
    case 'OFF_TRACK':
      return 'off_track'
    case 'CLOSED':
      return 'closed'
    default:
      return 'on_track'
  }
}

/** Objective: CLOSED closure wins, then `goalStatus`. */
export function objectiveStatusKey(goalStatus: string | null | undefined, closureStatus: string): OkrProfileStatusKey {
  return closureStatus === 'CLOSED' ? 'closed' : statusFromTier(goalStatus)
}

/** Key result: CLOSED closure wins, then `confidence`. */
export function keyResultStatusKey(confidence: string | null | undefined, closureStatus: string): OkrProfileStatusKey {
  return closureStatus === 'CLOSED' ? 'closed' : statusFromTier(confidence)
}

export function commitmentOrNull(value: unknown) {
  return isKrCommitment(value) ? value : null
}

export function commitmentShort(value: unknown): string | null {
  return isKrCommitment(value) ? KR_COMMITMENT_SHORT[value] : null
}

// ---------------------------------------------------------------------------
// Permissions (in-memory mirrors — see header)
// ---------------------------------------------------------------------------

export interface OkrEditViewer {
  id: string
  role: string
  /** Departments the viewer currently belongs to. */
  departmentIds: ReadonlySet<string>
  /** Users the viewer currently manages. */
  directReportIds: ReadonlySet<string>
}

const SEES_ALL: readonly string[] = ['ADMIN', 'EXECUTIVE']

export function isSeesAllRole(role: string | null | undefined): boolean {
  return SEES_ALL.includes(role ?? '')
}

/** Mirror of `canEditObjective` (lib/permissions.ts). */
export function canEditObjectiveInMemory(
  viewer: OkrEditViewer,
  objective: { level: string; ownerId: string; departmentId?: string | null },
): boolean {
  if (isSeesAllRole(viewer.role)) return true
  if (objective.ownerId === viewer.id) return true
  if (viewer.role === 'DEPARTMENT_LEAD') {
    if (objective.level === 'DEPARTMENT' && objective.departmentId) {
      return viewer.departmentIds.has(objective.departmentId)
    }
    if (objective.level === 'INDIVIDUAL') return viewer.directReportIds.has(objective.ownerId)
  }
  return false
}

/** Mirror of `canEditKeyResultWithObjectiveContext` (lib/permissions.ts). */
export function canEditKeyResultInMemory(
  viewer: OkrEditViewer,
  keyResult: { ownerId: string },
  objective: { level: string; ownerId: string; departmentId?: string | null },
): boolean {
  if (isSeesAllRole(viewer.role)) return true
  if (keyResult.ownerId === viewer.id) return true
  if (viewer.role === 'DEPARTMENT_LEAD' && viewer.directReportIds.has(keyResult.ownerId)) return true
  if (objective.ownerId === viewer.id) return true
  return canEditObjectiveInMemory(viewer, objective)
}

/**
 * PRF-11 close flow: owner or manager (the edit rule), the item is not closed
 * yet, and the timeframe has ended — unless the viewer is ADMIN / EXECUTIVE
 * (`canCloseBeforePeriodEnd`, lib/okr/period-close.ts).
 */
export function canOpenCloseFlow(input: {
  canEdit: boolean
  redacted: boolean
  closureStatus: string
  timeframeEnded: boolean
  canCloseEarly: boolean
  /** KR only: its objective is locked (the KR close route answers 409). */
  parentLocked?: boolean
}): boolean {
  if (input.redacted || !input.canEdit) return false
  if (input.closureStatus === 'CLOSED') return false
  if (input.parentLocked) return false
  return input.timeframeEnded || input.canCloseEarly
}

/** Check in / add initiative: edit rule, open and unlocked, and the period is still live. */
export function canWorkOnKeyResult(input: {
  canEdit: boolean
  redacted: boolean
  closureStatus: string
  krLocked: boolean
  objectiveLocked: boolean
  timeframeEnded: boolean
}): boolean {
  if (input.redacted || !input.canEdit) return false
  if (input.closureStatus !== 'OPEN') return false
  if (input.krLocked || input.objectiveLocked) return false
  return !input.timeframeEnded
}

/**
 * Card read rule for the profile tree (subset of `todoReadVerdict`,
 * lib/todos/access.ts): ADMIN/EXEC, participants, anyone who may edit the KR;
 * a sprint card opens to its board's viewers, any other card to viewers who
 * see its KR / objective without redaction.
 */
export function todoVisibleInProfile(facts: {
  seesAll: boolean
  isParticipant: boolean
  canEditParent: boolean
  inSprint: boolean
  canViewSprint: boolean
  parentFullyVisible: boolean
}): boolean {
  if (facts.seesAll || facts.isParticipant || facts.canEditParent) return true
  return facts.inSprint ? facts.canViewSprint : facts.parentFullyVisible
}

// ---------------------------------------------------------------------------
// Checkpoints
// ---------------------------------------------------------------------------

/** UTC midnight of `d` (checkpoint due dates are stored as UTC calendar days). */
export function utcDayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** First PENDING checkpoint due today or later (by UTC day), or null. */
export function nextPendingCheckpoint<T extends { dueDate: string | Date; status: string }>(
  checkpoints: readonly T[],
  now: Date = new Date(),
): T | null {
  const today = utcDayStart(now)
  let best: T | null = null
  let bestAt = Number.POSITIVE_INFINITY
  for (const cp of checkpoints) {
    if (cp.status !== 'PENDING') continue
    const at = new Date(cp.dueDate).getTime()
    if (Number.isNaN(at) || at < today) continue
    if (at < bestAt) {
      best = cp
      bestAt = at
    }
  }
  return best
}

/** The due date falls today … `days` days from now (UTC days, inclusive). */
export function isDueWithinDays(dueIso: string | null | undefined, days: number, now: Date = new Date()): boolean {
  if (!dueIso) return false
  const at = new Date(dueIso).getTime()
  if (Number.isNaN(at)) return false
  const today = utcDayStart(now)
  return at >= today && at < today + (days + 1) * DAY_MS
}

export function checkpointDueSoon(kr: Pick<OkrProfileKeyResult, 'nextCheckpoint'>, now: Date = new Date()): boolean {
  return isDueWithinDays(kr.nextCheckpoint?.dueDate, CHECKPOINT_DUE_WINDOW_DAYS, now)
}

// ---------------------------------------------------------------------------
// Header strip (PRF-8)
// ---------------------------------------------------------------------------

export function computeHeader(
  objectives: readonly OkrProfileObjective[],
  lastCheckInAt: string | null,
  now: Date = new Date(),
): OkrProfileHeader {
  const ownKrs: OkrProfileKeyResult[] = []
  for (const o of objectives) for (const kr of o.keyResults) if (kr.ownedBySubject) ownKrs.push(kr)

  const commitment = { committed: 0, aspirational: 0, mixed: 0, unset: 0 }
  for (const kr of ownKrs) {
    if (kr.commitment === 'COMMITTED') commitment.committed += 1
    else if (kr.commitment === 'ASPIRATIONAL') commitment.aspirational += 1
    else if (kr.commitment === 'MIXED') commitment.mixed += 1
    else commitment.unset += 1
  }

  const progressPool = ownKrs.length > 0 ? ownKrs.map((k) => k.progress) : objectives.map((o) => o.progress)
  const averageProgress =
    progressPool.length > 0
      ? Math.round(progressPool.reduce((sum, p) => sum + (Number.isFinite(p) ? p : 0), 0) / progressPool.length)
      : null

  let nextCheckpoint: OkrProfileHeader['nextCheckpoint'] = null
  const candidates: Array<OkrProfileCheckpoint & { keyResultId: string; keyResultLabel: string }> = []
  for (const o of objectives) {
    for (const kr of o.keyResults) {
      if (kr.redacted || !kr.nextCheckpoint) continue
      candidates.push({ ...kr.nextCheckpoint, keyResultId: kr.id, keyResultLabel: kr.ref ?? kr.title ?? 'Key result' })
    }
  }
  const picked = nextPendingCheckpoint(candidates, now)
  if (picked) nextCheckpoint = picked

  return {
    objectives: objectives.length,
    ownedObjectives: objectives.filter((o) => o.involvement === 'OWNED').length,
    keyResults: ownKrs.length,
    averageProgress,
    commitment,
    nextCheckpoint,
    lastCheckInAt,
  }
}

// ---------------------------------------------------------------------------
// Filters (PRF-9)
// ---------------------------------------------------------------------------

export function activeFilterCount(filters: OkrProfileFilters): number {
  let n = 0
  if (filters.level) n += 1
  if (filters.commitment) n += 1
  if (filters.status) n += 1
  if (filters.blockedOnly) n += 1
  if (filters.checkpointDue30) n += 1
  return n
}

function krIsBlocked(kr: OkrProfileKeyResult): boolean {
  if (kr.blocked) return true
  return [...kr.milestones, ...kr.tasks].some((t) => t.blocked)
}

function krMatches(kr: OkrProfileKeyResult, filters: OkrProfileFilters, now: Date): boolean {
  if (filters.commitment && (kr.redacted || kr.commitment !== filters.commitment)) return false
  if (filters.status && kr.statusKey !== filters.status) return false
  if (filters.blockedOnly && !krIsBlocked(kr)) return false
  if (filters.checkpointDue30 && (kr.redacted || !checkpointDueSoon(kr, now))) return false
  return true
}

/**
 * Apply PRF-9 filters. The level filter keeps or drops whole objectives. The
 * KR-level filters keep an objective when one of its KRs matches (showing only
 * the matching KRs). Status and "blocked only" also keep an objective that
 * matches on its own (its KRs are then still narrowed).
 */
export function applyOkrProfileFilters(
  objectives: readonly OkrProfileObjective[],
  filters: OkrProfileFilters,
  now: Date = new Date(),
): OkrProfileObjective[] {
  const krFilterOn = Boolean(filters.commitment || filters.status || filters.blockedOnly || filters.checkpointDue30)
  const out: OkrProfileObjective[] = []
  for (const o of objectives) {
    if (filters.level && o.levelBucket !== filters.level) continue
    if (!krFilterOn) {
      out.push(o)
      continue
    }
    const keyResults = o.keyResults.filter((kr) => krMatches(kr, filters, now))
    const selfMatches =
      !filters.commitment &&
      !filters.checkpointDue30 &&
      (!filters.status || o.statusKey === filters.status) &&
      (!filters.blockedOnly || o.blocked || o.initiatives.some((t) => t.blocked))
    if (keyResults.length > 0 || selfMatches) out.push({ ...o, keyResults })
  }
  return out
}

// ---------------------------------------------------------------------------
// Past OKRs (PRF-10)
// ---------------------------------------------------------------------------

export function successorRelationLabel(via: ConnectionVia, subKind: string | null | undefined): string {
  if (isOkrLinkSubKind(subKind)) return OKR_LINK_SUB_KIND_LABELS[subKind]
  if (via === 'ROLLED_FROM') return 'Rolled forward'
  return 'Continued'
}

/** "C5", "company O4", or a truncated title when the item has no workbook ref. */
export function successorLabel(item: ConnectionItem, max = 40): string {
  if (item.redacted) return 'Private item'
  const base = item.ref?.trim() || (item.title.length > max ? `${item.title.slice(0, max - 1)}…` : item.title)
  return item.level === 'COMPANY' ? `company ${base}` : base
}

/**
 * PRF-10: CONTINUED when there is a successor; otherwise COMPLETED for an
 * ACHIEVED item, else RETIRED ("Retired — no successor" — retired or deferred).
 */
export function pastDisposition(successorCount: number, outcome: string | null | undefined): OkrProfileDisposition {
  if (successorCount > 0) return 'CONTINUED'
  return outcome === 'ACHIEVED' ? 'COMPLETED' : 'RETIRED'
}

export const DISPOSITION_LABELS: Record<OkrProfileDisposition, string> = {
  CONTINUED: 'Continued',
  COMPLETED: 'Completed — no successor',
  RETIRED: 'Retired — no successor',
}

export const OUTCOME_LABELS: Record<string, string> = {
  ACHIEVED: 'Achieved',
  PARTIAL: 'Partial',
  MISSED: 'Missed',
  ABANDONED: 'Abandoned',
}

export function outcomeTone(outcome: string | null | undefined): 'ok' | 'warn' | 'danger' | 'neutral' {
  switch (outcome) {
    case 'ACHIEVED':
      return 'ok'
    case 'PARTIAL':
      return 'warn'
    case 'MISSED':
      return 'danger'
    default:
      return 'neutral'
  }
}

/** "Carried → C5 · company O4" style groups: one entry per relation label, in first-seen order. */
export function groupSuccessorsByRelation<T extends { relationLabel: string }>(
  successors: readonly T[],
): Array<{ relationLabel: string; items: T[] }> {
  const map = new Map<string, T[]>()
  for (const s of successors) {
    const list = map.get(s.relationLabel) ?? []
    list.push(s)
    map.set(s.relationLabel, list)
  }
  return Array.from(map.entries()).map(([relationLabel, items]) => ({ relationLabel, items }))
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

const LEVEL_ORDER: Record<OkrProfileLevelBucket, number> = { company: 0, department: 1, individual: 2, contributed: 3 }

function refCompare(a: string | null, b: string | null, at: string | null, bt: string | null): number {
  if (a && b) return a.localeCompare(b, undefined, { numeric: true })
  if (a) return -1
  if (b) return 1
  return (at ?? '').localeCompare(bt ?? '')
}

export function sortObjectives<T extends Pick<OkrProfileObjective, 'levelBucket' | 'ref' | 'title'>>(rows: T[]): T[] {
  return [...rows].sort(
    (x, y) => LEVEL_ORDER[x.levelBucket] - LEVEL_ORDER[y.levelBucket] || refCompare(x.ref, y.ref, x.title, y.title),
  )
}

export function sortByRef<T extends { ref: string | null; title: string | null }>(rows: T[]): T[] {
  return [...rows].sort((x, y) => refCompare(x.ref, y.ref, x.title, y.title))
}

const TODO_STATUS_ORDER: Record<string, number> = {
  STUCK: 0,
  IN_PROGRESS: 1,
  IN_REVIEW: 2,
  PENDING: 3,
  COMPLETED: 4,
}

/** Open work first, then by due date (undated last), then card number. */
export function sortTodos<T extends { status: string; dueDate: string | null; cardNumber: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const s = (TODO_STATUS_ORDER[a.status] ?? 3) - (TODO_STATUS_ORDER[b.status] ?? 3)
    if (s !== 0) return s
    const ad = a.dueDate ? Date.parse(a.dueDate) : Number.POSITIVE_INFINITY
    const bd = b.dueDate ? Date.parse(b.dueDate) : Number.POSITIVE_INFINITY
    if (ad !== bd) return ad - bd
    return a.cardNumber - b.cardNumber
  })
}
