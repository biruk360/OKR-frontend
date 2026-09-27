/**
 * Recurring to-do cards (DTE-5).
 *
 * Pure: no DB, no `Date.now()` — `now` is always injected, matching
 * `lib/todos/due-reminders.ts` so both can be unit-tested without a clock.
 *
 * The model is a *series head* plus generated instances. The card the user
 * configures keeps the rule; each generated occurrence is a new Todo row
 * pointing back at the head via `recurrenceParentId` and carrying no rule of
 * its own, so only the head ever spawns. New rows rather than one row whose
 * dueDate is pushed forward: mutating a single row would destroy per-occurrence
 * completion history, which is the whole point of a recurring task.
 *
 * All day maths is whole calendar days via date-fns (`differenceInCalendarDays`,
 * `addDays`, `subDays`), never milliseconds: a span measured in ms loses or
 * gains an hour across a DST change and lands on the wrong wall-clock time.
 */

import { addDays, differenceInCalendarDays, subDays } from 'date-fns'

export const RECURRENCE_RULES = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKDAYS', label: 'Every weekday (Mon–Fri)' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Every 2 weeks' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
] as const

export type RecurrenceRule = (typeof RECURRENCE_RULES)[number]['value']

const RULE_SET = new Set<string>(RECURRENCE_RULES.map((r) => r.value))

export function isRecurrenceRule(v: unknown): v is RecurrenceRule {
  return typeof v === 'string' && RULE_SET.has(v)
}

export function recurrenceLabel(rule: string | null | undefined): string | null {
  if (!isRecurrenceRule(rule)) return null
  return RECURRENCE_RULES.find((r) => r.value === rule)?.label ?? null
}

/** Local-midnight copy, so date arithmetic never drifts on a DST boundary. */
function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function isLastDayOfMonth(d: Date): boolean {
  return d.getDate() === daysInMonth(d.getFullYear(), d.getMonth())
}

/** True for the rules whose step is measured in months (and can therefore clamp). */
function isMonthBased(rule: RecurrenceRule): boolean {
  return rule === 'MONTHLY' || rule === 'YEARLY'
}

/**
 * Add `months` to a date, clamping the day to the target month's length.
 * Without the clamp, `new Date(2026, 0, 31)` + 1 month rolls into March —
 * a monthly card due on the 31st would silently skip February.
 *
 * `anchorDay` is the day-of-month the series is *meant* to fall on. Pass it
 * whenever `d` may itself be a clamped date: stepping from a clamped Feb 28
 * with the date's own day would give Mar 28 (drift), with anchorDay 31 it
 * gives Mar 31.
 */
function addMonthsClamped(d: Date, months: number, anchorDay?: number | null): Date {
  const y = d.getFullYear()
  const m = d.getMonth() + months
  const day = anchorDay ?? d.getDate()
  const lastDayOfTarget = new Date(y, m + 1, 0).getDate()
  return new Date(y, m, Math.min(day, lastDayOfTarget))
}

/**
 * The next due date strictly after `from` for a rule.
 * Returns null for an unknown rule rather than guessing a cadence.
 *
 * `anchorDay` only affects MONTHLY/YEARLY (see `addMonthsClamped`); omitted, the
 * day of `from` is used, which is exact unless `from` was itself clamped.
 */
export function nextOccurrence(
  rule: string | null | undefined,
  from: Date,
  anchorDay?: number | null,
): Date | null {
  if (!isRecurrenceRule(rule)) return null
  if (Number.isNaN(from.getTime())) return null
  const base = atMidnight(from)

  switch (rule) {
    case 'DAILY':
      return addDays(base, 1)
    case 'WEEKDAYS': {
      // Fri → Mon, Sat → Mon, Sun → Mon; otherwise the next day.
      let next = addDays(base, 1)
      while (next.getDay() === 0 || next.getDay() === 6) next = addDays(next, 1)
      return next
    }
    case 'WEEKLY':
      return addDays(base, 7)
    case 'BIWEEKLY':
      return addDays(base, 14)
    case 'MONTHLY':
      return addMonthsClamped(base, 1, anchorDay)
    case 'YEARLY':
      // Feb 29 in a non-leap year clamps to Feb 28 rather than rolling to Mar 1.
      return addMonthsClamped(base, 12, anchorDay)
  }
}

