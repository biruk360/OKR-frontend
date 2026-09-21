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
 */

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

/**
 * Add `months` to a date, clamping the day to the target month's length.
 * Without the clamp, `new Date(2026, 0, 31)` + 1 month rolls into March —
 * a monthly card due on the 31st would silently skip February.
 */
function addMonthsClamped(d: Date, months: number): Date {
  const y = d.getFullYear()
  const m = d.getMonth() + months
  const day = d.getDate()
  const lastDayOfTarget = new Date(y, m + 1, 0).getDate()
  return new Date(y, m, Math.min(day, lastDayOfTarget))
}

/**
 * The next due date strictly after `from` for a rule.
 * Returns null for an unknown rule rather than guessing a cadence.
 */
export function nextOccurrence(rule: string | null | undefined, from: Date): Date | null {
  if (!isRecurrenceRule(rule)) return null
  if (Number.isNaN(from.getTime())) return null
  const base = atMidnight(from)

  switch (rule) {
    case 'DAILY':
      return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1)
    case 'WEEKDAYS': {
      // Fri → Mon, Sat → Mon, Sun → Mon; otherwise the next day.
      const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1)
      while (next.getDay() === 0 || next.getDay() === 6) {
        next.setDate(next.getDate() + 1)
      }
      return next
    }
    case 'WEEKLY':
      return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 7)
    case 'BIWEEKLY':
      return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 14)
    case 'MONTHLY':
      return addMonthsClamped(base, 1)
    case 'YEARLY':
      // Feb 29 in a non-leap year clamps to Feb 28 rather than rolling to Mar 1.
      return addMonthsClamped(base, 12)
  }
}

export interface SeriesHead {
  recurrenceRule: string | null
  /** The due date of the most recently generated occurrence. */
  dueDate: Date | null
  /** Inclusive last date the series may generate. Null = open-ended. */
  recurrenceEndsAt?: Date | null
  archivedAt?: Date | null
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

  const next = nextOccurrence(head.recurrenceRule, head.dueDate)
  if (!next) return false
  if (head.recurrenceEndsAt && next > atMidnight(head.recurrenceEndsAt)) return false

  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + horizonDays)
  return next <= horizon
}

/**
 * Every occurrence from `head.dueDate` up to the horizon, in order.
 *
 * A generator run that finds a series which has been dormant (the app was down,
 * or a daily card was left alone for a week) must not emit one card per missed
 * day — that would flood the board. `maxPerRun` caps it and the caller carries
 * on from the last one it generated on the next tick.
 */
export function occurrencesUpTo(
  head: SeriesHead,
  now: Date,
  horizonDays = 1,
  maxPerRun = 5,
): Date[] {
  const out: Date[] = []
  let cursor: SeriesHead = { ...head }
  while (out.length < maxPerRun && shouldGenerate(cursor, now, horizonDays)) {
    const next = nextOccurrence(cursor.recurrenceRule, cursor.dueDate as Date)
    if (!next) break
    out.push(next)
    cursor = { ...cursor, dueDate: next }
  }
  return out
}
