/**
 * Team mood alert rules (spec S8 SC5 / §12 SCRUM_TEAM_MOOD_ALERT).
 *
 * Pure functions — no Prisma — so the rule is unit-tested and the daily
 * health job only supplies data. Mood is only ever evaluated as a TEAM
 * aggregate: a day with fewer than MOOD_ALERT_MIN_REPORTERS distinct
 * reporters carries no signal, so a small team can never expose one person's
 * mood to the CEO through the alert.
 */

export const MOOD_ALERT_MIN_REPORTERS = 3
/** A day is "red" when at least this share of reported moods is STRUGGLING. */
export const MOOD_ALERT_RED_SHARE = 0.5

export interface MoodReport {
  userId: string
  mood: string | null | undefined
}

/** True when the team's reported mood for one day is red (≥50% STRUGGLING, ≥3 reporters). */
export function isRedTeamMoodDay(reports: readonly MoodReport[]): boolean {
  const byUser = new Map<string, string>()
  for (const report of reports) {
    if (report.mood) byUser.set(report.userId, report.mood)
  }
  if (byUser.size < MOOD_ALERT_MIN_REPORTERS) return false
  const struggling = [...byUser.values()].filter((mood) => mood === 'STRUGGLING').length
  return struggling / byUser.size >= MOOD_ALERT_RED_SHARE
}

/** Number of consecutive red days ending at the last key of `dayKeysAsc`. */
export function trailingRedMoodStreak(dayKeysAsc: readonly string[], reportsByDay: ReadonlyMap<string, readonly MoodReport[]>): number {
  let streak = 0
  for (let i = dayKeysAsc.length - 1; i >= 0; i--) {
    if (!isRedTeamMoodDay(reportsByDay.get(dayKeysAsc[i]) ?? [])) break
    streak++
  }
  return streak
}

/**
 * Alert when the streak first reaches the threshold, then once per further
 * threshold-length run (10, 20, 30… days) — never every day.
 */
export function shouldSendTeamMoodAlert(streak: number, thresholdDays: number): boolean {
  const threshold = Math.max(1, Math.floor(thresholdDays))
  return streak >= threshold && (streak - threshold) % threshold === 0
}