/**
 * The inverse of `nextOccurrence`: the due date one step before `from` (REC-FIX-2r).
 * Exact for DAILY/WEEKLY/BIWEEKLY; WEEKDAYS steps back over the weekend
 * (Mon → Fri); MONTHLY/YEARLY step back one period with the same clamp, so
 * without an `anchorDay` a clamped `from` (Feb 28 of a 31st series) maps to the
 * 28th of the previous month — the original day is not recoverable from one date.
 */
export function previousOccurrence(
  rule: string | null | undefined,
  from: Date,
  anchorDay?: number | null,
): Date | null {
  if (!isRecurrenceRule(rule)) return null
  if (Number.isNaN(from.getTime())) return null
  const base = atMidnight(from)

  switch (rule) {
    case 'DAILY':
      return subDays(base, 1)
    case 'WEEKDAYS': {
      let prev = subDays(base, 1)
      while (prev.getDay() === 0 || prev.getDay() === 6) prev = subDays(prev, 1)
      return prev
    }
    case 'WEEKLY':
      return subDays(base, 7)
    case 'BIWEEKLY':
      return subDays(base, 14)
    case 'MONTHLY':
      return addMonthsClamped(base, -1, anchorDay)
    case 'YEARLY':
      return addMonthsClamped(base, -12, anchorDay)
  }
}

/**
 * The n-th occurrence of a series whose first due date is `anchor`
 * (n = 0 is the anchor itself). Computed from the anchor, never from a previous
 * occurrence, so MONTHLY/YEARLY cannot drift: a series anchored on Jan 31 runs
 * Feb 28 → Mar 31 → Apr 30, and one anchored on Feb 29 comes back to Feb 29 in
 * every leap year. This is the reference definition the generator's
 * cursor-plus-anchorDay stepping must agree with (see the tests).
 */
export function nthOccurrence(
  rule: string | null | undefined,
  anchor: Date,
  n: number,
): Date | null {
  if (!isRecurrenceRule(rule)) return null
  if (Number.isNaN(anchor.getTime())) return null
  if (!Number.isInteger(n) || n < 0) return null
  const base = atMidnight(anchor)

  switch (rule) {
    case 'DAILY':
      return addDays(base, n)
    case 'WEEKLY':
      return addDays(base, 7 * n)
    case 'BIWEEKLY':
      return addDays(base, 14 * n)
    case 'WEEKDAYS': {
      let d = base
      for (let i = 0; i < n; i++) d = nextOccurrence('WEEKDAYS', d) as Date
      return d
    }
    case 'MONTHLY':
      return addMonthsClamped(base, n)
    case 'YEARLY':
      return addMonthsClamped(base, 12 * n)
  }
}

/**
 * The day-of-month a MONTHLY/YEARLY series is anchored on, given its head's
 * current due date (the generator's cursor) and evidence of earlier due dates.
 *
 * Why this is needed: the head's dueDate is the series cursor, so once the
 * generator clamps it (Jan 31 → Feb 28) the intended "31st" is no longer on
 * the row. Without an anchor the next step would be Mar 28, and every month
 * after that (monthly drift).
 *
 * Rules:
 *  - Non-month rules have no anchor (null).
 *  - A head due before the last day of its month cannot be clamped, so its own
 *    day *is* the anchor. This also honours a user who re-anchors the series
 *    by editing the head's due date.
 *  - A head due on the last day of its month may be clamped: the anchor is the
 *    largest day among `evidence` dates from the same series in the window
 *    (MONTHLY: the 12 preceding months; YEARLY: the same month in the 4
 *    preceding years, which always includes a leap year), never less than
 *    the head's own day. Every generated date is either the anchor day or a
 *    clamp below it, and any short month is preceded by a 31-day month, so one
 *    step of real history is enough for MONTHLY.
 *
 * Callers must pass evidence from *after* the last user re-anchor only; see
 * `anchorEvidenceFromLogs`.
 */
