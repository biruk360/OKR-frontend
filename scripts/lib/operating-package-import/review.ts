/**
 * Operating-package importer (IMP-2) — the dry-run review workbook.
 *
 * One sheet per decision the reviewer must confirm before `--apply`: people, KR numeric plans,
 * duty cadences, KPI parsing, CONTRIBUTES_TO / SUCCEEDS link plans, carry-forward matches,
 * dependencies, decisions, and every warning.
 */
import * as fs from 'fs'
import * as path from 'path'
import * as XLSX from 'xlsx'

export type ReviewValue = string | number | boolean | null
export type ReviewRow = Record<string, ReviewValue>

export class ReviewSheets {
  private readonly sheets = new Map<string, ReviewRow[]>()
  private readonly order: string[] = []

  add(sheet: string, row: ReviewRow): void {
    if (!this.sheets.has(sheet)) {
      this.sheets.set(sheet, [])
      this.order.push(sheet)
    }
    this.sheets.get(sheet)!.push(row)
  }

  rows(sheet: string): ReviewRow[] {
    return this.sheets.get(sheet) ?? []
  }

  /** Sheets in a fixed order first, then any others in insertion order. */
  names(preferred: readonly string[]): string[] {
    const first = preferred.filter((s) => this.sheets.has(s))
    return [...first, ...this.order.filter((s) => !first.includes(s))]
  }

  write(file: string, preferred: readonly string[]): void {
    const wb = XLSX.utils.book_new()
    for (const name of this.names(preferred)) {
      const rows = this.rows(name)
      const ws = XLSX.utils.json_to_sheet(rows)
      const headers = rows.length > 0 ? Object.keys(rows[0]) : []
      ws['!cols'] = headers.map((h) => {
        const longest = rows.reduce((max, r) => Math.max(max, String(r[h] ?? '').length), h.length)
        return { wch: Math.min(80, Math.max(8, longest + 2)) }
      })
      if (headers.length > 0) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: headers.length - 1, r: rows.length } }) }
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
    }
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
    XLSX.writeFile(wb, file)
  }
}

export const REVIEW_SHEET_ORDER = [
  'Summary',
  'Warnings',
  'People',
  'Unmatched',
  'Packages',
  'KR plan',
  'Checkpoints',
  'Milestones & tasks',
  'Duties',
  'KPIs',
  'Development',
  'Role definitions',
  'Links (CONTRIBUTES_TO)',
  'Dependencies',
  'Decisions',
  'Reviews',
  'Carry-forward',
] as const
