/**
 * Odoo sales sync — pace and unit helpers. Pure and client-safe.
 *
 * A quota KPI states its pace in `targetText`, e.g.
 *   "ETB 25M by 31 Dec · 60M by 31 Mar · 100M by 6 Jul"
 *   "ETB 100M: 50M by 31 Mar · 100M by 6 Jul"
 *   "ETB 8M by 31 Dec · 25M by 31 Mar · 60M by 6 Jul (C); 75M (A — his own top line, D72)"
 * `parsePace` turns that into cumulative ETB checkpoints. Only the committed
 * figures count: anything after the first `;` that follows the checkpoints
 * (the aspirational "A" part) is ignored.
 */
import { compareDateKeys, isDateKey } from '@/lib/kpi/periods'

export interface PacePoint {
  /** `YYYY-MM-DD`. */
  date: string
  /** Cumulative target in ETB by that date. */
  cumulative: number
}

export interface FiscalWindow {
  /** First day, `YYYY-MM-DD`. */
  startKey: string
  /** Last day (inclusive), `YYYY-MM-DD`. */
  endKey: string
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/**
 * Multiplier from a KPI unit to ETB. "ETB" → 1, "ETB M" / "M ETB" / "ETBm" /
 * "ETB (M)" / "ETB million" → 1e6, "ETB K" → 1e3. Dimensionless units ("%",
 * "x") pass through with 1. Anything else throws, so a misconfigured KPI is
 * reported instead of being synced in the wrong scale.
 */
export function etbFactor(unit: string | null | undefined): number {
  const u = (unit ?? '').trim().toLowerCase().replace(/[().\s]/g, '')
  if (u === '' || u === '%' || u === 'x' || u === 'percent') return 1
  const money = u.replace(/^birr$/, 'etb')
  if (money === 'etb' || money === 'br') return 1
  if (/^(etb(m|mn|million|millions)|(m|mn|million|millions)etb)$/.test(money)) return 1e6
  if (/^(etb(k|thousand)|(k|thousand)etb)$/.test(money)) return 1e3
  if (/^(etb(b|bn|billion)|(b|bn|billion)etb)$/.test(money)) return 1e9
  throw new Error(`Unknown KPI unit "${unit}"`)
}

/** A value in the KPI's unit, in ETB. */
export function toEtb(value: number, unit: string | null | undefined): number {
  return value * etbFactor(unit)
}

/** An ETB amount, in the KPI's unit. */
export function fromEtb(etb: number, unit: string | null | undefined): number {
  return etb / etbFactor(unit)
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function keyToMs(key: string): number {
  return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)))
}

/** Whole days from `a` to `b` (both `YYYY-MM-DD`). */
export function daysBetween(a: string, b: string): number {
  return Math.round((keyToMs(b) - keyToMs(a)) / MS_PER_DAY)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * "31 Dec" → a date inside the fiscal year: on or after the FY start's
 * month/day → the start year, otherwise the end year. ("6 Jul" in a FY that
 * starts 8 Jul 2026 is 6 Jul 2027.) An explicit year wins.
 */
function resolveDay(day: number, month: number, year: number | null, fy: FiscalWindow): string | null {
  const startYear = Number(fy.startKey.slice(0, 4))
  const endYear = Number(fy.endKey.slice(0, 4))
  const startMd = fy.startKey.slice(5)
  const md = `${pad(month)}-${pad(day)}`
  const y = year ?? (md >= startMd ? startYear : endYear)
  const key = `${y}-${md}`
  return isDateKey(key) ? key : null
}

// ---------------------------------------------------------------------------
// Pace
// ---------------------------------------------------------------------------

const SCALE: Record<string, number> = { k: 1e3, m: 1e6, mn: 1e6, b: 1e9, bn: 1e9 }

function amount(num: string, suffix: string | undefined, factor: number): number {
  const n = Number(num.replace(/,/g, ''))
  const s = (suffix ?? '').toLowerCase()
  return s ? n * SCALE[s] : n * factor
}

const NUM = String.raw`(\d[\d,]*(?:\.\d+)?)\s*(k|m|mn|b|bn)?\b`
const CHECKPOINT_RE = new RegExp(
  String.raw`(?:etb\s*)?${NUM}\s*by\s+(\d{1,2})\s+([a-z]{3})[a-z]*\.?(?:\s+(\d{4}))?`,
  'gi',
)
const LEADING_TOTAL_RE = new RegExp(String.raw`^\s*(?:etb\s*)?${NUM}\s*:`, 'i')

/**
 * Cumulative ETB checkpoints from a pace text. The last checkpoint always equals
 * the annual target: a leading "ETB 100M:" total that no checkpoint reaches is
 * added at the FY end. Returns `[]` when no checkpoint parses.
 */
export function parsePace(targetText: string | null | undefined, unit: string | null | undefined, fy: FiscalWindow): PacePoint[] {
  if (!targetText) return []
  const factor = etbFactor(unit)
  // Committed figures only: drop the aspirational tail after the first ";".
  const committed = targetText.split(';')[0]

  const byDate = new Map<string, number>()
  for (const m of committed.matchAll(CHECKPOINT_RE)) {
    const month = MONTHS[m[4].toLowerCase()]
    if (!month) continue
    const date = resolveDay(Number(m[3]), month, m[5] ? Number(m[5]) : null, fy)
    if (!date) continue
    byDate.set(date, amount(m[1], m[2], factor))
  }
  if (byDate.size === 0) return []

  const points = [...byDate.entries()]
    .map(([date, cumulative]) => ({ date, cumulative }))
    .sort((a, b) => compareDateKeys(a.date, b.date))

  const total = committed.match(LEADING_TOTAL_RE)
  const target = total ? amount(total[1], total[2], factor) : points[points.length - 1].cumulative
  const last = points[points.length - 1]
  if (last.cumulative !== target) {
    if (compareDateKeys(last.date, fy.endKey) < 0) points.push({ date: fy.endKey, cumulative: target })
    else last.cumulative = target
  }
  return points
}

/** The annual target of a pace (its final checkpoint), or null for an empty pace. */
export function paceTarget(pace: readonly PacePoint[]): number | null {
  return pace.length ? pace[pace.length - 1].cumulative : null
}

/**
 * Cumulative ETB expected by `dateKey`: a straight line from 0 on the FY start
 * through each checkpoint; the final target after the last one.
 */
export function expectedBy(pace: readonly PacePoint[], fyStartKey: string, dateKey: string): number {
  if (pace.length === 0 || compareDateKeys(dateKey, fyStartKey) <= 0) return 0
  let prevDate = fyStartKey
  let prevValue = 0
  for (const point of pace) {
    if (compareDateKeys(dateKey, point.date) <= 0) {
      const span = daysBetween(prevDate, point.date)
      if (span <= 0) return point.cumulative
      return prevValue + ((point.cumulative - prevValue) * daysBetween(prevDate, dateKey)) / span
    }
    prevDate = point.date
    prevValue = point.cumulative
  }
  return prevValue
}

/** The first checkpoint on or after `dateKey`, or null when the pace is done. */
export function nextCheckpoint(pace: readonly PacePoint[], dateKey: string): PacePoint | null {
  return pace.find((p) => compareDateKeys(p.date, dateKey) >= 0) ?? null
}

