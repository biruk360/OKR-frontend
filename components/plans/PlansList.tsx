'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Star, MoreHorizontal, Search } from 'lucide-react'

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
    <div className="notion-surface min-h-screen">
      <div className="mx-auto max-w-[1280px] px-6 py-6">
        {/* Tabs + create button */}
        <div className="mb-4 flex items-center justify-between border-b border-[color:var(--notion-divider)]">
          <div className="flex items-center gap-1">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'all'}
              className="notion-tab"
              onClick={() => setTab('all')}
            >
              All plans
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'watched'}
              className="notion-tab"
              onClick={() => setTab('watched')}
            >
              Watched plans
            </button>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Link
              href="/dashboard/objectives?create=1"
              className="notion-button notion-button-primary"
            >
              Create a new plan
            </Link>
            <button className="notion-icon-button" aria-label="More">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filter row */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--notion-text-tertiary)]" />
            <input
              className="notion-input pl-7 w-[220px]"
              placeholder="Filter plans by name"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
            />
          </div>
          <select
            className="notion-input w-[180px]"
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
          >
            <option value="">Filter plans by team</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            className="notion-input w-[180px]"
            value={insightFilter}
            onChange={(e) => setInsightFilter(e.target.value)}
          >
            <option value="">Filter plans by insight</option>
            <option value="on-track">On track (NCS &gt; 66)</option>
            <option value="at-risk">At risk (NCS 34–66)</option>
            <option value="off-track">Off track (NCS ≤ 33)</option>
          </select>
          <label className="ml-auto inline-flex items-center gap-2 text-[12px] text-[color:var(--notion-text-secondary)]">
            <input
              type="checkbox"
              checked={hideFinished}
              onChange={(e) => setHideFinished(e.target.checked)}
              className="notion-checkbox"
            />
            Hide finished plans
          </label>
        </div>

        {/* Table */}
        <div className="notion-card">
          <table className="notion-table">
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
                    <td colSpan={6} className="!py-1.5 !pl-3 notion-eyebrow !border-b-0">Favorite plans</td>
                  </tr>
                  {favoriteRows.map((row) => (
                    <PlanTableRow key={row.id} row={row} isFavorite onToggleFavorite={toggleFavorite} />
                  ))}
                </>
              )}
              {(favoriteRows.length > 0 && otherRows.length > 0) && (
                <tr>
                  <td colSpan={6} className="!py-1.5 !pl-3 notion-eyebrow !border-b-0">All plans</td>
                </tr>
              )}
              {otherRows.map((row) => (
                <PlanTableRow key={row.id} row={row} isFavorite={false} onToggleFavorite={toggleFavorite} />
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center !py-8 text-[color:var(--notion-text-tertiary)]">
                    No plans match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
  const ncsTone = row.ncs <= 33 ? 'red' : row.ncs <= 66 ? 'yellow' : 'green'
  const statusTone = row.status === 'ARCHIVED' ? 'gray' : row.goalStatus === 'CLOSED' ? 'gray' : 'blue'
  const statusLabel = row.status === 'ARCHIVED' ? 'Archived' : row.goalStatus === 'CLOSED' ? 'Done' : 'In Progress'
  const timeline = `${formatMonthYear(row.timeframeStart)} → ${formatMonthYear(row.timeframeEnd)}`

  return (
    <tr>
      <td>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleFavorite(row.id)}
            className="notion-icon-button"
            aria-label={isFavorite ? 'Unfavorite' : 'Favorite'}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star className={`h-3.5 w-3.5 ${isFavorite ? 'fill-yellow-400 text-yellow-500' : ''}`} />
          </button>
          <Link href={planLink} className="font-medium text-[color:var(--notion-text)] hover:underline">
            {row.title}
          </Link>
          {row.department && (
            <span className="notion-pill" data-tone="gray">{row.department}</span>
          )}
        </div>
      </td>
      <td>
        <div className="flex items-center gap-2">
          <span className="notion-text-secondary tabular-nums">{row.keyResultsProgressPct}%</span>
          <div className="w-16 notion-progress">
            <div className="notion-progress-fill" style={{ width: `${row.keyResultsProgressPct}%` }} />
          </div>
        </div>
      </td>
      <td>
        <span className="notion-text-secondary tabular-nums">
          {row.initiativesClosed}/{row.initiativesTotal}
        </span>
      </td>
      <td>
        <div className="flex items-center gap-1.5">
          <span className="notion-pill" data-tone={ncsTone}>{row.ncs} NCS</span>
        </div>
      </td>
      <td className="notion-text-tertiary">{timeline}</td>
      <td>
        <span className="notion-pill" data-tone={statusTone}>{statusLabel}</span>
      </td>
    </tr>
  )
}

function formatMonthYear(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}
