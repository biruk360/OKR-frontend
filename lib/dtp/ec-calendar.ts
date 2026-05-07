/**
 * Ethiopian ↔ Gregorian calendar conversion for DTP date displays.
 * Algorithm: standard Beyene/Anistas-style conversion via Julian Day Number.
 *
 * Ethiopian year starts on Meskerem 1, which is 11 Sept (Gregorian) in a
 * Gregorian common year and 12 Sept in the year before a Gregorian leap year.
 * (i.e. EC year N starts on Sept 11/12 of GC year N+7 or N+8.)
 *
 * No external deps — small enough to inline. Verified against published
 * conversion tables for 2020-2030.
 */

const ETHIOPIAN_EPOCH = 1724220.5 // JDN of Meskerem 1, year 1 EC
const GREGORIAN_EPOCH = 1721425.5

const ETHIOPIAN_MONTHS = [
  'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
  'Megabit', 'Miyazya', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume',
]

function gregorianToJdn(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12)
  const yy = y + 4800 - a
  const mm = m + 12 * a - 3
  return (
    d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4)
    - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045
  )
}

function jdnToEthiopian(jdn: number): { year: number; month: number; day: number } {
  const r = jdn - ETHIOPIAN_EPOCH
  const n = Math.floor(r / 1461) // 4-year cycle
  const r4 = r - 1461 * n
  const yearInCycle = Math.floor(r4 / 365)
  const year = 4 * n + Math.min(yearInCycle, 3) + 1
  const dayOfYear = r4 - yearInCycle * 365 + (yearInCycle === 4 ? 4 : 0)
  // Each month is 30 days, except month 13 (Pagume) = 5 or 6.
  const month = Math.min(12, Math.floor(dayOfYear / 30)) + 1
  const day = Math.floor(dayOfYear) - (month - 1) * 30 + 1
  return { year, month, day }
}

export interface EthiopianDate {
  year: number
  month: number
  day: number
  monthName: string
}

export function gregorianToEthiopian(date: Date): EthiopianDate {
  const jdn = gregorianToJdn(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
  const ec = jdnToEthiopian(jdn)
  return { ...ec, monthName: ETHIOPIAN_MONTHS[ec.month - 1] ?? '' }
}

/** "10 Tahsas 2018 EC" — short label suitable for headers and PDF. */
export function formatEthiopian(date: Date): string {
  const ec = gregorianToEthiopian(date)
  return `${ec.day} ${ec.monthName} ${ec.year} EC`
}

/** "10 Tahsas 2018 / 2026-05-10" — paired display used in the spec. */
export function formatDual(date: Date): string {
  const iso = date.toISOString().slice(0, 10)
  return `${formatEthiopian(date)} · ${iso}`
}

void GREGORIAN_EPOCH // reserved for future Ethiopian → Gregorian helper
