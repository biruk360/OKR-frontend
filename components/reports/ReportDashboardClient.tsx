'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'
import {
  Search,
  SlidersHorizontal,
  Share2,
  ChevronDown,
  ChevronRight,
  Filter,
  RotateCcw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import {
  getKrDisplayStatus,
  statusLabel,
  bucketProgressCounts,
  avgConfidenceScore,
  type KrDisplayStatus,
} from '@/lib/reportDashboard'

export interface ReportKrRow {
  id: string
  title: string
  progress: number
  confidence: string
  unit: string
  startValue: number
  targetValue: number
  currentValue: number
  objectiveId: string
  objectiveTitle: string
  planLabel: string
  ownerId: string
  ownerName: string
  ownerAvatar: string | null
  checkInCount: number
}

export interface ReportObjectiveRow {
  id: string
  title: string
  progress: number
  goalStatus: string
  level: string
  planLabel: string
  ownerName: string
  ownerAvatar: string | null
  keyResultCount: number
}

export interface ReportTodoRow {
  id: string
  title: string
  status: string
  keyResultId: string
  krTitle: string
  objectiveTitle: string
  assigneeName: string
  dueDate: string | null
}

type MainTab = 'objectives' | 'key-results' | 'initiatives'
type SortKey = 'plan' | 'objective' | 'progress' | 'status'

const STATUS_COLORS: Record<KrDisplayStatus, string> = {
  pending: '#9ca3af',
  on_track: '#22c55e',
  at_risk: '#eab308',
  off_track: '#ef4444',
  not_measurable: '#1f2937',
}

const DONUT_BLUE = '#2563eb'

interface Props {
  currentUserId: string
  keyResults: ReportKrRow[]
  objectives: ReportObjectiveRow[]
  todos: ReportTodoRow[]
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function ReportDashboardClient({
  currentUserId,
  keyResults: krRows,
  objectives: objRows,
  todos: todoRows,
}: Props) {
  const [mainTab, setMainTab] = useState<MainTab>('key-results')
  const [filterOpen, setFilterOpen] = useState(true)
  const [segmentQuery, setSegmentQuery] = useState('')
  const [quickOwned, setQuickOwned] = useState(false)
  const [quickContributing, setQuickContributing] = useState(false)
  const [quickOffTrack, setQuickOffTrack] = useState(false)
  const [quickAtRisk, setQuickAtRisk] = useState(false)
  const [quickNoCheckIn, setQuickNoCheckIn] = useState(false)
  const [activePreset, setActivePreset] = useState<string>('all-key-results')

  // Honor ?filter=... from URL (e.g. dashboard "At a Glance" cards link in)
  const searchParams = useSearchParams()
  useEffect(() => {
    const f = searchParams?.get('filter')
    if (f) applyPreset(f)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  function clearAll() {
    setQuickOwned(false)
    setQuickContributing(false)
    setQuickOffTrack(false)
    setQuickAtRisk(false)
    setQuickNoCheckIn(false)
  }

  function applyPreset(preset: string) {
    clearAll()
    setActivePreset(preset)
    switch (preset) {
      case 'all-off-track':
        setQuickOffTrack(true)
        break
      case 'all-at-risk':
        setQuickAtRisk(true)
        break
      case 'your-key-results':
        setQuickOwned(true)
        setQuickContributing(true)
        break
      case 'owned':
        setQuickOwned(true)
        break
      case 'contributing':
        setQuickContributing(true)
        break
      case 'owned-off-track':
        setQuickOwned(true)
        setQuickOffTrack(true)
        break
      case 'owned-at-risk':
        setQuickOwned(true)
        setQuickAtRisk(true)
        break
      case 'on-track':
      case 'pending':
      case 'active':
      case 'draft':
      case 'all-key-results':
      default:
        // 'all-key-results' / 'active' / fallthrough — no extra flags
        break
    }
  }
  const [planStatus, setPlanStatus] = useState<string>('all')
  const [confidenceFilter, setConfidenceFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortKey>('plan')
  const [tableLimit, setTableLimit] = useState(25)
  /** undefined = expanded (default) */
  const [expandedObjectives, setExpandedObjectives] = useState<Record<string, boolean>>({})

  const krsWithStatus = useMemo(
    () =>
      krRows.map((kr) => ({
        ...kr,
        displayStatus: getKrDisplayStatus(kr),
      })),
    [krRows]
  )

  const filteredKrs = useMemo(() => {
    let list = krsWithStatus
    const q = segmentQuery.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (kr) =>
          kr.title.toLowerCase().includes(q) ||
          kr.objectiveTitle.toLowerCase().includes(q) ||
          kr.planLabel.toLowerCase().includes(q)
      )
    }
    if (quickOwned && !quickContributing) list = list.filter((kr) => kr.ownerId === currentUserId)
    if (quickContributing && !quickOwned) {
      // Contributing-only: KR has check-ins but the current user is not the owner.
      list = list.filter((kr) => kr.ownerId !== currentUserId && kr.checkInCount > 0)
    }
    // (Both true => "your key results" — owned OR contributing)
    if (quickOwned && quickContributing) {
      list = list.filter((kr) => kr.ownerId === currentUserId || kr.checkInCount > 0)
    }
    if (quickOffTrack) list = list.filter((kr) => kr.displayStatus === 'off_track')
    if (quickAtRisk) list = list.filter((kr) => kr.displayStatus === 'at_risk')
    if (quickNoCheckIn) list = list.filter((kr) => kr.checkInCount === 0)
    if (confidenceFilter !== 'all') {
      list = list.filter((kr) => kr.confidence === confidenceFilter)
    }
    if (planStatus !== 'all') {
      list = list.filter((kr) => {
        const o = objRows.find((x) => x.id === kr.objectiveId)
        if (!o) return true
        return o.goalStatus === planStatus
      })
    }
    return list
  }, [
    krsWithStatus,
    segmentQuery,
    quickOwned,
    quickContributing,
    quickOffTrack,
    quickAtRisk,
    quickNoCheckIn,
    confidenceFilter,
    planStatus,
    objRows,
    currentUserId,
  ])

  const sortedKrs = useMemo(() => {
    const copy = [...filteredKrs]
    copy.sort((a, b) => {
      switch (sortBy) {
        case 'plan':
          return a.planLabel.localeCompare(b.planLabel) || a.title.localeCompare(b.title)
        case 'objective':
          return a.objectiveTitle.localeCompare(b.objectiveTitle) || a.title.localeCompare(b.title)
        case 'progress':
          return b.progress - a.progress
        case 'status':
          return statusLabel(a.displayStatus).localeCompare(statusLabel(b.displayStatus))
        default:
          return 0
      }
    })
    return copy
  }, [filteredKrs, sortBy])

  const statusCounts = useMemo(() => {
    const init: Record<KrDisplayStatus, number> = {
      pending: 0,
      on_track: 0,
      at_risk: 0,
      off_track: 0,
      not_measurable: 0,
    }
    for (const kr of filteredKrs) {
      init[kr.displayStatus]++
    }
    return init
  }, [filteredKrs])

  const avgCompletion = useMemo(() => {
    if (filteredKrs.length === 0) return 0
    return Math.round(
      filteredKrs.reduce((s, kr) => s + Math.min(100, Math.max(0, kr.progress)), 0) /
        filteredKrs.length
    )
  }, [filteredKrs])

  const healthScore = useMemo(
    () =>
      avgConfidenceScore(
        filteredKrs.map((kr) => ({
          confidence: kr.confidence,
          displayStatus: kr.displayStatus,
        }))
      ),
    [filteredKrs]
  )

  const progressBarData = useMemo(
    () => bucketProgressCounts(filteredKrs.map((k) => k.progress)),
    [filteredKrs]
  )

  const donutConfidenceData = useMemo(
    () => [
      { name: 'On track', value: statusCounts.on_track, color: STATUS_COLORS.on_track },
      { name: 'At risk', value: statusCounts.at_risk, color: STATUS_COLORS.at_risk },
      { name: 'Off track', value: statusCounts.off_track, color: STATUS_COLORS.off_track },
      { name: 'Pending', value: statusCounts.pending, color: STATUS_COLORS.pending },
      {
        name: 'Not measurable',
        value: statusCounts.not_measurable,
        color: STATUS_COLORS.not_measurable,
      },
    ],
    [statusCounts]
  )

  const groupedByObjective = useMemo(() => {
    const map = new Map<string, typeof sortedKrs>()
    for (const kr of sortedKrs.slice(0, tableLimit)) {
      const key = kr.objectiveId
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(kr)
    }
    return map
  }, [sortedKrs, tableLimit])

  const resetFilters = useCallback(() => {
    setSegmentQuery('')
    setQuickOwned(false)
    setQuickOffTrack(false)
    setQuickAtRisk(false)
    setQuickNoCheckIn(false)
    setPlanStatus('all')
    setConfidenceFilter('all')
    setSortBy('plan')
  }, [])

  const shareReport = useCallback(() => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    if (url && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url)
      toast.success('Link copied to clipboard')
    }
  }, [])

  const toggleObjective = (id: string) => {
    setExpandedObjectives((prev) => ({ ...prev, [id]: !((prev[id] ?? true)) }))
  }

  const filteredObjectives = useMemo(() => {
    let list = objRows
    const q = segmentQuery.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (o) => o.title.toLowerCase().includes(q) || o.planLabel.toLowerCase().includes(q)
      )
    }
    if (planStatus !== 'all') list = list.filter((o) => o.goalStatus === planStatus)
    return list
  }, [objRows, segmentQuery, planStatus])

  const filteredTodos = useMemo(() => {
    let list = todoRows
    const q = segmentQuery.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.krTitle.toLowerCase().includes(q) ||
          t.objectiveTitle.toLowerCase().includes(q)
      )
    }
    return list
  }, [todoRows, segmentQuery])

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
      {/* Filter column */}
      <aside
        className={cn(
          'w-full shrink-0 rounded-lg border border-gray-200 bg-gray-50/80 lg:w-64',
          !filterOpen && 'hidden lg:block'
        )}
      >
        <div className="border-b border-gray-200 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">Filters</span>
            <button
              type="button"
              className="lg:hidden text-xs text-primary-600"
              onClick={() => setFilterOpen(false)}
            >
              Hide
            </button>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search objectives, KRs, plans…"
              value={segmentQuery}
              onChange={(e) => setSegmentQuery(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </div>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-3 py-3 text-sm lg:max-h-none">
          <PresetGroup
            title="Key results"
            items={[
              { id: 'all-key-results', label: 'All key results' },
              { id: 'active', label: 'Active' },
              { id: 'draft', label: 'Draft' },
              { id: 'all-off-track', label: 'All off track' },
              { id: 'all-at-risk', label: 'All at risk' },
            ]}
            active={activePreset}
            onPick={applyPreset}
          />
          <PresetGroup
            title="Your key results"
            items={[
              { id: 'your-key-results', label: 'Your key results' },
              { id: 'owned', label: 'Owned' },
              { id: 'contributing', label: 'Contributing' },
              { id: 'owned-off-track', label: 'Owned off track' },
              { id: 'owned-at-risk', label: 'Owned at risk' },
            ]}
            active={activePreset}
            onPick={applyPreset}
          />
          {(quickOwned || quickContributing || quickOffTrack || quickAtRisk || quickNoCheckIn) && (
            <button
              onClick={() => { clearAll(); setActivePreset('all-key-results') }}
              className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset filters
            </button>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-500">
              Portfolio view of objectives, key results, and initiatives.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 self-start rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 lg:hidden"
            onClick={() => setFilterOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </button>
        </div>

        {/* Main tabs */}
        <div className="flex border-b border-gray-200">
          {(
            [
              ['objectives', 'Objectives'],
              ['key-results', 'Key results'],
              ['initiatives', 'Initiatives'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMainTab(id)}
              className={cn(
                '-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold uppercase tracking-wide',
                mainTab === id
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700">
              <Filter className="h-3.5 w-3.5" />
              Filters
            </span>
            <select
              value={planStatus}
              onChange={(e) => setPlanStatus(e.target.value)}
              className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium uppercase text-gray-700"
            >
              <option value="all">Plan status — all</option>
              <option value="ON_TRACK">On track</option>
              <option value="AT_RISK">At risk</option>
              <option value="OFF_TRACK">Off track</option>
              <option value="CLOSED">Closed</option>
            </select>
            <select
              value={confidenceFilter}
              onChange={(e) => setConfidenceFilter(e.target.value)}
              className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium uppercase text-gray-700"
            >
              <option value="all">Confidence — all</option>
              <option value="ON_TRACK">On track</option>
              <option value="AT_RISK">At risk</option>
              <option value="OFF_TRACK">Off track</option>
            </select>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset filters
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-gray-600">
              {mainTab === 'key-results' && (
                <>
                  <span className="font-semibold text-gray-900">{filteredKrs.length}</span> key
                  results match
                </>
              )}
              {mainTab === 'objectives' && (
                <>
                  <span className="font-semibold text-gray-900">{filteredObjectives.length}</span>{' '}
                  objectives match
                </>
              )}
              {mainTab === 'initiatives' && (
                <>
                  <span className="font-semibold text-gray-900">{filteredTodos.length}</span>{' '}
                  initiatives match
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Save segment
              </button>
              <button
                type="button"
                onClick={shareReport}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary-700"
              >
                <Share2 className="h-3.5 w-3.5" />
                Share
              </button>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">Sort</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  className="rounded-md border border-gray-200 bg-white py-1 pl-2 pr-7 text-xs text-gray-800"
                  disabled={mainTab !== 'key-results'}
                >
                  <option value="plan">Plan</option>
                  <option value="objective">Objective</option>
                  <option value="progress">Progress</option>
                  <option value="status">Status</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {mainTab === 'key-results' && (
          <>
            {/* Status strip */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-5">
              <StatusCard label="Pending" value={statusCounts.pending} accent="bg-gray-400" />
              <StatusCard label="On track" value={statusCounts.on_track} accent="bg-emerald-500" />
              <StatusCard label="At risk" value={statusCounts.at_risk} accent="bg-amber-400" />
              <StatusCard label="Off track" value={statusCounts.off_track} accent="bg-red-500" />
              <StatusCard
                label="Not measurable"
                value={statusCounts.not_measurable}
                accent="bg-gray-900"
              />
            </div>

            {/*
              Average completion / Health score / Progress distribution chart row removed at user request.
              Counts above (Pending / On track / At risk / Off track / Not measurable) cover this need.
            */}

            {/* KR table */}
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 bg-gray-50/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Key results
              </div>
              <div className="divide-y divide-gray-100">
                {Array.from(groupedByObjective.entries()).map(([objId, rows]) => {
                  const title = rows[0]?.objectiveTitle ?? 'Objective'
                  const open = expandedObjectives[objId] ?? true
                  return (
                    <div key={objId}>
                      <button
                        type="button"
                        onClick={() => toggleObjective(objId)}
                        className="flex w-full items-center gap-2 bg-gray-50 px-3 py-2 text-left text-sm font-semibold text-gray-900 hover:bg-gray-100"
                      >
                        {open ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />
                        )}
                        <span className="truncate">{title}</span>
                      </button>
                      {open && (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                              <th className="px-3 py-2 font-medium">Key result</th>
                              <th className="hidden px-2 py-2 font-medium sm:table-cell">Plan</th>
                              <th className="px-2 py-2 font-medium">Progress</th>
                              <th className="hidden px-2 py-2 font-medium md:table-cell">Owner</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((kr) => (
                              <tr key={kr.id} className="border-b border-gray-50 hover:bg-gray-50/80">
                                <td className="max-w-md px-3 py-2.5">
                                  <Link
                                    href={`/dashboard/key-results/${kr.id}`}
                                    className="font-medium text-primary-700 hover:underline"
                                  >
                                    {kr.title}
                                  </Link>
                                </td>
                                <td className="hidden max-w-[10rem] truncate px-2 py-2.5 text-gray-600 sm:table-cell">
                                  {kr.planLabel}
                                </td>
                                <td className="whitespace-nowrap px-2 py-2.5">
                                  <span
                                    className={cn(
                                      'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                                      kr.displayStatus === 'off_track' && 'bg-red-50 text-red-800',
                                      kr.displayStatus === 'at_risk' && 'bg-amber-50 text-amber-900',
                                      kr.displayStatus === 'on_track' && 'bg-emerald-50 text-emerald-900',
                                      kr.displayStatus === 'pending' && 'bg-gray-100 text-gray-700',
                                      kr.displayStatus === 'not_measurable' && 'bg-gray-900 text-white'
                                    )}
                                  >
                                    {statusLabel(kr.displayStatus)}
                                  </span>
                                  <span className="ml-2 text-gray-600">
                                    {Math.round(kr.progress)}%
                                  </span>
                                </td>
                                <td className="hidden px-2 py-2 md:table-cell">
                                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-800">
                                    {initials(kr.ownerName)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )
                })}
              </div>
              {sortedKrs.length > tableLimit && (
                <div className="border-t border-gray-100 p-3 text-center">
                  <button
                    type="button"
                    onClick={() => setTableLimit((n) => n + 25)}
                    className="text-sm font-medium text-primary-600 hover:text-primary-800"
                  >
                    Load more
                  </button>
                </div>
              )}
              {sortedKrs.length === 0 && (
                <p className="p-8 text-center text-sm text-gray-500">No key results match these filters.</p>
              )}
            </div>
          </>
        )}

        {mainTab === 'objectives' && (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <th className="px-4 py-3 font-medium">Objective</th>
                  <th className="hidden px-3 py-3 font-medium sm:table-cell">Plan</th>
                  <th className="px-3 py-3 font-medium">Progress</th>
                  <th className="hidden px-3 py-3 font-medium md:table-cell">Key results</th>
                  <th className="px-3 py-3 font-medium">Owner</th>
                </tr>
              </thead>
              <tbody>
                {filteredObjectives.map((o) => (
                  <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/objectives/${o.id}`}
                        className="font-medium text-primary-700 hover:underline"
                      >
                        {o.title}
                      </Link>
                      <div className="text-xs text-gray-500">{o.level.replace('_', ' ')}</div>
                    </td>
                    <td className="hidden max-w-[10rem] truncate px-3 py-3 text-gray-600 sm:table-cell">
                      {o.planLabel}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span className="font-medium text-gray-900">{Math.round(o.progress)}%</span>
                    </td>
                    <td className="hidden px-3 py-3 text-gray-600 md:table-cell">{o.keyResultCount}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-800">
                        {initials(o.ownerName)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredObjectives.length === 0 && (
              <p className="p-8 text-center text-sm text-gray-500">No objectives match these filters.</p>
            )}
          </div>
        )}

        {mainTab === 'initiatives' && (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <th className="px-4 py-3 font-medium">Initiative</th>
                  <th className="hidden px-3 py-3 font-medium lg:table-cell">Key result</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="hidden px-3 py-3 font-medium md:table-cell">Assignee</th>
                </tr>
              </thead>
              <tbody>
                {filteredTodos.map((t) => (
                  <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{t.title}</div>
                      <div className="text-xs text-gray-500">{t.objectiveTitle}</div>
                    </td>
                    <td className="hidden max-w-xs truncate px-3 py-3 text-gray-600 lg:table-cell">
                      <Link
                        href={`/dashboard/key-results/${t.keyResultId}`}
                        className="text-primary-700 hover:underline"
                      >
                        {t.krTitle}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800">
                        {t.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 text-gray-700 md:table-cell">{t.assigneeName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredTodos.length === 0 && (
              <p className="p-8 text-center text-sm text-gray-500">No initiatives in this scope.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function FilterChip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary-500 bg-primary-50 text-primary-900'
          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
      )}
    >
      {children}
    </button>
  )
}

function PresetGroup({
  title,
  items,
  active,
  onPick,
}: {
  title: string
  items: { id: string; label: string }[]
  active: string
  onPick: (id: string) => void
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onPick(item.id)}
              className={cn(
                'w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                active === item.id
                  ? 'bg-primary-50 font-medium text-primary-900'
                  : 'text-gray-700 hover:bg-white hover:text-gray-900'
              )}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StatusCard({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className={cn('mb-2 h-1 w-full rounded-full', accent)} />
      <div className="text-2xl font-bold tabular-nums text-gray-900">{value}</div>
      <div className="text-xs font-medium text-gray-500">{label}</div>
    </div>
  )
}
