'use client'

/**
 * /dashboard/reports — CEO / Employee super dashboard plus the filterable
 * objectives / key results / initiatives tables.
 *
 * 2026-09-25: split by section into sibling files (no behaviour change):
 *   report-dashboard-utils.ts  types + pure helpers + status colours
 *   useReportDashboardData.ts  scope / metrics / chart / ranking derivations
 *   ReportSuperDashboard.tsx   CEO charts + recommendations + rankings
 *   ReportFilterStrip.tsx      tab switcher, search, FilterSelects, chips
 *   ReportResultTables.tsx     the three tab bodies
 *   report-csv.ts              client-side CSV export of the active tab
 */
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Download, Printer, Share2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { PageHeader } from '@/components/ui/PageHeader'
import { KpiCard } from '@/components/ui/dashboard'
import { EmployeeSuperDashboard } from '@/features/reports'
import {
  getKrDisplayStatus,
  statusLabel,
  type KrDisplayStatus,
} from '@/lib/reportDashboard'
import {
  EMPTY_STATUS_COUNTS,
  type DashboardMode,
  type DynamicFilter,
  type FilterOptions,
  type MainTab,
  type ReportKrRow,
  type ReportKrWithStatus,
  type ReportObjectiveRow,
  type ReportTodoRow,
  type SortKey,
} from './report-dashboard-utils'
import { useReportDashboardData } from './useReportDashboardData'
import { ReportSegmented } from './ReportSegmented'
import { ReportSuperDashboard } from './ReportSuperDashboard'
import { ReportFilterStrip } from './ReportFilterStrip'
import {
  ReportInitiativesTable,
  ReportKeyResultsTable,
  ReportObjectivesTable,
} from './ReportResultTables'
import { buildReportCsv, downloadCsv } from './report-csv'

export type {
  FilterOptions,
  ReportKrRow,
  ReportObjectiveRow,
  ReportTodoRow,
} from './report-dashboard-utils'

interface Props {
  currentUserId: string
  currentUserName: string
  currentUserRole: string
  keyResults: ReportKrRow[]
  objectives: ReportObjectiveRow[]
  todos: ReportTodoRow[]
  filterOptions?: FilterOptions
  /**
   * Personal enrichment for the Employee super-dashboard. Empty for CEO scope.
   * See lib/dashboards/payload.ts.
   */
  personal?: {
    completionDates: string[]
    checkinDates: string[]
    alignmentChains: Array<{
      objectiveId: string
      objectiveTitle: string
      ancestors: Array<{ id: string; title: string; level: string }>
    }>
  }
}

const HEADER_BUTTON_CLASS =
  'inline-flex items-center gap-1 h-7 rounded-[var(--ap-radius-sm)] border bg-card px-2.5 text-xs text-muted-foreground hover:text-foreground'

