/**
 * Client-side CSV export for the /dashboard/reports tables. Builds the file
 * from rows already loaded in the page — no request, no dependency.
 */
import { statusLabel } from '@/lib/reportDashboard'
import type {
  MainTab,
  ReportKrWithStatus,
  ReportObjectiveRow,
  ReportTodoRow,
} from './report-dashboard-utils'

type Cell = string | number | null | undefined

/** RFC 4180 escaping, plus a guard against spreadsheet formula injection. */
export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s) && typeof value === 'string') s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}

export function buildReportCsv(
  tab: MainTab,
  data: { krs: ReportKrWithStatus[]; objectives: ReportObjectiveRow[]; todos: ReportTodoRow[] },
): string {
  if (tab === 'key-results') {
    return toCsv(
      ['Key result', 'Objective', 'Plan', 'Department', 'Timeframe', 'Owner', 'Status', 'Confidence', 'Progress %', 'Start', 'Current', 'Target', 'Unit', 'Check-ins'],
      data.krs.map((kr) => [
        kr.title, kr.objectiveTitle, kr.planLabel, kr.departmentName, kr.timeframeName, kr.ownerName,
        statusLabel(kr.displayStatus), kr.confidence, Math.round(kr.progress),
        kr.startValue, kr.currentValue, kr.targetValue, kr.unit, kr.checkInCount,
      ]),
    )
  }
  if (tab === 'objectives') {
    return toCsv(
      ['Objective', 'Level', 'Plan', 'Department', 'Timeframe', 'Owner', 'Plan status', 'Progress %', 'Key results'],
      data.objectives.map((o) => [
        o.title, o.level, o.planLabel, o.departmentName, o.timeframeName, o.ownerName,
        o.goalStatus, Math.round(o.progress), o.keyResultCount,
      ]),
    )
  }
  return toCsv(
    ['Initiative', 'Key result', 'Objective', 'Status', 'Priority', 'Assignee', 'Due date'],
    data.todos.map((t) => [
      t.title, t.krTitle, t.objectiveTitle, t.status, t.priority, t.assigneeName,
      t.dueDate ? t.dueDate.slice(0, 10) : '',
    ]),
  )
}

/** Trigger a browser download of `csv` as `filename` (UTF-8 BOM for Excel). */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
