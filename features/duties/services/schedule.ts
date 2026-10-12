/**
 * Recurring duties — cadence → Todo recurrence mapping and first-due maths
 * (DUT-1, DUT-2, DUT-3, DUT-4).
 *
 * Pure and client-safe: no DB and no `Date.now()` (`now` is always injected),
 * matching lib/todos/recurrence.ts, whose day maths (local midnight, month-end
 * clamping, anchor days) this module reuses rather than re-implements.
 *
 * A duty is a *definition* (decision D3). When it has `autoTask` and a calendar
 * cadence it owns one Todo recurrence head; the existing generator
 * (lib/todos/recurrence-generator.ts) then creates the occurrences. EVENT
 * cadences never get a head — the owner logs each occurrence by hand (DUT-3).
 */
import { addDays, differenceInCalendarDays } from 'date-fns'
import { isRecurrenceRule, nextOccurrence, previousOccurrence, type RecurrenceRule } from '@/lib/todos/recurrence'
import { isDutyCadence, type DutyCadence } from '@/types/package'

// ---------------------------------------------------------------------------
// Sprint calendar (DUT-2)
// ---------------------------------------------------------------------------

/**
 * First day of the company-wide two-week sprint calendar: S1 starts Monday
 * 12 Oct 2026 (spec DUT-2, assumption [A]). Local midnight, like every date the
 * recurrence engine produces.
 */
export const SPRINT_CALENDAR_START_ISO = '2026-10-12'
export const SPRINT_LENGTH_DAYS = 14

export function sprintCalendarStart(): Date {
  return new Date(2026, 9, 12)
}

/** Local-midnight copy of a date. */
export function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** The start of the sprint that contains `day` (on the fixed company calendar). */
export function sprintStartOnOrBefore(day: Date): Date {
  const start = sprintCalendarStart()
  const diff = differenceInCalendarDays(atMidnight(day), start)
  const k = Math.floor(diff / SPRINT_LENGTH_DAYS)
  return addDays(start, k * SPRINT_LENGTH_DAYS)
}

/** The first sprint start on or after `day`. */
export function sprintStartOnOrAfter(day: Date): Date {
  const start = sprintCalendarStart()
  const diff = differenceInCalendarDays(atMidnight(day), start)
  const k = Math.ceil(diff / SPRINT_LENGTH_DAYS)
  return addDays(start, k * SPRINT_LENGTH_DAYS)
}

/** 1-based sprint number on the company calendar (S1 = the sprint starting 12 Oct 2026). */
export function sprintNumberFor(day: Date): number {
  const diff = differenceInCalendarDays(atMidnight(day), sprintCalendarStart())
  return Math.floor(diff / SPRINT_LENGTH_DAYS) + 1
}

// ---------------------------------------------------------------------------
// Cadence → recurrence rule (DUT-1, DUT-2, DUT-3)
// ---------------------------------------------------------------------------

/**
 * The Todo `recurrenceRule` a cadence maps to. Calendar cadences map 1:1
 * (QUARTERLY / SEMIANNUAL come from FND-5); EVERY_SPRINT is BIWEEKLY anchored on
 * a sprint start; EVENT has no rule (null) and never creates a head.
 */
export function cadenceToRecurrenceRule(cadence: string | null | undefined): RecurrenceRule | null {
  if (!isDutyCadence(cadence)) return null
  if (cadence === 'EVENT') return null
  if (cadence === 'EVERY_SPRINT') return 'BIWEEKLY'
  return isRecurrenceRule(cadence) ? cadence : null
}

/** True for every cadence the recurrence engine can generate on its own (all but EVENT). */
export function isCalendarCadence(cadence: string | null | undefined): boolean {
  return cadenceToRecurrenceRule(cadence) !== null
}

/** Whether a duty with these settings owns a Todo recurrence head (DUT-1 / DUT-3). */
export function dutyWantsHead(duty: { cadence: string; autoTask: boolean; status?: string | null }): boolean {
  if (duty.status === 'RETIRED') return false
  return duty.autoTask && isCalendarCadence(duty.cadence)
}

