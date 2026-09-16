/**
 * Timezone-correct schedule evaluation for AI Automations.
 * Spec: docs/AI_Automations_Requirements_v1.0.md §5.
 *
 * Pure functions only — no Prisma, no I/O — so the whole engine is unit-testable
 * and the tick can call it without a transaction. Anything that needs the
 * database (fiscal quarter boundaries, org holidays) is injected by the caller.
 *
 * Two rules that drive the design:
 *   1. Slots are wall-clock rules in the automation's own timezone, so `nextRunAt`
 *      is always recomputed from the rule — never by adding a fixed millisecond
 *      delta, which silently drifts across DST.
 *   2. `scheduledFor` is the *nominal* slot, never the actual start. That is what
 *      makes @@unique([automationId, scheduledFor]) an exactly-once guarantee.
 */

import type {
  CatchUpPolicy,
  ScheduleSpec,
  Weekday,
} from '@/types/automations'
import {
  DEFAULT_CATCH_UP_WINDOW_MINUTES,
  DEFAULT_JITTER_SECONDS,
  WEEKDAYS,
} from '@/types/automations'

// ---------------------------------------------------------------------------
// Timezone primitives
// ---------------------------------------------------------------------------

export interface ZonedParts {
  year: number
  month: number // 1-12
  day: number // 1-31
  hour: number
  minute: number
  second: number
}

const partsCache = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsCache.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsCache.set(timeZone, fmt)
  }
  return fmt
}

/** Wall-clock parts of `instant` as seen in `timeZone`. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant)
  const read = (type: string): number => {
    const found = parts.find((p) => p.type === type)
    return found ? Number(found.value) : 0
  }
  // Intl renders midnight as hour 24 in some ICU versions; normalise to 0.
  const hour = read('hour') % 24
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour,
    minute: read('minute'),
    second: read('second'),
  }
}

/** Offset (ms) that `timeZone` is ahead of UTC at the given instant. */
function offsetMsAt(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asIfUtc - instant.getTime()
}

/**
 * The UTC instant at which the given wall-clock time occurs in `timeZone`.
 * Two-pass so DST transitions resolve correctly: the first pass guesses the
 * offset from the naive instant, the second corrects it using the offset that
 * actually applies at the candidate instant.
 */
export function utcFromZoned(
  parts: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timeZone: string
): Date {
  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0
  )
  let ts = naive - offsetMsAt(new Date(naive), timeZone)
  ts = naive - offsetMsAt(new Date(ts), timeZone)
  return new Date(ts)
}

// ---------------------------------------------------------------------------
// Calendar helpers (locale-free — arithmetic on a UTC proxy date)
// ---------------------------------------------------------------------------

