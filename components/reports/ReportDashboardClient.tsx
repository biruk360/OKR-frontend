'use client'

import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react'
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
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Gauge,
  Lightbulb,
  ListChecks,
  Target,
  type LucideIcon,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import StatusPill from '@/components/shared/StatusPill'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  DashboardCard,
  InsightTile,
  KpiCard,
  MiniBadge,
  Sparkline,
} from '@/components/ui/dashboard'
import { EmployeeSuperDashboard } from '@/features/reports'
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
  objectiveProgress: number
  planLabel: string
  departmentId: string | null
  departmentName: string
  timeframeId: string
  timeframeName: string
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
  ownerId: string
  ownerName: string
  ownerAvatar: string | null
  departmentId: string | null
  departmentName: string
  timeframeId: string
  timeframeName: string
  keyResultCount: number
}

export interface ReportTodoRow {
  id: string
  title: string
  status: string
  priority: string
  keyResultId: string
  krTitle: string
  objectiveTitle: string
  assigneeId: string
  assigneeName: string
  dueDate: string | null
}

type MainTab = 'objectives' | 'key-results' | 'initiatives'
type DashboardMode = 'ceo' | 'employee'
type SortKey = 'plan' | 'objective' | 'progress' | 'status'

export interface FilterOptions {
  users: Array<{ id: string; name: string }>
  departments: Array<{ id: string; name: string }>
  timeframes: Array<{ id: string; name: string }>
}

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

const STATUS_COLORS: Record<KrDisplayStatus, string> = {
  on_track: '#34C759',
  at_risk: '#FF9F0A',
  off_track: '#FF3B30',
  pending: '#8E8E93',
  not_measurable: '#636366',
}

const EMPTY_STATUS_COUNTS: Record<KrDisplayStatus, number> = {
  pending: 0,
  on_track: 0,
  at_risk: 0,
  off_track: 0,
  not_measurable: 0,
}

function clampPct(value: number) {
  return Math.max(0, Math.min(100, Math.round(value || 0)))
}

function average(items: number[]) {
  if (items.length === 0) return 0
  return Math.round(items.reduce((sum, value) => sum + value, 0) / items.length)
}

