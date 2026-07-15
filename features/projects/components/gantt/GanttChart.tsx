'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  Columns,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Flag,
  GitBranch,
  Image as ImageIcon,
  List,
  ListTree,
  Map as MapIcon,
  Minus,
  MessageSquare,
  PanelTop,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
} from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { businessDaysBetween } from '@/lib/projects/business-days'
import { criticalPath } from '@/lib/projects/scheduling'
import { cn } from '@/lib/utils'
import {
  ACTIVITY_STATUS_LABEL,
  ACTIVITY_STATUS_TOKEN,
  DEPENDENCY_TYPES,
  SLIP_REASONS,
  SLIP_REASON_LABEL,
  SLIP_REASON_OWNER,
  type ActivityStatus,
  type DependencyType,
  type OwnerParty,
  type SlipReason,
} from '../../types'
import {
  useAddActivity,
  useCommitBaseline,
  useCreateActivityDependency,
  useDeleteActivityDependency,
  useRebaseline,
  useShiftActivitySchedule,
  type ActivityDependencyNode,
  type ActivityNode,
  type MilestoneNode,
  type PhaseNode,
  type ProjectDetail,
} from '../../hooks/useProject'
import { AiAssistantPanel } from '../ai/AiAssistantPanel'

type GanttScale = 'days' | 'weeks' | 'months' | 'quarters' | 'years'
type GanttSort = 'position' | 'name' | 'date' | 'status' | 'priority'
type GanttSegment = 'phase' | 'assignee' | 'status' | 'owner'
type OptionalColumn = 'assignee' | 'estimatedHours' | 'start' | 'due' | 'status' | 'priority' | 'risk' | 'percent' | 'owner' | 'slipDays'
type GanttRowType = 'phase' | 'milestone' | 'activity' | 'subactivity'
type ExportFormat = 'pdf' | 'png' | 'csv' | 'xml'

interface GanttRow {
  id: string
  activityId: string | null
  milestoneId: string | null
  parentActivityId: string | null
  parentId: string | null
  type: GanttRowType
  depth: number
  title: string
  position: number
  status: string
  assigneeId?: string | null
  ownerParty?: string
  percentComplete: number
  priority?: string | null
  risk?: string | null
  estimatedHours?: number | null
  slipDays: number
  commentsCount: number
  start: Date | null
  end: Date | null
  baselineStart: Date | null
  baselineEnd: Date | null
  isMilestone: boolean
  waitingSince: Date | null
  hasChildren: boolean
}

interface PendingScheduleChange {
  row: GanttRow
  mode: 'move' | 'resize-start' | 'resize-end'
  currentStart: Date | null
  currentEnd: Date | null
}

interface GanttToolbarPrefs {
  showBaselines: boolean
  showDependencies: boolean
  showProgress: boolean
  showCriticalPath: boolean
  showWeekends: boolean
  showToday: boolean
  showMinimap: boolean
  showComments: boolean
}

interface DragPreview {
  activityId: string
  currentStart: Date | null
  currentEnd: Date | null
  label: string
  x: number
  y: number
}

interface TimelineUnit {
  key: string
  start: Date
  end: Date
  label: string
  group: string
  width: number
}

const ROW_HEIGHT = 40
const HEADER_HEIGHT = 64
const LEFT_WIDTH_KEY = 'projects.gantt.leftWidth'
const COLUMNS_KEY = 'projects.gantt.columns'
const COLLAPSE_KEY = 'projects.gantt.collapsed'
const PREFS_KEY = 'projects.gantt.toolbarPrefs'
const SEGMENT_KEY = 'projects.gantt.segment'
const DEFAULT_COLUMNS: OptionalColumn[] = ['start', 'due', 'status', 'owner', 'percent']
const DEFAULT_PREFS: GanttToolbarPrefs = {
  showBaselines: true,
  showDependencies: true,
  showProgress: true,
  showCriticalPath: false,
  showWeekends: true,
  showToday: true,
  showMinimap: true,
  showComments: false,
}
const BASE_UNIT_WIDTH: Record<GanttScale, number> = { days: 34, weeks: 58, months: 78, quarters: 110, years: 148 }
const COLUMN_LABEL: Record<OptionalColumn, string> = {
  assignee: 'Assignee',
  estimatedHours: 'EH',
  start: 'Start',
  due: 'Due',
  status: 'Status',
  priority: 'Priority',
  risk: 'Risk',
  percent: '%',
  owner: 'Owner Party',
  slipDays: 'Slip Days',
}