// ---------------------------------------------------------------------------
// Timing text parsing ("By 10:00", "First Saturday", "15th", "Month end")
// ---------------------------------------------------------------------------

export interface ParsedTiming {
  /** "HH:mm" (24h) when the text names a clock time. */
  time: string | null
  /** BY = a deadline ("By 10:00", "before 9am"); AT = a start / fixed slot. */
  timeMode: 'BY' | 'AT' | null
  /** 0 (Sunday) … 6 (Saturday). */
  weekday: number | null
  /** 1…4 for "first"…"fourth", -1 for "last" — combined with `weekday`. */
  ordinal: number | null
  /** 1…31; 31 also stands for "last day / month end" (clamps in short months). */
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

const EMPTY_TIMING: ParsedTiming = { time: null, timeMode: null, weekday: null, ordinal: null, dayOfMonth: null }

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function parseClock(text: string): string | null {
  // 24h or 12h with minutes: "10:00", "9.30", "2:15 pm"
  const hm = text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(am|pm)?\b/i)
  if (hm) {
    let h = Number(hm[1])
    const m = Number(hm[2])
    const suffix = hm[3]?.toLowerCase()
    if (suffix === 'pm' && h < 12) h += 12
    if (suffix === 'am' && h === 12) h = 0
    return `${pad2(h)}:${pad2(m)}`
  }
  // Hour only with am/pm: "9am", "5 pm"
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

/** Best-effort parse of the workbook "Timing" column. Unknown text yields all-null fields. */
export function parseTimingText(text: string | null | undefined): ParsedTiming {
  if (!text || !text.trim()) return { ...EMPTY_TIMING }
  const t = text.trim()
  const out: ParsedTiming = { ...EMPTY_TIMING }

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

/**
 * The planner slot (`Todo.startTime` / `endTime`, "HH:mm") for a duty card.
 * "By 10:00" with 30 min → 09:30–10:00; "Fixed slot 09:00" with 60 min → 09:00–10:00.
 * Without a parsed time the card is all-day (both null).
 */
export function dutyPlannerTimes(
  timing: ParsedTiming,
  durationMin: number | null | undefined,
): { startTime: string | null; endTime: string | null } {
  if (!timing.time) return { startTime: null, endTime: null }
  const at = minutesOf(timing.time)
  const dur = typeof durationMin === 'number' && durationMin > 0 ? durationMin : null
  if (timing.timeMode === 'BY') {
    return { startTime: dur ? hhmmOf(at - dur) : null, endTime: timing.time }
  }
  return { startTime: timing.time, endTime: dur ? hhmmOf(at + dur) : null }
}

// ---------------------------------------------------------------------------
// First / next occurrence (DUT-1, DUT-4)
// ---------------------------------------------------------------------------

function isWeekend(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6
}

/** `day` itself when it is Mon–Fri, otherwise the following Monday. */
export function nextWorkingDayOnOrAfter(day: Date): Date {
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

/** The n-th (1…4) or last (-1) given weekday of a month. */
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

export interface FirstOccurrenceInput {
  cadence: string
  startsOn?: Date | null
  endsOn?: Date | null
  timingText?: string | null
  now: Date
}

/**
 * DUT-1: the due date of the first occurrence a new (or re-scheduled) head gets.
 *
 * The floor is `startsOn` when it is in the future, otherwise today — a head is
 * never created in the past (no backfill). From the floor:
 *  - EVERY_SPRINT: the next sprint start (or, when the timing names a weekday,
 *    that weekday inside the current sprint if still ahead, else the next one);
 *  - DAILY: the floor; WEEKDAYS: the next Mon–Fri;
 *  - WEEKLY / BIWEEKLY: the named weekday on or after the floor;
 *  - MONTHLY / QUARTERLY / SEMIANNUAL / YEARLY: "First Saturday" style ordinals
 *    or a day of month ("15th", "Month end") in the floor's month, else the next;
 *  - otherwise (timing not parseable): the next working day.
 * Returns null for EVENT cadences or when the first date would fall after `endsOn`.
 */
export function firstDutyOccurrence(input: FirstOccurrenceInput): Date | null {
  const rule = cadenceToRecurrenceRule(input.cadence)
  if (!rule) return null
  const today = atMidnight(input.now)
  const start = input.startsOn ? atMidnight(input.startsOn) : null
  const floor = start && start > today ? start : today
  const timing = parseTimingText(input.timingText)
  const cadence = input.cadence as DutyCadence

  let due: Date
  switch (cadence) {
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

/**
 * DUT-4 resume: step a head's cursor forward with its own rule until it is on
 * or after today, so a paused series restarts at the next future occurrence and
 * never back-fills the paused weeks. Returns `from` unchanged when it is already
 * today or later, and null when the next date falls after `endsOn`.
 */
export function nextFutureOccurrence(
  rule: string | null | undefined,
  from: Date,
  now: Date,
  opts: { anchorDay?: number | null; endsOn?: Date | null } = {},
): Date | null {
  if (!isRecurrenceRule(rule) || Number.isNaN(from.getTime())) return null
  const today = atMidnight(now)
  let cursor = atMidnight(from)
  // Bounded: a daily series paused for years is still < 4000 steps.
  for (let i = 0; cursor < today && i < 4000; i++) {
    const next = nextOccurrence(rule, cursor, opts.anchorDay ?? null)
    if (!next) return null
    cursor = next
  }
  if (cursor < today) return null
  if (opts.endsOn && cursor > atMidnight(opts.endsOn)) return null
  return cursor
}

/**
 * Where to put a head's `dueDate` (the generator's series cursor) so that the
 * next card the series shows is due on `target`, and nothing earlier is
 * generated (DUT-4: no backfill).
 *
 *  - A head that is still open and has never spawned an occurrence *is* the
 *    first card: it moves to `target` itself.
 *  - Otherwise (the head is done, or it has advanced and only mirrors the
 *    newest occurrence) the cursor goes one step before `target`, so the
 *    generator creates the `target` card on its normal horizon. When the cursor
 *    already sits on `target` (that card exists) it stays where it is.
 */
export function planHeadCursor(input: {
  rule: string
  target: Date
  headOpen: boolean
  headHasChildren: boolean
  currentDue: Date | null
  anchorDay?: number | null
}): Date {
  if (input.headOpen && !input.headHasChildren) return input.target
  if (input.currentDue && atMidnight(input.currentDue).getTime() === input.target.getTime()) return input.currentDue
  return previousOccurrence(input.rule, input.target, input.anchorDay ?? null) ?? input.target
}

/**
 * The default description written on a duty's cards: output, duration and
 * timing in one line each. Kept in sync on edit only while the card still
 * carries the generated text (a user's own edits are never overwritten).
 */
export function dutyCardDescription(duty: {
  outputText?: string | null
  durationMin?: number | null
  timingText?: string | null
  eventLabel?: string | null
}): string | null {
  const lines: string[] = ['Recurring duty.']
  if (duty.eventLabel) lines.push(`Occurs ${duty.eventLabel}.`)
  if (duty.timingText) lines.push(`Timing: ${duty.timingText}`)
  if (typeof duty.durationMin === 'number' && duty.durationMin > 0) lines.push(`Duration: ${formatDuration(duty.durationMin)}`)
  if (duty.outputText) lines.push(`Output: ${duty.outputText}`)
  return lines.length > 1 ? lines.join('\n') : null
}

/** "30 min", "1 h", "1 h 30 min". */
export function formatDuration(minutes: number | null | undefined): string | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Parse "YYYY-MM-DD" as a local-midnight date; full ISO strings parse as-is. Invalid → null. */
export function parseDutyDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return d.getMonth() === Number(m[2]) - 1 ? d : null
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Local "YYYY-MM-DD" of a date (inverse of parseDutyDate). */
export function toDutyDateKey(d: Date | null | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
