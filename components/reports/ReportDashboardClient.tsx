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
  X,
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
  /** ACTIVE | DRAFT | ARCHIVED — drives the Active/Draft preset filters. */
  status: string
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

export interface FilterOptions {
  users: Array<{ id: string; name: string }>
  departments: Array<{ id: string; name: string }>
  timeframes: Array<{ id: string; name: string }>
}

interface Props {
  currentUserId: string
  keyResults: ReportKrRow[]
  objectives: ReportObjectiveRow[]
  todos: ReportTodoRow[]
  filterOptions?: FilterOptions
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
  filterOptions,
}: Props) {
  const [mainTab, setMainTab] = useState<MainTab>('key-results')
  const [filterOpen, setFilterOpen] = useState(true)

  // Dynamic filter chips — each chip is { type, id, label }
  const [dynamicFilters, setDynamicFilters] = useState<Array<{ type: string; id: string; label: string }>>([])
  const [addingFilterType, setAddingFilterType] = useState<string | null>(null)

  function addDynamicFilter(type: string, id: string, label: string) {
    setDynamicFilters((prev) => {
      if (prev.some((f) => f.type === type && f.id === id)) return prev
      return [...prev, { type, id, label }]
    })
    setAddingFilterType(null)
  }
  function removeDynamicFilter(type: string, id: string) {
    setDynamicFilters((prev) => prev.filter((f) => !(f.type === type && f.id === id)))
  }
  const [segmentQuery, setSegmentQuery] = useState('')
  const [quickOwned, setQuickOwned] = useState(false)
  const [quickContributing, setQuickContributing] = useState(false)
  const [quickOffTrack, setQuickOffTrack] = useState(false)
  const [quickAtRisk, setQuickAtRisk] = useState(false)
  const [quickNoCheckIn, setQuickNoCheckIn] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'ACTIVE' | 'DRAFT'>('all')
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
    setStatusFilter('all')
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
      case 'active':
        setStatusFilter('ACTIVE')
        break
      case 'draft':
        setStatusFilter('DRAFT')
        break
      case 'on-track':
      case 'pending':
      case 'all-key-results':
      default:
        // no extra flags
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
    if (statusFilter !== 'all') list = list.filter((kr) => kr.status === statusFilter)

    // Dynamic filter chips (AND-chained)
    const userFilters = dynamicFilters.filter((f) => f.type === 'user').map((f) => f.id)
    const deptFilters = dynamicFilters.filter((f) => f.type === 'department').map((f) => f.id)
    const tfFilters = dynamicFilters.filter((f) => f.type === 'timeframe').map((f) => f.label)
    if (userFilters.length > 0) {
      list = list.filter((kr) => userFilters.includes(kr.ownerId))
    }
    if (deptFilters.length > 0) {
      list = list.filter((kr) => {
        const obj = objRows.find((o) => o.id === kr.objectiveId)
        return obj && deptFilters.some((d) => obj.planLabel.includes(d))
      })
    }
    if (tfFilters.length > 0) {
      list = list.filter((kr) => {
        const obj = objRows.find((o) => o.id === kr.objectiveId)
        return obj && tfFilters.some((t) => obj.planLabel.includes(t))
      })
    }
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
    statusFilter,
    dynamicFilters,
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
          'w-full shrink-0 rounded-lg border border-border bg-muted/80 lg:w-64',
          !filterOpen && 'hidden lg:block'
        )}
      >
        <div className="border-b border-border px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Filters</span>
            <button
              type="button"
              className="lg:hidden text-xs text-primary-600"
              onClick={() => setFilterOpen(false)}
            >
              Hide
            </button>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search objectives, KRs, plans…"
              value={segmentQuery}
              onChange={(e) => setSegmentQuery(e.target.value)}
              className="w-full rounded-md border border-border bg-card py-1.5 pl-8 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
        {/* Dynamic filter chip bar */}
        <div className="flex flex-wrap items-center gap-2">
          {dynamicFilters.map((f) => (
            <span key={`${f.type}-${f.id}`} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              <span className="text-muted-foreground capitalize">{f.type}:</span> {f.label}
              <button
                onClick={() => removeDynamicFilter(f.type, f.id)}
                className="ml-0.5 text-muted-foreground hover:text-muted-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          {/* Add filter dropdown */}
          <div className="relative">
            <button
              onClick={() => setAddingFilterType(addingFilterType ? null : '_pick')}
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:border-gray-400 hover:text-muted-foreground"
            >
              <Filter className="h-3 w-3" /> Add filter
            </button>

            {addingFilterType === '_pick' && (
              <div className="absolute left-0 top-8 z-20 rounded-md border border-border bg-card p-1 shadow-lg min-w-[160px]">
                <button onClick={() => setAddingFilterType('user')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted rounded">User</button>
                <button onClick={() => setAddingFilterType('department')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted rounded">Department</button>
                <button onClick={() => setAddingFilterType('timeframe')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted rounded">Timeframe</button>
                <button onClick={() => setAddingFilterType('confidence')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted rounded">Confidence</button>
                <button onClick={() => setAddingFilterType('status')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted rounded">Status</button>
              </div>
            )}

            {addingFilterType === 'user' && filterOptions && (
              <div className="absolute left-0 top-8 z-20 rounded-md border border-border bg-card p-1 shadow-lg min-w-[200px] max-h-[240px] overflow-auto">
                {filterOptions.users.map((u) => (
                  <button key={u.id} onClick={() => addDynamicFilter('user', u.id, u.name)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted rounded truncate">{u.name}</button>
                ))}
              </div>
            )}
            {addingFilterType === 'department' && filterOptions && (
              <div className="absolute left-0 top-8 z-20 rounded-md border border-border bg-card p-1 shadow-lg min-w-[200px] max-h-[240px] overflow-auto">
                {filterOptions.departments.map((d) => (
                  <button key={d.id} onClick={() => addDynamicFilter('department', d.id, d.name)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted rounded truncate">{d.name}</button>
                ))}
              </div>
            )}
            {addingFilterType === 'timeframe' && filterOptions && (
              <div className="absolute left-0 top-8 z-20 rounded-md border border-border bg-card p-1 shadow-lg min-w-[200px] max-h-[240px] overflow-auto">
                {filterOptions.timeframes.map((t) => (
                  <button key={t.id} onClick={() => addDynamicFilter('timeframe', t.id, t.name)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted rounded truncate">{t.name}</button>
                ))}
              </div>
            )}
            {addingFilterType === 'confidence' && (
              <div className="absolute left-0 top-8 z-20 rounded-md border border-border bg-card p-1 shadow-lg min-w-[160px]">
                <button onClick={() => addDynamicFilter('confidence', 'ON_TRACK', 'On track')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted rounded">On track</button>
                <button onClick={() => addDynamicFilter('confidence', 'AT_RISK', 'At risk')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted rounded">At risk</button>
                <button onClick={() => addDynamicFilter('confidence', 'OFF_TRACK', 'Off track')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted rounded">Off track</button>
              </div>
            )}
            {addingFilterType === 'status' && (
              <div className="absolute left-0 top-8 z-20 rounded-md border border-border bg-card p-1 shadow-lg min-w-[160px]">
                <button onClick={() => addDynamicFilter('status', 'ACTIVE', 'Active')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted rounded">Active</button>
                <button onClick={() => addDynamicFilter('status', 'DRAFT', 'Draft')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted rounded">Draft</button>
              </div>
            )}
          </div>

          {dynamicFilters.length > 0 && (
            <button
              onClick={() => setDynamicFilters([])}
              className="text-xs text-primary-600 hover:text-primary-700"
            >
              Clear all
            </button>
          )}

          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 self-start rounded-md border border-border bg-card px-2 py-1 text-sm text-muted-foreground lg:hidden"
            onClick={() => setFilterOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Presets
          </button>
        </div>

        {/* Main tabs */}
        <div className="flex border-b border-border">
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
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              Filters
            </span>
            <select
              value={planStatus}
              onChange={(e) => setPlanStatus(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1.5 text-xs font-medium uppercase text-muted-foreground"
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
              className="rounded-md border border-border bg-card px-2 py-1.5 text-xs font-medium uppercase text-muted-foreground"
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
            <p className="text-sm text-muted-foreground">
              {mainTab === 'key-results' && (
                <>
                  <span className="font-semibold text-foreground">{filteredKrs.length}</span> key
                  results match
                </>
              )}
              {mainTab === 'objectives' && (
                <>
                  <span className="font-semibold text-foreground">{filteredObjectives.length}</span>{' '}
                  objectives match
                </>
              )}
              {mainTab === 'initiatives' && (
                <>
                  <span className="font-semibold text-foreground">{filteredTodos.length}</span>{' '}
                  initiatives match
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
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
                <span className="text-xs text-muted-foreground">Sort</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  className="rounded-md border border-border bg-card py-1 pl-2 pr-7 text-xs text-foreground"
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
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <div className="border-b border-border bg-muted/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Key results
              </div>
              <div className="divide-y divide-border">
                {Array.from(groupedByObjective.entries()).map(([objId, rows]) => {
                  const title = rows[0]?.objectiveTitle ?? 'Objective'
                  const open = expandedObjectives[objId] ?? true
                  return (
                    <div key={objId}>
                      <button
                        type="button"
                        onClick={() => toggleObjective(objId)}
                        className="flex w-full items-center gap-2 bg-muted px-3 py-2 text-left text-sm font-semibold text-foreground hover:bg-muted"
                      >
                        {open ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate">{title}</span>
                      </button>
                      {open && (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-left text-xs text-muted-foreground">
                              <th className="px-3 py-2 font-medium">Key result</th>
                              <th className="hidden px-2 py-2 font-medium sm:table-cell">Plan</th>
                              <th className="px-2 py-2 font-medium">Progress</th>
                              <th className="hidden px-2 py-2 font-medium md:table-cell">Owner</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((kr) => (
                              <tr key={kr.id} className="border-b border-gray-50 hover:bg-muted/80">
                                <td className="max-w-md px-3 py-2.5">
                                  <Link
                                    href={`/dashboard/key-results/${kr.id}`}
                                    className="font-medium text-primary-700 hover:underline"
                                  >
                                    {kr.title}
                                  </Link>
                                </td>
                                <td className="hidden max-w-[10rem] truncate px-2 py-2.5 text-muted-foreground sm:table-cell">
                                  {kr.planLabel}
                                </td>
                                <td className="whitespace-nowrap px-2 py-2.5">
                                  <span
                                    className={cn(
                                      'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                                      kr.displayStatus === 'off_track' && 'bg-red-50 text-red-800',
                                      kr.displayStatus === 'at_risk' && 'bg-amber-50 text-amber-900',
                                      kr.displayStatus === 'on_track' && 'bg-emerald-50 text-emerald-900',
                                      kr.displayStatus === 'pending' && 'bg-muted text-muted-foreground',
                                      kr.displayStatus === 'not_measurable' && 'bg-gray-900 text-white'
                                    )}
                                  >
                                    {statusLabel(kr.displayStatus)}
                                  </span>
                                  <span className="ml-2 text-muted-foreground">
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
                <div className="border-t border-border p-3 text-center">
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
                <p className="p-8 text-center text-sm text-muted-foreground">No key results match these filters.</p>
              )}
            </div>
          </>
        )}

        {mainTab === 'objectives' && (
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Objective</th>
                  <th className="hidden px-3 py-3 font-medium sm:table-cell">Plan</th>
                  <th className="px-3 py-3 font-medium">Progress</th>
                  <th className="hidden px-3 py-3 font-medium md:table-cell">Key results</th>
                  <th className="px-3 py-3 font-medium">Owner</th>
                </tr>
              </thead>
              <tbody>
                {filteredObjectives.map((o) => (
                  <tr key={o.id} className="border-b border-border hover:bg-muted/80">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/objectives/${o.id}`}
                        className="font-medium text-primary-700 hover:underline"
                      >
                        {o.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">{o.level.replace('_', ' ')}</div>
                    </td>
                    <td className="hidden max-w-[10rem] truncate px-3 py-3 text-muted-foreground sm:table-cell">
                      {o.planLabel}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span className="font-medium text-foreground">{Math.round(o.progress)}%</span>
                    </td>
                    <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">{o.keyResultCount}</td>
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
              <p className="p-8 text-center text-sm text-muted-foreground">No objectives match these filters.</p>
            )}
          </div>
        )}

        {mainTab === 'initiatives' && (
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Initiative</th>
                  <th className="hidden px-3 py-3 font-medium lg:table-cell">Key result</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="hidden px-3 py-3 font-medium md:table-cell">Assignee</th>
                </tr>
              </thead>
              <tbody>
                {filteredTodos.map((t) => (
                  <tr key={t.id} className="border-b border-border hover:bg-muted/80">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{t.title}</div>
                      <div className="text-xs text-muted-foreground">{t.objectiveTitle}</div>
                    </td>
                    <td className="hidden max-w-xs truncate px-3 py-3 text-muted-foreground lg:table-cell">
                      <Link
                        href={`/dashboard/key-results/${t.keyResultId}`}
                        className="text-primary-700 hover:underline"
                      >
                        {t.krTitle}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                        {t.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">{t.assigneeName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredTodos.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">No initiatives in this scope.</p>
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
          : 'border-border bg-card text-muted-foreground hover:border-border'
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
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
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
                  : 'text-muted-foreground hover:bg-card hover:text-foreground'
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
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className={cn('mb-2 h-1 w-full rounded-full', accent)} />
      <div className="text-2xl font-bold tabular-nums text-foreground">{value}</div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  )
}