export function inferAnchorDay(
  rule: string | null | undefined,
  headDue: Date,
  evidence: ReadonlyArray<Date | null | undefined> = [],
): number | null {
  if (!isRecurrenceRule(rule) || !isMonthBased(rule)) return null
  if (Number.isNaN(headDue.getTime())) return null
  const headDay = headDue.getDate()
  if (!isLastDayOfMonth(headDue)) return headDay

  const hy = headDue.getFullYear()
  const hm = headDue.getMonth()
  let anchor = headDay
  for (const e of evidence) {
    if (!e || Number.isNaN(e.getTime())) continue
    const ey = e.getFullYear()
    const em = e.getMonth()
    const inWindow =
      rule === 'MONTHLY'
        ? (() => {
            const monthsBack = hy * 12 + hm - (ey * 12 + em)
            return monthsBack >= 1 && monthsBack <= 12
          })()
        : em === hm && hy - ey >= 1 && hy - ey <= 4
    if (inWindow && e.getDate() > anchor) anchor = e.getDate()
  }
  return anchor
}

/** Does the generator need to look up history to know this head's anchor day? */
export function needsAnchorEvidence(rule: string | null | undefined, headDue: Date | null): boolean {
  if (!headDue || !isRecurrenceRule(rule) || !isMonthBased(rule)) return false
  return isLastDayOfMonth(headDue)
}

// ── Stored anchor day (`Todo.recurrenceAnchorDay`) ──────────────────────────
//
// History-based inference (above) only works while the ActivityLog rows it
// reads exist, and they are pruned after 540 days. So the anchor is stored on
// the head when the user sets the rule or the due date, and `inferAnchorDay`
// is only the fallback for legacy heads whose column is still null.

function isValidDate(d: Date | null | undefined): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime())
}

/**
 * The anchor a head gets from a freshly chosen due date: its day of month for
 * MONTHLY/YEARLY (31 behaves as "last day": it clamps in short months), null
 * for every other rule or when there is no due date.
 */
export function anchorDayForDue(
  rule: string | null | undefined,
  dueDate: Date | null | undefined,
): number | null {
  if (!isRecurrenceRule(rule) || !isMonthBased(rule)) return null
  if (!isValidDate(dueDate)) return null
  return dueDate.getDate()
}

/**
 * What to write to `recurrenceAnchorDay` when a head's rule and/or due date is
 * saved. `undefined` = leave the column as it is.
 *
 *  - Rule not MONTHLY/YEARLY, or no due date → null (clears a stale anchor).
 *  - Rule changed, or due date moved to a different calendar day → the new
 *    due date's day (a user re-anchor).
 *  - Same rule, same due day → unchanged. The card modal re-sends dueDate and
 *    recurrenceRule on every Dates-panel save; a head sitting on a clamped
 *    Feb 28 of a "31st" series must not be re-anchored to 28 just because the
 *    user changed its reminder.
 */
export function anchorDayOnSave(
  prev: { recurrenceRule: string | null; dueDate: Date | null },
  next: { recurrenceRule: string | null; dueDate: Date | null },
): number | null | undefined {
  const anchor = anchorDayForDue(next.recurrenceRule, next.dueDate)
  if (anchor === null) return null
  if (prev.recurrenceRule !== next.recurrenceRule) return anchor
  const p = prev.dueDate
  const n = next.dueDate as Date
  const sameDay =
    isValidDate(p) &&
    p.getFullYear() === n.getFullYear() &&
    p.getMonth() === n.getMonth() &&
    p.getDate() === n.getDate()
  return sameDay ? undefined : anchor
}

/**
 * The stored anchor, if it is usable for this rule: an integer 1–31 on a
 * MONTHLY/YEARLY head. Null means "not stored" and the caller falls back to
 * `inferAnchorDay` (legacy rows).
 */
export function storedAnchorDay(
  rule: string | null | undefined,
  value: number | null | undefined,
): number | null {
  if (!isRecurrenceRule(rule) || !isMonthBased(rule)) return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 31) return null
  return value
}

/** Metadata the generator stamps on the audit row for each head advance. */
export const RECURRENCE_JOB = 'todo-recurrence'

export interface DueDateLogRow {
  changes: unknown
  metadata: unknown
  createdAt: Date
}