/** 0 = Sunday. Computed from the calendar date, independent of any timezone. */
export function weekdayIndexOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function weekdayOf(year: number, month: number, day: number): Weekday {
  return WEEKDAYS[weekdayIndexOf(year, month, day)]
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function isWeekend(year: number, month: number, day: number): boolean {
  const idx = weekdayIndexOf(year, month, day)
  return idx === 0 || idx === 6
}

/** Last Mon–Fri of the month. */
export function lastBusinessDayOf(year: number, month: number): number {
  let day = daysInMonth(year, month)
  while (isWeekend(year, month, day)) day--
  return day
}

/** Day-of-month for the nth occurrence of a weekday; nth = -1 means the last. */
export function nthWeekdayOf(year: number, month: number, nth: number, weekday: Weekday): number | null {
  const target = WEEKDAYS.indexOf(weekday)
  if (target < 0) return null
  const total = daysInMonth(year, month)

  if (nth === -1) {
    for (let day = total; day >= 1; day--) {
      if (weekdayIndexOf(year, month, day) === target) return day
    }
    return null
  }

  let seen = 0
  for (let day = 1; day <= total; day++) {
    if (weekdayIndexOf(year, month, day) === target) {
      seen++
      if (seen === nth) return day
    }
  }
  return null
}

function isoDateOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Advance a Y/M/D triple by one calendar day. */
function nextCalendarDay(d: { year: number; month: number; day: number }) {
  const total = daysInMonth(d.year, d.month)
  if (d.day < total) return { year: d.year, month: d.month, day: d.day + 1 }
  if (d.month < 12) return { year: d.year, month: d.month + 1, day: 1 }
  return { year: d.year + 1, month: 1, day: 1 }
}

// ---------------------------------------------------------------------------
// Cron (5-field, evaluated in the automation's timezone)
// ---------------------------------------------------------------------------

export interface ParsedCron {
  minutes: number[]
  hours: number[]
  daysOfMonth: number[]
  months: number[]
  daysOfWeek: number[]
  /** Cron semantics: when both dom and dow are restricted, a day matching EITHER runs. */
  domRestricted: boolean
  dowRestricted: boolean
}

function expandCronField(field: string, min: number, max: number): number[] {
  const out = new Set<number>()
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/')
    const step = stepPart ? Number(stepPart) : 1
    if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid cron step in "${field}"`)

    let start: number
    let end: number
    if (rangePart === '*') {
      start = min
      end = max
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-').map(Number)
      start = a
      end = b
    } else {
      start = Number(rangePart)
      end = Number(rangePart)
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || end > max || start > end) {
      throw new Error(`Invalid cron range "${part}" (expected ${min}-${max})`)
    }
    for (let v = start; v <= end; v += step) out.add(v)
  }
  return Array.from(out).sort((a, b) => a - b)
}

export function parseCron(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) {
    throw new Error(`Cron must have 5 fields (minute hour day-of-month month day-of-week), got ${fields.length}`)
  }
  const [min, hr, dom, mon, dow] = fields
  return {
    minutes: expandCronField(min, 0, 59),
    hours: expandCronField(hr, 0, 23),
    daysOfMonth: expandCronField(dom, 1, 31),
    months: expandCronField(mon, 1, 12),
    // Accept 7 as Sunday, normalising onto 0.
    daysOfWeek: expandCronField(dow, 0, 7).map((d) => (d === 7 ? 0 : d)),
    domRestricted: dom !== '*',
    dowRestricted: dow !== '*',
  }
}

// ---------------------------------------------------------------------------
// Next-run computation
// ---------------------------------------------------------------------------

export interface NextRunOptions {
  /**
   * Quarter end dates for `quarterSource: 'FISCAL'`, injected by the caller from
   * the Timeframe model. Ignored for CALENDAR quarters.
   */
  fiscalQuarterEnds?: Date[]
  /** ISO YYYY-MM-DD dates to skip when `skipHolidays` is set. */
  holidays?: string[]
  /** Safety bound on the calendar-day scan. */
  maxLookaheadDays?: number
}

function parseHhMm(value: string | undefined, fallback: { hour: number; minute: number }) {
  if (!value) return fallback
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return fallback
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return fallback
  return { hour, minute }
}

/** Candidate wall-clock times for a matching day, ascending. */
function timesForDay(spec: ScheduleSpec, cron: ParsedCron | null): Array<{ hour: number; minute: number }> {
  if (spec.kind === 'CUSTOM_CRON' && cron) {
    const out: Array<{ hour: number; minute: number }> = []
    for (const hour of cron.hours) {
      for (const minute of cron.minutes) out.push({ hour, minute })
    }
    return out
  }

  if (spec.kind === 'HOURLY') {
    const minute = spec.minute ?? 0
    const start = parseHhMm(spec.activeWindowStart, { hour: 0, minute: 0 })
    const end = parseHhMm(spec.activeWindowEnd, { hour: 23, minute: 59 })
    const out: Array<{ hour: number; minute: number }> = []
    for (let hour = 0; hour < 24; hour++) {
      const afterStart = hour > start.hour || (hour === start.hour && minute >= start.minute)
      const beforeEnd = hour < end.hour || (hour === end.hour && minute <= end.minute)
      if (afterStart && beforeEnd) out.push({ hour, minute })
    }
    return out
  }

  const at = parseHhMm(spec.atTime, { hour: 8, minute: 0 })
  return [at]
}

/** Does this calendar day satisfy the schedule's day rule? */
function dayMatches(
  spec: ScheduleSpec,
  date: { year: number; month: number; day: number },
  cron: ParsedCron | null,
  options: NextRunOptions
): boolean {
  const { year, month, day } = date

  if (spec.skipHolidays && options.holidays?.includes(isoDateOf(year, month, day))) return false

  switch (spec.kind) {
    case 'ONCE':
      return true

    case 'HOURLY':
    case 'DAILY':
      return !spec.weekdaysOnly || !isWeekend(year, month, day)

    case 'WEEKLY': {
      const days = spec.byDay?.length ? spec.byDay : ['MON' as Weekday]
      return days.includes(weekdayOf(year, month, day))
    }

    case 'MONTHLY': {
      if (spec.lastBusinessDay) return day === lastBusinessDayOf(year, month)
      if (spec.nthWeekday) return day === nthWeekdayOf(year, month, spec.nthWeekday.nth, spec.nthWeekday.day)
      // A requested day past the end of a short month clamps to the last day
      // rather than skipping the month entirely — "the 31st" means month-end.
      const wanted = Math.min(spec.dayOfMonth ?? 1, daysInMonth(year, month))
      return day === wanted
    }

    case 'QUARTERLY': {
      const offset = spec.quarterOffset ?? 'LAST_DAY'
      if (spec.quarterSource === 'FISCAL') {
        const ends = options.fiscalQuarterEnds ?? []
        return ends.some((end) => {
          const target = quarterTargetDay(end, offset, spec.quarterOffsetDays ?? 0)
          return target.year === year && target.month === month && target.day === day
        })
      }
      const quarterMonths = offset === 'FIRST_DAY' ? [1, 4, 7, 10] : [3, 6, 9, 12]
      if (!quarterMonths.includes(month)) {
        // N_DAYS_BEFORE_END can land in the preceding month; handle via date math.
        if (offset !== 'N_DAYS_BEFORE_END') return false
        return calendarQuarterOffsetMatches(year, month, day, spec.quarterOffsetDays ?? 0)
      }
      if (offset === 'FIRST_DAY') return day === 1
      if (offset === 'LAST_DAY') return day === daysInMonth(year, month)
      return calendarQuarterOffsetMatches(year, month, day, spec.quarterOffsetDays ?? 0)
    }

    case 'YEARLY': {
      const wantedMonth = spec.month ?? 1
      const wantedDay = Math.min(spec.day ?? 1, daysInMonth(year, wantedMonth))
      return month === wantedMonth && day === wantedDay
    }

    case 'CUSTOM_CRON': {
      if (!cron) return false
      if (!cron.months.includes(month)) return false
      const domHit = cron.daysOfMonth.includes(day)
      const dowHit = cron.daysOfWeek.includes(weekdayIndexOf(year, month, day))
      if (cron.domRestricted && cron.dowRestricted) return domHit || dowHit
      if (cron.domRestricted) return domHit
      if (cron.dowRestricted) return dowHit
      return true
    }
  }
}

function quarterTargetDay(end: Date, offset: string, offsetDays: number) {
  const base = new Date(end.getTime())
  if (offset === 'FIRST_DAY') {
    return { year: base.getUTCFullYear(), month: base.getUTCMonth() - 1, day: 1 }
  }
  if (offset === 'N_DAYS_BEFORE_END') {
    const shifted = new Date(base.getTime() - offsetDays * 86400000)
    return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() }
  }
  return { year: base.getUTCFullYear(), month: base.getUTCMonth() + 1, day: base.getUTCDate() }
}

function calendarQuarterOffsetMatches(year: number, month: number, day: number, offsetDays: number): boolean {
  for (const qMonth of [3, 6, 9, 12]) {
    const end = Date.UTC(year, qMonth - 1, daysInMonth(year, qMonth))
    const target = new Date(end - offsetDays * 86400000)
    if (
      target.getUTCFullYear() === year &&
      target.getUTCMonth() + 1 === month &&
      target.getUTCDate() === day
    ) {
      return true
    }
  }
  return false
}

/**
 * The first slot strictly after `after`, or null when the schedule has no further
 * occurrence (ONCE already fired, past `endDate`, or nothing matched inside the
 * lookahead bound).
 */
export function computeNextRunAt(
  spec: ScheduleSpec,
  after: Date,
  options: NextRunOptions = {}
): Date | null {
  const timeZone = spec.timezone || 'UTC'

  if (spec.kind === 'ONCE') {
    if (!spec.runAt) return null
    const at = new Date(spec.runAt)
    if (Number.isNaN(at.getTime())) return null
    return at.getTime() > after.getTime() ? at : null
  }

  const endBound = spec.endDate ? new Date(spec.endDate) : null
  const startBound = spec.startDate ? new Date(spec.startDate) : null
  const floor = startBound && startBound.getTime() > after.getTime() ? startBound : after

  let cron: ParsedCron | null = null
  if (spec.kind === 'CUSTOM_CRON') {
    if (!spec.cron) return null
    cron = parseCron(spec.cron)
  }

  const times = timesForDay(spec, cron)
  if (times.length === 0) return null

  const maxDays = options.maxLookaheadDays ?? 800
  let cursor = zonedParts(floor, timeZone)
  let date = { year: cursor.year, month: cursor.month, day: cursor.day }

  for (let i = 0; i < maxDays; i++) {
    if (dayMatches(spec, date, cron, options)) {
      for (const time of times) {
        const candidate = utcFromZoned({ ...date, hour: time.hour, minute: time.minute }, timeZone)
        if (candidate.getTime() <= floor.getTime()) continue
        if (endBound && candidate.getTime() > endBound.getTime()) return null
        return candidate
      }
    }
    date = nextCalendarDay(date)
  }

  return null
}

// ---------------------------------------------------------------------------
// Jitter
// ---------------------------------------------------------------------------

/**
 * Deterministic per-automation offset so 200 automations scheduled at 08:00 do
 * not all hit Odoo and the AI provider in the same second. Derived from the id
 * so a given automation's effective start time stays stable across ticks.
 */
export function jitterOffsetMs(automationId: string, maxJitterSeconds = DEFAULT_JITTER_SECONDS): number {
  if (maxJitterSeconds <= 0) return 0
  let hash = 0
  for (let i = 0; i < automationId.length; i++) {
    hash = (hash * 31 + automationId.charCodeAt(i)) >>> 0
  }
  return (hash % (maxJitterSeconds * 1000))
}

// ---------------------------------------------------------------------------
// Tick planning
// ---------------------------------------------------------------------------

export interface TickInput {
  id: string
  scheduleJson: ScheduleSpec
  nextRunAt: Date | null
  runCount?: number
}

export interface TickActions {
  /** Slots to enqueue as QUEUED runs. */
  enqueue: Date[]
  /** Slots that blew past the catch-up window — recorded as MISSED for visibility. */
  missed: Date[]
  /** The slot to persist as the automation's new nextRunAt. */
  nextRunAt: Date | null
  /** True when the automation has exhausted maxRuns / endDate and should end. */
  ended: boolean
}

/**
 * Decides what a single tick should do for one automation, without touching the
 * database. Catch-up semantics (spec §5.2):
 *
 *   SKIP             — a missed slot is lost; advance quietly.
 *   RUN_LATE         — fire missed slots inside the window; beyond it, record MISSED.
 *   RUN_ONCE_LATEST  — collapse a backlog into the single most recent slot.
 */
export function planTickActions(
  automation: TickInput,
  now: Date,
  options: NextRunOptions = {}
): TickActions {
  const spec = automation.scheduleJson
  const policy: CatchUpPolicy = spec.catchUpPolicy ?? 'SKIP'
  const windowMs = (spec.catchUpWindowMinutes ?? DEFAULT_CATCH_UP_WINDOW_MINUTES) * 60_000
  const jitter = jitterOffsetMs(automation.id, spec.jitterSeconds ?? DEFAULT_JITTER_SECONDS)

  const enqueue: Date[] = []
  const missed: Date[] = []

  let slot = automation.nextRunAt ?? computeNextRunAt(spec, now, options)
  let runs = automation.runCount ?? 0
  const maxRuns = spec.maxRuns ?? null
  let ended = false

  // Walk every slot that is already due. Bounded so a long outage plus a
  // per-minute schedule can't spin here.
  for (let guard = 0; guard < 500; guard++) {
    if (!slot) {
      ended = true
      break
    }
    // Jitter delays the *firing*, not the slot identity: scheduledFor stays nominal.
    if (slot.getTime() + jitter > now.getTime()) break

    if (maxRuns !== null && runs >= maxRuns) {
      ended = true
      break
    }

    const lateBy = now.getTime() - slot.getTime()
    if (lateBy <= windowMs) {
      enqueue.push(slot)
      runs++
    } else if (policy === 'RUN_LATE') {
      missed.push(slot)
    } else if (policy === 'RUN_ONCE_LATEST') {
      // Drop anything already queued from this backlog — only the latest survives.
      enqueue.length = 0
      enqueue.push(slot)
    }
    // SKIP: fall through silently.

    slot = computeNextRunAt(spec, slot, options)
  }

  if (policy === 'RUN_ONCE_LATEST' && enqueue.length > 1) {
    const latest = enqueue[enqueue.length - 1]
    enqueue.length = 0
    enqueue.push(latest)
  }

  return { enqueue, missed, nextRunAt: slot, ended }
}

/** Human-readable one-liner for list views ("Weekly on Mon at 07:00 (EAT)"). */
export function describeSchedule(spec: ScheduleSpec): string {
  const tz = spec.timezone || 'UTC'
  const at = spec.atTime ?? '08:00'
  switch (spec.kind) {
    case 'ONCE':
      return spec.runAt ? `Once at ${new Date(spec.runAt).toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'Once'
    case 'HOURLY': {
      const window =
        spec.activeWindowStart && spec.activeWindowEnd
          ? ` between ${spec.activeWindowStart}–${spec.activeWindowEnd}`
          : ''
      return `Hourly at :${String(spec.minute ?? 0).padStart(2, '0')}${window} (${tz})`
    }
    case 'DAILY':
      return `Daily at ${at}${spec.weekdaysOnly ? ' on weekdays' : ''} (${tz})`
    case 'WEEKLY':
      return `Weekly on ${(spec.byDay ?? ['MON']).join(', ')} at ${at} (${tz})`
    case 'MONTHLY': {
      if (spec.lastBusinessDay) return `Monthly on the last business day at ${at} (${tz})`
      if (spec.nthWeekday) {
        const nth = spec.nthWeekday.nth === -1 ? 'last' : `#${spec.nthWeekday.nth}`
        return `Monthly on the ${nth} ${spec.nthWeekday.day} at ${at} (${tz})`
      }
      return `Monthly on day ${spec.dayOfMonth ?? 1} at ${at} (${tz})`
    }
    case 'QUARTERLY': {
      const source = spec.quarterSource === 'FISCAL' ? 'fiscal quarter' : 'calendar quarter'
      const offset =
        spec.quarterOffset === 'FIRST_DAY'
          ? 'start'
          : spec.quarterOffset === 'N_DAYS_BEFORE_END'
            ? `${spec.quarterOffsetDays ?? 0} days before end`
            : 'end'
      return `Quarterly at ${source} ${offset}, ${at} (${tz})`
    }
    case 'YEARLY':
      return `Yearly on ${String(spec.month ?? 1).padStart(2, '0')}-${String(spec.day ?? 1).padStart(2, '0')} at ${at} (${tz})`
    case 'CUSTOM_CRON':
      return `Cron "${spec.cron ?? ''}" (${tz})`
  }
}