export function GanttChart({ project, onActivityOpen }: { project: ProjectDetail; onActivityOpen?: (activityId: string) => void }) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const addActivity = useAddActivity(project.id)
  const commitBaseline = useCommitBaseline(project.id)
  const rebaseline = useRebaseline(project.id)
  const shiftSchedule = useShiftActivitySchedule(project.id)
  const createDependency = useCreateActivityDependency(project.id)
  const deleteDependency = useDeleteActivityDependency(project.id)
  const [leftWidth, setLeftWidth] = useState(420)
  const [scale, setScale] = useState<GanttScale>('weeks')
  const [zoom, setZoom] = useState(1)
  const [sort, setSort] = useState<GanttSort>('position')
  const [segment, setSegment] = useState<GanttSegment>('phase')
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [visibleColumns, setVisibleColumns] = useState<OptionalColumn[]>(DEFAULT_COLUMNS)
  const [toolbarPrefs, setToolbarPrefs] = useState<GanttToolbarPrefs>(DEFAULT_PREFS)
  const [showAiAssistant, setShowAiAssistant] = useState(false)
  const [baselineVersion, setBaselineVersion] = useState(project.baselineVersion || 1)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [dependencyType, setDependencyType] = useState<DependencyType>('FS')
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)
  const [lastScheduleChange, setLastScheduleChange] = useState<PendingScheduleChange | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const [pendingChange, setPendingChange] = useState<PendingScheduleChange | null>(null)
  const [slipReason, setSlipReason] = useState<SlipReason | ''>('')
  const [slipOwner, setSlipOwner] = useState<OwnerParty>('CLIENT')
  const [slipDetail, setSlipDetail] = useState('')
  const [linkingFrom, setLinkingFrom] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ActivityDependencyNode | null>(null)

  useEffect(() => {
    const savedWidth = Number(localStorage.getItem(LEFT_WIDTH_KEY))
    if (Number.isFinite(savedWidth) && savedWidth >= 300 && savedWidth <= 760) setLeftWidth(savedWidth)
    const savedColumns = localStorage.getItem(COLUMNS_KEY)
    if (savedColumns) {
      const parsed = savedColumns.split(',').filter((c): c is OptionalColumn => c in COLUMN_LABEL)
      if (parsed.length) setVisibleColumns(parsed)
    }
    const savedCollapsed = localStorage.getItem(COLLAPSE_KEY)
    if (savedCollapsed) setCollapsed(new Set(savedCollapsed.split(',').filter(Boolean)))
    const savedPrefs = localStorage.getItem(PREFS_KEY)
    if (savedPrefs) setToolbarPrefs({ ...DEFAULT_PREFS, ...JSON.parse(savedPrefs) })
    const savedSegment = localStorage.getItem(SEGMENT_KEY) as GanttSegment | null
    if (savedSegment && ['phase', 'assignee', 'status', 'owner'].includes(savedSegment)) setSegment(savedSegment)
  }, [])

  useEffect(() => {
    setBaselineVersion(project.baselineVersion || 1)
  }, [project.baselineVersion])

  useEffect(() => {
    localStorage.setItem(LEFT_WIDTH_KEY, String(leftWidth))
  }, [leftWidth])

  useEffect(() => {
    localStorage.setItem(COLUMNS_KEY, visibleColumns.join(','))
  }, [visibleColumns])

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, [...collapsed].join(','))
  }, [collapsed])

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(toolbarPrefs))
  }, [toolbarPrefs])

  useEffect(() => {
    localStorage.setItem(SEGMENT_KEY, segment)
  }, [segment])

  const allRows = useMemo(() => buildRows(project, sort, segment), [project, sort, segment])
  const visibleRows = useMemo(
    () => filterVisibleRows(allRows, collapsed, query),
    [allRows, collapsed, query]
  )
  const range = useMemo(() => computeDateRange(project, allRows), [project, allRows])
  const units = useMemo(() => buildTimelineUnits(range.start, range.end, scale, zoom), [range, scale, zoom])
  const timelineWidth = units.reduce((sum, u) => sum + u.width, 0)
  const selectedRow = useMemo(
    () => allRows.find((row) => row.activityId === selectedActivityId) ?? null,
    [allRows, selectedActivityId]
  )
  const criticalActivityIds = useMemo(() => {
    if (!toolbarPrefs.showCriticalPath) return new Set<string>()
    try {
      const tasks = allRows
        .filter((row) => row.activityId)
        .map((row) => ({ id: row.activityId!, currentStart: row.start, currentEnd: row.end }))
      return new Set(criticalPath(tasks, project.dependencies).taskIds)
    } catch {
      return new Set<string>()
    }
  }, [allRows, project.dependencies, toolbarPrefs.showCriticalPath])

  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const todayX = toolbarPrefs.showToday ? dateToX(new Date(), units) : null
  const groups = groupTimelineUnits(units)
  const columnTemplate = buildColumnTemplate(visibleColumns)
  const previewByActivity = dragPreview ? new Map([[dragPreview.activityId, { start: dragPreview.currentStart, end: dragPreview.currentEnd }]]) : new Map()
  const baselineVersions = Array.from({ length: Math.max(1, project.baselineVersion || 1) }, (_, i) => i + 1)

  const resizeStart = (clientX: number) => {
    const startX = clientX
    const startWidth = leftWidth
    const onMove = (event: MouseEvent) => {
      setLeftWidth(Math.min(760, Math.max(300, startWidth + event.clientX - startX)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const setAllCollapsed = (nextCollapsed: boolean) => {
    setCollapsed(nextCollapsed ? new Set(allRows.filter((r) => r.hasChildren).map((r) => r.id)) : new Set())
  }

  const toggleColumn = (col: OptionalColumn) => {
    setVisibleColumns((current) =>
      current.includes(col) ? current.filter((c) => c !== col) : [...current, col]
    )
  }

  const togglePreference = (key: keyof GanttToolbarPrefs) => {
    setToolbarPrefs((current) => ({ ...current, [key]: !current[key] }))
  }

  const downloadExport = async (format: ExportFormat) => {
    const params = new URLSearchParams({ format, baselineVersion: String(baselineVersion) })
    const res = await fetch(`/api/projects/${project.id}/gantt/export?${params}`)
    if (!res.ok) throw new Error(`Export failed: ${res.status}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.code || project.id}-gantt.${format === 'xml' ? 'xml' : format}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const copyShareLink = async () => {
    const url = `${window.location.origin}/dashboard/projects/${project.id}`
    await navigator.clipboard?.writeText(url)
  }

  const duplicateSelected = () => {
    if (!selectedRow?.activityId || !selectedRow.milestoneId) return
    addActivity.mutate({
      milestoneId: selectedRow.milestoneId,
      parentActivityId: selectedRow.parentActivityId,
      title: `${selectedRow.title} Copy`,
      assigneeId: selectedRow.assigneeId ?? null,
      ownerParty: selectedRow.ownerParty ?? '360GROUND',
      currentStart: isoDateOnly(selectedRow.start),
      currentEnd: isoDateOnly(selectedRow.end),
      priority: selectedRow.priority ?? null,
      risk: selectedRow.risk ?? null,
      estimatedHours: selectedRow.estimatedHours ?? null,
      isMilestone: selectedRow.isMilestone,
    })
  }

  const undoLastScheduleChange = () => {
    if (!lastScheduleChange) return
    if (project.baselineCommittedAt) {
      setPendingChange(lastScheduleChange)
      setSlipReason('')
      setSlipOwner('CLIENT')
      setSlipDetail('Undo last schedule change')
      return
    }
    void persistScheduleChange(lastScheduleChange)
  }

  const commitBaselineFromToolbar = () => {
    if (project.baselineCommittedAt || commitBaseline.isPending) return
    commitBaseline.mutate({ notes: 'Committed from Gantt toolbar' })
  }

  const rebaselineFromToolbar = () => {
    if (!project.baselineCommittedAt || rebaseline.isPending) return
    const reason = window.prompt('Reason for re-baseline?')
    if (!reason?.trim()) return
    rebaseline.mutate({ reason: reason.trim() })
  }

  const startBarDrag = (row: GanttRow, mode: PendingScheduleChange['mode'], event: React.MouseEvent) => {
    if (linkingFrom) return
    if (!row.activityId || row.type === 'phase' || !row.start || !row.end) return
    event.preventDefault()
    event.stopPropagation()
    const startClientX = event.clientX
    const originStart = row.start
    const originEnd = row.end
    const onMove = (move: MouseEvent) => {
      const deltaDays = pixelsToDays(move.clientX - startClientX, units)
      const currentStart = mode === 'resize-end' ? originStart : addDays(originStart, deltaDays)
      const currentEnd = mode === 'resize-start' ? originEnd : addDays(originEnd, deltaDays)
      if (currentStart && currentEnd && currentEnd < currentStart) return
      setDragPreview({
        activityId: row.activityId!,
        currentStart,
        currentEnd,
        label: `${fmtDate(currentStart)} - ${fmtDate(currentEnd)}`,
        x: move.clientX,
        y: move.clientY,
      })
    }
    const onUp = (up: MouseEvent) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const deltaDays = pixelsToDays(up.clientX - startClientX, units)
      const currentStart = mode === 'resize-end' ? originStart : addDays(originStart, deltaDays)
      const currentEnd = mode === 'resize-start' ? originEnd : addDays(originEnd, deltaDays)
      if (deltaDays === 0 || (currentStart && currentEnd && currentEnd < currentStart)) {
        setDragPreview(null)
        return
      }
      const change = { row, mode, currentStart, currentEnd }
      if (project.baselineCommittedAt) {
        setPendingChange(change)
        setSlipReason('')
        setSlipOwner('CLIENT')
        setSlipDetail('')
      } else {
        void persistScheduleChange(change)
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const persistScheduleChange = async (change: PendingScheduleChange, slip?: { slipReason: SlipReason; slipOwner: OwnerParty; slipDetail: string }) => {
    if (!change.row.activityId) return
    try {
      await shiftSchedule.mutateAsync({
        activityId: change.row.activityId,
        mode: change.mode,
        currentStart: isoDateOnly(change.currentStart),
        currentEnd: isoDateOnly(change.currentEnd),
        ...slip,
      })
      setLastScheduleChange({
        row: change.row,
        mode: 'move',
        currentStart: change.row.start,
        currentEnd: change.row.end,
      })
    } finally {
      setDragPreview(null)
      setPendingChange(null)
    }
  }

  const beginDependency = (activityId: string, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setLinkingFrom(activityId)
  }

  const completeDependency = (activityId: string, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (!linkingFrom || linkingFrom === activityId) return
    createDependency.mutate({ predecessorId: linkingFrom, successorId: activityId, type: dependencyType })
    setLinkingFrom(null)
  }

  return (
    <section className="rounded-card border border-black/[0.08] bg-surface-card shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.08] px-3 py-2">
        <div className="flex items-center gap-1 rounded-md border border-black/[0.08] bg-surface-card px-2 py-1">
          <Search className="size-3.5 text-ink-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search schedule"
            className="w-44 bg-transparent text-body-sm text-ink-primary outline-none placeholder:text-ink-tertiary"
          />
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => setAllCollapsed(false)} title="Expand all">
          <ListTree className="mr-1 size-3.5" /> Expand
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => setAllCollapsed(true)} title="Collapse all">
          <List className="mr-1 size-3.5" /> Collapse
        </button>

        <details className="relative">
          <summary className="btn btn-outline btn-sm cursor-pointer list-none">
            <Download className="mr-1 size-3.5" /> Export
          </summary>
          <div className="absolute left-0 top-9 z-30 w-56 rounded-md border border-black/[0.08] bg-surface-card p-1 shadow-popover">
            <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-body-sm hover:bg-surface-hover" onClick={() => void downloadExport('pdf')}>
              <FileText className="size-3.5" /> PDF
            </button>
            <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-body-sm hover:bg-surface-hover" onClick={() => void downloadExport('png')}>
              <ImageIcon className="size-3.5" /> PNG
            </button>
            <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-body-sm hover:bg-surface-hover" onClick={() => void downloadExport('csv')}>
              <Columns className="size-3.5" /> CSV
            </button>
            <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-body-sm hover:bg-surface-hover" onClick={() => void downloadExport('xml')}>
              <GitBranch className="size-3.5" /> MS Project XML
            </button>
            <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-body-sm hover:bg-surface-hover" onClick={() => void copyShareLink()}>
              <Share2 className="size-3.5" /> Share link
            </button>
          </div>
        </details>

        <details className="relative">
          <summary className="btn btn-outline btn-sm cursor-pointer list-none">
            {toolbarPrefs.showBaselines ? <Eye className="mr-1 size-3.5" /> : <EyeOff className="mr-1 size-3.5" />} Baseline
          </summary>
          <div className="absolute left-0 top-9 z-30 w-64 space-y-2 rounded-md border border-black/[0.08] bg-surface-card p-2 shadow-popover">
            <label className="flex items-center justify-between gap-2 text-body-sm">
              <span>Show baseline bars</span>
              <input type="checkbox" checked={toolbarPrefs.showBaselines} onChange={() => togglePreference('showBaselines')} />
            </label>
            <label className="block text-body-sm text-ink-secondary">
              Version
              <select className="input mt-1 h-8 w-full" value={baselineVersion} onChange={(e) => setBaselineVersion(Number(e.target.value))}>
                {baselineVersions.map((v) => <option key={v} value={v}>Baseline v{v}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn btn-outline btn-sm" onClick={commitBaselineFromToolbar} disabled={!!project.baselineCommittedAt || commitBaseline.isPending}>
                Commit
              </button>
              <button className="btn btn-outline btn-sm" onClick={rebaselineFromToolbar} disabled={!project.baselineCommittedAt || rebaseline.isPending}>
                Re-baseline
              </button>
            </div>
          </div>
        </details>

        <details className="relative">
          <summary className="btn btn-outline btn-sm cursor-pointer list-none">
            <PanelTop className="mr-1 size-3.5" /> Options
          </summary>
          <div className="absolute left-0 top-9 z-30 w-64 space-y-1 rounded-md border border-black/[0.08] bg-surface-card p-2 shadow-popover">
            <ToolbarCheck label="Dependencies" checked={toolbarPrefs.showDependencies} onChange={() => togglePreference('showDependencies')} />
            <ToolbarCheck label="Progress fill" checked={toolbarPrefs.showProgress} onChange={() => togglePreference('showProgress')} />
            <ToolbarCheck label="Critical path" checked={toolbarPrefs.showCriticalPath} onChange={() => togglePreference('showCriticalPath')} />
            <ToolbarCheck label="Weekends" checked={toolbarPrefs.showWeekends} onChange={() => togglePreference('showWeekends')} />
            <ToolbarCheck label="Today marker" checked={toolbarPrefs.showToday} onChange={() => togglePreference('showToday')} />
          </div>
        </details>

        <details className="relative">
          <summary className="btn btn-outline btn-sm cursor-pointer list-none">
            <Columns className="mr-1 size-3.5" /> Columns
          </summary>
          <div className="absolute left-0 top-9 z-30 grid w-72 grid-cols-2 gap-1 rounded-md border border-black/[0.08] bg-surface-card p-2 shadow-popover">
            {Object.keys(COLUMN_LABEL).map((col) => (
              <ToolbarCheck
                key={col}
                label={COLUMN_LABEL[col as OptionalColumn]}
                checked={visibleColumns.includes(col as OptionalColumn)}
                onChange={() => toggleColumn(col as OptionalColumn)}
              />
            ))}
          </div>
        </details>

        <select className="rounded-md border border-black/[0.08] bg-surface-card px-2 py-1 text-body-sm" value={segment} onChange={(e) => setSegment(e.target.value as GanttSegment)}>
          <option value="phase">Group: Phase</option>
          <option value="assignee">Group: Assignee</option>
          <option value="status">Group: Status</option>
          <option value="owner">Group: Owner Party</option>
        </select>
        <select className="rounded-md border border-black/[0.08] bg-surface-card px-2 py-1 text-body-sm" value={sort} onChange={(e) => setSort(e.target.value as GanttSort)}>
          <option value="position">Sort: Schedule</option>
          <option value="date">Sort: Date</option>
          <option value="name">Sort: Name</option>
          <option value="status">Sort: Status</option>
          <option value="priority">Sort: Priority</option>
        </select>
        <select className="rounded-md border border-black/[0.08] bg-surface-card px-2 py-1 text-body-sm" value={scale} onChange={(e) => setScale(e.target.value as GanttScale)}>
          <option value="days">Days</option>
          <option value="weeks">Weeks</option>
          <option value="months">Months</option>
          <option value="quarters">Quarters</option>
          <option value="years">Years</option>
        </select>
        <select className="rounded-md border border-black/[0.08] bg-surface-card px-2 py-1 text-body-sm" value={dependencyType} onChange={(e) => setDependencyType(e.target.value as DependencyType)}>
          {DEPENDENCY_TYPES.map((type) => <option key={type} value={type}>Link: {type}</option>)}
        </select>
        <button className="btn btn-outline btn-sm" onClick={() => togglePreference('showCriticalPath')} title="Critical path">
          <Flag className={cn('mr-1 size-3.5', toolbarPrefs.showCriticalPath && 'text-danger-600')} /> Critical
        </button>
        <button className="btn btn-outline btn-sm" onClick={undoLastScheduleChange} disabled={!lastScheduleChange || shiftSchedule.isPending} title="Undo last schedule change">
          <RotateCcw className="mr-1 size-3.5" /> Undo
        </button>
        <button className="btn btn-outline btn-sm" onClick={duplicateSelected} disabled={!selectedRow?.activityId || addActivity.isPending} title="Duplicate selected activity">
          <Copy className="mr-1 size-3.5" /> Duplicate
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => togglePreference('showComments')} title="Toggle comments">
          <MessageSquare className="mr-1 size-3.5" /> Comments
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => togglePreference('showMinimap')} title="Toggle minimap">
          <MapIcon className="mr-1 size-3.5" /> Minimap
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => setShowAiAssistant(true)} title="Constrained AI Assistant">
          <Sparkles className="mr-1 size-3.5" /> AI
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.1).toFixed(2)))}>
          <Minus className="size-3.5" />
        </button>
        <span className="w-12 text-center text-body-sm text-ink-secondary">{Math.round(zoom * 100)}%</span>
        <button className="btn btn-outline btn-sm" onClick={() => setZoom((z) => Math.min(1.8, +(z + 0.1).toFixed(2)))}>
          <Plus className="size-3.5" />
        </button>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-ink-tertiary">
          {selectedRow ? <span>Selected: {selectedRow.title}</span> : <span>Select a bar to duplicate</span>}
        </div>
      </div>

      {toolbarPrefs.showCriticalPath && (
        <div className="border-b border-danger-500/20 bg-danger-50 px-3 py-1.5 text-[11px] font-medium text-danger-700">
          Critical path is highlighted in red on dated activities.
        </div>
      )}

      <div className="border-b border-black/[0.08] px-3 py-2">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-tertiary">
          <span className="inline-flex items-center gap-1"><span className="size-3 rounded-pill bg-project-baseline opacity-50" /> Baseline</span>
          <span className="inline-flex items-center gap-1"><span className="size-3 rounded-pill bg-project-status-started" /> Current</span>
          <span className="inline-flex items-center gap-1"><span className="size-3 rotate-45 bg-status-completed" /> Milestone</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-0 border-l border-danger-500" /> Today</span>
          <span className="inline-flex items-center gap-1"><span className="size-3 rounded-pill border-2 border-danger-500" /> Critical path</span>
        </div>
      </div>

      {toolbarPrefs.showMinimap && (
      <div className="border-b border-black/[0.08] px-3 py-2">
        <GanttMinimap
          start={range.start}
          end={range.end}
          visibleStartRatio={timelineWidth ? Math.min(1, scrollLeft / timelineWidth) : 0}
          visibleWidthRatio={timelineWidth ? Math.min(1, ((parentRef.current?.clientWidth ?? 0) - leftWidth) / timelineWidth) : 1}
        />
      </div>
      )}

      <div
        ref={parentRef}
        className="relative h-[640px] overflow-auto"
        onScroll={(e) => setScrollLeft((e.currentTarget as HTMLDivElement).scrollLeft)}
      >
        <div style={{ width: leftWidth + timelineWidth, minWidth: '100%' }}>
          <div
            className="sticky top-0 z-20 grid border-b border-black/[0.08] bg-surface-card"
            style={{ gridTemplateColumns: `${leftWidth}px ${timelineWidth}px`, height: HEADER_HEIGHT }}
          >
            <div className="relative border-r border-black/[0.08]">
              <div className="grid h-full items-center text-[11px] font-medium uppercase tracking-[0.04em] text-ink-tertiary" style={{ gridTemplateColumns: columnTemplate }}>
                <div className="px-3">Task</div>
                {visibleColumns.map((col) => <div key={col} className="px-2">{COLUMN_LABEL[col]}</div>)}
              </div>
              <button
                className="absolute right-[-4px] top-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-primary-100"
                aria-label="Resize task list"
                onMouseDown={(e) => resizeStart(e.clientX)}
              />
            </div>
            <div className="relative overflow-hidden">
              <div className="flex h-8 border-b border-black/[0.08]">
                {groups.map((g) => (
                  <div key={g.key} className="border-r border-black/[0.04] px-2 py-1 text-[11px] font-medium text-ink-secondary" style={{ width: g.width }}>
                    {g.label}
                  </div>
                ))}
              </div>
              <div className="flex h-8">
                {units.map((u) => (
                  <div
                    key={u.key}
                    className={cn('border-r border-black/[0.04] px-1 py-1 text-center text-[11px] text-ink-tertiary', toolbarPrefs.showWeekends && isWeekendUnit(u) && 'bg-warning-50/60')}
                    style={{ width: u.width }}
                  >
                    {u.label}
                  </div>
                ))}
              </div>
              {todayX != null && (
                <div className="pointer-events-none absolute top-0 h-full border-l border-danger-500" style={{ left: todayX }}>
                  <div className="rounded-b bg-danger-500 px-1 py-0.5 text-[10px] font-medium text-white">Today</div>
                </div>
              )}
            </div>
          </div>

          {visibleRows.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-body-sm text-ink-secondary">
              No schedule rows match the current search.
            </div>
          ) : (
            <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
              {toolbarPrefs.showDependencies && (
                <GanttDependencyLayer
                  dependencies={project.dependencies}
                  rows={visibleRows}
                  units={units}
                  height={virtualizer.getTotalSize()}
                  onDelete={setDeleteTarget}
                />
              )}
              {virtualItems.map((item) => {
                const row = visibleRows[item.index]
                const preview = row.activityId ? previewByActivity.get(row.activityId) : undefined
                const isCritical = !!row.activityId && criticalActivityIds.has(row.activityId)
                return (
                  <div
                    key={row.id}
                    className={cn('absolute left-0 grid border-b border-black/[0.04]', selectedActivityId && row.activityId === selectedActivityId && 'bg-primary-50/50')}
                    style={{
                      transform: `translateY(${item.start}px)`,
                      gridTemplateColumns: `${leftWidth}px ${timelineWidth}px`,
                      height: ROW_HEIGHT,
                    }}
                  >
                    <GanttTaskListRow
                      row={row}
                      collapsed={collapsed.has(row.id)}
                      columns={visibleColumns}
                      columnTemplate={columnTemplate}
                      onToggle={() => setCollapsed((current) => toggleSetValue(current, row.id))}
                    />
                    <GanttTimelineRow
                      row={row}
                      preview={preview}
                      units={units}
                      todayX={todayX}
                      baselined={!!project.baselineCommittedAt && toolbarPrefs.showBaselines}
                      showProgress={toolbarPrefs.showProgress}
                      showWeekends={toolbarPrefs.showWeekends}
                      showComments={toolbarPrefs.showComments}
                      isCritical={isCritical}
                      isSelected={!!row.activityId && row.activityId === selectedActivityId}
                      linkingFrom={linkingFrom}
                      onStartDrag={startBarDrag}
                      onSelect={(activityId) => {
                        setSelectedActivityId(activityId)
                        onActivityOpen?.(activityId)
                      }}
                      onBeginDependency={beginDependency}
                      onCompleteDependency={completeDependency}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-black/[0.08] px-3 py-2 text-body-sm text-ink-tertiary">
        <span>{visibleRows.length} visible rows of {allRows.length}</span>
        <span className="inline-flex items-center gap-3">
          {linkingFrom && <span className="text-primary-600">Choose a successor activity...</span>}
          <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" /> {fmtDate(range.start)} to {fmtDate(range.end)}</span>
        </span>
      </div>
      {dragPreview && (
        <div
          className="pointer-events-none fixed z-50 rounded-md bg-ink-primary px-2 py-1 text-[11px] font-medium text-white shadow-popover"
          style={{ left: dragPreview.x + 10, top: dragPreview.y + 10 }}
        >
          {dragPreview.label}
        </div>
      )}
      <ConfirmDialog
        open={!!pendingChange}
        onClose={() => {
          setPendingChange(null)
          setDragPreview(null)
        }}
        onConfirm={() => {
          if (!pendingChange || !slipReason) return
          void persistScheduleChange(pendingChange, { slipReason, slipOwner, slipDetail: slipDetail.trim() })
        }}
        title="Record Schedule Slip"
        message="This project is baselined. Date changes require a reason and owner before the schedule can be saved."
        variant="warning"
        confirmLabel="Save Schedule Change"
        disabled={!slipReason || shiftSchedule.isPending}
        isLoading={shiftSchedule.isPending}
        extraContent={
          <div className="space-y-3">
            <label className="block">
              <span className="text-body-sm text-ink-secondary">Reason</span>
              <select
                className="input mt-1 w-full"
                value={slipReason}
                onChange={(e) => {
                  const reason = e.target.value as SlipReason
                  setSlipReason(reason)
                  if (reason) setSlipOwner(SLIP_REASON_OWNER[reason])
                }}
              >
                <option value="">Select reason</option>
                {SLIP_REASONS.map((r) => <option key={r} value={r}>{SLIP_REASON_LABEL[r]}</option>)}
              </select>
            </label>
            <div>
              <div className="text-body-sm text-ink-secondary">Owner</div>
              <div className="mt-1 flex gap-2">
                {(['360GROUND', 'CLIENT', 'SHARED'] as const).map((owner) => (
                  <label key={owner} className="flex items-center gap-1 rounded-md border border-black/[0.08] px-2 py-1 text-body-sm">
                    <input type="radio" checked={slipOwner === owner} onChange={() => setSlipOwner(owner)} />
                    {owner === '360GROUND' ? '360Ground' : labelize(owner)}
                  </label>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-body-sm text-ink-secondary">Detail</span>
              <textarea className="input mt-1 w-full" rows={2} value={slipDetail} onChange={(e) => setSlipDetail(e.target.value)} />
            </label>
          </div>
        }
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return
          deleteDependency.mutate({ dependencyId: deleteTarget.id }, { onSuccess: () => setDeleteTarget(null) })
        }}
        title="Delete Dependency"
        message="Remove this dependency link from the schedule?"
        variant="danger"
        confirmLabel="Delete"
        isLoading={deleteDependency.isPending}
      />
      <AiAssistantPanel
        projectId={project.id}
        open={showAiAssistant}
        onClose={() => setShowAiAssistant(false)}
      />
    </section>
  )
}

function GanttTaskListRow({
  row,
  collapsed,
  columns,
  columnTemplate,
  onToggle,
}: {
  row: GanttRow
  collapsed: boolean
  columns: OptionalColumn[]
  columnTemplate: string
  onToggle: () => void
}) {
  return (
    <div className="grid items-center border-r border-black/[0.08] text-body-sm" style={{ gridTemplateColumns: columnTemplate }}>
      <div className="flex min-w-0 items-center gap-1 px-3" style={{ paddingLeft: 12 + row.depth * 18 }}>
        {row.hasChildren ? (
          <button className="rounded p-0.5 hover:bg-surface-hover" onClick={onToggle} aria-label={collapsed ? 'Expand row' : 'Collapse row'}>
            {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className={row.type === 'phase' ? 'truncate font-semibold text-ink-primary' : row.type === 'milestone' ? 'truncate font-medium text-ink-primary' : 'truncate text-ink-secondary'}>
          {row.title}
        </span>
      </div>
      {columns.map((col) => <div key={col} className="truncate px-2 text-[12px] text-ink-secondary">{renderColumn(row, col)}</div>)}
    </div>
  )
}

function GanttTimelineRow({
  row,
  preview,
  units,
  todayX,
  baselined,
  showProgress,
  showWeekends,
  showComments,
  isCritical,
  isSelected,
  linkingFrom,
  onStartDrag,
  onSelect,
  onBeginDependency,
  onCompleteDependency,
}: {
  row: GanttRow
  preview?: { start: Date | null; end: Date | null }
  units: TimelineUnit[]
  todayX: number | null
  baselined: boolean
  showProgress: boolean
  showWeekends: boolean
  showComments: boolean
  isCritical: boolean
  isSelected: boolean
  linkingFrom: string | null
  onStartDrag: (row: GanttRow, mode: PendingScheduleChange['mode'], event: React.MouseEvent) => void
  onSelect: (activityId: string) => void
  onBeginDependency: (activityId: string, event: React.MouseEvent) => void
  onCompleteDependency: (activityId: string, event: React.MouseEvent) => void
}) {
  const actualStart = preview?.start ?? row.start
  const actualEnd = preview?.end ?? row.end
  const actual = spanToRect(actualStart, actualEnd, units)
  const baseline = baselined ? spanToRect(row.baselineStart, row.baselineEnd, units) : null
  const isMilestone = row.type === 'milestone' || row.isMilestone
  const canInteract = !!row.activityId && row.type !== 'phase' && row.type !== 'milestone'

  return (
    <div className={row.type === 'phase' ? 'relative bg-surface-muted/40' : 'relative'}>
      <div className="flex h-full">
        {units.map((u) => (
          <div
            key={u.key}
            className={cn('h-full border-r border-black/[0.04]', showWeekends && isWeekendUnit(u) && 'bg-warning-50/35')}
            style={{ width: u.width }}
          />
        ))}
      </div>
      {baseline && (
        <div
          className={cn(
            'pointer-events-none absolute top-[23px] h-2 rounded-pill bg-project-baseline opacity-40',
            isMilestone && 'h-3 w-3 rotate-45 rounded-none'
          )}
          style={{
            left: isMilestone ? baseline.left - 6 : baseline.left,
            width: isMilestone ? 12 : baseline.width,
          }}
          title="Baseline"
        />
      )}
      {actual && isMilestone ? (
        <div
          className={cn(
            'absolute top-[13px] h-3.5 w-3.5 rotate-45 border border-black/10',
            canInteract && 'cursor-grab active:cursor-grabbing',
            statusClass(row),
            row.risk === 'HIGH' && 'ring-2 ring-danger-500/30',
            isCritical && 'ring-2 ring-danger-500',
            isSelected && 'outline outline-2 outline-primary-500'
          )}
          style={{ left: actual.left - 7 }}
          title={`${row.title} · ${renderColumn(row, 'status')}`}
          onMouseDown={(event) => onStartDrag(row, 'move', event)}
          onClick={() => row.activityId && onSelect(row.activityId)}
          onMouseUp={(event) => row.activityId && completeIfLinking(linkingFrom, row.activityId, event, onCompleteDependency)}
        />
      ) : actual ? (
        <div
          className={cn(
            'absolute top-[10px] h-4 min-w-[16px] overflow-hidden rounded-pill shadow-sm',
            canInteract && 'cursor-grab active:cursor-grabbing',
            row.type === 'phase' ? 'bg-ink-secondary' : statusClass(row),
            row.risk === 'HIGH' && 'ring-2 ring-danger-500/30',
            isCritical && 'ring-2 ring-danger-500',
            isSelected && 'outline outline-2 outline-primary-500'
          )}
          style={{ left: actual.left, width: actual.width }}
          title={`${row.title} · ${renderColumn(row, 'status')} · ${Math.round(row.percentComplete)}%`}
          onMouseDown={(event) => onStartDrag(row, 'move', event)}
          onClick={() => row.activityId && onSelect(row.activityId)}
          onMouseUp={(event) => row.activityId && completeIfLinking(linkingFrom, row.activityId, event, onCompleteDependency)}
        >
          {canInteract && (
            <>
              <span
                className="absolute left-0 top-0 z-10 h-full w-2 cursor-ew-resize rounded-l-pill bg-black/10"
                onMouseDown={(event) => onStartDrag(row, 'resize-start', event)}
              />
              <span
                className="absolute right-0 top-0 z-10 h-full w-2 cursor-ew-resize rounded-r-pill bg-black/10"
                onMouseDown={(event) => onStartDrag(row, 'resize-end', event)}
              />
            </>
          )}
          {row.type === 'phase' && (
            <>
              <span className="absolute left-0 top-[-3px] h-[22px] w-1 rounded-l bg-ink-primary" />
              <span className="absolute right-0 top-[-3px] h-[22px] w-1 rounded-r bg-ink-primary" />
            </>
          )}
          {showProgress && row.type !== 'phase' && (
            <div
              className="h-full rounded-pill bg-black/20"
              style={{ width: `${Math.max(0, Math.min(100, row.percentComplete))}%` }}
            />
          )}
        </div>
      ) : null}
      {actual && canInteract && row.activityId && (
        <>
          <button
            className={cn('absolute top-[12px] z-10 size-3 rounded-full border border-primary-500 bg-surface-card shadow-sm', linkingFrom === row.activityId && 'bg-primary-500')}
            style={{ left: actual.left - 16 }}
            title="Start dependency"
            onMouseDown={(event) => onBeginDependency(row.activityId!, event)}
          />
          <button
            className={cn('absolute top-[12px] z-10 size-3 rounded-full border border-primary-500 bg-surface-card shadow-sm', linkingFrom && linkingFrom !== row.activityId && 'ring-2 ring-primary-500/30')}
            style={{ left: actual.left + actual.width + 4 }}
            title={linkingFrom ? 'Finish dependency' : 'Start dependency'}
            onMouseDown={(event) => linkingFrom ? onCompleteDependency(row.activityId!, event) : onBeginDependency(row.activityId!, event)}
          />
        </>
      )}
      {actual && (
        <div className="absolute top-[8px] truncate pl-2 text-[11px] text-ink-secondary" style={{ left: actual.left + actual.width, maxWidth: 220 }}>
          {row.title}
        </div>
      )}
      {actual && row.status === 'APPROVAL_REQUESTED' && row.waitingSince && (
        <span
          className="absolute top-[5px] inline-flex items-center gap-1 rounded-pill bg-warning-50 px-1.5 py-0.5 text-[10px] font-medium text-warning-700 shadow-sm"
          style={{ left: actual.left + Math.max(8, actual.width - 6) }}
          title="Business days waiting for client approval"
        >
          <Clock className="size-3" /> {businessDaysBetween(row.waitingSince, new Date())}d
        </span>
      )}
      {actual && showComments && row.commentsCount > 0 && (
        <span
          className="absolute top-[21px] inline-flex items-center gap-1 rounded-pill bg-surface-card px-1.5 py-0.5 text-[10px] font-medium text-ink-secondary shadow-sm ring-1 ring-black/[0.08]"
          style={{ left: actual.left + Math.max(8, actual.width - 8) }}
          title={`${row.commentsCount} comments`}
        >
          <MessageSquare className="size-3" /> {row.commentsCount}
        </span>
      )}
      {todayX != null && <div className="pointer-events-none absolute top-0 h-full border-l border-danger-500/80" style={{ left: todayX }} />}
    </div>
  )
}

function GanttDependencyLayer({
  dependencies,
  rows,
  units,
  height,
  onDelete,
}: {
  dependencies: ActivityDependencyNode[]
  rows: GanttRow[]
  units: TimelineUnit[]
  height: number
  onDelete: (dependency: ActivityDependencyNode) => void
}) {
  const byActivity = new Map(rows.map((row, index) => [row.activityId, { row, index }]).filter(([id]) => !!id) as [string, { row: GanttRow; index: number }][])
  const width = units.reduce((sum, unit) => sum + unit.width, 0)

  return (
    <svg className="pointer-events-none absolute left-0 top-0 z-10" width={width} height={height}>
      <defs>
        <marker id="gantt-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L6,3 z" className="fill-ink-tertiary" />
        </marker>
      </defs>
      {dependencies.map((dependency) => {
        const pred = byActivity.get(dependency.predecessorId)
        const succ = byActivity.get(dependency.successorId)
        if (!pred || !succ) return null
        const predRect = spanToRect(pred.row.start, pred.row.end, units)
        const succRect = spanToRect(succ.row.start, succ.row.end, units)
        if (!predRect || !succRect) return null
        const points = dependencyPoints(dependency.type, predRect, succRect, pred.index, succ.index)
        const midX = (points.startX + points.endX) / 2
        const path = `M ${points.startX} ${points.startY} C ${midX} ${points.startY}, ${midX} ${points.endY}, ${points.endX} ${points.endY}`
        return (
          <g key={dependency.id} className="pointer-events-auto cursor-pointer" onClick={() => onDelete(dependency)}>
            <path d={path} fill="none" stroke="transparent" strokeWidth="10" />
            <path d={path} fill="none" className="stroke-ink-tertiary" strokeWidth="1.5" markerEnd="url(#gantt-arrow)" />
          </g>
        )
      })}
    </svg>
  )
}

function GanttMinimap({
  start,
  end,
  visibleStartRatio,
  visibleWidthRatio,
}: {
  start: Date
  end: Date
  visibleStartRatio: number
  visibleWidthRatio: number
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-tertiary">Minimap</div>
      <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-surface-muted">
        <div
          className="absolute top-0 h-full rounded-md bg-primary-500/30 ring-1 ring-primary-500/40"
          style={{ left: `${visibleStartRatio * 100}%`, width: `${Math.max(8, visibleWidthRatio * 100)}%` }}
        />
      </div>
      <div className="w-44 text-right text-[11px] text-ink-tertiary">{fmtDate(start)} - {fmtDate(end)}</div>
    </div>
  )
}

function ToolbarCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded px-2 py-1 text-body-sm text-ink-secondary hover:bg-surface-hover">
      <span className="truncate">{label}</span>
      <input type="checkbox" checked={checked} onChange={onChange} />
    </label>
  )
}

function buildRows(project: ProjectDetail, sort: GanttSort, segment: GanttSegment): GanttRow[] {
  const rows: GanttRow[] = []
  const phases = [...project.phases].sort(comparePhase(sort))
  for (const phase of phases) {
    const phaseId = `phase:${phase.id}`
    const phaseActivities = phase.milestones.flatMap((m) => m.activities)
    const phaseCurrent = activitySpan(phaseActivities, 'current') ?? { start: parseDate(phase.currentStart), end: parseDate(phase.currentEnd) }
    const phaseBaseline = activitySpan(phaseActivities, 'baseline') ?? { start: parseDate(phase.baselineStart), end: parseDate(phase.baselineEnd) }
    rows.push({
      id: phaseId,
      activityId: null,
      milestoneId: null,
      parentActivityId: null,
      parentId: null,
      type: 'phase',
      depth: 0,
      title: phase.name,
      position: phase.position,
      status: phase.status,
      assigneeId: null,
      percentComplete: phase.percentComplete,
      estimatedHours: null,
      slipDays: 0,
      commentsCount: 0,
      start: phaseCurrent.start,
      end: phaseCurrent.end,
      baselineStart: phaseBaseline.start,
      baselineEnd: phaseBaseline.end,
      isMilestone: false,
      waitingSince: null,
      hasChildren: phase.milestones.length > 0,
    })

    const milestones = [...phase.milestones].sort(compareMilestone(sort))
    for (const milestone of milestones) {
      const milestoneId = `milestone:${milestone.id}`
      const topActivities = milestone.activities.filter((a) => !a.parentActivityId)
      const milestoneCurrent = activitySpan(milestone.activities, 'current') ?? { start: parseDate(milestone.currentDate), end: parseDate(milestone.currentDate) }
      const milestoneBaseline = activitySpan(milestone.activities, 'baseline') ?? { start: parseDate(milestone.baselineDate), end: parseDate(milestone.baselineDate) }
      rows.push({
        id: milestoneId,
        activityId: null,
        milestoneId: milestone.id,
        parentActivityId: null,
        parentId: phaseId,
        type: 'milestone',
        depth: 1,
        title: milestone.name,
        position: milestone.position,
        status: milestone.status,
        assigneeId: null,
        percentComplete: milestone.percentComplete,
        estimatedHours: null,
        slipDays: 0,
        commentsCount: 0,
        start: milestoneCurrent.start,
        end: milestoneCurrent.end,
        baselineStart: milestoneBaseline.start,
        baselineEnd: milestoneBaseline.end,
        isMilestone: true,
        waitingSince: null,
        hasChildren: topActivities.length > 0,
      })

      for (const activity of topActivities.sort(compareActivity(sort, segment))) {
        pushActivityRows(rows, activity, milestone.activities, milestoneId, 2, sort, segment)
      }
    }
  }
  return rows
}

function pushActivityRows(rows: GanttRow[], activity: ActivityNode, all: ActivityNode[], parentId: string, depth: number, sort: GanttSort, segment: GanttSegment) {
  const children = all.filter((a) => a.parentActivityId === activity.id).sort(compareActivity(sort, segment))
  const activityId = `activity:${activity.id}`
  rows.push({
    id: activityId,
    activityId: activity.id,
    milestoneId: activity.milestoneId,
    parentActivityId: activity.parentActivityId,
    parentId,
    type: depth > 2 ? 'subactivity' : 'activity',
    depth,
    title: activity.title,
    position: activity.position,
    status: activity.status,
    assigneeId: activity.assigneeId,
    ownerParty: activity.ownerParty,
    percentComplete: activity.percentComplete,
    priority: activity.priority,
    risk: activity.risk,
    estimatedHours: activity.estimatedHours,
    slipDays: activity.slipDays,
    commentsCount: activity._count.comments,
    start: parseDate(activity.currentStart),
    end: parseDate(activity.currentEnd),
    baselineStart: parseDate(activity.baselineStart),
    baselineEnd: parseDate(activity.baselineEnd),
    isMilestone: activity.isMilestone,
    waitingSince: parseDate(activity.waitingSince),
    hasChildren: children.length > 0,
  })
  for (const child of children) pushActivityRows(rows, child, all, activityId, depth + 1, sort, segment)
}

function filterVisibleRows(rows: GanttRow[], collapsed: Set<string>, query: string): GanttRow[] {
  const q = query.trim().toLowerCase()
  const byId = new Map(rows.map((r) => [r.id, r]))
  const matches = new Set<string>()
  if (q) {
    for (const row of rows) {
      if (row.title.toLowerCase().includes(q) || row.status.toLowerCase().includes(q)) {
        let current: GanttRow | undefined = row
        while (current) {
          matches.add(current.id)
          current = current.parentId ? byId.get(current.parentId) : undefined
        }
      }
    }
  }

  const visible: GanttRow[] = []
  const hiddenParents = new Set<string>()
  for (const row of rows) {
    if (row.parentId && hiddenParents.has(row.parentId)) {
      hiddenParents.add(row.id)
      continue
    }
    if (q && !matches.has(row.id)) {
      hiddenParents.add(row.id)
      continue
    }
    visible.push(row)
    if (collapsed.has(row.id)) hiddenParents.add(row.id)
  }
  return visible
}

function computeDateRange(project: ProjectDetail, rows: GanttRow[]): { start: Date; end: Date } {
  const dates = rows.flatMap((r) => [r.start, r.end]).filter((d): d is Date => !!d)
  dates.push(new Date(project.plannedStart), new Date(project.plannedEnd), new Date())
  const min = new Date(Math.min(...dates.map((d) => d.getTime())))
  const max = new Date(Math.max(...dates.map((d) => d.getTime())))
  const start = startOfDay(addDays(min, -7))
  const end = startOfDay(addDays(max, 21))
  return { start, end }
}

function buildTimelineUnits(start: Date, end: Date, scale: GanttScale, zoom: number): TimelineUnit[] {
  const units: TimelineUnit[] = []
  const width = BASE_UNIT_WIDTH[scale] * zoom
  let cursor = alignDate(start, scale)
  while (cursor <= end && units.length < 600) {
    const next = addScaleUnit(cursor, scale, 1)
    units.push({
      key: `${scale}:${cursor.toISOString()}`,
      start: cursor,
      end: next,
      label: unitLabel(cursor, scale),
      group: groupLabel(cursor, scale),
      width,
    })
    cursor = next
  }
  return units
}

function isWeekendUnit(unit: TimelineUnit): boolean {
  const cursor = startOfDay(unit.start)
  while (cursor < unit.end) {
    const day = cursor.getDay()
    if (day === 0 || day === 6) return true
    cursor.setDate(cursor.getDate() + 1)
  }
  return false
}

function groupTimelineUnits(units: TimelineUnit[]) {
  const groups: { key: string; label: string; width: number }[] = []
  for (const unit of units) {
    const last = groups[groups.length - 1]
    if (last && last.label === unit.group) last.width += unit.width
    else groups.push({ key: `${unit.group}:${unit.key}`, label: unit.group, width: unit.width })
  }
  return groups
}

function dateToX(date: Date, units: TimelineUnit[]): number | null {
  let x = 0
  for (const unit of units) {
    if (date >= unit.start && date < unit.end) {
      const span = unit.end.getTime() - unit.start.getTime()
      return x + ((date.getTime() - unit.start.getTime()) / span) * unit.width
    }
    x += unit.width
  }
  return null
}

function spanToRect(start: Date | null, end: Date | null, units: TimelineUnit[]): { left: number; width: number } | null {
  if (!start && !end) return null
  const s = start ?? end
  const e = end ?? start
  if (!s || !e) return null
  const left = dateToX(s, units)
  if (left == null) return null
  const inclusiveEnd = addDays(e, 1)
  const right = dateToX(inclusiveEnd, units) ?? dateToX(e, units) ?? left + 16
  return { left, width: Math.max(16, right - left) }
}

function statusClass(row: GanttRow): string {
  const status = row.status as ActivityStatus
  const token = ACTIVITY_STATUS_TOKEN[status] ?? ACTIVITY_STATUS_TOKEN.NOT_STARTED
  return `bg-${token}`
}

function activitySpan(activities: ActivityNode[], kind: 'current' | 'baseline'): { start: Date | null; end: Date | null } | null {
  const starts: Date[] = []
  const ends: Date[] = []
  for (const activity of activities) {
    const start = parseDate(kind === 'current' ? activity.currentStart : activity.baselineStart)
    const end = parseDate(kind === 'current' ? activity.currentEnd : activity.baselineEnd)
    if (start) starts.push(start)
    if (end) ends.push(end)
  }
  if (!starts.length && !ends.length) return null
  const allStarts = starts.length ? starts : ends
  const allEnds = ends.length ? ends : starts
  return {
    start: new Date(Math.min(...allStarts.map((d) => d.getTime()))),
    end: new Date(Math.max(...allEnds.map((d) => d.getTime()))),
  }
}

function pixelsToDays(px: number, units: TimelineUnit[]): number {
  const timelineWidth = units.reduce((sum, unit) => sum + unit.width, 0)
  const timelineDays = units.reduce((sum, unit) => sum + Math.max(1, Math.round((unit.end.getTime() - unit.start.getTime()) / 86400000)), 0)
  if (!timelineWidth || !timelineDays) return 0
  return Math.round((px / timelineWidth) * timelineDays)
}

function isoDateOnly(date: Date | null): string | null {
  if (!date) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function completeIfLinking(
  linkingFrom: string | null,
  activityId: string,
  event: React.MouseEvent,
  onCompleteDependency: (activityId: string, event: React.MouseEvent) => void
) {
  if (linkingFrom && linkingFrom !== activityId) onCompleteDependency(activityId, event)
}

function dependencyPoints(
  type: DependencyType,
  pred: { left: number; width: number },
  succ: { left: number; width: number },
  predIndex: number,
  succIndex: number
): { startX: number; startY: number; endX: number; endY: number } {
  const predStart = pred.left
  const predEnd = pred.left + pred.width
  const succStart = succ.left
  const succEnd = succ.left + succ.width
  const startX = type === 'SS' || type === 'SF' ? predStart : predEnd
  const endX = type === 'FF' || type === 'SF' ? succEnd : succStart
  return {
    startX,
    startY: predIndex * ROW_HEIGHT + ROW_HEIGHT / 2,
    endX,
    endY: succIndex * ROW_HEIGHT + ROW_HEIGHT / 2,
  }
}

function buildColumnTemplate(columns: OptionalColumn[]): string {
  const widths: Record<OptionalColumn, string> = {
    assignee: '92px',
    estimatedHours: '56px',
    start: '76px',
    due: '76px',
    status: '112px',
    priority: '78px',
    risk: '64px',
    percent: '56px',
    owner: '104px',
    slipDays: '72px',
  }
  return `minmax(170px, 1fr) ${columns.map((c) => widths[c]).join(' ')}`
}

function renderColumn(row: GanttRow, col: OptionalColumn): string {
  if (col === 'assignee') return row.assigneeId ? shortId(row.assigneeId) : '-'
  if (col === 'estimatedHours') return row.estimatedHours == null ? '-' : String(row.estimatedHours)
  if (col === 'start') return fmtDate(row.start)
  if (col === 'due') return fmtDate(row.end)
  if (col === 'status') return ACTIVITY_STATUS_LABEL[row.status as ActivityStatus] ?? labelize(row.status)
  if (col === 'priority') return row.priority ? labelize(row.priority) : '-'
  if (col === 'risk') return row.risk ? labelize(row.risk) : '-'
  if (col === 'percent') return `${Math.round(row.percentComplete)}%`
  if (col === 'owner') return row.ownerParty ? (row.ownerParty === '360GROUND' ? '360Ground' : labelize(row.ownerParty)) : '-'
  if (col === 'slipDays') return row.activityId ? String(row.slipDays) : '-'
  return ''
}

function comparePhase(sort: GanttSort) {
  return (a: PhaseNode, b: PhaseNode) => compareValues(sort, a, b, a.name, b.name, a.currentStart ?? null, b.currentStart ?? null, a.status, b.status)
}

function compareMilestone(sort: GanttSort) {
  return (a: MilestoneNode, b: MilestoneNode) => compareValues(sort, a, b, a.name, b.name, a.currentDate ?? null, b.currentDate ?? null, a.status, b.status)
}

function compareActivity(sort: GanttSort, segment: GanttSegment) {
  return (a: ActivityNode, b: ActivityNode) => {
    const segmentCompare = segmentValue(a, segment).localeCompare(segmentValue(b, segment))
    return segmentCompare || compareValues(sort, a, b, a.title, b.title, a.currentStart, b.currentStart, a.status, b.status, a.priority, b.priority)
  }
}

function segmentValue(activity: ActivityNode, segment: GanttSegment): string {
  if (segment === 'assignee') return activity.assigneeId ?? ''
  if (segment === 'status') return activity.status
  if (segment === 'owner') return activity.ownerParty
  return ''
}

function compareValues(
  sort: GanttSort,
  a: { position: number },
  b: { position: number },
  nameA: string,
  nameB: string,
  dateA: string | null,
  dateB: string | null,
  statusA: string,
  statusB: string,
  priorityA?: string | null,
  priorityB?: string | null
) {
  if (sort === 'name') return nameA.localeCompare(nameB) || a.position - b.position
  if (sort === 'date') return +(parseDate(dateA) ?? new Date(8640000000000000)) - +(parseDate(dateB) ?? new Date(8640000000000000)) || a.position - b.position
  if (sort === 'status') return statusA.localeCompare(statusB) || a.position - b.position
  if (sort === 'priority') return (priorityA ?? '').localeCompare(priorityB ?? '') || a.position - b.position
  return a.position - b.position
}

function toggleSetValue(current: Set<string>, value: string): Set<string> {
  const next = new Set(current)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

function parseDate(value: string | Date | null): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function fmtDate(value: Date | string | null): string {
  const d = parseDate(value)
  if (!d) return '-'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function labelize(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

function shortId(value: string): string {
  return value.length > 8 ? value.slice(0, 8) : value
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function alignDate(date: Date, scale: GanttScale): Date {
  const d = startOfDay(date)
  if (scale === 'weeks') {
    const day = d.getDay()
    return addDays(d, -(day === 0 ? 6 : day - 1))
  }
  if (scale === 'months') return new Date(d.getFullYear(), d.getMonth(), 1)
  if (scale === 'quarters') return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)
  if (scale === 'years') return new Date(d.getFullYear(), 0, 1)
  return d
}

function addScaleUnit(date: Date, scale: GanttScale, amount: number): Date {
  const next = new Date(date)
  if (scale === 'days') next.setDate(next.getDate() + amount)
  if (scale === 'weeks') next.setDate(next.getDate() + amount * 7)
  if (scale === 'months') next.setMonth(next.getMonth() + amount)
  if (scale === 'quarters') next.setMonth(next.getMonth() + amount * 3)
  if (scale === 'years') next.setFullYear(next.getFullYear() + amount)
  return next
}

function unitLabel(date: Date, scale: GanttScale): string {
  if (scale === 'days') return String(date.getDate())
  if (scale === 'weeks') return `W${weekNumber(date)}`
  if (scale === 'months') return date.toLocaleDateString(undefined, { month: 'short' })
  if (scale === 'quarters') return `Q${Math.floor(date.getMonth() / 3) + 1}`
  return String(date.getFullYear())
}

function groupLabel(date: Date, scale: GanttScale): string {
  if (scale === 'days' || scale === 'weeks') return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  if (scale === 'months' || scale === 'quarters') return String(date.getFullYear())
  return 'Years'
}

function weekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((+d - +yearStart) / 86400000) + 1) / 7)
}
