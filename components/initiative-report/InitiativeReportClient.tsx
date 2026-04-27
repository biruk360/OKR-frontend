'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { CheckCircle2, Search, ChevronDown, ChevronRight, Printer } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'

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

  const onTrack = rows.filter((r) => r.compliancePct >= 80).length
  const atRisk = rows.filter((r) => r.compliancePct >= 50 && r.compliancePct < 80).length
  const offTrack = rows.filter((r) => r.compliancePct < 50).length

  return (
    <div className="-m-3 sm:-m-6 min-h-full p-4 sm:p-6">
      <div className="mx-auto max-w-[1400px] space-y-4">
        {/* Hero */}
        <header className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight text-foreground">Initiative Report</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Daily mandatory updates · {overallCompliance}% compliance
              {missingToday > 0 && (
                <span style={{ color: 'var(--ap-red)' }}> · {missingToday} missing today</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-7 rounded-[10px] border bg-background px-2 text-[12px] outline-none"
              style={{ borderColor: 'var(--ap-border)' }}
            />
            <span className="text-[12px] text-muted-foreground">→</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-7 rounded-[10px] border bg-background px-2 text-[12px] outline-none"
              style={{ borderColor: 'var(--ap-border)' }}
            />
            <button
              type="button"
              onClick={() => typeof window !== 'undefined' && window.print()}
              className="inline-flex items-center gap-1 h-7 rounded-[10px] border bg-card px-2.5 text-[12px] text-muted-foreground hover:text-foreground"
              style={{ borderColor: 'var(--ap-border)' }}
            >
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
          </div>
        </header>

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Compliance" value={`${overallCompliance}%`} tint="var(--ap-accent)" />
          <KpiCard label="On track" value={onTrack} tint="var(--ap-green)" />
          <KpiCard label="At risk" value={atRisk} tint="var(--ap-orange)" />
          <KpiCard label="Off track" value={offTrack} tint="var(--ap-red)" />
        </div>

        {/* Filter strip */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-[360px]">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Filter by initiative, owner or objective"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 w-full rounded-[10px] border bg-background pl-7 pr-2 text-[13px] outline-none"
              style={{ borderColor: 'var(--ap-border)' }}
            />
          </div>
        </div>

        {loading ? (
          <div
            className="rounded-[14px] border bg-card p-8 text-center text-[13px] text-muted-foreground"
            style={{ borderColor: 'var(--ap-border)' }}
          >
            Loading report…
          </div>
        ) : filteredRows.length === 0 ? (
          <EmptyState
            title="No initiatives match your filters"
            description="Adjust the date range or search to see updates."
          />
        ) : (
          <div
            className="rounded-[14px] border bg-card overflow-x-auto"
            style={{ borderColor: 'var(--ap-border)' }}
          >
            <table className="min-w-max w-full text-[13px]">
              <thead>
                <tr style={{ background: 'var(--ap-bg-sunken)' }}>
                  <th
                    className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-3 py-2"
                    style={{ width: 280, position: 'sticky', left: 0, background: 'var(--ap-bg-sunken)', zIndex: 10 }}
                  >
                    Initiative
                  </th>
                  <th
                    className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-2 py-2"
                    style={{ width: 110 }}
                  >
                    Compliance
                  </th>
                  {dates.map((d) => (
                    <th
                      key={d}
                      className="text-center px-1 py-2"
                      style={{ width: 44 }}
                      title={d}
                    >
                      <div className="text-[10px] font-semibold text-muted-foreground">
                        {new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'narrow' })}
                      </div>
                      <div className="text-[10px] tabular-nums text-muted-foreground">
                        {new Date(d + 'T12:00:00').getDate()}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const isExpanded = expandedRow === row.id
                  const compTint =
                    row.compliancePct >= 80 ? 'var(--ap-green)' :
                    row.compliancePct >= 50 ? 'var(--ap-orange)' : 'var(--ap-red)'
                  return (
                    <tr key={row.id} className="border-t" style={{ borderColor: 'var(--ap-border)' }}>
                      <td
                        className="px-3 py-2"
                        style={{ position: 'sticky', left: 0, background: 'var(--ap-bg, #ffffff)', zIndex: 5 }}
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedRow(isExpanded ? null : row.id)}
                          className="flex items-center gap-1.5 text-left w-full"
                        >
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          }
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium text-foreground">
                              {row.title}
                            </div>
                            <div className="truncate text-[12px] text-muted-foreground">
                              {row.assignee.name}
                              {row.objectiveTitle && <> · {row.objectiveTitle}</>}
                            </div>
                          </div>
                        </button>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-1.5 w-14 overflow-hidden rounded-full"
                            style={{ background: 'var(--ap-bg-sunken)' }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${row.compliancePct}%`, background: compTint }}
                            />
                          </div>
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            {row.compliancePct}%
                          </span>
                        </div>
                      </td>
                      {row.days.map((day) => {
                        const isEditing = editingCell?.initId === row.id && editingCell?.date === day.date
                        return (
                          <td
                            key={day.date}
                            className="text-center cursor-pointer"
                            style={{ padding: '4px 2px' }}
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
                              <div
                                className="absolute z-20 mt-1 w-60 p-2 rounded-[14px] border bg-card"
                                style={{ borderColor: 'var(--ap-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}
                              >
                                <textarea
                                  autoFocus
                                  value={editContent}
                                  onChange={(e) => setEditContent(e.target.value)}
                                  rows={3}
                                  className="w-full min-h-[64px] rounded-[10px] border bg-background p-2 text-[12px] outline-none"
                                  style={{ borderColor: 'var(--ap-border)' }}
                                  placeholder="What did you do today?"
                                />
                                <div className="mt-2 flex gap-1">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); submitUpdate(row.id, day.date) }}
                                    className="inline-flex h-6 items-center rounded-[8px] px-2 text-[11px] font-semibold text-white"
                                    style={{ background: 'var(--ap-accent)' }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setEditingCell(null) }}
                                    className="inline-flex h-6 items-center rounded-[8px] border px-2 text-[11px] text-muted-foreground"
                                    style={{ borderColor: 'var(--ap-border)' }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : day.hasUpdate ? (
                              <CheckCircle2 className="mx-auto h-4 w-4" style={{ color: 'var(--ap-green)' }} />
                            ) : (
                              <div
                                className="mx-auto h-3.5 w-3.5 rounded-[4px]"
                                style={{ background: 'rgba(255,59,48,0.15)', border: '1px solid rgba(255,59,48,0.4)' }}
                              />
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

function KpiCard({ label, value, tint }: { label: string; value: string | number; tint: string }) {
  return (
    <div
      className="rounded-[14px] border bg-card p-4"
      style={{ borderColor: 'var(--ap-border)' }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-[28px] font-semibold tabular-nums tracking-tight" style={{ color: tint }}>
        {value}
      </div>
    </div>
  )
}
