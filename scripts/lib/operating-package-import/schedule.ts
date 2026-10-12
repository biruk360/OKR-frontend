/**
 * Operating-package importer (IMP) — recurring-duty head schedule (DUT-1, DUT-2, DUT-3).
 *
 * A faithful port of the pure parts of features/duties/services/schedule.ts (V3), which the
 * importer cannot import because it resolves '@/' paths. Keep the two in step: a duty imported here
 * must get the same head (rule, first due date, planner slot, anchor day, card text) that the
 * duties service would create for the same input. Day maths reuse lib/todos/recurrence.ts.
 */
import { addDays, differenceInCalendarDays } from 'date-fns'
import { anchorDayForDue, isRecurrenceRule, type RecurrenceRule } from '../../../lib/todos/recurrence'
import type { DutyCadence } from './rules'

/** S1 starts Monday 12 Oct 2026 (DUT-2). Local midnight, like every date the recurrence engine makes. */
export const SPRINT_CALENDAR_START_ISO = '2026-10-12'
export const SPRINT_LENGTH_DAYS = 14

export function sprintCalendarStart(): Date {
  return new Date(2026, 9, 12)
}

export function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** "YYYY-MM-DD" as a local-midnight date (the duties service's parseDutyDate). */
export function localDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function sprintStartOnOrBefore(day: Date): Date {
  const start = sprintCalendarStart()
  const k = Math.floor(differenceInCalendarDays(atMidnight(day), start) / SPRINT_LENGTH_DAYS)
  return addDays(start, k * SPRINT_LENGTH_DAYS)
}

function sprintStartOnOrAfter(day: Date): Date {
  const start = sprintCalendarStart()
  const k = Math.ceil(differenceInCalendarDays(atMidnight(day), start) / SPRINT_LENGTH_DAYS)
  return addDays(start, k * SPRINT_LENGTH_DAYS)
}

/** Calendar cadences map 1:1; EVERY_SPRINT is BIWEEKLY on the sprint calendar; EVENT has no rule. */
export function cadenceToRecurrenceRule(cadence: DutyCadence | string | null | undefined): RecurrenceRule | null {
  if (!cadence || cadence === 'EVENT') return null
  if (cadence === 'EVERY_SPRINT') return 'BIWEEKLY'
  return isRecurrenceRule(cadence) ? cadence : null
}

// ─── Timing text ────────────────────────────────────────────────────────────

export interface ParsedTiming {
  time: string | null
  timeMode: 'BY' | 'AT' | null
  weekday: number | null
  ordinal: number | null
  dayOfMonth: number | null
}

const WEEKDAY_PATTERNS: Array<[RegExp, number]> = [
  [/\b(sundays?|sun)\b/i, 0],
  [/\b(mondays?|mon)\b/i, 1],
  [/\b(tuesdays?|tues|tue)\b/i, 2],
  [/\b(wednesdays?|wed)\b/i, 3],
  [/\b(thursdays?|thurs|thur|thu)\b/i, 4],
  [/\b(fridays?|fri)\b/i, 5],
  [/\b(saturdays?|sat)\b/i, 6],
]

const ORDINALS: Record<string, number> = {
  first: 1,
  '1st': 1,
  second: 2,
  '2nd': 2,
  third: 3,
  '3rd': 3,
  fourth: 4,
  '4th': 4,
  last: -1,
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function parseClock(text: string): string | null {
  const hm = text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(am|pm)?\b/i)
  if (hm) {
    let h = Number(hm[1])
    const m = Number(hm[2])
    const suffix = hm[3]?.toLowerCase()
    if (suffix === 'pm' && h < 12) h += 12
    if (suffix === 'am' && h === 12) h = 0
    return `${pad2(h)}:${pad2(m)}`
  }
  const h12 = text.match(/\b(1[0-2]|0?[1-9])\s*(am|pm)\b/i)
  if (h12) {
    let h = Number(h12[1])
    const suffix = h12[2].toLowerCase()
    if (suffix === 'pm' && h < 12) h += 12
    if (suffix === 'am' && h === 12) h = 0
    return `${pad2(h)}:00`
  }
  return null
}

export function parseTimingText(text: string | null | undefined): ParsedTiming {
  const out: ParsedTiming = { time: null, timeMode: null, weekday: null, ordinal: null, dayOfMonth: null }
  if (!text || !text.trim()) return out
  const t = text.trim()
  out.time = parseClock(t)
  if (out.time) out.timeMode = /\b(by|before|until|no later than|deadline)\b/i.test(t) ? 'BY' : 'AT'
  for (const [re, day] of WEEKDAY_PATTERNS) {
    if (re.test(t)) {
      out.weekday = day
      break
    }
  }
  if (out.weekday !== null) {
    const ord = t.match(/\b(first|1st|second|2nd|third|3rd|fourth|4th|last)\b/i)
    if (ord) out.ordinal = ORDINALS[ord[1].toLowerCase()] ?? null
  }
  if (/\b(month[- ]?end|end of (the )?month|last (working )?day)\b/i.test(t)) {
    out.dayOfMonth = 31
  } else if (out.weekday === null) {
    const dom = t.match(/\b([12]?\d|3[01])(st|nd|rd|th)\b/i) ?? t.match(/\bday\s+([12]?\d|3[01])\b/i)
    if (dom) {
      const n = Number(dom[1])
      if (n >= 1 && n <= 31) out.dayOfMonth = n
    }
  }
  return out
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function hhmmOf(minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, minutes))
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`
}

/** Planner slot: "By 10:00" with 30 min → 09:30–10:00; "Sat 9:00" with 90 min → 09:00–10:30. */
export function dutyPlannerTimes(timing: ParsedTiming, durationMin: number | null | undefined): { startTime: string | null; endTime: string | null } {
  if (!timing.time) return { startTime: null, endTime: null }
  const at = minutesOf(timing.time)
  const dur = typeof durationMin === 'number' && durationMin > 0 ? durationMin : null
  if (timing.timeMode === 'BY') return { startTime: dur ? hhmmOf(at - dur) : null, endTime: timing.time }
  return { startTime: timing.time, endTime: dur ? hhmmOf(at + dur) : null }
}

// ─── First occurrence ───────────────────────────────────────────────────────

function isWeekend(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6
}

function nextWorkingDayOnOrAfter(day: Date): Date {
  let d = atMidnight(day)
  while (isWeekend(d)) d = addDays(d, 1)
  return d
}

function weekdayOnOrAfter(day: Date, weekday: number): Date {
  const d = atMidnight(day)
  return addDays(d, (weekday - d.getDay() + 7) % 7)
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, ordinal: number): Date {
  if (ordinal === -1) {
    const last = new Date(year, month, daysInMonth(year, month))
    return addDays(last, -((last.getDay() - weekday + 7) % 7))
  }
  const first = weekdayOnOrAfter(new Date(year, month, 1), weekday)
  return addDays(first, (ordinal - 1) * 7)
}

function clampedDayOfMonth(year: number, month: number, day: number): Date {
  return new Date(year, month, Math.min(day, daysInMonth(year, month)))
}

/**
 * DUT-1: the due date of the head's first occurrence — from max(startsOn, today), using the
 * timing text when it parses, otherwise the next working day. Null for EVENT or past `endsOn`.
 */
export function firstDutyOccurrence(input: {
  cadence: DutyCadence
  startsOn?: Date | null
  endsOn?: Date | null
  timingText?: string | null
  now: Date
}): Date | null {
  const rule = cadenceToRecurrenceRule(input.cadence)
  if (!rule) return null
  const today = atMidnight(input.now)
  const start = input.startsOn ? atMidnight(input.startsOn) : null
  const floor = start && start > today ? start : today
  const timing = parseTimingText(input.timingText)

  let due: Date
  switch (input.cadence) {
    case 'EVERY_SPRINT': {
      if (timing.weekday !== null) {
        const current = sprintStartOnOrBefore(floor)
        const offset = (timing.weekday - current.getDay() + 7) % 7
        const inCurrent = addDays(current, offset)
        due = inCurrent >= floor ? inCurrent : addDays(inCurrent, SPRINT_LENGTH_DAYS)
      } else {
        due = sprintStartOnOrAfter(floor)
      }
      break
    }
    case 'DAILY':
      due = floor
      break
    case 'WEEKDAYS':
      due = nextWorkingDayOnOrAfter(floor)
      break
    case 'WEEKLY':
    case 'BIWEEKLY':
      due = timing.weekday !== null ? weekdayOnOrAfter(floor, timing.weekday) : nextWorkingDayOnOrAfter(floor)
      break
    case 'MONTHLY':
    case 'QUARTERLY':
    case 'SEMIANNUAL':
    case 'YEARLY': {
      const y = floor.getFullYear()
      const m = floor.getMonth()
      if (timing.weekday !== null && timing.ordinal !== null) {
        const here = nthWeekdayOfMonth(y, m, timing.weekday, timing.ordinal)
        due = here >= floor ? here : nthWeekdayOfMonth(y, m + 1, timing.weekday, timing.ordinal)
      } else if (timing.dayOfMonth !== null) {
        const here = clampedDayOfMonth(y, m, timing.dayOfMonth)
        due = here >= floor ? here : clampedDayOfMonth(y, m + 1, timing.dayOfMonth)
      } else if (timing.weekday !== null) {
        due = weekdayOnOrAfter(floor, timing.weekday)
      } else {
        due = nextWorkingDayOnOrAfter(floor)
      }
      break
    }
    default:
      return null
  }
  if (input.endsOn && due > atMidnight(input.endsOn)) return null
  return due
}

/** Everything the duty's Todo recurrence head needs (DUT-1), or null when the duty gets no head. */
export interface DutyHeadPlan {
  rule: RecurrenceRule
  dueDate: Date
  anchorDay: number | null
  startTime: string | null
  endTime: string | null
  description: string | null
}

export function dutyHeadPlan(input: {
  cadence: DutyCadence
  autoTask: boolean
  startsOn: Date | null
  endsOn: Date | null
  timingText: string | null
  durationMin: number | null
  outputText: string | null
  eventLabel: string | null
  now: Date
}): DutyHeadPlan | null {
  const rule = cadenceToRecurrenceRule(input.cadence)
  if (!rule || !input.autoTask) return null
  const due = firstDutyOccurrence(input)
  if (!due) return null
  const times = dutyPlannerTimes(parseTimingText(input.timingText), input.durationMin)
  return {
    rule,
    dueDate: due,
    anchorDay: anchorDayForDue(rule, due),
    startTime: times.startTime,
    endTime: times.endTime,
    description: dutyCardDescription(input),
  }
}

/** "30 min", "1 h", "1 h 30 min". */
export function formatDuration(minutes: number | null | undefined): string | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** The duties service's default card text (kept identical so later edits recognise it as generated). */
export function dutyCardDescription(duty: {
  outputText?: string | null
  durationMin?: number | null
  timingText?: string | null
  eventLabel?: string | null
}): string | null {
  const lines: string[] = ['Recurring duty.']
  if (duty.eventLabel) lines.push(`Occurs ${duty.eventLabel}.`)
  if (duty.timingText) lines.push(`Timing: ${duty.timingText}`)
  const duration = formatDuration(duty.durationMin)
  if (duration) lines.push(`Duration: ${duration}`)
  if (duty.outputText) lines.push(`Output: ${duty.outputText}`)
  return lines.length > 1 ? lines.join('\n') : null
}
