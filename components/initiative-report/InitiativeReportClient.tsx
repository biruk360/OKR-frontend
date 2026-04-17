'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Calendar, AlertCircle, CheckCircle2, Search, ChevronDown, ChevronRight, Pencil } from 'lucide-react'

interface DayCell {
  date: string
  hasUpdate: boolean
  content: string | null
  status: string | null
  blockers: string | null
  authorName: string | null
}

interface ReportRow {
  id: string
  title: string
  status: string
  assignee: { id: string; name: string; avatar: string | null }
  krTitle: string | null
  objectiveTitle: string | null
  compliancePct: number
  days: DayCell[]
}

function defaultFrom(): string {
  const d = new Date()
  d.setDate(d.getDate() - 13)
  return d.toISOString().slice(0, 10)
}
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function InitiativeReportClient() {
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(today)
  const [dates, setDates] = useState<string[]>([])
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<{ initId: string; date: string } | null>(null)
  const [editContent, setEditContent] = useState('')

  useEffect(() => {
    fetchReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

  async function fetchReport() {
    setLoading(true)
    try {
      const res = await fetch(`/api/initiative-report?from=${from}&to=${to}`)
      const data = await res.json()
      if (data.success) {
        setDates(data.data.dates)
        setRows(data.data.rows)
      }
    } catch {
      toast.error('Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  async function submitUpdate(initId: string, date: string) {
    if (!editContent.trim()) return
    try {
      const res = await fetch(`/api/initiatives/${initId}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent.trim(), updateDate: date }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast.success('Update saved')
      setEditingCell(null)
      setEditContent('')
      fetchReport()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save')
    }
  }

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.assignee.name.toLowerCase().includes(q) ||
        (r.objectiveTitle?.toLowerCase().includes(q) ?? false)
    )
  }, [rows, query])

  const overallCompliance = rows.length > 0
    ? Math.round(rows.reduce((s, r) => s + r.compliancePct, 0) / rows.length)
    : 0

  const missingToday = rows.filter((r) => {
    const todayCell = r.days.find((d) => d.date === today())
    return todayCell && !todayCell.hasUpdate && r.status !== 'COMPLETED'
  }).length

  return (
    <div className=" -m-3 sm:-m-6 min-h-full p-4 sm:p-6">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Initiative Report</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Daily mandatory updates. {overallCompliance}% compliance
              {missingToday > 0 && (
                <span className="text-destructive"> · {missingToday} missing today</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="input w-[140px]"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="input w-[140px]"
            />
          </div>
        </div>

        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1 max-w-[320px]">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Filter by initiative, owner, or objective"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input pl-7"
            />
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading report...</div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-xs text-muted-foreground">
            No initiatives match your filters.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="inline-flex items-center gap-1 px-2.5 py-2 text-sm font-medium border-b-2 border-transparent cursor-pointer text-muted-foreground hover:text-foregroundle min-w-max">
              <thead>
                <tr>
                  <th style={{ width: 280, position: 'sticky', left: 0, background: '#ffffff', zIndex: 10 }}>
                    Initiative
                  </th>
                  <th style={{ width: 80 }}>Compliance</th>
                  {dates.map((d) => (
                    <th
                      key={d}
                      style={{ width: 44, textAlign: 'center', padding: '4px 2px' }}
                      title={d}
                    >
                      <div className="text-[10px]">
                        {new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'narrow' })}
                      </div>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        {new Date(d + 'T12:00:00').getDate()}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const isExpanded = expandedRow === row.id
                  return (
                    <tr key={row.id} className="group">
                      <td style={{ position: 'sticky', left: 0, background: '#ffffff', zIndex: 5 }}>
                        <button
                          type="button"
                          onClick={() => setExpandedRow(isExpanded ? null : row.id)}
                          className="flex items-center gap-1.5 text-left w-full"
                        >
                          {isExpanded
                            ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                            : <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          }
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium text-foreground">
                              {row.title}
                            </div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              {row.assignee.name}
                              {row.objectiveTitle && <> · {row.objectiveTitle}</>}
                            </div>
                          </div>
                        </button>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <div className="h-1 w-full bg-muted rounded-full overflow-hidden w-12">
                            <div
                              className="h-full bg-primary-500 rounded-full transition-all"
                              style={{
                                width: `${row.compliancePct}%`,
                                background: row.compliancePct >= 80
                                  ? '#059669'
                                  : row.compliancePct >= 50
                                  ? '#d97706'
                                  : '#dc2626',
                              }}
                            />
                          </div>
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {row.compliancePct}%
                          </span>
                        </div>
                      </td>
                      {row.days.map((day) => {
                        const isEditing = editingCell?.initId === row.id && editingCell?.date === day.date
                        return (
                          <td
                            key={day.date}
                            style={{ padding: '2px', textAlign: 'center', cursor: 'pointer' }}
                            title={
                              day.hasUpdate
                                ? `${day.authorName}: ${day.content?.slice(0, 100)}`
                                : `No update on ${day.date}`
                            }
                            onClick={() => {
                              if (!isEditing) {
                                setEditingCell({ initId: row.id, date: day.date })
                                setEditContent(day.content || '')
                              }
                            }}
                          >
                            {isEditing ? (
                              <div className="absolute z-20 mt-1 w-60 p-2 rounded-lg border border-border bg-card" style={{ boxShadow: '0 4px 8px -2px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.08)' }}>
                                <textarea
                                  autoFocus
                                  value={editContent}
                                  onChange={(e) => setEditContent(e.target.value)}
                                  rows={3}
                                  className="input min-h-[60px] text-[12px]"
                                  placeholder="What did you do today?"
                                />
                                <div className="mt-1 flex gap-1">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); submitUpdate(row.id, day.date) }}
                                    className="btn-outline btn-primary btn-sm"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setEditingCell(null) }}
                                    className="btn-outline btn-sm"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : day.hasUpdate ? (
                              <CheckCircle2
                                className="mx-auto h-4 w-4 text-emerald-600"
                              />
                            ) : (
                              <div className="mx-auto h-4 w-4 rounded-sm bg-[color:#fee2e2] border border-[color:#dc2626] opacity-60" />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