function dueState(dueDate: string | null) {
  if (!dueDate) return 'none'
  const due = new Date(dueDate).getTime()
  const now = Date.now()
  const week = 7 * 24 * 60 * 60 * 1000
  if (due < now) return 'overdue'
  if (due - now <= week) return 'soon'
  return 'later'
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

  const dashboardScope = useMemo(() => {
    if (dashboardMode === 'employee') {
      const ownedObjectiveIds = new Set(
        objRows.filter((o) => o.ownerId === currentUserId).map((o) => o.id)
      )
      const ownedKrObjectiveIds = new Set(
        krsWithStatus.filter((kr) => kr.ownerId === currentUserId).map((kr) => kr.objectiveId)
      )
      const scopedObjectives = objRows.filter(
        (o) => o.ownerId === currentUserId || ownedKrObjectiveIds.has(o.id)
      )
      const scopedKrs = krsWithStatus.filter(
        (kr) => kr.ownerId === currentUserId || ownedObjectiveIds.has(kr.objectiveId)
      )
      const scopedKrIds = new Set(scopedKrs.map((kr) => kr.id))
      const scopedTodos = todoRows.filter(
        (todo) => todo.assigneeId === currentUserId || scopedKrIds.has(todo.keyResultId)
      )
      return { objectives: scopedObjectives, krs: scopedKrs, todos: scopedTodos }
    }

    return { objectives: objRows, krs: krsWithStatus, todos: todoRows }
  }, [currentUserId, dashboardMode, krsWithStatus, objRows, todoRows])

  const dashboardStatusCounts = useMemo(() => {
    const init: Record<KrDisplayStatus, number> = { ...EMPTY_STATUS_COUNTS }
    for (const kr of dashboardScope.krs) init[kr.displayStatus]++
    return init
  }, [dashboardScope.krs])

  const superMetrics = useMemo(() => {
    const krs = dashboardScope.krs
    const objectives = dashboardScope.objectives
    const todos = dashboardScope.todos
    const completedTodos = todos.filter((t) => t.status === 'COMPLETED').length
    const openTodos = todos.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.status)).length
    const overdueTodos = todos.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.status) && dueState(t.dueDate) === 'overdue').length
    const soonTodos = todos.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.status) && dueState(t.dueDate) === 'soon').length
    const riskKrs = dashboardStatusCounts.at_risk + dashboardStatusCounts.off_track
    return {
      objectiveCount: objectives.length,
      krCount: krs.length,
      initiativeCount: todos.length,
      ownerCount: new Set(krs.map((kr) => kr.ownerId)).size,
      avgObjectiveProgress: average(objectives.map((o) => o.progress)),
      avgKrProgress: average(krs.map((kr) => kr.progress)),
      riskRate: krs.length === 0 ? 0 : Math.round((riskKrs / krs.length) * 100),
      noCheckInCount: krs.filter((kr) => kr.checkInCount === 0).length,
      completedTodos,
      openTodos,
      overdueTodos,
      soonTodos,
      completionRate: todos.length === 0 ? 0 : Math.round((completedTodos / todos.length) * 100),
    }
  }, [dashboardScope, dashboardStatusCounts])

  const statusChartData = useMemo(
    () => [
      { name: 'On track', value: dashboardStatusCounts.on_track, key: 'on_track' as KrDisplayStatus },
      { name: 'At risk', value: dashboardStatusCounts.at_risk, key: 'at_risk' as KrDisplayStatus },
      { name: 'Off track', value: dashboardStatusCounts.off_track, key: 'off_track' as KrDisplayStatus },
      { name: 'Pending', value: dashboardStatusCounts.pending, key: 'pending' as KrDisplayStatus },
      { name: 'Not measurable', value: dashboardStatusCounts.not_measurable, key: 'not_measurable' as KrDisplayStatus },
    ].filter((item) => item.value > 0),
    [dashboardStatusCounts]
  )

  const departmentRows = useMemo(() => {
    const map = new Map<string, {
      id: string
      name: string
      krs: typeof krsWithStatus
      objectives: ReportObjectiveRow[]
      todos: ReportTodoRow[]
    }>()
    for (const obj of dashboardScope.objectives) {
      const id = obj.departmentId ?? 'unassigned'
      if (!map.has(id)) map.set(id, { id, name: obj.departmentName, krs: [], objectives: [], todos: [] })
      map.get(id)!.objectives.push(obj)
    }
    for (const kr of dashboardScope.krs) {
      const id = kr.departmentId ?? 'unassigned'
      if (!map.has(id)) map.set(id, { id, name: kr.departmentName, krs: [], objectives: [], todos: [] })
      map.get(id)!.krs.push(kr)
    }
    const krDeptById = new Map(dashboardScope.krs.map((kr) => [kr.id, kr.departmentId ?? 'unassigned']))
    for (const todo of dashboardScope.todos) {
      const id = krDeptById.get(todo.keyResultId) ?? 'unassigned'
      if (!map.has(id)) map.set(id, { id, name: 'Unassigned', krs: [], objectives: [], todos: [] })
      map.get(id)!.todos.push(todo)
    }
    return Array.from(map.values())
      .map((row) => {
        const risk = row.krs.filter((kr) => kr.displayStatus === 'at_risk' || kr.displayStatus === 'off_track').length
        return {
          id: row.id,
          name: row.name,
          objectives: row.objectives.length,
          krs: row.krs.length,
          progress: average(row.krs.map((kr) => kr.progress)),
          risk,
          riskRate: row.krs.length === 0 ? 0 : Math.round((risk / row.krs.length) * 100),
          openTodos: row.todos.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.status)).length,
          overdue: row.todos.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.status) && dueState(t.dueDate) === 'overdue').length,
        }
      })
      .sort((a, b) => b.riskRate - a.riskRate || a.progress - b.progress)
  }, [dashboardScope, krsWithStatus])

  const ownerRows = useMemo(() => {
    const map = new Map<string, { id: string; name: string; krs: typeof krsWithStatus; todos: ReportTodoRow[] }>()
    for (const kr of dashboardScope.krs) {
      if (!map.has(kr.ownerId)) map.set(kr.ownerId, { id: kr.ownerId, name: kr.ownerName, krs: [], todos: [] })
      map.get(kr.ownerId)!.krs.push(kr)
    }
    for (const todo of dashboardScope.todos) {
      if (!map.has(todo.assigneeId)) map.set(todo.assigneeId, { id: todo.assigneeId, name: todo.assigneeName, krs: [], todos: [] })
      map.get(todo.assigneeId)!.todos.push(todo)
    }
    return Array.from(map.values())
      .map((row) => {
        const risk = row.krs.filter((kr) => kr.displayStatus === 'at_risk' || kr.displayStatus === 'off_track').length
        const openTodos = row.todos.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.status)).length
        return {
          id: row.id,
          name: row.name,
          krs: row.krs.length,
          progress: average(row.krs.map((kr) => kr.progress)),
          risk,
          openTodos,
          overdue: row.todos.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.status) && dueState(t.dueDate) === 'overdue').length,
          loadScore: risk * 3 + openTodos,
        }
      })
      .sort((a, b) => b.loadScore - a.loadScore)
  }, [dashboardScope])

  const planRows = useMemo(() => {
    const map = new Map<string, typeof dashboardScope.krs>()
    for (const kr of dashboardScope.krs) {
      if (!map.has(kr.timeframeName)) map.set(kr.timeframeName, [])
      map.get(kr.timeframeName)!.push(kr)
    }
    return Array.from(map.entries()).map(([name, krs]) => ({
      name,
      progress: average(krs.map((kr) => kr.progress)),
      krs: krs.length,
      risk: krs.filter((kr) => kr.displayStatus === 'at_risk' || kr.displayStatus === 'off_track').length,
    }))
  }, [dashboardScope.krs])

  const progressBands = useMemo(() => {
    const bands = [
      { name: '0-24%', min: 0, max: 25 },
      { name: '25-49%', min: 25, max: 50 },
      { name: '50-74%', min: 50, max: 75 },
      { name: '75-100%', min: 75, max: 101 },
    ]
    return bands.map((band) => ({
      name: band.name,
      objectives: dashboardScope.objectives.filter((o) => o.progress >= band.min && o.progress < band.max).length,
      krs: dashboardScope.krs.filter((kr) => kr.progress >= band.min && kr.progress < band.max).length,
    }))
  }, [dashboardScope])

  const burnupData = useMemo(() => {
    const sortedPlans = [...planRows].sort((a, b) => a.name.localeCompare(b.name))
    if (sortedPlans.length > 0) {
      return sortedPlans.map((row, index) => ({
        name: row.name,
        progress: row.progress,
        risk: row.risk,
        target: Math.min(100, Math.round(((index + 1) / sortedPlans.length) * 100)),
      }))
    }
    return [{ name: 'Current', progress: superMetrics.avgKrProgress, risk: dashboardStatusCounts.at_risk + dashboardStatusCounts.off_track, target: 75 }]
  }, [dashboardStatusCounts, planRows, superMetrics.avgKrProgress])

  const recommendations = useMemo(() => {
    if (dashboardMode === 'employee') {
      const ownedKrs = dashboardScope.krs.filter((kr) => kr.ownerId === currentUserId)
      const openAssignedTodos = dashboardScope.todos.filter((t) => t.assigneeId === currentUserId && !['COMPLETED', 'CANCELLED'].includes(t.status))
      const items: Array<{ title: string; detail: string; tone: KrDisplayStatus; href?: string }> = []
      const offTrack = ownedKrs.find((kr) => kr.displayStatus === 'off_track')
      const atRisk = ownedKrs.find((kr) => kr.displayStatus === 'at_risk')
      const noCheckIn = ownedKrs.find((kr) => kr.checkInCount === 0)
      const overdue = openAssignedTodos.find((t) => dueState(t.dueDate) === 'overdue')
      const upcoming = openAssignedTodos.find((t) => dueState(t.dueDate) === 'soon')
      const lowProgress = ownedKrs.filter((kr) => kr.progress < 50).sort((a, b) => a.progress - b.progress)[0]
      if (offTrack) items.push({ title: 'Recover the most critical KR', detail: `${offTrack.title} is off track at ${clampPct(offTrack.progress)}%. Add a check-in and split the next action into initiatives.`, tone: 'off_track', href: `/dashboard/key-results/${offTrack.id}` })
      if (atRisk) items.push({ title: 'Protect an at-risk outcome', detail: `${atRisk.title} is at risk. Review confidence blockers before the next update.`, tone: 'at_risk', href: `/dashboard/key-results/${atRisk.id}` })
      if (overdue) items.push({ title: 'Clear overdue work', detail: `${overdue.title} is overdue and linked to ${overdue.krTitle}.`, tone: 'off_track', href: `/dashboard/key-results/${overdue.keyResultId}` })
      if (upcoming) items.push({ title: 'Prepare this week', detail: `${upcoming.title} is due soon. Finish or renegotiate the due date.`, tone: 'pending', href: `/dashboard/key-results/${upcoming.keyResultId}` })
      if (noCheckIn) items.push({ title: 'Create a first signal', detail: `${noCheckIn.title} has no check-ins yet. A quick update will improve visibility.`, tone: 'pending', href: `/dashboard/key-results/${noCheckIn.id}` })
      if (lowProgress) items.push({ title: 'Move the lowest-progress KR', detail: `${lowProgress.title} is at ${clampPct(lowProgress.progress)}%. Pick one initiative that changes the metric this week.`, tone: 'at_risk', href: `/dashboard/key-results/${lowProgress.id}` })
      if (items.length === 0) {
        items.push({ title: 'Maintain execution rhythm', detail: 'Your visible scope is healthy. Keep check-ins fresh and close small initiatives before adding more work.', tone: 'on_track' })
      }
      return items.slice(0, 5)
    }

    const items: Array<{ title: string; detail: string; tone: KrDisplayStatus; href?: string }> = []
    const weakestDepartment = departmentRows[0]
    const overloadedOwner = ownerRows[0]
    const noKrObjective = dashboardScope.objectives.find((o) => o.keyResultCount === 0)
    const staleKr = dashboardScope.krs.find((kr) => kr.checkInCount === 0)
    const overdueDepartment = departmentRows.find((row) => row.overdue > 0)
    if (weakestDepartment && weakestDepartment.risk > 0) items.push({ title: 'Prioritize department recovery', detail: `${weakestDepartment.name} has ${weakestDepartment.risk} risky KRs and ${weakestDepartment.riskRate}% risk concentration.`, tone: weakestDepartment.riskRate >= 50 ? 'off_track' : 'at_risk' })
    if (overloadedOwner && overloadedOwner.loadScore > 0) items.push({ title: 'Rebalance owner load', detail: `${overloadedOwner.name} carries ${overloadedOwner.risk} risky KRs and ${overloadedOwner.openTodos} open initiatives.`, tone: overloadedOwner.risk > 0 ? 'at_risk' : 'pending' })
    if (noKrObjective) items.push({ title: 'Add measurable KRs', detail: `${noKrObjective.title} has no key results, so progress quality is weak.`, tone: 'pending', href: `/dashboard/objectives/${noKrObjective.id}` })
    if (staleKr) items.push({ title: 'Close visibility gaps', detail: `${staleKr.title} has no check-ins. Ask the owner for a current signal.`, tone: 'pending', href: `/dashboard/key-results/${staleKr.id}` })
    if (overdueDepartment) items.push({ title: 'Unblock overdue initiatives', detail: `${overdueDepartment.name} has ${overdueDepartment.overdue} overdue initiatives tied to active outcomes.`, tone: 'off_track' })
    if (items.length === 0) {
      items.push({ title: 'Scale what is working', detail: 'No critical dashboard risks are visible in the current scope. Review high-progress teams for practices to replicate.', tone: 'on_track' })
    }
    return items.slice(0, 5)
  }, [currentUserId, dashboardMode, dashboardScope, departmentRows, ownerRows])

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
          <h1 className="text-[24px] font-semibold tracking-tight text-foreground">
            {dashboardMode === 'ceo' ? 'CEO Super Dashboard' : `${currentUserName} Dashboard`}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {dashboardMode === 'ceo'
              ? 'Company-wide operating view across OKRs, owners, initiatives, risks, and plans'
              : 'Personal execution view with recommended next actions and your visible OKR scope'} · {matchCount} {mainTab === 'key-results' ? 'key results' : mainTab === 'objectives' ? 'objectives' : 'initiatives'} match · filtered avg {avgCompletion}%
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canSeeCeoMode && (
            <APSeg
              value={dashboardMode}
              onChange={setDashboardMode}
              options={[
                { value: 'ceo', label: 'CEO' },
                { value: 'employee', label: 'Employee' },
              ]}
            />
          )}
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
        <SuperDashboard
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

