/**
 * Operating-package importer (IMP) — pure text helpers: cell normalisation, sheet tables with a
 * detected header row, workbook date parsing (FY 2026/27 year inference), durations and name lists.
 *
 * Pure and self-contained (no DB, no '@/' imports) so the importer runs from a bare checkout with tsx.
 */
import * as XLSX from 'xlsx'

/** Collapse whitespace (incl. line breaks and NBSP) and trim. Numbers keep their JS string form. */
export function cellText(value: unknown): string {
  if (value == null) return ''
  return String(value)
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True for the workbook "empty" markers: '', '—', '–', '-', 'n/a'. */
export function isBlank(text: string | null | undefined): boolean {
  const t = cellText(text)
  return t === '' || t === '—' || t === '–' || t === '-' || /^n\/?a$/i.test(t)
}

/** Null for blank markers, otherwise the normalised text. */
export function textOrNull(text: string | null | undefined): string | null {
  return isBlank(text) ? null : cellText(text)
}

/** Shorten to `max` characters on a word boundary, with an ellipsis. */
export function truncate(text: string, max: number): string {
  const t = cellText(text)
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:·—–-]+$/, '')}…`
}

// ─── Sheet tables ───────────────────────────────────────────────────────────

export interface SheetTable {
  sheet: string
  /** Normalised header cells. */
  header: string[]
  /** 0-based index of the header row in the sheet (rows above it are notes). */
  headerRow: number
  /** One entry per non-empty data row. */
  rows: TableRow[]
}

export interface TableRow {
  /** 1-based spreadsheet row number, for messages. */
  rowNumber: number
  cells: string[]
}

/** Raw rows of a sheet (array of arrays), or null when the sheet is missing. */
export function sheetRows(wb: XLSX.WorkBook, sheet: string): unknown[][] | null {
  const ws = wb.Sheets[sheet]
  if (!ws) return null
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
}

/**
 * Read a table whose header row is the first row with `firstHeader` (case-insensitive) in column A.
 * Several sheets carry a one-row note above the header, so the header is detected, never assumed.
 */
export function readTable(wb: XLSX.WorkBook, sheet: string, firstHeader: string): SheetTable | null {
  const raw = sheetRows(wb, sheet)
  if (!raw) return null
  const want = firstHeader.toLowerCase()
  const headerRow = raw.findIndex((r) => cellText(r[0]).toLowerCase() === want)
  if (headerRow < 0) return null
  const header = raw[headerRow].map((c) => cellText(c))
  const rows: TableRow[] = []
  for (let i = headerRow + 1; i < raw.length; i++) {
    const cells = raw[i].map((c) => cellText(c))
    if (cells.every((c) => c === '')) continue
    rows.push({ rowNumber: i + 1, cells })
  }
  return { sheet, header, headerRow, rows }
}

/** Index of the first header matching `re`, or -1. */
export function columnIndex(table: SheetTable, re: RegExp): number {
  return table.header.findIndex((h) => re.test(h))
}

/** Accessor for a column by header regex; missing columns read as ''. */
export function column(table: SheetTable, re: RegExp): (row: TableRow) => string {
  const i = columnIndex(table, re)
  return (row) => (i < 0 ? '' : row.cells[i] ?? '')
}

/** Two-column "Label | Value" rows of a README sheet (label in A, value in B). */
export function keyValueRows(wb: XLSX.WorkBook, sheet: string): Array<{ rowNumber: number; label: string; value: string }> {
  const raw = sheetRows(wb, sheet) ?? []
  const out: Array<{ rowNumber: number; label: string; value: string }> = []
  raw.forEach((r, i) => {
    const label = cellText(r[0])
    const value = cellText(r[1])
    if (label || value) out.push({ rowNumber: i + 1, label, value })
  })
  return out
}

// ─── Dates ──────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
}
const MONTH_ALT = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'

/** True when the text names a calendar month (used to reject "15 Nov 2026" as a numeric target). */
export function mentionsMonth(text: string): boolean {
  return new RegExp(`\\b(?:${MONTH_ALT})\\b`, 'i').test(text)
}

/** FY 2026/27 runs 7 Jul 2026 – 6 Jul 2027 (workbook README). */
export const FY_START_YEAR = 2026

/** Year for a year-less "23 Oct": Jul 7 – Dec → FY start year, Jan – Jul 6 → the next year. */
export function inferFiscalYear(month: number, day: number, fyStartYear = FY_START_YEAR): number {
  if (month > 6 || (month === 6 && day >= 7)) return fyStartYear
  return fyStartYear + 1
}

/** UTC-midnight date; null when the day does not exist in that month. */
export function utcDate(year: number, month: number, day: number): Date | null {
  const d = new Date(Date.UTC(year, month, day))
  return d.getUTCMonth() === month && d.getUTCDate() === day ? d : null
}

/**
 * Every date in a workbook cell, in reading order, as UTC midnight.
 *  - "Fri 23 Oct 2026", "31 Mar / 6 Jul 2027", "30 Oct / 15 Nov / 1 Dec 2026" — day + month (+ year);
 *    a year-less date takes its year from the fiscal year (inferFiscalYear).
 *  - Month-only tokens ("Dec 2026 / Mar 2027", "early Nov 2026") are used only when the text has no
 *    day-dates: end of month, the 10th after "early", the 15th after "mid". "From Nov 2026" is skipped.
 */
export function parseDates(text: string | null | undefined, fyStartYear = FY_START_YEAR): Date[] {
  const t = cellText(text)
  if (!t) return []
  const out: Date[] = []
  const dayRe = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALT})\\.?(?:\\s+(\\d{4}))?\\b`, 'gi')
  let m: RegExpExecArray | null
  while ((m = dayRe.exec(t))) {
    const day = Number(m[1])
    const month = MONTHS[m[2].toLowerCase().slice(0, m[2].toLowerCase().startsWith('sept') ? 4 : 3)]
    if (month === undefined) continue
    const year = m[3] ? Number(m[3]) : inferFiscalYear(month, day, fyStartYear)
    const d = utcDate(year, month, day)
    if (d) out.push(d)
  }
  if (out.length > 0) return out

  const monthRe = new RegExp(`\\b(early|mid|late|from)?\\s*(${MONTH_ALT})\\.?\\s+(\\d{4})\\b`, 'gi')
  while ((m = monthRe.exec(t))) {
    const qualifier = (m[1] ?? '').toLowerCase()
    if (qualifier === 'from') continue
    const month = MONTHS[m[2].toLowerCase().slice(0, m[2].toLowerCase().startsWith('sept') ? 4 : 3)]
    if (month === undefined) continue
    const year = Number(m[3])
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const day = qualifier === 'early' ? 10 : qualifier === 'mid' ? 15 : lastDay
    const d = utcDate(year, month, day)
    if (d) out.push(d)
  }
  return out
}

