'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Star, MoreHorizontal, Search, List, GanttChartSquare } from 'lucide-react'
import StatusPill from '@/components/shared/StatusPill'
import { EmptyState } from '@/components/ui/EmptyState'

const PlansGantt = dynamic(() => import('./PlansGantt'), { ssr: false })

export interface PlanRow {
  id: string
  title: string
  level: string
  ownerName: string
  ownerAvatar: string | null
  timeframeId: string
  timeframeName: string
  timeframeStart: string
  timeframeEnd: string
  department: string | null
  keyResultsTotal: number
  keyResultsCompleted: number
  keyResultsProgressPct: number
  initiativesTotal: number
  initiativesClosed: number
  ncs: number
  goalStatus: string
  status: string
  childCount: number
}

const FAVORITES_KEY = 'okr.plans.favorites'

function APSeg<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string; icon?: React.ReactNode }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div
      className="inline-flex items-center rounded-[10px] p-0.5 border"
      style={{ background: 'var(--ap-bg-sunken)', borderColor: 'var(--ap-border)' }}
    >
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center gap-1 h-6 px-2.5 rounded-[8px] text-[11px] font-medium transition ${
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export default function PlansList({
  rows,
  currentUserId: _currentUserId,
}: {
  rows: PlanRow[]
  currentUserId: string
}) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<'all' | 'watched'>('all')
  const [view, setView] = useState<'list' | 'gantt'>('list')
  const [hideFinished, setHideFinished] = useState(false)
  const [nameFilter, setNameFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [insightFilter, setInsightFilter] = useState('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY)
      if (raw) setFavorites(new Set(JSON.parse(raw)))
    } catch {}
  }, [])

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(next))) } catch {}
      return next
    })
  }

  const departments = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.department) set.add(r.department)
    return Array.from(set).sort()
  }, [rows])

  const filteredRows = useMemo(() => {
    let list = rows
    if (tab === 'watched') list = list.filter((r) => favorites.has(r.id))
    if (nameFilter.trim()) {
      const q = nameFilter.trim().toLowerCase()
      list = list.filter((r) => r.title.toLowerCase().includes(q))
    }
    if (teamFilter) {
      list = list.filter((r) => r.department === teamFilter)
    }
    if (insightFilter === 'off-track') list = list.filter((r) => r.ncs <= 33)
    if (insightFilter === 'at-risk') list = list.filter((r) => r.ncs > 33 && r.ncs <= 66)
    if (insightFilter === 'on-track') list = list.filter((r) => r.ncs > 66)
    if (hideFinished) list = list.filter((r) => r.goalStatus !== 'CLOSED' && r.status !== 'ARCHIVED')
    return list
  }, [rows, tab, favorites, nameFilter, teamFilter, insightFilter, hideFinished])

  const favoriteRows = filteredRows.filter((r) => favorites.has(r.id))
  const otherRows = filteredRows.filter((r) => !favorites.has(r.id))

  // KPIs
  const kpis = useMemo(() => {
    const total = rows.length
    const onTrack = rows.filter((r) => r.ncs > 66).length
    const atRisk = rows.filter((r) => r.ncs > 33 && r.ncs <= 66).length
    const offTrack = rows.filter((r) => r.ncs <= 33).length
    const avgProgress = total
      ? Math.round(rows.reduce((s, r) => s + (r.keyResultsProgressPct || 0), 0) / total)
      : 0
    return { total, onTrack, atRisk, offTrack, avgProgress }
  }, [rows])

  return (
    <div className="-m-3 sm:-m-6 min-h-full p-4 sm:p-6">
      <div className={view === 'gantt' ? 'w-full space-y-4' : 'mx-auto max-w-[1280px] space-y-4'}>
        {/* Hero */}
        <header className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight text-foreground">Plans</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {kpis.total} plan{kpis.total === 1 ? '' : 's'} across the organization · avg progress {kpis.avgProgress}%
            </p>
          </div>
          <div className="flex items-center gap-2">
            <APSeg
              value={view}
              onChange={setView}
              options={[
                { value: 'list', label: 'List', icon: <List className="h-3 w-3" /> },
                { value: 'gantt', label: 'Gantt', icon: <GanttChartSquare className="h-3 w-3" /> },
              ]}
            />
            <Link
              href="/dashboard/objectives?create=1"
              className="inline-flex h-7 items-center rounded-[10px] px-3 text-[12px] font-semibold text-white"
              style={{ background: 'var(--ap-accent)' }}
            >
              Create a plan
            </Link>
            <button
              className="inline-flex items-center justify-center size-7 rounded-[10px] border text-muted-foreground hover:text-foreground"
              style={{ borderColor: 'var(--ap-border)' }}
              aria-label="More"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Total" value={kpis.total} tint="var(--ap-fg-muted)" />
          <KpiCard label="On track" value={kpis.onTrack} tint="var(--ap-green)" />
          <KpiCard label="At risk" value={kpis.atRisk} tint="var(--ap-orange)" />
          <KpiCard label="Off track" value={kpis.offTrack} tint="var(--ap-red)" />
        </div>

        {/* Sub-tabs + filter strip */}
        <div
          className="rounded-[14px] border bg-card overflow-hidden"
          style={{ borderColor: 'var(--ap-border)' }}
        >
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--ap-border)' }}>
            <APSeg
              value={tab}
              onChange={setTab}
              options={[
                { value: 'all', label: 'All plans' },
                { value: 'watched', label: 'Watched' },
              ]}
            />
            <div className="relative ml-1">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                className="h-7 w-[220px] rounded-[10px] border bg-background pl-7 pr-2 text-[12px] outline-none"
                style={{ borderColor: 'var(--ap-border)' }}
                placeholder="Filter by name"
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
              />
            </div>
            <select
              className="h-7 rounded-[10px] border bg-background px-2 text-[12px] outline-none"
              style={{ borderColor: 'var(--ap-border)' }}
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
            >
              <option value="">All teams</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select
              className="h-7 rounded-[10px] border bg-background px-2 text-[12px] outline-none"
              style={{ borderColor: 'var(--ap-border)' }}
              value={insightFilter}
              onChange={(e) => setInsightFilter(e.target.value)}
            >
              <option value="">Any insight</option>
              <option value="on-track">On track (NCS &gt; 66)</option>
              <option value="at-risk">At risk (NCS 34–66)</option>
              <option value="off-track">Off track (NCS ≤ 33)</option>
            </select>
            <label className="ml-auto inline-flex items-center gap-2 text-[12px] text-muted-foreground">
              <input
                type="checkbox"
                checked={hideFinished}
                onChange={(e) => setHideFinished(e.target.checked)}
                className="appearance-none w-3.5 h-3.5 rounded border"
                style={{ borderColor: 'var(--ap-border)' }}
              />
              Hide finished
            </label>
          </div>

          {/* Gantt */}
          {view === 'gantt' && (
            <div className="p-3"><PlansGantt /></div>
          )}

          {/* List */}
          {view === 'list' && (
            filteredRows.length === 0 ? (
              <div className="p-2">
                <EmptyState
                  bare
                  title="No plans match your filters"
                  description="Adjust the filters above or clear them to see all plans."
                />
              </div>
            ) : (
              <div className="overflow-hidden">
                <div
                  className="grid items-center gap-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b"
                  style={{
                    borderColor: 'var(--ap-border)',
                    background: 'var(--ap-bg-sunken)',
                    gridTemplateColumns: 'minmax(0,2.5fr) minmax(140px,1fr) minmax(120px,0.8fr) 90px minmax(120px,1fr) 110px',
                  }}
                >
                  <div>Plan</div>
                  <div>Key results</div>
                  <div>Initiatives</div>
                  <div>NCS</div>
                  <div>Timeline</div>
                  <div>Status</div>
                </div>

                {favoriteRows.length > 0 && (
                  <>
                    <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Favorites
                    </div>
                    {favoriteRows.map((row) => (
                      <PlanRowItem key={row.id} row={row} isFavorite onToggleFavorite={toggleFavorite} />
                    ))}
                  </>
                )}
                {favoriteRows.length > 0 && otherRows.length > 0 && (
                  <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-t" style={{ borderColor: 'var(--ap-border)' }}>
                    All plans
                  </div>
                )}
                {otherRows.map((row) => (
                  <PlanRowItem key={row.id} row={row} isFavorite={false} onToggleFavorite={toggleFavorite} />
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <div
      className="rounded-[14px] border bg-card p-4"
      style={{ borderColor: 'var(--ap-border)' }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-[28px] font-semibold tabular-nums tracking-tight" style={{ color: tint }}>
          {value}
        </span>
      </div>
    </div>
  )
}

function PlanRowItem({
  row,
  isFavorite,
  onToggleFavorite,
}: {
  row: PlanRow
  isFavorite: boolean
  onToggleFavorite: (id: string) => void
}) {
  const planLink = `/dashboard/objectives/${row.id}`
  const ncsColor =
    row.ncs <= 33 ? 'var(--ap-red)' : row.ncs <= 66 ? 'var(--ap-orange)' : 'var(--ap-green)'
  const status =
    row.status === 'ARCHIVED' ? 'closed' : row.goalStatus === 'CLOSED' ? 'completed' : 'in-progress'
  const timeline = `${formatMonthYear(row.timeframeStart)} → ${formatMonthYear(row.timeframeEnd)}`

  return (
    <div
      className="grid items-center gap-2 px-4 py-2.5 border-t hover:bg-[var(--ap-bg-hover,rgba(0,0,0,0.02))] transition-colors"
      style={{
        borderColor: 'var(--ap-border)',
        gridTemplateColumns: 'minmax(0,2.5fr) minmax(140px,1fr) minmax(120px,0.8fr) 90px minmax(120px,1fr) 110px',
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={() => onToggleFavorite(row.id)}
          className="inline-flex items-center justify-center size-6 rounded-md text-muted-foreground hover:bg-muted"
          aria-label={isFavorite ? 'Unfavorite' : 'Favorite'}
        >
          <Star className={`h-3.5 w-3.5 ${isFavorite ? 'fill-yellow-400 text-yellow-500' : ''}`} />
        </button>
        <Link href={planLink} className="text-[13px] font-medium text-foreground hover:underline truncate">
          {row.title}
        </Link>
        {row.department && (
          <span
            className="inline-flex items-center h-5 px-1.5 text-[10px] font-medium rounded-full"
            style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}
          >
            {row.department}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div
          className="h-1.5 w-16 overflow-hidden rounded-full"
          style={{ background: 'var(--ap-bg-sunken)' }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${row.keyResultsProgressPct}%`, background: 'var(--ap-accent)' }}
          />
        </div>
        <span className="text-[12px] tabular-nums text-muted-foreground">{row.keyResultsProgressPct}%</span>
      </div>
      <div className="text-[12px] tabular-nums text-muted-foreground">
        {row.initiativesClosed}/{row.initiativesTotal}
      </div>
      <div>
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
          style={{ background: 'rgba(0,0,0,0.04)', color: ncsColor }}
        >
          {row.ncs}
        </span>
      </div>
      <div className="text-[12px] text-muted-foreground tabular-nums">{timeline}</div>
      <div>
        <StatusPill status={status} size="xs" />
      </div>
    </div>
  )
}

function formatMonthYear(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}
