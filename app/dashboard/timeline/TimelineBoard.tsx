'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface Row {
  id: string
  title: string
  level: string
  goalStatus: string
  progress: number
  startDate: string | null
  endDate: string | null
  ownerName: string
  keyResults: Array<{ id: string; title: string; progress: number; confidence: string }>
}

interface Props {
  rows: Row[]
}

const STATUS_COLOUR: Record<string, string> = {
  ON_TRACK: 'bg-emerald-500',
  AT_RISK: 'bg-amber-500',
  OFF_TRACK: 'bg-red-500',
  CLOSED: 'bg-slate-400',
}

const CONFIDENCE_COLOUR: Record<string, string> = {
  ON_TRACK: 'bg-emerald-300',
  AT_RISK: 'bg-amber-300',
  OFF_TRACK: 'bg-red-300',
}

interface Quarter {
  label: string
  year: number
  q: number
  start: Date
  end: Date
}

function buildQuarters(minDate: Date, maxDate: Date): Quarter[] {
  const out: Quarter[] = []
  const startYear = minDate.getFullYear()
  const endYear = maxDate.getFullYear()
  for (let y = startYear; y <= endYear; y++) {
    for (let q = 0; q < 4; q++) {
      const start = new Date(Date.UTC(y, q * 3, 1))
      const end = new Date(Date.UTC(y, q * 3 + 3, 0, 23, 59, 59))
      out.push({
        label: `Q${q + 1} '${String(y).slice(2)}`,
        year: y,
        q: q + 1,
        start,
        end,
      })
    }
  }
  return out
}

export default function TimelineBoard({ rows }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const { quarters, rangeStart, rangeEnd } = useMemo(() => {
    const dates = rows
      .flatMap((r) => [r.startDate, r.endDate])
      .filter((d): d is string => Boolean(d))
      .map((d) => new Date(d))
    const now = new Date()
    const min =
      dates.length > 0
        ? new Date(Math.min(...dates.map((d) => d.getTime())))
        : new Date(now.getFullYear(), 0, 1)
    const max =
      dates.length > 0
        ? new Date(Math.max(...dates.map((d) => d.getTime())))
        : new Date(now.getFullYear() + 1, 0, 1)
    const quarters = buildQuarters(min, max)
    const rangeStart = quarters[0]?.start ?? min
    const rangeEnd = quarters[quarters.length - 1]?.end ?? max
    return { quarters, rangeStart, rangeEnd }
  }, [rows])

  const totalSpan = Math.max(1, rangeEnd.getTime() - rangeStart.getTime())

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 w-80">
                Objective
              </th>
              {quarters.map((q) => (
                <th key={q.label} className="px-2 py-2 text-center text-xs font-medium text-gray-600">
                  {q.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={quarters.length + 1} className="px-4 py-10 text-center text-sm text-gray-500">
                  No active objectives to display.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <TimelineRow
                  key={row.id}
                  row={row}
                  expanded={expanded[row.id] ?? false}
                  onToggle={() => setExpanded((prev) => ({ ...prev, [row.id]: !prev[row.id] }))}
                  quarters={quarters}
                  rangeStart={rangeStart}
                  totalSpan={totalSpan}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TimelineRow({
  row,
  expanded,
  onToggle,
  quarters,
  rangeStart,
  totalSpan,
}: {
  row: Row
  expanded: boolean
  onToggle: () => void
  quarters: Quarter[]
  rangeStart: Date
  totalSpan: number
}) {
  const start = row.startDate ? new Date(row.startDate) : null
  const end = row.endDate ? new Date(row.endDate) : null

  const left =
    start && end ? ((start.getTime() - rangeStart.getTime()) / totalSpan) * 100 : 0
  const width =
    start && end ? ((end.getTime() - start.getTime()) / totalSpan) * 100 : 0

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50">
        <td className="sticky left-0 z-10 bg-white px-3 py-2 w-80">
          <div className="flex items-start gap-1">
            <button
              type="button"
              onClick={onToggle}
              className="mt-0.5 text-gray-400 hover:text-gray-700"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <div className="min-w-0 flex-1">
              <Link
                href={`/dashboard/objectives/${row.id}`}
                className="text-sm font-medium text-gray-900 hover:text-blue-600 line-clamp-1"
                title={row.title}
              >
                {row.title}
              </Link>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {row.level} · {row.ownerName} · {Math.round(row.progress)}%
              </p>
            </div>
          </div>
        </td>
        <td colSpan={quarters.length} className="relative h-10 align-middle p-0">
          <div className="relative h-10">
            {quarters.map((_, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 border-l border-gray-100"
                style={{ left: `${(i / quarters.length) * 100}%` }}
              />
            ))}
            {start && end && (
              <div
                className={`absolute top-1/2 -translate-y-1/2 h-5 rounded ${STATUS_COLOUR[row.goalStatus] ?? 'bg-slate-400'} shadow-sm`}
                style={{ left: `${left}%`, width: `${Math.max(width, 0.8)}%` }}
                title={`${start.toLocaleDateString()} – ${end.toLocaleDateString()}`}
              >
                <span className="px-2 text-[10px] leading-5 text-white font-semibold truncate block">
                  {row.title}
                </span>
              </div>
            )}
          </div>
        </td>
      </tr>
      {expanded &&
        row.keyResults.map((kr) => {
          // KRs inherit the objective's window for placement since they don't carry dates themselves.
          return (
            <tr key={kr.id} className="border-b border-gray-50 bg-gray-50/40">
              <td className="sticky left-0 z-10 bg-gray-50/40 px-3 py-1.5 w-80">
                <div className="pl-6 min-w-0">
                  <Link
                    href={`/dashboard/key-results/${kr.id}`}
                    className="text-xs text-gray-700 hover:text-blue-600 line-clamp-1"
                    title={kr.title}
                  >
                    <span className="mr-1 inline-block text-[9px] font-semibold px-1 py-0.5 rounded bg-blue-100 text-blue-700">
                      KR
                    </span>
                    {kr.title}
                  </Link>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {Math.round(kr.progress)}% · {kr.confidence.replace(/_/g, ' ').toLowerCase()}
                  </p>
                </div>
              </td>
              <td colSpan={quarters.length} className="relative h-7 align-middle p-0">
                {start && end && (
                  <div className="relative h-7">
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 h-3 rounded ${CONFIDENCE_COLOUR[kr.confidence] ?? 'bg-slate-200'}`}
                      style={{ left: `${left}%`, width: `${Math.max(width, 0.8)}%` }}
                    />
                  </div>
                )}
              </td>
            </tr>
          )
        })}
    </>
  )
}
