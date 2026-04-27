'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Search,
  Share2,
  ChevronDown,
  ChevronRight,
  Filter,
  RotateCcw,
  X,
  Printer,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import StatusPill from '@/components/shared/StatusPill'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  getKrDisplayStatus,
  statusLabel,
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

function statusToPillKey(s: KrDisplayStatus): string {
  switch (s) {
    case 'on_track': return 'on-track'
    case 'at_risk': return 'at-risk'
    case 'off_track': return 'off-track'
    case 'pending': return 'pending'
    default: return 'pending'
  }
}

function APSeg<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[]
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
            className={cn(
              'inline-flex items-center h-6 px-2.5 rounded-[8px] text-[11px] font-medium transition',
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export default function ReportDashboardClient({
  currentUserId,
  keyResults: krRows,
  objectives: objRows,
  todos: todoRows,
  filterOptions,
}: Props) {
  const [mainTab, setMainTab] = useState<MainTab>('key-results')

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
      case 'all-off-track': setQuickOffTrack(true); break
      case 'all-at-risk': setQuickAtRisk(true); break
      case 'your-key-results': setQuickOwned(true); setQuickContributing(true); break
      case 'owned': setQuickOwned(true); break
      case 'contributing': setQuickContributing(true); break
      case 'owned-off-track': setQuickOwned(true); setQuickOffTrack(true); break
      case 'owned-at-risk': setQuickOwned(true); setQuickAtRisk(true); break
      case 'active': setStatusFilter('ACTIVE'); break
      case 'draft': setStatusFilter('DRAFT'); break
      default: break
    }
  }

  const [planStatus, setPlanStatus] = useState<string>('all')
  const [confidenceFilter, setConfidenceFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortKey>('plan')
  const [tableLimit, setTableLimit] = useState(25)
  const [expandedObjectives, setExpandedObjectives] = useState<Record<string, boolean>>({})

  const krsWithStatus = useMemo(
    () => krRows.map((kr) => ({ ...kr, displayStatus: getKrDisplayStatus(kr) })),
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
      list = list.filter((kr) => kr.ownerId !== currentUserId && kr.checkInCount > 0)
    }
    if (quickOwned && quickContributing) {
      list = list.filter((kr) => kr.ownerId === currentUserId || kr.checkInCount > 0)
    }
    if (quickOffTrack) list = list.filter((kr) => kr.displayStatus === 'off_track')
    if (quickAtRisk) list = list.filter((kr) => kr.displayStatus === 'at_risk')
    if (quickNoCheckIn) list = list.filter((kr) => kr.checkInCount === 0)
    if (statusFilter !== 'all') list = list.filter((kr) => kr.status === statusFilter)

    const userFilters = dynamicFilters.filter((f) => f.type === 'user').map((f) => f.id)
    const deptFilters = dynamicFilters.filter((f) => f.type === 'department').map((f) => f.id)
    const tfFilters = dynamicFilters.filter((f) => f.type === 'timeframe').map((f) => f.label)
    if (userFilters.length > 0) list = list.filter((kr) => userFilters.includes(kr.ownerId))
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
    krsWithStatus, segmentQuery, quickOwned, quickContributing, quickOffTrack, quickAtRisk,
    quickNoCheckIn, confidenceFilter, planStatus, statusFilter, dynamicFilters, objRows, currentUserId,
  ])

  const sortedKrs = useMemo(() => {
    const copy = [...filteredKrs]
    copy.sort((a, b) => {
      switch (sortBy) {
        case 'plan': return a.planLabel.localeCompare(b.planLabel) || a.title.localeCompare(b.title)
        case 'objective': return a.objectiveTitle.localeCompare(b.objectiveTitle) || a.title.localeCompare(b.title)
        case 'progress': return b.progress - a.progress
        case 'status': return statusLabel(a.displayStatus).localeCompare(statusLabel(b.displayStatus))
        default: return 0
      }
    })
    return copy
  }, [filteredKrs, sortBy])

  const statusCounts = useMemo(() => {
    const init: Record<KrDisplayStatus, number> = {
      pending: 0, on_track: 0, at_risk: 0, off_track: 0, not_measurable: 0,
    }
    for (const kr of filteredKrs) init[kr.displayStatus]++
    return init
  }, [filteredKrs])

  const avgCompletion = useMemo(() => {
    if (filteredKrs.length === 0) return 0
    return Math.round(
      filteredKrs.reduce((s, kr) => s + Math.min(100, Math.max(0, kr.progress)), 0) / filteredKrs.length
    )
  }, [filteredKrs])

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

  const matchCount =
    mainTab === 'key-results' ? filteredKrs.length :
    mainTab === 'objectives' ? filteredObjectives.length :
    filteredTodos.length

  return (
    <div className="space-y-4">
      {/* Hero */}
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-foreground">Reports</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {matchCount} {mainTab === 'key-results' ? 'key results' : mainTab === 'objectives' ? 'objectives' : 'initiatives'} match · avg completion {avgCompletion}%
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={shareReport}
            className="inline-flex items-center gap-1 h-7 rounded-[10px] border bg-card px-2.5 text-[12px] text-muted-foreground hover:text-foreground"
            style={{ borderColor: 'var(--ap-border)' }}
          >
            <Share2 className="h-3.5 w-3.5" /> Share
          </button>
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <KpiCard label="Pending" value={statusCounts.pending} tint="var(--ap-fg-muted)" />
        <KpiCard label="On track" value={statusCounts.on_track} tint="var(--ap-green)" />
        <KpiCard label="At risk" value={statusCounts.at_risk} tint="var(--ap-orange)" />
        <KpiCard label="Off track" value={statusCounts.off_track} tint="var(--ap-red)" />
        <KpiCard label="Not measurable" value={statusCounts.not_measurable} tint="var(--ap-fg)" />
      </div>

      {/* Tabs + filter strip card */}
      <div
        className="rounded-[14px] border bg-card overflow-hidden"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--ap-border)' }}>
          <APSeg
            value={mainTab}
            onChange={setMainTab}
            options={[
              { value: 'objectives', label: 'Objectives' },
              { value: 'key-results', label: 'Key results' },
              { value: 'initiatives', label: 'Initiatives' },
            ]}
          />
          <div className="relative ml-1 flex-1 max-w-[320px]">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search objectives, KRs, plans…"
              value={segmentQuery}
              onChange={(e) => setSegmentQuery(e.target.value)}
              className="h-7 w-full rounded-[10px] border bg-background pl-7 pr-2 text-[12px] outline-none"
              style={{ borderColor: 'var(--ap-border)' }}
            />
          </div>
          <select
            value={planStatus}
            onChange={(e) => setPlanStatus(e.target.value)}
            className="h-7 rounded-[10px] border bg-background px-2 text-[12px] outline-none"
            style={{ borderColor: 'var(--ap-border)' }}
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
            className="h-7 rounded-[10px] border bg-background px-2 text-[12px] outline-none"
            style={{ borderColor: 'var(--ap-border)' }}
          >
            <option value="all">Confidence — all</option>
            <option value="ON_TRACK">On track</option>
            <option value="AT_RISK">At risk</option>
            <option value="OFF_TRACK">Off track</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            disabled={mainTab !== 'key-results'}
            className="h-7 rounded-[10px] border bg-background px-2 text-[12px] outline-none disabled:opacity-50"
            style={{ borderColor: 'var(--ap-border)' }}
          >
            <option value="plan">Sort: Plan</option>
            <option value="objective">Sort: Objective</option>
            <option value="progress">Sort: Progress</option>
            <option value="status">Sort: Status</option>
          </select>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1 h-7 rounded-[10px] px-2 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>

        {/* Preset chip strip */}
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b" style={{ borderColor: 'var(--ap-border)' }}>
          {[
            { id: 'all-key-results', label: 'All KRs' },
            { id: 'your-key-results', label: 'Your KRs' },
            { id: 'owned', label: 'Owned' },
            { id: 'contributing', label: 'Contributing' },
            { id: 'all-off-track', label: 'Off track' },
            { id: 'all-at-risk', label: 'At risk' },
            { id: 'active', label: 'Active' },
            { id: 'draft', label: 'Draft' },
          ].map((p) => {
            const active = activePreset === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium border transition',
                  active
                    ? 'text-white'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                style={
                  active
                    ? { background: 'var(--ap-accent)', borderColor: 'var(--ap-accent)' }
                    : { borderColor: 'var(--ap-border)', background: 'transparent' }
                }
              >
                {p.label}
              </button>
            )
          })}

          {/* Dynamic filter chips */}
          {dynamicFilters.map((f) => (
            <span
              key={`${f.type}-${f.id}`}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium text-muted-foreground"
              style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)' }}
            >
              <span className="capitalize">{f.type}:</span> {f.label}
              <button
                type="button"
                onClick={() => removeDynamicFilter(f.type, f.id)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          <div className="relative">
            <button
              type="button"
              onClick={() => setAddingFilterType(addingFilterType ? null : '_pick')}
              className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              style={{ borderColor: 'var(--ap-border)' }}
            >
              <Filter className="h-3 w-3" /> Add filter
            </button>
            {addingFilterType === '_pick' && (
              <div className="absolute left-0 top-8 z-20 rounded-[10px] border bg-card p-1 shadow-lg min-w-[160px]" style={{ borderColor: 'var(--ap-border)' }}>
                {['user', 'department', 'timeframe', 'confidence', 'status'].map((t) => (
                  <button key={t} onClick={() => setAddingFilterType(t)} className="w-full text-left px-3 py-1.5 text-[12px] capitalize hover:bg-muted rounded">{t}</button>
                ))}
              </div>
            )}
            {addingFilterType === 'user' && filterOptions && (
              <div className="absolute left-0 top-8 z-20 rounded-[10px] border bg-card p-1 shadow-lg min-w-[200px] max-h-[240px] overflow-auto" style={{ borderColor: 'var(--ap-border)' }}>
                {filterOptions.users.map((u) => (
                  <button key={u.id} onClick={() => addDynamicFilter('user', u.id, u.name)} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted rounded truncate">{u.name}</button>
                ))}
              </div>
            )}
            {addingFilterType === 'department' && filterOptions && (
              <div className="absolute left-0 top-8 z-20 rounded-[10px] border bg-card p-1 shadow-lg min-w-[200px] max-h-[240px] overflow-auto" style={{ borderColor: 'var(--ap-border)' }}>
                {filterOptions.departments.map((d) => (
                  <button key={d.id} onClick={() => addDynamicFilter('department', d.id, d.name)} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted rounded truncate">{d.name}</button>
                ))}
              </div>
            )}
            {addingFilterType === 'timeframe' && filterOptions && (
              <div className="absolute left-0 top-8 z-20 rounded-[10px] border bg-card p-1 shadow-lg min-w-[200px] max-h-[240px] overflow-auto" style={{ borderColor: 'var(--ap-border)' }}>
                {filterOptions.timeframes.map((t) => (
                  <button key={t.id} onClick={() => addDynamicFilter('timeframe', t.id, t.name)} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted rounded truncate">{t.name}</button>
                ))}
              </div>
            )}
            {addingFilterType === 'confidence' && (
              <div className="absolute left-0 top-8 z-20 rounded-[10px] border bg-card p-1 shadow-lg min-w-[160px]" style={{ borderColor: 'var(--ap-border)' }}>
                <button onClick={() => addDynamicFilter('confidence', 'ON_TRACK', 'On track')} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted rounded">On track</button>
                <button onClick={() => addDynamicFilter('confidence', 'AT_RISK', 'At risk')} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted rounded">At risk</button>
                <button onClick={() => addDynamicFilter('confidence', 'OFF_TRACK', 'Off track')} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted rounded">Off track</button>
              </div>
            )}
            {addingFilterType === 'status' && (
              <div className="absolute left-0 top-8 z-20 rounded-[10px] border bg-card p-1 shadow-lg min-w-[160px]" style={{ borderColor: 'var(--ap-border)' }}>
                <button onClick={() => addDynamicFilter('status', 'ACTIVE', 'Active')} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted rounded">Active</button>
                <button onClick={() => addDynamicFilter('status', 'DRAFT', 'Draft')} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted rounded">Draft</button>
              </div>
            )}
          </div>

          {dynamicFilters.length > 0 && (
            <button
              onClick={() => setDynamicFilters([])}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Clear chips
            </button>
          )}
        </div>

        {/* Tab bodies */}
        {mainTab === 'key-results' && (
          sortedKrs.length === 0 ? (
            <div className="p-2">
              <EmptyState bare title="No key results match these filters" description="Adjust filters above or reset to start over." />
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--ap-border)' }}>
              {Array.from(groupedByObjective.entries()).map(([objId, rows]) => {
                const title = rows[0]?.objectiveTitle ?? 'Objective'
                const open = expandedObjectives[objId] ?? true
                return (
                  <div key={objId}>
                    <button
                      type="button"
                      onClick={() => toggleObjective(objId)}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-[12px] font-semibold text-foreground"
                      style={{ background: 'var(--ap-bg-sunken)' }}
                    >
                      {open ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{title}</span>
                    </button>
                    {open && (
                      <div>
                        <div
                          className="grid items-center gap-2 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b"
                          style={{
                            borderColor: 'var(--ap-border)',
                            gridTemplateColumns: 'minmax(0,2.5fr) minmax(120px,1fr) 160px 60px',
                          }}
                        >
                          <div>Key result</div>
                          <div className="hidden sm:block">Plan</div>
                          <div>Progress</div>
                          <div>Owner</div>
                        </div>
                        {rows.map((kr) => (
                          <div
                            key={kr.id}
                            className="grid items-center gap-2 px-4 py-2.5 border-b hover:bg-[rgba(0,0,0,0.02)] transition-colors"
                            style={{
                              borderColor: 'var(--ap-border)',
                              gridTemplateColumns: 'minmax(0,2.5fr) minmax(120px,1fr) 160px 60px',
                            }}
                          >
                            <Link
                              href={`/dashboard/key-results/${kr.id}`}
                              className="text-[13px] font-medium text-foreground hover:underline truncate"
                            >
                              {kr.title}
                            </Link>
                            <div className="hidden sm:block text-[12px] text-muted-foreground truncate">{kr.planLabel}</div>
                            <div className="flex items-center gap-2">
                              <StatusPill status={statusToPillKey(kr.displayStatus)} size="xs" />
                              <span className="text-[12px] tabular-nums text-muted-foreground">{Math.round(kr.progress)}%</span>
                            </div>
                            <div>
                              <span
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold"
                                style={{ background: 'rgba(0,122,255,0.12)', color: 'var(--ap-accent)' }}
                                title={kr.ownerName}
                              >
                                {initials(kr.ownerName)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {sortedKrs.length > tableLimit && (
                <div className="border-t p-3 text-center" style={{ borderColor: 'var(--ap-border)' }}>
                  <button
                    type="button"
                    onClick={() => setTableLimit((n) => n + 25)}
                    className="text-[12px] font-semibold"
                    style={{ color: 'var(--ap-accent)' }}
                  >
                    Load more
                  </button>
                </div>
              )}
            </div>
          )
        )}

        {mainTab === 'objectives' && (
          filteredObjectives.length === 0 ? (
            <div className="p-2">
              <EmptyState bare title="No objectives match these filters" description="Try a broader query or reset filters." />
            </div>
          ) : (
            <div>
              <div
                className="grid items-center gap-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b"
                style={{
                  borderColor: 'var(--ap-border)',
                  background: 'var(--ap-bg-sunken)',
                  gridTemplateColumns: 'minmax(0,2.5fr) minmax(120px,1fr) 80px 80px 60px',
                }}
              >
                <div>Objective</div>
                <div className="hidden sm:block">Plan</div>
                <div>Progress</div>
                <div className="hidden md:block">KRs</div>
                <div>Owner</div>
              </div>
              {filteredObjectives.map((o) => (
                <div
                  key={o.id}
                  className="grid items-center gap-2 px-4 py-2.5 border-b hover:bg-[rgba(0,0,0,0.02)] transition-colors"
                  style={{
                    borderColor: 'var(--ap-border)',
                    gridTemplateColumns: 'minmax(0,2.5fr) minmax(120px,1fr) 80px 80px 60px',
                  }}
                >
                  <div className="min-w-0">
                    <Link href={`/dashboard/objectives/${o.id}`} className="text-[13px] font-medium text-foreground hover:underline truncate block">
                      {o.title}
                    </Link>
                    <div className="text-[11px] text-muted-foreground">{o.level.replace('_', ' ')}</div>
                  </div>
                  <div className="hidden sm:block text-[12px] text-muted-foreground truncate">{o.planLabel}</div>
                  <div className="text-[12px] tabular-nums font-medium text-foreground">{Math.round(o.progress)}%</div>
                  <div className="hidden md:block text-[12px] tabular-nums text-muted-foreground">{o.keyResultCount}</div>
                  <div>
                    <span
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold"
                      style={{ background: 'rgba(0,122,255,0.12)', color: 'var(--ap-accent)' }}
                      title={o.ownerName}
                    >
                      {initials(o.ownerName)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {mainTab === 'initiatives' && (
          filteredTodos.length === 0 ? (
            <div className="p-2">
              <EmptyState bare title="No initiatives in this scope" description="Try clearing the search or filters." />
            </div>
          ) : (
            <div>
              <div
                className="grid items-center gap-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b"
                style={{
                  borderColor: 'var(--ap-border)',
                  background: 'var(--ap-bg-sunken)',
                  gridTemplateColumns: 'minmax(0,2.5fr) minmax(140px,1fr) 110px 120px',
                }}
              >
                <div>Initiative</div>
                <div className="hidden lg:block">Key result</div>
                <div>Status</div>
                <div className="hidden md:block">Assignee</div>
              </div>
              {filteredTodos.map((t) => (
                <div
                  key={t.id}
                  className="grid items-center gap-2 px-4 py-2.5 border-b hover:bg-[rgba(0,0,0,0.02)] transition-colors"
                  style={{
                    borderColor: 'var(--ap-border)',
                    gridTemplateColumns: 'minmax(0,2.5fr) minmax(140px,1fr) 110px 120px',
                  }}
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-foreground truncate">{t.title}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{t.objectiveTitle}</div>
                  </div>
                  <div className="hidden lg:block text-[12px] text-muted-foreground truncate">
                    <Link href={`/dashboard/key-results/${t.keyResultId}`} className="hover:underline">{t.krTitle}</Link>
                  </div>
                  <div>
                    <StatusPill status={t.status.toLowerCase().replace(/_/g, '-')} size="xs" />
                  </div>
                  <div className="hidden md:block text-[12px] text-muted-foreground truncate">{t.assigneeName}</div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value, tint }: { label: string; value: number | string; tint: string }) {
  return (
    <div className="rounded-[14px] border bg-card p-4" style={{ borderColor: 'var(--ap-border)' }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-[28px] font-semibold tabular-nums tracking-tight" style={{ color: tint }}>
        {value}
      </div>
    </div>
  )
}