/** Latest date in the text (the completion date of "31 Mar / 6 Jul 2027"), or null. */
export function latestDate(text: string | null | undefined): Date | null {
  const dates = parseDates(text)
  if (dates.length === 0) return null
  return dates.reduce((a, b) => (b > a ? b : a))
}

/** Earliest date in the text (when a dependency is first needed), or null. */
export function earliestDate(text: string | null | undefined): Date | null {
  const dates = parseDates(text)
  if (dates.length === 0) return null
  return dates.reduce((a, b) => (b < a ? b : a))
}

/** "YYYY-MM-DD" of a UTC date (review workbook). */
export function isoDay(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

// ─── Durations ──────────────────────────────────────────────────────────────

/**
 * Minutes from the workbook "Duration" column: "30 min", "1 h", "90 min + 30 min prep" (summed),
 * "30–45 min" / "1–2 h" (upper bound), "Half-day" (240), "2 days" (8 h each), "~14 h". Null when none.
 */
export function parseDurationMinutes(text: string | null | undefined): number | null {
  const t = cellText(text).toLowerCase()
  if (!t || isBlank(t)) return null
  let total = 0
  for (const part of t.split('+')) {
    if (/half[- ]?day/.test(part)) {
      total += 240
      continue
    }
    if (/full[- ]?day/.test(part)) {
      total += 480
      continue
    }
    const m = part.match(/(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*(min(?:ute)?s?|h(?:ours?|rs?)?|days?)\b/)
    if (!m) continue
    const n = Number(m[2] ?? m[1])
    const unit = m[3]
    if (unit.startsWith('min')) total += n
    else if (unit.startsWith('d')) total += n * 480
    else total += n * 60
  }
  return total > 0 ? Math.round(total) : null
}

// ─── Name lists ─────────────────────────────────────────────────────────────

/** Split a people cell ("Meklit; Betty", "Eden, Yohannes G", "Meklit / plan") into trimmed tokens. */
export function splitNames(text: string | null | undefined): string[] {
  const t = cellText(text)
  if (isBlank(t)) return []
  // Commas inside parentheses ("Yohannes G (banking, NGO)") must not split.
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of t) {
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (depth === 0 && (ch === ';' || ch === ',' || ch === '·' || ch === '/')) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  parts.push(current)
  const out: string[] = []
  for (const p of parts) {
    for (const q of p.split(/\s+and\s+/i)) {
      const name = q.trim()
      if (name && !isBlank(name)) out.push(name)
    }
  }
  return out
}
