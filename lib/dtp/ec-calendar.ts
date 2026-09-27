/**
 * Ethiopian ↔ Gregorian calendar conversion for DTP date displays, via the
 * Julian Day Number.
 *
 * Amete Mihret era: twelve 30-day months + Pagume (5 days, 6 in a leap year).
 * The Ethiopian leap year is year % 4 === 3 (e.g. 2011, 2015, 2019 EC) — the
 * year that ENDS just before a Gregorian leap year's February. So Meskerem 1
 * falls on 11 Sept (Gregorian), or 12 Sept when the following Gregorian year
 * is a leap year (e.g. 2016 EC began 2023-09-12, 2017 EC began 2024-09-11).
 *
 * No external deps. Checked day-by-day against the Dershowitz & Reingold
 * reference conversion for 2020-2030 (lib/dtp/dtp.test.ts).
 */

/** JDN of 1 Meskerem 1 EC (= 29 Aug 8 CE, Julian). */
const ETHIOPIAN_EPOCH_JDN = 1724221

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
  const days = jdn - ETHIOPIAN_EPOCH_JDN
  const cycle = Math.floor(days / 1461) // 4-year cycle: years 1, 2, 3 (leap, 366 d), 4
  const r = days - 1461 * cycle
  let yearInCycle: number // 0-based
  let dayOfYear: number // 0-based
  if (r < 730) {
    yearInCycle = Math.floor(r / 365)
    dayOfYear = r - 365 * yearInCycle
  } else if (r < 1096) {
    yearInCycle = 2 // the leap year (year % 4 === 3)
    dayOfYear = r - 730
  } else {
    yearInCycle = 3
    dayOfYear = r - 1096
  }
  const year = 4 * cycle + yearInCycle + 1
  // Each month is 30 days, except month 13 (Pagume) = 5 or 6.
  const month = Math.floor(dayOfYear / 30) + 1
  const day = dayOfYear - (month - 1) * 30 + 1
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
