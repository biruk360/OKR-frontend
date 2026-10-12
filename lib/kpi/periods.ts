/**
 * KPI reading periods (KPI-1) — pure, client-safe.
 *
 * A KPI's `frequency` decides its reading periods:
 *   - WEEKLY     Monday → Sunday
 *   - MONTHLY    calendar month
 *   - QUARTERLY  fiscal quarter, anchored on the month the KPI's timeframe starts
 *                (FY 2026/27 starts 1 July → Q1 = Jul–Sep, Q2 = Oct–Dec, …)
 *
 * Periods are date-only. Everything works on `YYYY-MM-DD` keys; the stored
 * `KpiReading.periodStart` is the first day at 00:00:00.000Z and `periodEnd`
 * the last day at 23:59:59.999Z (`periodStartDate` / `periodEndDate`). That
 * canonical periodStart is what `@@unique([kpiId, periodStart])` relies on, so
 * every writer (API, cron, importer) must bucket through this module.
 *
 * "Today" is a calendar date in the organisation's timezone (default
 * Africa/Addis_Ababa, the OrganizationSettings default) — see `dateKeyInZone`.
 */
import type { KpiFrequency } from '@/types/package'

/** Organisation default timezone (OrganizationSettings.timezone default). */
export const KPI_DEFAULT_TIMEZONE = 'Africa/Addis_Ababa'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export interface KpiPeriod {
  frequency: KpiFrequency
  /** First day, `YYYY-MM-DD`. */
  startKey: string
  /** Last day (inclusive), `YYYY-MM-DD`. */
  endKey: string
  /** Human label: "Week of 6 Oct 2026", "Oct 2026", "Q2 FY26/27". */
  label: string
}

export interface KpiPeriodOptions {
  /**
   * Month (0–11) the fiscal year starts in. Only QUARTERLY uses it. Derive it
   * from the KPI's timeframe with `fiscalStartMonthOf(timeframe.startDate)`.
   * Defaults to 0 (calendar quarters).
   */
  fiscalStartMonth?: number
}

// ---------------------------------------------------------------------------
// Date-key helpers
// ---------------------------------------------------------------------------

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_KEY_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

function keyToMs(key: string): number {
  return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)))
}

function msToKey(ms: number): string {
  // Floor to the UTC day first so a timestamp keeps its UTC date.
  return new Date(Math.floor(ms / MS_PER_DAY) * MS_PER_DAY).toISOString().slice(0, 10)
}

/** `YYYY-MM-DD` + n days. */
export function addDaysToKey(key: string, days: number): string {
  return msToKey(keyToMs(key) + days * MS_PER_DAY)
}

/** Compare two date keys: negative, 0, positive. */
export function compareDateKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** The calendar date of `date` in `timeZone`, as `YYYY-MM-DD`. */
export function dateKeyInZone(date: Date, timeZone: string = KPI_DEFAULT_TIMEZONE): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    return `${get('year')}-${get('month')}-${get('day')}`
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

/**
 * The UTC date key of a stored period boundary (periodStart / periodEnd are
 * written at UTC day boundaries, so the UTC date is the period date).
 */
export function storedDateKey(value: Date | string): string {
  if (typeof value === 'string') return isDateKey(value) ? value : new Date(value).toISOString().slice(0, 10)
  return value.toISOString().slice(0, 10)
}

/** Stored `periodStart`: first day 00:00:00.000Z. */
export function periodStartDate(startKey: string): Date {
  return new Date(`${startKey}T00:00:00.000Z`)
}

/** Stored `periodEnd`: last day 23:59:59.999Z. */
export function periodEndDate(endKey: string): Date {
  return new Date(`${endKey}T23:59:59.999Z`)
}

/**
 * Timeframe boundaries as date keys. Timeframes are stored at UTC day edges
 * (start 00:00Z, end 00:00Z or 23:59:59Z), so the end is its UTC date. The
 * start is read 12 hours later, so a start saved as local midnight in a
 * UTC+ zone (e.g. 2026-06-30T21:00Z for 1 July in Addis Ababa) still lands on
 * the intended day.
 */
export function timeframeWindowKeys(
  startDate: Date | string,
  endDate: Date | string,
): { startKey: string; endKey: string } {
  const start = new Date(startDate)
  const end = new Date(endDate)
  return {
    startKey: Number.isNaN(start.getTime()) ? '1970-01-01' : msToKey(start.getTime() + 12 * 60 * 60 * 1000),
    endKey: Number.isNaN(end.getTime()) ? '1970-01-01' : msToKey(end.getTime()),
  }
}

/** Fiscal-year start month (0–11) from the timeframe's start date (see timeframeWindowKeys). */
export function fiscalStartMonthOf(timeframeStart: Date | string): number {
  const date = new Date(timeframeStart)
  if (Number.isNaN(date.getTime())) return 0
  return new Date(date.getTime() + 12 * 60 * 60 * 1000).getUTCMonth()
}

function normalizeFiscalStartMonth(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0
  return ((Math.trunc(value) % 12) + 12) % 12
}

