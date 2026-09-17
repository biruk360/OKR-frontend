/**
 * Due-date tone — the single source of truth for "is this late, and how should
 * it look".
 *
 * Pure: no DB, no I/O, no implicit `Date.now()`. Callers may inject `now`, which
 * is what makes this testable — the same convention `due-reminders.ts` uses.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * Ten files had each grown their own version, and they disagreed on three
 * things that are visible to users:
 *
 *   1. WHEN SOMETHING IS LATE. Five files compared the raw timestamp
 *      (`new Date(dueDate) < Date.now()`). A `dueDate` with no time component
 *      is midnight, so a task due TODAY rendered as overdue from 00:01 onward.
 *      That also contradicted `due-reminders.ts`, which already treats an
 *      all-day task as due at the END of its day. This module follows the
 *      reminder convention, so the badge and the reminder finally agree.
 *
 *   2. WHAT "SOON" MEANS. `TaskCardTrello` used ≤2 days; `ReportDashboardClient`
 *      used ≤7. Both are defensible for their surface — a sprint card has a
 *      tighter horizon than a weekly report — so `soonWithinDays` is a
 *      parameter with a documented default rather than a value forced on
 *      everyone.
 *
 *   3. WHAT THE COLOURS MEAN. `TodoCardModal` painted "due tomorrow" GREEN and
 *      `SetDueDateButton` painted any future date GREEN. Green reads as
 *      "complete" or "on track"; neither is true of a task that is merely
 *      scheduled. Green is now reserved for `done`, and nothing else.
 */

export type DueTone = 'none' | 'done' | 'overdue' | 'today' | 'soon' | 'upcoming'

export interface DueToneInput {
  /** The stored due date. A date-only value is treated as all-day. */
  dueDate: Date | string | null | undefined
  /** "HH:mm" wall-clock due time, when the card carries one. */
  endTime?: string | null
  /** Completed/cancelled cards are `done` regardless of date. */
  done?: boolean
  /**
   * Calendar days ahead (excluding today) that still count as `soon`.
   * Default 2 — the card/board horizon. Report surfaces pass 7.
   */
  soonWithinDays?: number
  /** Injectable clock. Defaults to the real now. */
  now?: Date
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/** Local midnight for a date — the basis for all calendar-day comparisons. */
function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

/**
 * The instant a card is actually due.
 *
 * With an `endTime`, that wall-clock time on the due day. Without one, the END
 * of the due day — matching `reminderFireAt()`. This is the whole fix for the
 * "overdue at 00:01" bug.
 */
export function dueInstant(dueDate: Date | string, endTime?: string | null): Date {
  const due = new Date(dueDate)
  if (endTime && HHMM.test(endTime)) {
    const [h, m] = endTime.split(':')
    due.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0)
  } else {
    due.setHours(23, 59, 59, 999)
  }
  return due
}

/** Whole calendar days from `a` to `b`; negative when `b` is in the past. */
function calendarDaysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000)
}

export function dueTone(input: DueToneInput): DueTone {
  const { dueDate, endTime, done, soonWithinDays = 2, now = new Date() } = input
  if (done) return 'done'
  if (!dueDate) return 'none'

  const parsed = new Date(dueDate)
  if (Number.isNaN(parsed.getTime())) return 'none'

  // Lateness is judged against the real instant, so a card due today at 17:00
  // is not late at 09:00 — but an all-day card due today is not late either,
  // because its instant is the end of the day.
  if (dueInstant(parsed, endTime) < now) return 'overdue'

  const days = calendarDaysBetween(now, parsed)
  if (days <= 0) return 'today'
  if (days <= soonWithinDays) return 'soon'
  return 'upcoming'
}

/**
 * Convenience for the several call sites that only need a boolean.
 * Same rule as `dueTone(...) === 'overdue'`.
 */
export function isOverdue(
  dueDate: Date | string | null | undefined,
  opts: { endTime?: string | null; done?: boolean; now?: Date } = {},
): boolean {
  return dueTone({ dueDate, ...opts }) === 'overdue'
}

/**
 * Token pairs per tone. Values are `--ap-*` references, so these follow the
 * theme (including dark mode) without any per-call-site work.
 *
 * `soon` shares `today`'s amber deliberately: both mean "act now", and
 * inventing a fourth intensity would need a token that does not exist.
 */
export const DUE_TONE_STYLE: Record<DueTone, { background: string; color: string }> = {
  none: { background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-subtle)' },
  done: { background: 'var(--ap-ok-bg)', color: 'var(--ap-ok-fg)' },
  overdue: { background: 'var(--ap-danger-bg)', color: 'var(--ap-danger-fg)' },
  today: { background: 'var(--ap-warn-bg)', color: 'var(--ap-warn-fg)' },
  soon: { background: 'var(--ap-warn-bg)', color: 'var(--ap-warn-fg)' },
  upcoming: { background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' },
}

/** Short prefix for a date chip, e.g. "Overdue · May 22". Null when neutral. */
export function dueTonePrefix(tone: DueTone): string | null {
  switch (tone) {
    case 'overdue': return 'Overdue'
    case 'today': return 'Today'
    case 'done': return 'Done'
    default: return null
  }
}
