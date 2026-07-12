/**
 * Business-day calculations for the Project Management module.
 *
 * Used by the Approval Clock (Epic C3), SLA breach detection (Epic H4), and idle-day
 * detection (Epic G4). Weekends (Sat/Sun) are always excluded; additional holidays are
 * configurable. Pure functions — unit-tested, no I/O.
 *
 * Build spec: docs/project_management_module_BUILD_SPEC.md §C3 ("business days only").
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Normalize a Date to midnight UTC (date-only comparison, DST-safe). */
function toUtcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** Format a Date as `YYYY-MM-DD` in UTC — the key format for the holiday set. */
export function toDateKey(d: Date): string {
  return new Date(toUtcMidnight(d)).toISOString().slice(0, 10)
}

/** True if the date is Saturday or Sunday (UTC). */
export function isWeekend(d: Date): boolean {
  const day = new Date(toUtcMidnight(d)).getUTCDay()
  return day === 0 || day === 6
}

/**
 * True if the date is a working day: not a weekend and not in the holiday set.
 * `holidays` is a set of `YYYY-MM-DD` keys.
 */
export function isWorkingDay(d: Date, holidays: ReadonlySet<string> = new Set()): boolean {
  return !isWeekend(d) && !holidays.has(toDateKey(d))
}

/**
 * Count business days strictly between `start` and `end` — i.e. the number of
 * working days the clock was running. The start day itself is not counted (the
 * deliverable is sent on `start`); each subsequent working day up to and including
 * `end` counts as one day waited.
 *
 * Example (build spec C3): sent Monday, approved the following Monday → 5 business
 * days (Tue, Wed, Thu, Fri, Mon), with the intervening weekend excluded.
 *
 * If `end` is before `start`, returns 0.
 */
export function businessDaysBetween(
  start: Date,
  end: Date,
  holidays: ReadonlySet<string> = new Set()
): number {
  const startMs = toUtcMidnight(start)
  const endMs = toUtcMidnight(end)
  if (endMs <= startMs) return 0

  let count = 0
  for (let ms = startMs + MS_PER_DAY; ms <= endMs; ms += MS_PER_DAY) {
    const day = new Date(ms)
    if (isWorkingDay(day, holidays)) count += 1
  }
  return count
}

/**
 * Add `n` business days to a date, skipping weekends and holidays. Used to compute
 * SLA deadlines (e.g. "approve within 5 business days") and escalation trigger dates.
 */
export function addBusinessDays(
  start: Date,
  n: number,
  holidays: ReadonlySet<string> = new Set()
): Date {
  let ms = toUtcMidnight(start)
  let remaining = n
  while (remaining > 0) {
    ms += MS_PER_DAY
    if (isWorkingDay(new Date(ms), holidays)) remaining -= 1
  }
  return new Date(ms)
}

/**
 * List the working days within an inclusive `[start, end]` range. Used by idle-day
 * detection (Epic G4) to enumerate the days a developer could have been active.
 */
export function workingDaysInRange(
  start: Date,
  end: Date,
  holidays: ReadonlySet<string> = new Set()
): Date[] {
  const startMs = toUtcMidnight(start)
  const endMs = toUtcMidnight(end)
  const out: Date[] = []
  for (let ms = startMs; ms <= endMs; ms += MS_PER_DAY) {
    const day = new Date(ms)
    if (isWorkingDay(day, holidays)) out.push(day)
  }
  return out
}