export default function ReportDashboardClient({
  currentUserId,
  currentUserName,
  currentUserRole,
  keyResults: krRows,
  objectives: objRows,
  todos: todoRows,
  filterOptions,
  personal,
}: Props) {
  // CEO mode is gated to ADMIN + EXECUTIVE — matches the /api/dashboards/ceo
  // server gate. DEPARTMENT_LEADs and EMPLOYEEs default to (and are pinned to)
  // the employee view.
  const canSeeCeoMode = currentUserRole === 'ADMIN' || currentUserRole === 'EXECUTIVE'
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>(
    canSeeCeoMode ? 'ceo' : 'employee'
  )
  const [mainTab, setMainTab] = useState<MainTab>('key-results')

  const [dynamicFilters, setDynamicFilters] = useState<DynamicFilter[]>([])

  function addDynamicFilter(type: string, id: string, label: string) {
    setDynamicFilters((prev) => {
      if (prev.some((f) => f.type === type && f.id === id)) return prev
      return [...prev, { type, id, label }]
    })
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

  const krsWithStatus = useMemo<ReportKrWithStatus[]>(
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
    const tfFilters = dynamicFilters.filter((f) => f.type === 'timeframe').map((f) => f.id)
    const confidenceFilters = dynamicFilters.filter((f) => f.type === 'confidence').map((f) => f.id)
    const statusFilters = dynamicFilters.filter((f) => f.type === 'status').map((f) => f.id)
    if (userFilters.length > 0) list = list.filter((kr) => userFilters.includes(kr.ownerId))
    if (deptFilters.length > 0) list = list.filter((kr) => kr.departmentId && deptFilters.includes(kr.departmentId))
    if (tfFilters.length > 0) list = list.filter((kr) => tfFilters.includes(kr.timeframeId))
    if (confidenceFilters.length > 0) list = list.filter((kr) => confidenceFilters.includes(kr.confidence))
    if (statusFilters.length > 0) list = list.filter((kr) => statusFilters.includes(kr.status))
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
    const init: Record<KrDisplayStatus, number> = { ...EMPTY_STATUS_COUNTS }
    for (const kr of filteredKrs) init[kr.displayStatus]++
    return init
  }, [filteredKrs])

  const avgCompletion = useMemo(() => {
    if (filteredKrs.length === 0) return 0
    return Math.round(
      filteredKrs.reduce((s, kr) => s + Math.min(100, Math.max(0, kr.progress)), 0) / filteredKrs.length
    )
  }, [filteredKrs])

  const {
    dashboardScope,
    superMetrics,
    statusChartData,
    departmentRows,
    ownerRows,
    planRows,
    progressBands,
    burnupData,
    recommendations,
  } = useReportDashboardData({
    currentUserId,
    dashboardMode,
    krsWithStatus,
    objRows,
    todoRows,
  })

  const groupedByObjective = useMemo(() => {
    const map = new Map<string, ReportKrWithStatus[]>()
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

  const tabNoun =
    mainTab === 'key-results' ? 'key results' : mainTab === 'objectives' ? 'objectives' : 'initiatives'

  /** Export the active tab's filtered rows (all of them, not just the loaded page). */
  const exportCsv = useCallback(() => {
    if (matchCount === 0) {
      toast.error(`No ${tabNoun} to export`)
      return
    }
    const csv = buildReportCsv(mainTab, {
      krs: sortedKrs,
      objectives: filteredObjectives,
      todos: filteredTodos,
    })
    downloadCsv(`okr-report-${mainTab}-${format(new Date(), 'yyyy-MM-dd')}.csv`, csv)
  }, [filteredObjectives, filteredTodos, mainTab, matchCount, sortedKrs, tabNoun])

  return (
    <div className="space-y-4">
      {/* Hero */}
      <PageHeader
        className="mb-0 px-1"
        title={dashboardMode === 'ceo' ? 'CEO Super Dashboard' : `${currentUserName} Dashboard`}
        description={`${dashboardMode === 'ceo'
          ? 'Company-wide operating view across OKRs, owners, initiatives, risks, and plans'
          : 'Personal execution view with recommended next actions and your visible OKR scope'} · ${matchCount} ${tabNoun} match · filtered avg ${avgCompletion}%`}
        actions={
          <div className="flex flex-wrap items-center gap-2 no-print">
            {canSeeCeoMode && (
              <ReportSegmented
                label="Dashboard view"
                value={dashboardMode}
                onChange={setDashboardMode}
                options={[
                  { value: 'ceo', label: 'CEO' },
                  { value: 'employee', label: 'Employee' },
                ]}
              />
            )}
            <button type="button" onClick={shareReport} className={HEADER_BUTTON_CLASS} style={{ borderColor: 'var(--ap-border)' }}>
              <Share2 className="h-3.5 w-3.5" aria-hidden /> Share
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className={HEADER_BUTTON_CLASS}
              style={{ borderColor: 'var(--ap-border)' }}
              title={`Download the filtered ${tabNoun} as CSV`}
            >
              <Download className="h-3.5 w-3.5" aria-hidden /> Export CSV
            </button>
            <button
              type="button"
              onClick={() => typeof window !== 'undefined' && window.print()}
              className={HEADER_BUTTON_CLASS}
              style={{ borderColor: 'var(--ap-border)' }}
              title="Print, or choose “Save as PDF” in the print dialog"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden /> Print / PDF
            </button>
          </div>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <KpiCard label="Pending" value={statusCounts.pending} tint="var(--ap-fg-muted)" />
        <KpiCard label="On track" value={statusCounts.on_track} tint="var(--ap-green)" />
        <KpiCard label="At risk" value={statusCounts.at_risk} tint="var(--ap-orange)" />
        <KpiCard label="Off track" value={statusCounts.off_track} tint="var(--ap-red)" />
        <KpiCard label="Not measurable" value={statusCounts.not_measurable} tint="var(--ap-fg)" />
      </div>

      {dashboardMode === 'employee' ? (
        <EmployeeSuperDashboard
          krs={dashboardScope.krs.map((kr) => ({
            id: kr.id,
            title: kr.title,
            progress: kr.progress,
            confidence: kr.confidence,
            objectiveId: kr.objectiveId,
            objectiveTitle: kr.objectiveTitle,
            ownerId: kr.ownerId,
            checkInCount: kr.checkInCount,
            displayStatus: kr.displayStatus,
          }))}
          objectives={dashboardScope.objectives.map((o) => ({
            id: o.id,
            title: o.title,
            level: o.level,
            ownerId: o.ownerId,
          }))}
          todos={dashboardScope.todos.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            keyResultId: t.keyResultId,
            krTitle: t.krTitle,
            objectiveTitle: t.objectiveTitle,
            assigneeId: t.assigneeId,
            dueDate: t.dueDate,
          }))}
          recommendations={recommendations}
          personal={personal ?? { completionDates: [], checkinDates: [], alignmentChains: [] }}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
        />
      ) : (
        <ReportSuperDashboard
          mode={dashboardMode}
          metrics={superMetrics}
          statusChartData={statusChartData}
          progressBands={progressBands}
          burnupData={burnupData}
          departmentRows={departmentRows}
          ownerRows={ownerRows}
          planRows={planRows}
          recommendations={recommendations}
          // Sparklines are derived from current per-plan rollups — real shape,
          // not synthetic. When historical aggregates land (Phase 3) swap these
          // for true 8-week series from a snapshots table.
          sparklines={{
            progress: planRows.map((p) => p.progress),
            risk: planRows.map((p) => p.risk),
            krs: planRows.map((p) => p.krs),
            initiatives: departmentRows.map((d) => d.openTodos),
          }}
        />
      )}

      {/* Tabs + filter strip card */}
      <div
        className="rounded-[var(--ap-radius-md)] border bg-card overflow-hidden"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <ReportFilterStrip
          mainTab={mainTab}
          onMainTabChange={setMainTab}
          query={segmentQuery}
          onQueryChange={setSegmentQuery}
          planStatus={planStatus}
          onPlanStatusChange={setPlanStatus}
          confidenceFilter={confidenceFilter}
          onConfidenceFilterChange={setConfidenceFilter}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          onReset={resetFilters}
          activePreset={activePreset}
          onApplyPreset={applyPreset}
          dynamicFilters={dynamicFilters}
          onAddDynamicFilter={addDynamicFilter}
          onRemoveDynamicFilter={removeDynamicFilter}
          onClearDynamicFilters={() => setDynamicFilters([])}
          filterOptions={filterOptions}
        />

        {/* Tab bodies */}
        {mainTab === 'key-results' && (
          <ReportKeyResultsTable
            sortedKrs={sortedKrs}
            groupedByObjective={groupedByObjective}
            expandedObjectives={expandedObjectives}
            onToggleObjective={toggleObjective}
            tableLimit={tableLimit}
            onLoadMore={() => setTableLimit((n) => n + 25)}
          />
        )}

        {mainTab === 'objectives' && <ReportObjectivesTable objectives={filteredObjectives} />}

        {mainTab === 'initiatives' && <ReportInitiativesTable todos={filteredTodos} />}
      </div>
    </div>
  )
}