function SuperDashboard({
  mode,
  metrics,
  statusChartData,
  progressBands,
  burnupData,
  departmentRows,
  ownerRows,
  planRows,
  recommendations,
  sparklines,
}: {
  mode: DashboardMode
  metrics: {
    objectiveCount: number
    krCount: number
    initiativeCount: number
    ownerCount: number
    avgObjectiveProgress: number
    avgKrProgress: number
    riskRate: number
    noCheckInCount: number
    completedTodos: number
    openTodos: number
    overdueTodos: number
    soonTodos: number
    completionRate: number
  }
  statusChartData: Array<{ name: string; value: number; key: KrDisplayStatus }>
  progressBands: Array<{ name: string; objectives: number; krs: number }>
  burnupData: Array<{ name: string; progress: number; risk: number; target: number }>
  departmentRows: Array<{ id: string; name: string; objectives: number; krs: number; progress: number; risk: number; riskRate: number; openTodos: number; overdue: number }>
  ownerRows: Array<{ id: string; name: string; krs: number; progress: number; risk: number; openTodos: number; overdue: number; loadScore: number }>
  planRows: Array<{ name: string; progress: number; krs: number; risk: number }>
  recommendations: Array<{ title: string; detail: string; tone: KrDisplayStatus; href?: string }>
  /** Optional series passed to the four hero InsightTiles. Each is a flat array of values. */
  sparklines?: {
    progress?: number[]
    risk?: number[]
    krs?: number[]
    initiatives?: number[]
  }
}) {
  const topDepartments = departmentRows.slice(0, 6)
  const topOwners = ownerRows.slice(0, 6)
  const healthLabel = metrics.riskRate >= 35 ? 'Critical' : metrics.riskRate >= 18 ? 'Watch' : 'Healthy'
  const healthColor = metrics.riskRate >= 35 ? 'var(--ap-red)' : metrics.riskRate >= 18 ? 'var(--ap-orange)' : 'var(--ap-green)'

  return (
    <section className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InsightTile
          icon={Target}
          label="OKR scope"
          value={`${metrics.objectiveCount} / ${metrics.krCount}`}
          detail={`${metrics.ownerCount} owners · ${metrics.initiativeCount} initiatives`}
          tint="var(--ap-accent)"
          trailing={sparklines?.krs && sparklines.krs.length > 1
            ? <Sparkline data={sparklines.krs} color="#007AFF" />
            : undefined}
        />
        <InsightTile
          icon={Gauge}
          label="Progress"
          value={`${metrics.avgKrProgress}%`}
          detail={`${metrics.avgObjectiveProgress}% objective average`}
          tint="var(--ap-green)"
          trailing={sparklines?.progress && sparklines.progress.length > 1
            ? <Sparkline data={sparklines.progress} color="#34C759" />
            : undefined}
        />
        <InsightTile
          icon={AlertTriangle}
          label="Risk rate"
          value={`${metrics.riskRate}%`}
          detail={`${metrics.noCheckInCount} KRs without check-ins`}
          tint={healthColor}
          trailing={sparklines?.risk && sparklines.risk.length > 1
            ? <Sparkline data={sparklines.risk} color={metrics.riskRate >= 35 ? '#FF3B30' : '#FF9500'} />
            : undefined}
        />
        <InsightTile
          icon={ListChecks}
          label="Initiatives"
          value={metrics.openTodos}
          detail={`${metrics.overdueTodos} overdue · ${metrics.soonTodos} due soon · ${metrics.completionRate}% complete`}
          tint="var(--ap-orange)"
          trailing={sparklines?.initiatives && sparklines.initiatives.length > 1
            ? <Sparkline data={sparklines.initiatives} color="#FF9500" />
            : undefined}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
        <DashboardCard
          title={mode === 'ceo' ? 'Operating trajectory' : 'Personal outcome trajectory'}
          right={<MiniBadge color={healthColor}>{healthLabel}</MiniBadge>}
        >
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={burnupData} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="reportProgressFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#007AFF" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#007AFF" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--ap-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--ap-fg-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--ap-fg-muted)' }} axisLine={false} tickLine={false} width={34} />
                <Tooltip contentStyle={{ borderColor: 'var(--ap-border)', borderRadius: 10, fontSize: 12 }} />
                <Area type="monotone" dataKey="target" stroke="var(--ap-fg-faint)" strokeDasharray="4 4" fill="transparent" name="Target" />
                <Area type="monotone" dataKey="progress" stroke="#007AFF" fill="url(#reportProgressFill)" strokeWidth={2.5} name="Progress" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </DashboardCard>

        <DashboardCard title="Status mix" right={<MiniBadge color="var(--ap-accent)">{metrics.krCount} KRs</MiniBadge>}>
          <div className="grid min-h-[260px] items-center gap-3 md:grid-cols-[180px_1fr]">
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusChartData} innerRadius={54} outerRadius={78} paddingAngle={2} dataKey="value">
                    {statusChartData.map((entry) => (
                      <Cell key={entry.key} fill={STATUS_COLORS[entry.key]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderColor: 'var(--ap-border)', borderRadius: 10, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {statusChartData.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">No key results in this scope.</p>
              ) : statusChartData.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[item.key] }} />
                    {item.name}
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </DashboardCard>
      </div>

      <div className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
        <DashboardCard title="Recommendation engine" right={<Lightbulb className="h-4 w-4 text-muted-foreground" />}>
          <div className="space-y-2">
            {recommendations.map((item, index) => (
              <RecommendationRow key={`${item.title}-${index}`} item={item} />
            ))}
          </div>
        </DashboardCard>

        <DashboardCard title="Progress distribution" right={<MiniBadge color="var(--ap-green)">{metrics.completedTodos} done</MiniBadge>}>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={progressBands} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--ap-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--ap-fg-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--ap-fg-muted)' }} axisLine={false} tickLine={false} width={34} />
                <Tooltip contentStyle={{ borderColor: 'var(--ap-border)', borderRadius: 10, fontSize: 12 }} />
                <Bar dataKey="objectives" name="Objectives" fill="#007AFF" radius={[4, 4, 0, 0]} />
                <Bar dataKey="krs" name="KRs" fill="#34C759" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </DashboardCard>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <DashboardCard title={mode === 'ceo' ? 'Department heatmap' : 'Team context'}>
          <CompactRankTable
            rows={topDepartments.map((row) => ({
              name: row.name,
              primary: `${row.progress}%`,
              secondary: `${row.risk} risk`,
              meter: row.riskRate,
              danger: row.overdue > 0,
            }))}
            empty="No department data"
          />
        </DashboardCard>

        <DashboardCard title={mode === 'ceo' ? 'Owner workload' : 'People linked to your scope'}>
          <CompactRankTable
            rows={topOwners.map((row) => ({
              name: row.name,
              primary: `${row.openTodos} open`,
              secondary: `${row.risk} risk · ${row.progress}%`,
              meter: Math.min(100, row.loadScore * 10),
              danger: row.overdue > 0,
            }))}
            empty="No owner data"
          />
        </DashboardCard>

        <DashboardCard title="Plan health">
          <CompactRankTable
            rows={planRows.slice(0, 6).map((row) => ({
              name: row.name,
              primary: `${row.progress}%`,
              secondary: `${row.krs} KRs · ${row.risk} risk`,
              meter: row.progress,
              danger: row.risk > 0,
            }))}
            empty="No plan data"
          />
        </DashboardCard>
      </div>
    </section>
  )
}