function formatDay(key: string): string {
  return `${Number(key.slice(8, 10))} ${MONTHS_SHORT[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
}

/** "6 Oct 2026". */
export function formatDateKey(key: string): string {
  return isDateKey(key) ? formatDay(key) : key
}

function monthStartKey(year: number, month0: number): string {
  return msToKey(Date.UTC(year, month0, 1))
}

/** Last day of the month that is `months` after (year, month0). */
function monthEndKey(year: number, month0: number, months = 1): string {
  return msToKey(Date.UTC(year, month0 + months, 1) - MS_PER_DAY)
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

export interface FiscalQuarter {
  /** 1–4 within the fiscal year. */
  quarter: number
  /** Calendar year the fiscal year starts in. */
  fiscalYearStart: number
  startKey: string
  endKey: string
  label: string
}

/** The fiscal quarter containing `dateKey`. */
export function fiscalQuarterOf(dateKey: string, fiscalStartMonth = 0): FiscalQuarter {
  const fsm = normalizeFiscalStartMonth(fiscalStartMonth)
  const year = Number(dateKey.slice(0, 4))
  const month0 = Number(dateKey.slice(5, 7)) - 1
  const offset = (month0 - fsm + 12) % 12
  const qIndex = Math.floor(offset / 3)
  const startMonth = (fsm + qIndex * 3) % 12
  const startYear = startMonth > month0 ? year - 1 : year
  const fiscalYearStart = startMonth >= fsm ? startYear : startYear - 1
  const quarter = qIndex + 1
  const label =
    fsm === 0
      ? `Q${quarter} ${fiscalYearStart}`
      : `Q${quarter} FY${String(fiscalYearStart % 100).padStart(2, '0')}/${String((fiscalYearStart + 1) % 100).padStart(2, '0')}`
  return {
    quarter,
    fiscalYearStart,
    startKey: monthStartKey(startYear, startMonth),
    endKey: monthEndKey(startYear, startMonth, 3),
    label,
  }
}

/** The reading period of `frequency` that contains `dateKey`. */
export function kpiPeriodForKey(frequency: KpiFrequency, dateKey: string, opts: KpiPeriodOptions = {}): KpiPeriod {
  switch (frequency) {
    case 'WEEKLY': {
      const dow = new Date(keyToMs(dateKey)).getUTCDay() // 0 = Sunday
      const startKey = addDaysToKey(dateKey, -((dow + 6) % 7))
      return { frequency, startKey, endKey: addDaysToKey(startKey, 6), label: `Week of ${formatDay(startKey)}` }
    }
    case 'MONTHLY': {
      const year = Number(dateKey.slice(0, 4))
      const month0 = Number(dateKey.slice(5, 7)) - 1
      return {
        frequency,
        startKey: monthStartKey(year, month0),
        endKey: monthEndKey(year, month0),
        label: `${MONTHS_SHORT[month0]} ${year}`,
      }
    }
    case 'QUARTERLY':
    default: {
      const q = fiscalQuarterOf(dateKey, opts.fiscalStartMonth)
      return { frequency: 'QUARTERLY', startKey: q.startKey, endKey: q.endKey, label: q.label }
    }
  }
}

/** The reading period containing `date` (a Date read in `timeZone`, or a date key). */
export function kpiPeriodFor(
  frequency: KpiFrequency,
  date: Date | string,
  opts: KpiPeriodOptions & { timeZone?: string } = {},
): KpiPeriod {
  const key = typeof date === 'string' && isDateKey(date) ? date : dateKeyInZone(new Date(date), opts.timeZone)
  return kpiPeriodForKey(frequency, key, opts)
}

/** The period of a stored reading (by its periodStart). */
export function kpiPeriodOfReading(
  frequency: KpiFrequency,
  periodStart: Date | string,
  opts: KpiPeriodOptions = {},
): KpiPeriod {
  return kpiPeriodForKey(frequency, storedDateKey(periodStart), opts)
}

export function nextKpiPeriod(period: KpiPeriod, opts: KpiPeriodOptions = {}): KpiPeriod {
  return kpiPeriodForKey(period.frequency, addDaysToKey(period.endKey, 1), opts)
}

export function previousKpiPeriod(period: KpiPeriod, opts: KpiPeriodOptions = {}): KpiPeriod {
  return kpiPeriodForKey(period.frequency, addDaysToKey(period.startKey, -1), opts)
}

/**
 * Every period of `frequency` that overlaps `[fromKey, toKey]`, oldest first.
 * Capped at `limit` periods (default 600 — ten years of weeks).
 */
export function listKpiPeriods(
  frequency: KpiFrequency,
  fromKey: string,
  toKey: string,
  opts: KpiPeriodOptions & { limit?: number } = {},
): KpiPeriod[] {
  if (compareDateKeys(fromKey, toKey) > 0) return []
  const limit = opts.limit ?? 600
  const out: KpiPeriod[] = []
  let period = kpiPeriodForKey(frequency, fromKey, opts)
  while (compareDateKeys(period.startKey, toKey) <= 0 && out.length < limit) {
    out.push(period)
    period = nextKpiPeriod(period, opts)
  }
  return out
}

/** True when the period's last day is before `todayKey`. */
export function isPeriodEnded(period: Pick<KpiPeriod, 'endKey'>, todayKey: string): boolean {
  return compareDateKeys(period.endKey, todayKey) < 0
}
