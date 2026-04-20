'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Star, MoreHorizontal, Search, List, GanttChartSquare } from 'lucide-react'

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

  return (
    <div className=" -m-3 sm:-m-6 min-h-full p-4 sm:p-6">
      <div className="mx-auto max-w-[1280px]">
        {/* Tabs + create button */}
        <div className="mb-3 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-1">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'all'}
              className="inline-flex items-center gap-1 px-2.5 py-2 text-sm font-medium border-b-2 border-transparent cursor-pointer text-muted-foreground hover:text-foreground"
              onClick={() => setTab('all')}
            >
              All plans
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'watched'}
              className="inline-flex items-center gap-1 px-2.5 py-2 text-sm font-medium border-b-2 border-transparent cursor-pointer text-muted-foreground hover:text-foreground"
              onClick={() => setTab('watched')}
            >
              Watched plans
            </button>
          </div>
          <div className="flex items-center gap-2 pb-1">
            <div className="inline-flex rounded border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setView('list')}
                className={`inline-flex items-center gap-1 px-2 py-1 text-xs ${
                  view === 'list'
                    ? 'bg-primary-500 text-white'
                    : 'bg-card text-muted-foreground hover:bg-muted'
                }`}
                aria-pressed={view === 'list'}
                title="List view"
              >
                <List className="h-3.5 w-3.5" /> List
              </button>
              <button
                type="button"
                onClick={() => setView('gantt')}
                className={`inline-flex items-center gap-1 px-2 py-1 text-xs ${
                  view === 'gantt'
                    ? 'bg-primary-500 text-white'
                    : 'bg-card text-muted-foreground hover:bg-muted'
                }`}
                aria-pressed={view === 'gantt'}
                title="Gantt view"
              >
                <GanttChartSquare className="h-3.5 w-3.5" /> Gantt
              </button>
            </div>
            <Link
              href="/dashboard/objectives?create=1"
              className="btn-outline btn-primary"
            >
              Create a plan
            </Link>
            <button className="inline-flex items-center justify-center size-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer" aria-label="More">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filter row */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              className="input pl-7 w-[220px]"
              placeholder="Filter plans by name"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
            />
          </div>
          <select
            className="input input w-[180px]"
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
          >
            <option value="">Filter plans by team</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            className="input input w-[180px]"
            value={insightFilter}
            onChange={(e) => setInsightFilter(e.target.value)}
          >
            <option value="">Filter plans by insight</option>
            <option value="on-track">On track (NCS &gt; 66)</option>
            <option value="at-risk">At risk (NCS 34–66)</option>
            <option value="off-track">Off track (NCS ≤ 33)</option>
          </select>
          <label className="ml-auto inline-flex items-center gap-2 text-[12px] text-muted-foreground">
            <input
              type="checkbox"
              checked={hideFinished}
              onChange={(e) => setHideFinished(e.target.checked)}
              className="appearance-none w-3.5 h-3.5 rounded border border-border"
            />
            Hide finished plans
          </label>
        </div>

        {/* Gantt view */}
        {view === 'gantt' && <PlansGantt />}

        {/* Table */}
        {view === 'list' && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Plan</th>
                <th style={{ width: '14%' }}>Key results</th>
                <th style={{ width: '12%' }}>Initiatives</th>
                <th style={{ width: '14%' }}>Confidence</th>
                <th style={{ width: '12%' }}>Timeline</th>
                <th style={{ width: '8%' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {favoriteRows.length > 0 && (
                <>
                  <tr>
                    <td colSpan={6} className="!py-1.5 !pl-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground !border-b-0">Favorite plans</td>
                  </tr>
                  {favoriteRows.map((row) => (
                    <PlanTableRow key={row.id} row={row} isFavorite onToggleFavorite={toggleFavorite} />
                  ))}
                </>
              )}
              {(favoriteRows.length > 0 && otherRows.length > 0) && (
                <tr>
                  <td colSpan={6} className="!py-1.5 !pl-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground !border-b-0">All plans</td>
                </tr>
              )}
              {otherRows.map((row) => (
                <PlanTableRow key={row.id} row={row} isFavorite={false} onToggleFavorite={toggleFavorite} />
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center !py-8 text-xs text-muted-foreground">
                    No plans match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  )
}

function PlanTableRow({
  row,
  isFavorite,
  onToggleFavorite,
}: {
  row: PlanRow
  isFavorite: boolean
  onToggleFavorite: (id: string) => void
}) {
  const planLink = `/dashboard/objectives/${row.id}`
  const ncsTone = row.ncs <= 33 ? 'danger' : row.ncs <= 66 ? 'warning' : 'success'
  const statusTone =
    row.status === 'ARCHIVED' || row.goalStatus === 'CLOSED' ? undefined : 'primary'
  const statusLabel =
    row.status === 'ARCHIVED' ? 'Archived' : row.goalStatus === 'CLOSED' ? 'Done' : 'In progress'
  const timeline = `${formatMonthYear(row.timeframeStart)} → ${formatMonthYear(row.timeframeEnd)}`

  return (
    <tr>
      <td>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleFavorite(row.id)}
            className="inline-flex items-center justify-center size-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label={isFavorite ? 'Unfavorite' : 'Favorite'}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star className={`h-3.5 w-3.5 ${isFavorite ? 'fill-yellow-400 text-yellow-500' : ''}`} />
          </button>
          <Link href={planLink} className="font-medium text-foreground hover:underline">
            {row.title}
          </Link>
          {row.department && (
            <span className="inline-flex items-center h-5 px-1.5 text-xs font-medium rounded">{row.department}</span>
          )}
        </div>
      </td>
      <td>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground tabular-nums">{row.keyResultsProgressPct}%</span>
          <div className="w-16 h-1 w-full bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${row.keyResultsProgressPct}%` }} />
          </div>
        </div>
      </td>
      <td>
        <span className="text-sm text-muted-foreground tabular-nums">
          {row.initiativesClosed}/{row.initiativesTotal}
        </span>
      </td>
      <td>
        <span className="inline-flex items-center h-4 px-1 text-[11px] font-bold uppercase rounded" data-tone={ncsTone}>
          {row.ncs} NCS
        </span>
      </td>
      <td className="text-xs text-muted-foreground">{timeline}</td>
      <td>
        <span className="inline-flex items-center h-4 px-1 text-[11px] font-bold uppercase rounded" data-tone={statusTone}>{statusLabel}</span>
      </td>
    </tr>
  )
}

function formatMonthYear(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}