// DashboardCard, InsightTile, MiniBadge, KpiCard moved to components/ui/dashboard
// so the main /dashboard page can reuse the same primitives.

function RecommendationRow({ item }: { item: { title: string; detail: string; tone: KrDisplayStatus; href?: string } }) {
  const toneColor = STATUS_COLORS[item.tone]
  const icon =
    item.tone === 'on_track' ? <CheckCircle2 className="h-4 w-4" /> :
    item.tone === 'pending' || item.tone === 'not_measurable' ? <Clock3 className="h-4 w-4" /> :
    <AlertTriangle className="h-4 w-4" />
  const body = (
    <div className="flex gap-3 rounded-[12px] border p-3 transition hover:bg-muted/40" style={{ borderColor: 'var(--ap-border)' }}>
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]" style={{ background: `${toneColor}1F`, color: toneColor }}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-foreground">{item.title}</div>
        <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">{item.detail}</p>
      </div>
    </div>
  )
  return item.href ? <Link href={item.href}>{body}</Link> : body
}

function CompactRankTable({
  rows,
  empty,
}: {
  rows: Array<{ name: string; primary: string; secondary: string; meter: number; danger?: boolean }>
  empty: string
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-[13px] text-muted-foreground">{empty}</p>
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.name} className="space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-foreground">{row.name}</p>
              <p className="text-[11px] text-muted-foreground">{row.secondary}</p>
            </div>
            <span className="shrink-0 text-[12px] font-semibold tabular-nums" style={{ color: row.danger ? 'var(--ap-red)' : 'var(--ap-fg)' }}>
              {row.primary}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--ap-bg-sunken)' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${clampPct(row.meter)}%`,
                background: row.danger ? 'var(--ap-red)' : 'var(--ap-accent)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

