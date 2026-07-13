import {
  addBusinessDays,
  businessDaysBetween,
  toDateKey,
  workingDaysInRange,
} from '@/lib/projects/business-days'
import { SCRUM_DEFAULT_TIMEZONE, SCRUM_DEFAULT_WORKING_DAYS } from '@/types/scrum'

export interface ScrumWorkingDaySettings {
  timezone?: string | null
  workingDays?: readonly number[] | null
  holidays?: readonly string[] | null
}

export interface ScrumCutoffSettings extends ScrumWorkingDaySettings {
  cutoffTime?: string | null
}

interface ResolvedScrumWorkingDaySettings {
  timezone: string
  workingDays: number[]
  holidays: string[]
}

export const DEFAULT_SCRUM_WORKING_DAY_SETTINGS: ResolvedScrumWorkingDaySettings = {
  timezone: SCRUM_DEFAULT_TIMEZONE,
  workingDays: [...SCRUM_DEFAULT_WORKING_DAYS],
  holidays: [],
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function settingsWithDefaults(settings: ScrumWorkingDaySettings = {}): ResolvedScrumWorkingDaySettings {
  return {
    timezone: settings.timezone || DEFAULT_SCRUM_WORKING_DAY_SETTINGS.timezone,
    workingDays: settings.workingDays?.length ? [...settings.workingDays] : [...DEFAULT_SCRUM_WORKING_DAY_SETTINGS.workingDays],
    holidays: settings.holidays ? [...settings.holidays] : [],
  }
}

export function dateKeyInTimezone(date: Date, timezone = SCRUM_DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const byType = new Map(parts.map((part) => [part.type, part.value]))
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`
}

export function dateFromDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`)
}

export function isScrumWorkingDay(date: Date, settings: ScrumWorkingDaySettings = {}): boolean {
  const resolved = settingsWithDefaults(settings)
  const key = dateKeyInTimezone(date, resolved.timezone)
  const day = dateFromDateKey(key).getUTCDay()
  if (!resolved.workingDays.includes(day)) return false

  return !new Set(resolved.holidays).has(key)
}

export function previousScrumWorkingDay(date: Date, settings: ScrumWorkingDaySettings = {}): Date | null {
  const resolved = settingsWithDefaults(settings)
  let cursor = dateFromDateKey(dateKeyInTimezone(date, resolved.timezone))
  for (let i = 0; i < 370; i++) {
    cursor = new Date(cursor.getTime() - MS_PER_DAY)
    if (isScrumWorkingDay(cursor, resolved)) return cursor
  }
  return null
}

export function scrumBusinessDaysBetween(start: Date, end: Date, settings: ScrumWorkingDaySettings = {}): number {
  const resolved = settingsWithDefaults(settings)
  const startKey = dateKeyInTimezone(start, resolved.timezone)
  const endKey = dateKeyInTimezone(end, resolved.timezone)

  // Fast path for the repo-default Monday-Friday pattern: reuse the shared PM math.
  if (isDefaultWorkingWeek(resolved.workingDays)) {
    return businessDaysBetween(dateFromDateKey(startKey), dateFromDateKey(endKey), new Set(resolved.holidays))
  }

  let count = 0
  let cursor = dateFromDateKey(startKey)
  const endDate = dateFromDateKey(endKey)
  while (cursor < endDate) {
    cursor = new Date(cursor.getTime() + MS_PER_DAY)
    if (isScrumWorkingDay(cursor, resolved)) count++
  }
  return count
}

export function addScrumWorkingDays(start: Date, days: number, settings: ScrumWorkingDaySettings = {}): Date {
  const resolved = settingsWithDefaults(settings)
  if (isDefaultWorkingWeek(resolved.workingDays)) {
    return addBusinessDays(start, days, new Set(resolved.holidays))
  }

  let cursor = dateFromDateKey(dateKeyInTimezone(start, resolved.timezone))
  let remaining = days
  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + MS_PER_DAY)
    if (isScrumWorkingDay(cursor, resolved)) remaining--
  }
  return cursor
}

export function scrumWorkingDaysInRange(start: Date, end: Date, settings: ScrumWorkingDaySettings = {}): Date[] {
  const resolved = settingsWithDefaults(settings)
  if (isDefaultWorkingWeek(resolved.workingDays)) {
    return workingDaysInRange(start, end, new Set(resolved.holidays))
  }

  const out: Date[] = []
  let cursor = dateFromDateKey(dateKeyInTimezone(start, resolved.timezone))
  const endDate = dateFromDateKey(dateKeyInTimezone(end, resolved.timezone))
  while (cursor <= endDate) {
    if (isScrumWorkingDay(cursor, resolved)) out.push(cursor)
    cursor = new Date(cursor.getTime() + MS_PER_DAY)
  }
  return out
}

export function isLateSubmission(submittedAt: Date, scrumDate: Date, settings: ScrumCutoffSettings = {}): boolean {
  const resolved = settingsWithDefaults(settings)
  const cutoffTime = settings.cutoffTime || '09:00'
  const submittedKey = dateKeyInTimezone(submittedAt, resolved.timezone)
  const scrumKey = dateKeyInTimezone(scrumDate, resolved.timezone)
  if (submittedKey !== scrumKey) return submittedKey > scrumKey

  const submittedTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: resolved.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(submittedAt)

  return submittedTime > cutoffTime
}

export function toScrumDateKey(date: Date, settings: ScrumWorkingDaySettings = {}): string {
  return dateKeyInTimezone(date, settings.timezone || SCRUM_DEFAULT_TIMEZONE)
}

export function toUtcDateKey(date: Date): string {
  return toDateKey(date)
}

function isDefaultWorkingWeek(days: readonly number[]): boolean {
  return days.length === 5 && days.every((day, index) => day === index + 1)
}
