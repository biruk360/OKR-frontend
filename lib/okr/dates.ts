/**
 * Cycle/timeframe date utilities — all pure, no side effects.
 */

/** Fraction of the timeframe elapsed (0–1). */
export function cycleElapsedFraction(
  cycleStart: Date,
  cycleEnd: Date,
  now: Date = new Date()
): number {
  const start = cycleStart.getTime()
  const end = cycleEnd.getTime()
  const duration = end - start
  if (duration <= 0) return 1
  const elapsed = now.getTime() - start
  return Math.max(0, Math.min(1, elapsed / duration))
}

/** Days remaining until the cycle end date. Negative = past deadline. */
export function daysUntilDeadline(cycleEnd: Date, now: Date = new Date()): number {
  return Math.ceil((cycleEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
}

/** Days since a given date. */
export function daysSince(date: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000))
}

/** Human-readable week label, e.g. "Week 3 of 13". */
export function weekLabel(cycleStart: Date, cycleEnd: Date, now: Date = new Date()): string {
  const start = cycleStart.getTime()
  const end = cycleEnd.getTime()
  const elapsed = now.getTime() - start
  const duration = end - start
  const week = Math.max(1, Math.ceil(elapsed / (7 * 24 * 60 * 60 * 1000)))
  const totalWeeks = Math.max(1, Math.ceil(duration / (7 * 24 * 60 * 60 * 1000)))
  return `Week ${Math.min(week, totalWeeks)} of ${totalWeeks}`
}
