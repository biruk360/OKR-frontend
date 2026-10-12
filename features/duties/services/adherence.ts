/**
 * Recurring duties — adherence, next due and weekly counts (DUT-5, PRF-2).
 *
 * Pure and client-safe. Input is the duty's Todo rows (head, generated
 * occurrences and logged event occurrences, all carrying `dutyId`).
 *
 * Which rows are occurrences:
 *  - every row without a `recurrenceRule` (generated occurrences carry none,
 *    and neither do logged EVENT occurrences);
 *  - the series head (it carries the rule) only while the generator has not yet
 *    spawned anything from it: until then the head *is* the first occurrence.
 *    Once it has children its `dueDate` is just the series cursor and mirrors
 *    the newest occurrence, so counting it would double-count. An archived head
 *    (paused / retired / replaced) that was never completed is not counted.
 */
import { addDays, startOfWeek } from 'date-fns'
import { nextOccurrence } from '@/lib/todos/recurrence'
import { atMidnight } from './schedule'

export interface DutyTodoRow {
  id: string
  status: string
  dueDate: Date | null
  completedAt?: Date | null
  archivedAt?: Date | null
  recurrenceRule?: string | null
  recurrenceParentId?: string | null
  recurrenceAnchorDay?: number | null
  /**
   * Set by the loader for a head whose generated occurrences fall outside the
   * rows passed in (e.g. older than the 90-day window), so it is still known
   * to have advanced.
   */
  hasChildren?: boolean
}

export interface AdherenceWindow {
  /** Occurrences that were due in the window (completed ones, plus anything due before today). */
  due: number
  /** Of those, how many are COMPLETED. */
  done: number
  /** done ÷ due as a whole percent, or null when nothing was due. */
  rate: number | null
}

export interface DutyAdherence {
  d30: AdherenceWindow
  d90: AdherenceWindow
}

const CLOSED_STATUSES = new Set(['COMPLETED', 'CANCELLED'])

function isHead(row: DutyTodoRow): boolean {
  return typeof row.recurrenceRule === 'string' && row.recurrenceRule.length > 0
}

/** The rows that count as occurrences (see the module comment). */
export function occurrenceRows<T extends DutyTodoRow>(rows: readonly T[]): T[] {
  const parents = new Set<string>()
  for (const r of rows) if (r.recurrenceParentId) parents.add(r.recurrenceParentId)
  return rows.filter((r) => {
    if (!isHead(r)) return true
    if (r.hasChildren || parents.has(r.id)) return false
    if (r.archivedAt && r.status !== 'COMPLETED') return false
    return true
  })
}

/**
 * DUT-5 for one window: completed ÷ due over the last `days` days (today
 * included). An occurrence due today that is still open is not counted yet —
 * it is not late — but one completed today is.
 */
export function adherenceWindow(rows: readonly DutyTodoRow[], now: Date, days: number): AdherenceWindow {
  const today = atMidnight(now)
  const from = addDays(today, -(days - 1))
  const tomorrow = addDays(today, 1)
  let due = 0
  let done = 0
  for (const r of occurrenceRows(rows)) {
    if (!r.dueDate) continue
    const d = r.dueDate
    if (d < from || d >= tomorrow) continue
    const completed = r.status === 'COMPLETED'
    if (!completed && d >= today) continue
    due++
    if (completed) done++
  }
  return { due, done, rate: due > 0 ? Math.round((done / due) * 100) : null }
}

/** DUT-5: 30- and 90-day adherence for one duty. */
export function computeDutyAdherence(rows: readonly DutyTodoRow[], now: Date): DutyAdherence {
  return { d30: adherenceWindow(rows, now, 30), d90: adherenceWindow(rows, now, 90) }
}

/** Sum several windows (the profile summary's overall 30-day adherence). */
export function combineAdherence(windows: readonly AdherenceWindow[]): AdherenceWindow {
  let due = 0
  let done = 0
  for (const w of windows) {
    due += w.due
    done += w.done
  }
  return { due, done, rate: due > 0 ? Math.round((done / due) * 100) : null }
}

/** Monday 00:00 → next Monday 00:00 of the week containing `now` (PRF-2 "this week"). */
export function weekWindow(now: Date): { start: Date; end: Date } {
  const start = startOfWeek(atMidnight(now), { weekStartsOn: 1 })
  return { start, end: addDays(start, 7) }
}

/** PRF-2: occurrences due this week and how many of them are done. */
export function weekCounts(rows: readonly DutyTodoRow[], now: Date): { due: number; done: number } {
  const { start, end } = weekWindow(now)
  let due = 0
  let done = 0
  for (const r of occurrenceRows(rows)) {
    if (!r.dueDate || r.dueDate < start || r.dueDate >= end) continue
    due++
    if (r.status === 'COMPLETED') done++
  }
  return { due, done }
}

/** Open (not completed / cancelled / archived) occurrences due before today. */
export function overdueCount(rows: readonly DutyTodoRow[], now: Date): number {
  const today = atMidnight(now)
  return occurrenceRows(rows).filter(
    (r) => r.dueDate && r.dueDate < today && !CLOSED_STATUSES.has(r.status) && !r.archivedAt,
  ).length
}

/** DUT-6: a duty with any completed occurrence can only be retired, never deleted. */
export function completedOccurrenceCount(rows: readonly DutyTodoRow[]): number {
  return rows.filter((r) => r.status === 'COMPLETED').length
}

/**
 * The next date this duty is due, on or after today: the earliest open card,
 * or — for an active series — the date the generator will create next.
 * Null for a paused / retired duty with nothing open, or an EVENT duty with no
 * logged occurrence ahead.
 */
export function computeNextDue(
  rows: readonly DutyTodoRow[],
  head: DutyTodoRow | null,
  now: Date,
  opts: { active: boolean; endsOn?: Date | null } = { active: true },
): Date | null {
  const today = atMidnight(now)
  let best: Date | null = null
  const consider = (d: Date | null | undefined) => {
    if (!d || d < today) return
    if (!best || d < best) best = d
  }
  for (const r of rows) {
    if (r.archivedAt || CLOSED_STATUSES.has(r.status)) continue
    consider(r.dueDate)
  }
  if (opts.active && head && !head.archivedAt && head.dueDate && head.recurrenceRule) {
    // The head's own date is covered above while it is open; the following
    // date is what the generator creates next (always ≥ the head's date).
    let cursor: Date | null = head.dueDate
    for (let i = 0; cursor && cursor < today && i < 4000; i++) {
      cursor = nextOccurrence(head.recurrenceRule, cursor, head.recurrenceAnchorDay ?? null)
    }
    if (cursor && cursor.getTime() === head.dueDate.getTime()) {
      cursor = CLOSED_STATUSES.has(head.status)
        ? nextOccurrence(head.recurrenceRule, cursor, head.recurrenceAnchorDay ?? null)
        : cursor
    }
    if (cursor && (!opts.endsOn || cursor <= atMidnight(opts.endsOn))) consider(cursor)
  }
  return best
}
