/**
 * KPI card figures (KPI-4, KPI-5) — pure, client-safe.
 *
 *   - sparkline of the last 12 numeric readings
 *   - quarter-to-date average (fiscal quarter of the KPI's timeframe)
 *   - overdue readings: a period that ended more than 3 working days ago
 *     without a reading (KPI-5). Working days skip Sat/Sun and the given holidays
 *     (lib/projects/business-days).
 *   - health counts for the profile summary (G / A / R / not scored)
 */
import { businessDaysBetween } from '@/lib/projects/business-days'
import type { KpiFrequency, KpiRag } from '@/types/package'
import {
  compareDateKeys,
  fiscalQuarterOf,
  listKpiPeriods,
  storedDateKey,
  type FiscalQuarter,
  type KpiPeriod,
  type KpiPeriodOptions,
} from './periods'

/** KPI-5: grace period, in working days after the period ends. */
export const KPI_READING_GRACE_WORKING_DAYS = 3
/** KPI-4: sparkline length. */
export const KPI_SPARKLINE_POINTS = 12

export interface KpiReadingLike {
  periodStart: Date | string
  value: number | null
  rag?: string | null
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function byPeriodAsc<T extends KpiReadingLike>(readings: readonly T[]): T[] {
  return [...readings].sort((a, b) => compareDateKeys(storedDateKey(a.periodStart), storedDateKey(b.periodStart)))
}

/** Latest reading by period (not by entry time). */
export function latestReading<T extends KpiReadingLike>(readings: readonly T[]): T | null {
  const sorted = byPeriodAsc(readings)
  return sorted.length ? sorted[sorted.length - 1] : null
}

/** KPI-4: numeric values of the last `points` readings that have one, oldest first. */
export function sparklineSeries(readings: readonly KpiReadingLike[], points = KPI_SPARKLINE_POINTS): number[] {
  const values = byPeriodAsc(readings)
    .map((r) => r.value)
    .filter(finite)
  return values.slice(Math.max(0, values.length - points))
}

export interface ReadingAverage {
  average: number
  count: number
}

/** Average of numeric readings whose period starts within `[fromKey, toKey]`; null when none. */
export function averageReadingsInRange(
  readings: readonly KpiReadingLike[],
  fromKey: string,
  toKey: string,
): ReadingAverage | null {
  let sum = 0
  let count = 0
  for (const r of readings) {
    if (!finite(r.value)) continue
    const key = storedDateKey(r.periodStart)
    if (compareDateKeys(key, fromKey) < 0 || compareDateKeys(key, toKey) > 0) continue
    sum += r.value
    count += 1
  }
  return count ? { average: sum / count, count } : null
}

export interface QuarterToDateAverage extends ReadingAverage {
  quarter: FiscalQuarter
}

/**
 * KPI-4: quarter-to-date average — numeric readings for periods starting in the
 * current fiscal quarter, up to today. Null when the quarter has no reading yet.
 */
export function quarterToDateAverage(
  readings: readonly KpiReadingLike[],
  todayKey: string,
  fiscalStartMonth = 0,
): QuarterToDateAverage | null {
  const quarter = fiscalQuarterOf(todayKey, fiscalStartMonth)
  const avg = averageReadingsInRange(readings, quarter.startKey, todayKey)
  return avg ? { ...avg, quarter } : null
}

/** KPI-5: has the period been over for more than the grace period (working days)? */
export function isReadingOverdue(
  period: Pick<KpiPeriod, 'endKey'>,
  todayKey: string,
  opts: { holidays?: ReadonlySet<string>; graceWorkingDays?: number } = {},
): boolean {
  if (compareDateKeys(period.endKey, todayKey) >= 0) return false
  const grace = opts.graceWorkingDays ?? KPI_READING_GRACE_WORKING_DAYS
  const end = new Date(`${period.endKey}T00:00:00.000Z`)
  const today = new Date(`${todayKey}T00:00:00.000Z`)
  return businessDaysBetween(end, today, opts.holidays ?? new Set()) > grace
}

export interface OverduePeriodsInput extends KpiPeriodOptions {
  frequency: KpiFrequency
  /**
   * First day readings are expected: the later of the timeframe start and the
   * day the KPI was created (a KPI added mid-year is not overdue for the
   * months before it existed).
   */
  windowStartKey: string
  /** Last day readings are expected: the timeframe end. */
  windowEndKey: string
  todayKey: string
  /** periodStart keys that already have a reading. */
  readingStartKeys: ReadonlySet<string>
  holidays?: ReadonlySet<string>
  graceWorkingDays?: number
}

/** KPI-5: periods in the window that are overdue and have no reading, oldest first. */
export function findOverduePeriods(input: OverduePeriodsInput): KpiPeriod[] {
  const lastKey = compareDateKeys(input.windowEndKey, input.todayKey) < 0 ? input.windowEndKey : input.todayKey
  return listKpiPeriods(input.frequency, input.windowStartKey, lastKey, input).filter(
    (period) =>
      !input.readingStartKeys.has(period.startKey) &&
      isReadingOverdue(period, input.todayKey, { holidays: input.holidays, graceWorkingDays: input.graceWorkingDays }),
  )
}

/** Later of two date keys. */
export function maxDateKey(a: string, b: string): string {
  return compareDateKeys(a, b) >= 0 ? a : b
}

export interface KpiHealthCounts {
  green: number
  amber: number
  red: number
  /** No RAG yet: no reading, before scoredFrom, or text-only without a manual RAG. */
  notScored: number
}

/** Health counts over each KPI's latest RAG. */
export function countKpiHealth(latestRags: ReadonlyArray<KpiRag | string | null | undefined>): KpiHealthCounts {
  const counts: KpiHealthCounts = { green: 0, amber: 0, red: 0, notScored: 0 }
  for (const rag of latestRags) {
    if (rag === 'GREEN') counts.green += 1
    else if (rag === 'AMBER') counts.amber += 1
    else if (rag === 'RED') counts.red += 1
    else counts.notScored += 1
  }
  return counts
}

/** Compact number for cards: 12 345.6 → "12,345.6"; keeps up to 2 decimals. */
export function formatKpiNumber(value: number | null | undefined, unit?: string | null): string {
  if (!finite(value)) return '—'
  const rounded = Math.round(value * 100) / 100
  const text = rounded.toLocaleString('en-US', { maximumFractionDigits: 2 })
  const u = (unit ?? '').trim()
  if (!u) return text
  if (u === '%') return `${text}%`
  return `${text} ${u}`
}