/**
 * Turn a head's activity rows (newest first) into anchor evidence.
 *
 * Each generator advance is logged as `changes.dueDate { from, to }` with
 * `metadata.job === RECURRENCE_JOB`; its `from` is the previous cursor, which
 * for the first advance is the user's original due date — the one fact the row
 * itself loses on the first clamp. Any other row carrying `changes.dueDate` is a
 * user edit (a re-anchor): its `to` is the new anchor and nothing older counts.
 */
export function anchorEvidenceFromLogs(rows: ReadonlyArray<DueDateLogRow>): {
  dates: Date[]
  reanchoredAt: Date | null
} {
  const dates: Date[] = []
  for (const row of rows) {
    const change = (row.changes as Record<string, { from?: unknown; to?: unknown }> | null)?.dueDate
    if (!change) continue
    const meta = row.metadata as { job?: unknown } | null
    if (meta?.job === RECURRENCE_JOB) {
      const from = toDate(change.from)
      if (from) dates.push(from)
      continue
    }
    const to = toDate(change.to)
    if (to) dates.push(to)
    return { dates, reanchoredAt: row.createdAt }
  }
  return { dates, reanchoredAt: null }
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v !== 'string' || !v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export interface SeriesHead {
  recurrenceRule: string | null
  /** The due date of the most recently generated occurrence. */
  dueDate: Date | null
  /** Inclusive last date the series may generate. Null = open-ended. */
  recurrenceEndsAt?: Date | null
  archivedAt?: Date | null
  /**
   * MONTHLY/YEARLY: the day-of-month the series is anchored on (see
   * `inferAnchorDay`). Omitted = the day of `dueDate`.
   */
  anchorDay?: number | null
}

/**
 * Should the generator create the next occurrence for this head right now?
 *
 * Generation is horizon-based rather than completion-based: the next card
 * appears `horizonDays` before it is due, so a weekly card is visible on the
 * board ahead of its deadline instead of materialising the morning it is due.
 */
export function shouldGenerate(
  head: SeriesHead,
  now: Date,
  horizonDays = 1,
): boolean {
  if (!isRecurrenceRule(head.recurrenceRule)) return false
  // An archived series is one the user has put away; it must stop spawning.
  if (head.archivedAt) return false
  if (!head.dueDate) return false

  const next = nextOccurrence(head.recurrenceRule, head.dueDate, head.anchorDay)
  if (!next) return false
  if (head.recurrenceEndsAt && next > atMidnight(head.recurrenceEndsAt)) return false

  const horizon = addDays(atMidnight(now), horizonDays)
  return next <= horizon
}

/**
 * Every occurrence from `head.dueDate` up to the horizon, in order.
 *
 * A generator run that finds a series which has been dormant (the app was down,
 * or a daily card was left alone for a week) must not emit one card per missed
 * day — that would flood the board. `maxPerRun` caps it and the caller carries
 * on from the last one it generated on the next tick.
 *
 * The anchor day is fixed for the whole run (defaulting to the head's own day),
 * so a catch-up across a short month does not drift either.
 */
export function occurrencesUpTo(
  head: SeriesHead,
  now: Date,
  horizonDays = 1,
  maxPerRun = 5,
): Date[] {
  const out: Date[] = []
  const anchorDay = head.anchorDay ?? head.dueDate?.getDate() ?? null
  let cursor: SeriesHead = { ...head, anchorDay }
  while (out.length < maxPerRun && shouldGenerate(cursor, now, horizonDays)) {
    const next = nextOccurrence(cursor.recurrenceRule, cursor.dueDate as Date, anchorDay)
    if (!next) break
    out.push(next)
    cursor = { ...cursor, dueDate: next }
  }
  return out
}

// ── Per-run plan (REC-FIX-1 / REC-FIX-2) ────────────────────────────────────

export interface DatedItem {
  startDate: Date | null
  dueDate: Date | null
}

/** Shift an item's dates by whole calendar days; undated fields stay null. */
export function shiftItemDates(item: DatedItem, days: number): DatedItem {
  return {
    startDate: item.startDate ? addDays(item.startDate, days) : null,
    dueDate: item.dueDate ? addDays(item.dueDate, days) : null,
  }
}

export interface OccurrencePlan {
  dueDate: Date
  /** `due − spanDays`; null when the head has no start date. */
  startDate: Date | null
  /** Days to add to each head checklist item date for this occurrence. */
  itemOffsetDays: number
}

export interface SeriesAdvancePlan {
  occurrences: OccurrencePlan[]
  /** What the head row becomes. `startDate` is present only when the head has a span. */
  head: { dueDate: Date; startDate?: Date }
  /** Days to shift the head's own dated checklist items by (0 = nothing to do). */
  headItemShiftDays: number
  /** Whole calendar days from the head's start to its due, measured once; null if no start. */
  spanDays: number | null
  anchorDay: number | null
}

/**
 * Everything one generator run writes for a series, computed without the DB.
 *
 * REC-FIX-1: the head's start→due span is measured once, before the loop, in
 * calendar days, and the head's startDate advances with its dueDate cursor, so
 * the span never inflates (the §1.2 bug: run 2 used a 9-day span, run 3 16).
 *
 * REC-FIX-2: copied checklist items keep their position relative to the card
 * ("item date − head due + occurrence due"), and the head's own items move by
 * the same amount as the head, so the formula stays right from run 2 on.
 */
export function planSeriesAdvance(
  head: SeriesHead & { startDate?: Date | null },
  now: Date,
  horizonDays = 1,
  maxPerRun = 5,
): SeriesAdvancePlan | null {
  if (!head.dueDate) return null
  const dates = occurrencesUpTo(head, now, horizonDays, maxPerRun)
  if (dates.length === 0) return null

  const headDue = head.dueDate
  const spanDays = head.startDate ? differenceInCalendarDays(headDue, head.startDate) : null
  const lastDate = dates[dates.length - 1]

  return {
    occurrences: dates.map((due) => ({
      dueDate: due,
      startDate: spanDays !== null ? subDays(due, spanDays) : null,
      itemOffsetDays: differenceInCalendarDays(due, headDue),
    })),
    head: {
      dueDate: lastDate,
      ...(spanDays !== null && { startDate: subDays(lastDate, spanDays) }),
    },
    headItemShiftDays: differenceInCalendarDays(lastDate, headDue),
    spanDays,
    anchorDay: head.anchorDay ?? (isMonthBased(head.recurrenceRule as RecurrenceRule) ? headDue.getDate() : null),
  }
}

// ── One-off repair (REC-FIX-1r / REC-FIX-2r) ────────────────────────────────

export interface HeadRepairInput {
  rule: string
  head: { startDate: Date | null; dueDate: Date }
  /** The earliest generated occurrence (first run, before any span drift). */
  first: { startDate: Date | null; dueDate: Date | null }
  /**
   * The head due date at the moment the fixed generator (REC-FIX-2) first
   * shifted the head's items, if it already has. Item drift stops there, so
   * the item delta must be measured up to it, not to today's due date.
   */
  itemsAlignedFromDue?: Date | null
}

export interface HeadRepairPlan {
  /** New head start date, or null when the start is already right or cannot be derived. */
  startDate: Date | null
  /** Why the start date is left alone, when it is. */
  startSkipReason: string | null
  /** Span the head should have (from the first occurrence); null if unknown. */
  spanDays: number | null
  /** Days to shift the head's dated checklist items by (0 = nothing to do). */
  itemDeltaDays: number
  originalHeadDue: Date | null
}

export function planHeadRepair(input: HeadRepairInput): HeadRepairPlan {
  const { rule, head, first } = input
  let startDate: Date | null = null
  let startSkipReason: string | null = null
  let spanDays: number | null = null

  if (!head.startDate) {
    startSkipReason = 'head has no start date'
  } else if (!first.startDate || !first.dueDate) {
    startSkipReason = 'first occurrence has no start/due date to take the span from'
  } else {
    spanDays = differenceInCalendarDays(first.dueDate, first.startDate)
    const target = subDays(head.dueDate, spanDays)
    if (differenceInCalendarDays(target, head.startDate) !== 0) startDate = target
    else startSkipReason = 'already aligned'
  }

  const originalHeadDue = first.dueDate ? previousOccurrence(rule, first.dueDate) : null
  const end = input.itemsAlignedFromDue ?? head.dueDate
  const itemDeltaDays = originalHeadDue ? differenceInCalendarDays(end, originalHeadDue) : 0

  return { startDate, startSkipReason, spanDays, itemDeltaDays, originalHeadDue }
}
