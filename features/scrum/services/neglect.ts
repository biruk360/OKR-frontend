import { dateFromDateKey, previousScrumWorkingDay, type ScrumWorkingDaySettings } from './working-days'

/** `ScrumJobRun.jobKey` of the once-per-neglect-period marker (userId column = objective id). */
export const OBJECTIVE_NEGLECT_JOB_KEY = 'scrum-objective-neglected'

/** Upper bound of alerts per nightly run, so a first run never floods the CEO; the rest follow on later nights. */
export const MAX_NEGLECT_ALERTS_PER_RUN = 25

/**
 * First day of the neglect window: the `days`-th completed working day before
 * `todayKey` (the job runs before the day's standup, so today is not counted).
 */
export function neglectWindowStart(todayKey: string, days: number, settings: ScrumWorkingDaySettings = {}): Date | null {
  let cursor: Date | null = dateFromDateKey(todayKey)
  for (let i = 0; i < Math.max(1, days); i++) {
    cursor = cursor ? previousScrumWorkingDay(cursor, settings) : null
    if (!cursor) return null
  }
  return cursor
}

/**
 * Once per neglect period: alert when the objective had no scrum mention in the
 * window and it was either never alerted, or has been mentioned since the last
 * alert (i.e. it recovered and is now neglected again).
 */
export function decideNeglectAlert(input: {
  mentionedInWindow: boolean
  lastAlertDate: Date | null
  windowStart: Date
  mentionedSinceLastAlert: boolean
}): boolean {
  if (input.mentionedInWindow) return false
  if (!input.lastAlertDate) return true
  if (input.lastAlertDate.getTime() >= input.windowStart.getTime()) return false
  return input.mentionedSinceLastAlert
}

const ITEM_SECTIONS = ['yesterdayItems', 'todayItems', 'blockerItems', 'winItems'] as const

/** Objective / KR / to-do ids referenced by any item of a stored `contentJson`. */
export function objectiveMentionsFromContent(contentJson: unknown) {
  const objectiveIds = new Set<string>()
  const keyResultIds = new Set<string>()
  const todoIds = new Set<string>()
  if (contentJson && typeof contentJson === 'object') {
    for (const section of ITEM_SECTIONS) {
      const items = (contentJson as Record<string, unknown>)[section]
      if (!Array.isArray(items)) continue
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        const { objectiveId, keyResultId, todoId } = item as Record<string, unknown>
        if (typeof objectiveId === 'string' && objectiveId) objectiveIds.add(objectiveId)
        if (typeof keyResultId === 'string' && keyResultId) keyResultIds.add(keyResultId)
        if (typeof todoId === 'string' && todoId) todoIds.add(todoId)
      }
    }
  }
  return { objectiveIds: [...objectiveIds], keyResultIds: [...keyResultIds], todoIds: [...todoIds] }
}
