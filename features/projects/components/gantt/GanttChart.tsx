'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import toast from 'react-hot-toast'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  CalendarDays,
  Clock,
  Columns,
  Copy,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FileText,
  GitBranch,
  Image as ImageIcon,
  List,
  ListTree,
  Maximize2,
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
import { Modal } from '@/components/ui/Modal'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { businessDaysBetween } from '@/lib/projects/business-days'
import { AUTO_SECTION_ID, defaultTaskPlacement, ensureTaskPlacement } from '@/lib/projects/schedule-creation'
import { criticalPath, shiftSuccessorsFromChange } from '@/lib/projects/scheduling'
import { useProjectViewStore } from '@/lib/stores/project-view-store'
import { cn } from '@/lib/utils'
import {
  DEPENDENCY_TYPES,
  SLIP_REASONS,
  SLIP_REASON_LABEL,
  SLIP_REASON_OWNER,
  type DependencyType,
  type OwnerParty,
  type SlipReason,
} from '../../types'
import {
  useAddActivity,
  useAddMilestone,
  useAddPhase,
  useCommitBaseline,
  useCreateActivityDependency,
  useDeleteActivityDependency,
  useRebaseline,
  useReorderSchedule,
  useShiftActivitySchedule,
  useUpdateActivity,
  type ActivityDependencyNode,
  type ProjectDetail,
} from '../../hooks/useProject'
import { AiAssistantPanel } from '../ai/AiAssistantPanel'
import { CommitBaselineDialog } from '../baseline/CommitBaselineDialog'
import { RebaselineDialog } from '../baseline/RebaselineDialog'
import { TextPromptDialog } from '../dialogs/TextPromptDialog'
import {
  COLUMN_LABEL,
  DEFAULT_TASK_COLUMN_WIDTH,
  MAX_TASK_COLUMN_WIDTH,
  MIN_TASK_COLUMN_WIDTH,
  TASK_COLUMN_WIDTH_KEY,
  ScheduleGridHeader,
  ScheduleGridRow,
  SCHEDULE_ROW_HEIGHT,
  buildColumnTemplate,
  buildRows,
  fmtDate,
  isOverdueRow,
  isoDateOnly,
  labelize,
  renderColumn,
  statusClass,
  type GanttRow,
  type GanttRowType,
  type GanttSegment,
  type GanttSort,
  type OptionalColumn,
} from './schedule-grid'

// Re-exported so existing imports of the grid pieces from this module keep working.
export {
  COLUMN_LABEL,
  DEFAULT_TASK_COLUMN_WIDTH,
  MAX_TASK_COLUMN_WIDTH,
  MIN_TASK_COLUMN_WIDTH,
  SCHEDULE_ROW_HEIGHT,
  ScheduleGridHeader,
  ScheduleGridRow,
  TASK_COLUMN_WIDTH_KEY,
  buildColumnTemplate,
  buildRows,
}
export type { GanttRow, GanttSegment, GanttSort, OptionalColumn } from './schedule-grid'

type GanttScale = 'days' | 'weeks' | 'months' | 'quarters' | 'years'
type ExportFormat = 'pdf' | 'png' | 'csv' | 'xml'

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
  showLegend: boolean
}

interface DragPreview {
  activityId: string
  currentStart: Date | null
  currentEnd: Date | null
  affected: Array<{ activityId: string; currentStart: Date | null; currentEnd: Date | null }>
  label: string
  x: number
  y: number
}

interface GanttFilters {
  query: string
  status: string
  assignee: string
  priority: string
  risk: string
}

interface TimelineUnit {
  key: string
  start: Date
  end: Date
  label: string
  group: string
  width: number
}

const ROW_HEIGHT = SCHEDULE_ROW_HEIGHT
const HEADER_HEIGHT = 48
const MIN_LEFT_WIDTH = 520
const DEFAULT_LEFT_WIDTH = 680
const MAX_LEFT_WIDTH = 900
const MIN_ZOOM = 0.45
const MAX_ZOOM = 1.8
const LEFT_WIDTH_KEY = 'projects.gantt.leftWidth.v4'
const COLLAPSE_KEY = 'projects.gantt.collapsed'
const PREFS_KEY = 'projects.gantt.toolbarPrefs.v2'
const SEGMENT_KEY = 'projects.gantt.segment'
const SORT_KEY_PREFIX = 'projects.gantt.sortMode'
const GANTT_COLUMNS: OptionalColumn[] = ['assignee', 'start', 'due', 'status', 'percent']
const DEFAULT_PREFS: GanttToolbarPrefs = {
  showBaselines: true,
  showDependencies: true,
  showProgress: true,
  showCriticalPath: false,
  showWeekends: true,
  showToday: true,
  showMinimap: false,
  showComments: false,
  showLegend: false,
}
const BASE_UNIT_WIDTH: Record<GanttScale, number> = { days: 34, weeks: 58, months: 78, quarters: 110, years: 148 }
export function GanttChart({ project, canEdit, onActivityOpen }: { project: ProjectDetail; canEdit: boolean; onActivityOpen?: (activityId: string) => void }) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const addActivity = useAddActivity(project.id)
  const addPhase = useAddPhase(project.id)
  const addMilestone = useAddMilestone(project.id)
  const reorderSchedule = useReorderSchedule(project.id)
  const commitBaseline = useCommitBaseline(project.id)
  const rebaseline = useRebaseline(project.id)
  const shiftSchedule = useShiftActivitySchedule(project.id)
  const updateActivity = useUpdateActivity(project.id)
  const createDependency = useCreateActivityDependency(project.id)
  const deleteDependency = useDeleteActivityDependency(project.id)
  const { users } = useUsersForSelection()
  const userNames = useMemo(() => new Map(users.map((user) => [user.id, user.name ?? user.email])), [users])
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH)
  const [taskColumnWidth, setTaskColumnWidth] = useState(DEFAULT_TASK_COLUMN_WIDTH)
  const [widthPrefsHydrated, setWidthPrefsHydrated] = useState(false)
  const [scale, setScale] = useState<GanttScale>('weeks')
  const [zoom, setZoom] = useState(1)
  const [sort, setSort] = useState<GanttSort>('manual')
  const [segment, setSegment] = useState<GanttSegment>('phase')
  const query = useProjectViewStore((state) => state.search)
  const setQuery = useProjectViewStore((state) => state.setSearch)
  const filterStatus = useProjectViewStore((state) => state.status)
  const filterAssignee = useProjectViewStore((state) => state.assignee)
  const filterPriority = useProjectViewStore((state) => state.priority)
  const filterRisk = useProjectViewStore((state) => state.risk)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const visibleColumns = GANTT_COLUMNS
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
  const [createKind, setCreateKind] = useState<'task' | 'section' | null>(null)
  const [newItemName, setNewItemName] = useState('')
  const initialTaskPlacement = defaultTaskPlacement(project.phases)
  const [newTaskPhaseId, setNewTaskPhaseId] = useState(initialTaskPlacement.sectionId)
  const [newTaskMilestoneId, setNewTaskMilestoneId] = useState(initialTaskPlacement.subsectionId)
  const [commitBaselineOpen, setCommitBaselineOpen] = useState(false)
  const [rebaselineOpen, setRebaselineOpen] = useState(false)
  const [gateOverride, setGateOverride] = useState<{ message: string; apply: (reason: string) => Promise<void> } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    const savedWidthValue = localStorage.getItem(LEFT_WIDTH_KEY)
    const savedWidth = savedWidthValue === null ? null : Number(savedWidthValue)
    if (savedWidth !== null && Number.isFinite(savedWidth) && savedWidth <= MAX_LEFT_WIDTH) setLeftWidth(Math.max(MIN_LEFT_WIDTH, savedWidth))
    const savedTaskColumnWidthValue = localStorage.getItem(TASK_COLUMN_WIDTH_KEY)
    const savedTaskColumnWidth = savedTaskColumnWidthValue === null ? null : Number(savedTaskColumnWidthValue)
    if (savedTaskColumnWidth !== null && Number.isFinite(savedTaskColumnWidth)) {
      setTaskColumnWidth(Math.min(MAX_TASK_COLUMN_WIDTH, Math.max(MIN_TASK_COLUMN_WIDTH, savedTaskColumnWidth)))
    }
    const savedCollapsed = localStorage.getItem(COLLAPSE_KEY)
    if (savedCollapsed) setCollapsed(new Set(savedCollapsed.split(',').filter(Boolean)))
    const savedPrefs = localStorage.getItem(PREFS_KEY)
    if (savedPrefs) setToolbarPrefs({ ...DEFAULT_PREFS, ...JSON.parse(savedPrefs) })
    const savedSegment = localStorage.getItem(SEGMENT_KEY) as GanttSegment | null
    if (savedSegment && ['phase', 'assignee', 'status', 'owner'].includes(savedSegment)) setSegment(savedSegment)
    const savedSort = localStorage.getItem(`${SORT_KEY_PREFIX}.${project.id}`) as GanttSort | null
    if (savedSort === 'manual' || savedSort === 'automatic') setSort(savedSort)
    setWidthPrefsHydrated(true)
  }, [project.id])

  useEffect(() => {
    setBaselineVersion(project.baselineVersion || 1)
  }, [project.baselineVersion])

  useEffect(() => {
    if (!widthPrefsHydrated) return
    localStorage.setItem(LEFT_WIDTH_KEY, String(leftWidth))
  }, [leftWidth, widthPrefsHydrated])

  useEffect(() => {
    if (!widthPrefsHydrated) return
    localStorage.setItem(TASK_COLUMN_WIDTH_KEY, String(taskColumnWidth))
  }, [taskColumnWidth, widthPrefsHydrated])

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, [...collapsed].join(','))
  }, [collapsed])

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(toolbarPrefs))
  }, [toolbarPrefs])

  useEffect(() => {
    localStorage.setItem(SEGMENT_KEY, segment)
  }, [segment])

  useEffect(() => {
    localStorage.setItem(`${SORT_KEY_PREFIX}.${project.id}`, sort)
  }, [project.id, sort])

  const allRows = useMemo(() => buildRows(project, sort, segment), [project, sort, segment])
  const filters = useMemo<GanttFilters>(() => ({
    query,
    status: filterStatus,
    assignee: filterAssignee,
    priority: filterPriority,
    risk: filterRisk,
  }), [filterAssignee, filterPriority, filterRisk, filterStatus, query])
  const visibleRows = useMemo(
    () => filterVisibleRows(allRows, collapsed, filters),
    [allRows, collapsed, filters]
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
  const columnTemplate = buildColumnTemplate(visibleColumns, taskColumnWidth)
  const previewByActivity = dragPreview
    ? new Map([
        [dragPreview.activityId, { start: dragPreview.currentStart, end: dragPreview.currentEnd }],
        ...dragPreview.affected.map((item) => [item.activityId, { start: item.currentStart, end: item.currentEnd }] as const),
      ])
    : new Map()
  const baselineVersions = Array.from({ length: Math.max(1, project.baselineVersion || 1) }, (_, i) => i + 1)
  const reorderEnabled = canEdit && segment === 'phase' && query.trim() === ''

  const resizeStart = (clientX: number) => {
    const startX = clientX
    const startWidth = leftWidth
    const onMove = (event: PointerEvent) => {
      setLeftWidth(Math.min(MAX_LEFT_WIDTH, Math.max(MIN_LEFT_WIDTH, startWidth + event.clientX - startX)))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const resizeTaskColumnStart = (clientX: number) => {
    const startX = clientX
    const startTaskWidth = taskColumnWidth
    const startLeftWidth = leftWidth
    const onMove = (event: PointerEvent) => {
      const requestedDelta = event.clientX - startX
      const minDelta = Math.max(MIN_TASK_COLUMN_WIDTH - startTaskWidth, MIN_LEFT_WIDTH - startLeftWidth)
      const maxDelta = Math.min(MAX_TASK_COLUMN_WIDTH - startTaskWidth, MAX_LEFT_WIDTH - startLeftWidth)
      const delta = Math.min(maxDelta, Math.max(minDelta, requestedDelta))
      setTaskColumnWidth(startTaskWidth + delta)
      setLeftWidth(startLeftWidth + delta)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const setAllCollapsed = (nextCollapsed: boolean) => {
    setCollapsed(nextCollapsed ? new Set(allRows.filter((r) => r.hasChildren).map((r) => r.id)) : new Set())
  }

  const togglePreference = (key: keyof GanttToolbarPrefs) => {
    setToolbarPrefs((current) => ({ ...current, [key]: !current[key] }))
  }

  const scrollToToday = () => {
    const container = parentRef.current
    if (!container || todayX == null) return
    const timelineViewport = Math.max(1, container.clientWidth - leftWidth)
    container.scrollTo({
      left: Math.max(0, todayX - timelineViewport / 2),
      behavior: 'smooth',
    })
  }

  const fitTimeline = () => {
    const container = parentRef.current
    if (!container || !timelineWidth) return
    const timelineViewport = Math.max(1, container.clientWidth - leftWidth)
    const baseTimelineWidth = timelineWidth / zoom
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, timelineViewport / baseTimelineWidth))
    setZoom(+nextZoom.toFixed(2))
    window.requestAnimationFrame(() => container.scrollTo({ left: 0, behavior: 'smooth' }))
  }

  const renameActivity = async (activityId: string, title: string) => {
    await updateActivity.mutateAsync({ activityId, title })
  }

  const updateGridActivity = async (row: GanttRow, patch: Record<string, unknown>) => {
    if (!row.activityId) return
    try {
      await updateActivity.mutateAsync({ activityId: row.activityId, ...patch })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update task'
      if (patch.status === 'STARTED' && /has not passed/i.test(message)) {
        const activityId = row.activityId
        setGateOverride({
          message,
          apply: async (reason) => { await updateActivity.mutateAsync({ activityId, ...patch, gateOverrideReason: reason }) },
        })
      }
    }
  }

  const updateGridDate = (row: GanttRow, field: 'start' | 'due', value: string) => {
    if (!row.activityId || !value) return
    const date = new Date(`${value}T00:00:00`)
    const currentStart = field === 'start' ? date : (row.start ?? date)
    const currentEnd = field === 'due' ? date : (row.end ?? date)
    if (currentEnd < currentStart) {
      toast.error('Due date must be on or after the start date')
      return
    }
    requestScheduleChange({
      row,
      mode: field === 'start' ? 'resize-start' : 'resize-end',
      currentStart,
      currentEnd,
    })
  }

  /**
   * The single entry point for every schedule date change (grid date cells, bar
   * drag/resize, keyboard nudges). Invariant #2: on a baselined project the write
   * is held in `pendingChange` until a slip reason + owner are supplied in the
   * dialog below; cancelling discards it and the bar reverts.
   */
  const requestScheduleChange = (change: PendingScheduleChange) => {
    if (project.baselineCommittedAt) {
      setPendingChange(change)
      setSlipReason('')
      setSlipOwner('CLIENT')
      setSlipDetail('')
    } else {
      void persistScheduleChange(change)
    }
  }

  /** Keyboard alternative to dragging a bar: move / resize by whole days. */
  const nudgeBar = (row: GanttRow, mode: PendingScheduleChange['mode'], deltaDays: number) => {
    if (linkingFrom || pendingChange || shiftSchedule.isPending) return
    if (!row.activityId || row.type === 'phase' || !row.start || !row.end || deltaDays === 0) return
    const currentStart = mode === 'resize-end' ? row.start : addDays(row.start, deltaDays)
    const currentEnd = mode === 'resize-start' ? row.end : addDays(row.end, deltaDays)
    if (currentEnd < currentStart) return
    requestScheduleChange({ row, mode, currentStart, currentEnd })
  }

  const downloadExport = async (format: ExportFormat) => {
    try {
      const params = new URLSearchParams({ format, baselineVersion: String(baselineVersion) })
      const res = await fetch(`/api/projects/${project.id}/gantt/export?${params}`)
      if (!res.ok) {
        const result = await res.json().catch(() => ({}))
        throw new Error(result.error || `Export failed: ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${project.code || project.id}-gantt.${format === 'xml' ? 'xml' : format}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to export Gantt')
    }
  }

  const copyShareLink = async () => {
    const url = `${window.location.origin}/portal/projects/${project.id}`
    await navigator.clipboard?.writeText(url)
    toast.success('Client portal link copied')
  }

  const publishSnapshot = async () => {
    const response = await fetch(`/api/projects/${project.id}/snapshots`, { method: 'POST' })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || result.success === false) {
      toast.error(result.error || 'Unable to publish snapshot')
      return
    }
    const url = `${window.location.origin}/projects/snapshots/${result.data.id}`
    await navigator.clipboard?.writeText(url)
    toast.success('Read-only snapshot published and link copied')
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

  const openTaskCreator = (row?: GanttRow) => {
    const defaultPlacement = defaultTaskPlacement(project.phases)
    let phaseId = defaultPlacement.sectionId
    let milestoneId = defaultPlacement.subsectionId
    if (row?.type === 'phase') {
      phaseId = entityId(row)
      milestoneId = project.phases.find((phase) => phase.id === phaseId)?.milestones[0]?.id ?? ''
    } else if (row?.milestoneId) {
      milestoneId = row.milestoneId
      phaseId = project.phases.find((phase) => phase.milestones.some((milestone) => milestone.id === milestoneId))?.id ?? phaseId
    }
    setNewTaskPhaseId(phaseId)
    setNewTaskMilestoneId(milestoneId)
    setNewItemName('')
    setCreateKind('task')
  }

  const closeCreator = () => {
    setCreateKind(null)
    setNewItemName('')
  }

  const createScheduleItem = async () => {
    const name = newItemName.trim()
    if (!name) return
    if (createKind === 'section') {
      await addPhase.mutateAsync({ name })
      closeCreator()
      return
    }
    if (createKind === 'task' && newTaskPhaseId) {
      const placement = await ensureTaskPlacement({
        sectionId: newTaskPhaseId,
        subsectionId: newTaskMilestoneId,
        createSection: async (sectionName) => addPhase.mutateAsync({ name: sectionName }) as Promise<{ id: string }>,
        createSubsection: async (phaseId, subsectionName) => addMilestone.mutateAsync({ phaseId, name: subsectionName }) as Promise<{ id: string }>,
      })
      await addActivity.mutateAsync({ milestoneId: placement.subsectionId, title: name })
      closeCreator()
    }
  }

  const createInlineTask = async (row: GanttRow, title: string) => {
    if (!row.milestoneId) throw new Error('This section needs a subsection before tasks can be added.')
    await addActivity.mutateAsync({ milestoneId: row.milestoneId, title, ownerParty: '360GROUND', weight: 1 })
  }

  const createInlineSection = async (name: string) => {
    const phase = await addPhase.mutateAsync({ name, weight: 1 }) as { id: string }
    await addMilestone.mutateAsync({ phaseId: phase.id, name: 'General', weight: 1 })
  }

  const handleReorder = async (event: DragEndEvent) => {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    if (!reorderEnabled || !overId || activeId === overId) return
    const activeRow = allRows.find((row) => row.id === activeId)
    let overRow = allRows.find((row) => row.id === overId)
    if (!activeRow || !overRow || activeRow.type === 'actions') return

    const byId = new Map(allRows.map((row) => [row.id, row]))
    const ancestorOfType = (row: GanttRow, type: GanttRowType): GanttRow | undefined => {
      let current: GanttRow | undefined = row
      while (current && current.type !== type) current = current.parentId ? byId.get(current.parentId) : undefined
      return current
    }

    if (activeRow.type === 'phase') {
      const target = ancestorOfType(overRow, 'phase')
      if (!target) return
      overRow = target
    }
    if (activeRow.type === 'milestone') {
      const target = ancestorOfType(overRow, 'milestone')
      if (!target) return
      overRow = target
    }

    if ((activeRow.type === 'activity' || activeRow.type === 'subactivity') && activeRow.activityId) {
      const targetPhase = ancestorOfType(overRow, 'phase')
      const targetMilestoneId = overRow.milestoneId
        ?? (targetPhase ? project.phases.find((phase) => `phase:${phase.id}` === targetPhase.id)?.milestones[0]?.id : undefined)
      if (targetMilestoneId && targetMilestoneId !== activeRow.milestoneId) {
        if (sort === 'automatic') toast.success('Switched to manual order')
        setSort('manual')
        await updateActivity.mutateAsync({ activityId: activeRow.activityId, milestoneId: targetMilestoneId })
        return
      }
      if (overRow.type === 'subactivity' && overRow.parentId) overRow = byId.get(overRow.parentId) ?? overRow
    }

    if (!overRow || activeRow.type !== overRow.type || activeRow.parentId !== overRow.parentId) return
    const siblings = allRows.filter((row) => row.type === activeRow.type && row.parentId === activeRow.parentId)
    const from = siblings.findIndex((row) => row.id === activeId)
    const to = siblings.findIndex((row) => row.id === overRow.id)
    if (from < 0 || to < 0) return
    const orderedRows = arrayMove(siblings, from, to)
    const kind = activeRow.type === 'phase' ? 'phase' : activeRow.type === 'milestone' ? 'milestone' : 'activity'
    if (sort === 'automatic') toast.success('Switched to manual order')
    setSort('manual')
    await reorderSchedule.mutateAsync({
      kind,
      parentId: kind === 'phase' ? project.id : kind === 'milestone' ? stripRowPrefix(activeRow.parentId!) : activeRow.milestoneId!,
      parentActivityId: kind === 'activity' ? activeRow.parentActivityId : undefined,
      orderedIds: orderedRows.map(entityId),
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

  // Both open confirmation dialogs: committing freezes the baseline for good
  // (invariant #1), and a re-baseline needs a diff preview + ≥20-char reason.
  const commitBaselineFromToolbar = () => {
    if (project.baselineCommittedAt || commitBaseline.isPending) return
    setCommitBaselineOpen(true)
  }

  const rebaselineFromToolbar = () => {
    if (!project.baselineCommittedAt || rebaseline.isPending) return
    setRebaselineOpen(true)
  }

  const startBarDrag = (row: GanttRow, mode: PendingScheduleChange['mode'], event: React.PointerEvent) => {
    if (linkingFrom) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (!row.activityId || row.type === 'phase' || !row.start || !row.end) return
    event.preventDefault()
    event.stopPropagation()
    const startClientX = event.clientX
    const originStart = row.start
    const originEnd = row.end
    const buildPreview = (clientX: number, clientY: number): DragPreview | null => {
      const deltaDays = pixelsToDays(clientX - startClientX, units)
      const currentStart = mode === 'resize-end' ? originStart : addDays(originStart, deltaDays)
      const currentEnd = mode === 'resize-start' ? originEnd : addDays(originEnd, deltaDays)
      if (currentStart && currentEnd && currentEnd < currentStart) return null
      const affected = mode === 'move'
        ? shiftSuccessorsFromChange(
            allRows.filter((item) => item.activityId).map((item) => ({ id: item.activityId!, currentStart: item.start, currentEnd: item.end })),
            project.dependencies.map((dependency) => ({
              predecessorId: dependency.predecessorId,
              successorId: dependency.successorId,
              type: dependency.type,
              lagDays: dependency.lagDays,
            })),
            { activityId: row.activityId!, currentStart, currentEnd }
          ).map((shift) => ({ activityId: shift.activityId, currentStart: shift.currentStart, currentEnd: shift.currentEnd }))
        : []
      return {
        activityId: row.activityId!,
        currentStart,
        currentEnd,
        affected,
        label: `${fmtDate(currentStart)} - ${fmtDate(currentEnd)}${affected.length ? ` · shifts ${affected.length} successor${affected.length === 1 ? '' : 's'}` : ''}`,
        x: clientX,
        y: clientY,
      }
    }
    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== event.pointerId) return
      const preview = buildPreview(move.clientX, move.clientY)
      if (preview) setDragPreview(preview)
    }
    const detach = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    const onCancel = (cancel: PointerEvent) => {
      if (cancel.pointerId !== event.pointerId) return
      detach()
      setDragPreview(null)
    }
    const onUp = (up: PointerEvent) => {
      if (up.pointerId !== event.pointerId) return
      detach()
      const deltaDays = pixelsToDays(up.clientX - startClientX, units)
      const currentStart = mode === 'resize-end' ? originStart : addDays(originStart, deltaDays)
      const currentEnd = mode === 'resize-start' ? originEnd : addDays(originEnd, deltaDays)
      if (deltaDays === 0 || (currentStart && currentEnd && currentEnd < currentStart)) {
        setDragPreview(null)
        return
      }
      requestScheduleChange({ row, mode, currentStart, currentEnd })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
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

  const beginDependency = (activityId: string, event: React.SyntheticEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setLinkingFrom(activityId)
  }

  const completeDependency = (activityId: string, event: React.SyntheticEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (!linkingFrom || linkingFrom === activityId) return
    createDependency.mutate({ predecessorId: linkingFrom, successorId: activityId, type: dependencyType })
    setLinkingFrom(null)
  }

  return (
    <section className="rounded border border-ink-primary/[0.12] bg-surface-card shadow-sm">
      <div className="flex flex-nowrap items-center gap-1 overflow-x-auto border-b border-ink-primary/[0.12] bg-surface-card px-2 py-1 md:overflow-visible [&_.btn]:h-8 [&_.btn]:px-2 [&_.btn]:py-0 [&_.btn]:text-xs [&_select]:h-8 [&_select]:text-xs">
        <div className="flex shrink-0 flex-nowrap items-center gap-1 border-r border-ink-primary/[0.10] pr-1">
          <div className="flex h-8 items-center gap-1 rounded border border-ink-primary/[0.12] bg-surface-card px-2">
            <Search className="size-3.5 text-ink-secondary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search schedule"
              className="w-28 bg-transparent text-xs text-ink-primary outline-none placeholder:text-ink-secondary"
            />
          </div>
          {canEdit && (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => openTaskCreator()}>
                <Plus className="mr-1 size-3.5" /> Task
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => { setNewItemName(''); setCreateKind('section') }} title="New section" aria-label="New section">
                <PanelTop className="size-3.5" />
              </button>
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-nowrap items-center gap-1 border-r border-ink-primary/[0.10] pr-1">
          <button className="btn btn-outline btn-sm" onClick={() => setAllCollapsed(false)} title="Expand all" aria-label="Expand all">
            <ListTree className="size-3.5" />
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setAllCollapsed(true)} title="Collapse all" aria-label="Collapse all">
            <List className="size-3.5" />
          </button>

          <details name="gantt-toolbar-menu" className="relative">
            <summary className="btn btn-outline btn-sm cursor-pointer list-none">
              <Download className="mr-1 size-3.5" /> Export
            </summary>
            <div className="absolute left-0 top-9 z-30 w-56 rounded-md border border-ink-primary/[0.12] bg-surface-card p-1 shadow-popover">
              <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-body-sm text-ink-primary hover:bg-surface-hover" onClick={() => void downloadExport('pdf')}>
                <FileText className="size-3.5" /> PDF
              </button>
              <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-body-sm text-ink-primary hover:bg-surface-hover" onClick={() => void downloadExport('png')}>
                <ImageIcon className="size-3.5" /> PNG
              </button>
              <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-body-sm text-ink-primary hover:bg-surface-hover" onClick={() => void downloadExport('csv')}>
                <Columns className="size-3.5" /> CSV
              </button>
              <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-body-sm text-ink-primary hover:bg-surface-hover" onClick={() => void downloadExport('xml')}>
                <GitBranch className="size-3.5" /> MS Project XML
              </button>
              <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-body-sm text-ink-primary hover:bg-surface-hover" onClick={() => void copyShareLink()}>
                <Share2 className="size-3.5" /> Copy client portal link
              </button>
              {canEdit && <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-body-sm text-ink-primary hover:bg-surface-hover" onClick={() => void publishSnapshot()}>
                <Share2 className="size-3.5" /> Publish public snapshot
              </button>
              }
            </div>
          </details>

          <details name="gantt-toolbar-menu" className="relative">
            <summary className="btn btn-outline btn-sm cursor-pointer list-none">
              {toolbarPrefs.showBaselines ? <Eye className="mr-1 size-3.5" /> : <EyeOff className="mr-1 size-3.5" />} Baseline
            </summary>
            <div className="absolute left-0 top-9 z-30 w-64 space-y-2 rounded-md border border-ink-primary/[0.12] bg-surface-card p-2 shadow-popover">
              <label className="flex items-center justify-between gap-2 text-body-sm text-ink-primary">
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

          <details name="gantt-toolbar-menu" className="relative">
            <summary className="btn btn-outline btn-sm cursor-pointer list-none">
              <PanelTop className="mr-1 size-3.5" /> Options
            </summary>
            <div className="absolute left-0 top-9 z-30 w-64 space-y-1 rounded-md border border-ink-primary/[0.12] bg-surface-card p-2 shadow-popover">
              <ToolbarCheck label="Dependencies" checked={toolbarPrefs.showDependencies} onChange={() => togglePreference('showDependencies')} />
              <ToolbarCheck label="Progress fill" checked={toolbarPrefs.showProgress} onChange={() => togglePreference('showProgress')} />
              <ToolbarCheck label="Critical path" checked={toolbarPrefs.showCriticalPath} onChange={() => togglePreference('showCriticalPath')} />
              <ToolbarCheck label="Weekends" checked={toolbarPrefs.showWeekends} onChange={() => togglePreference('showWeekends')} />
              <ToolbarCheck label="Today marker" checked={toolbarPrefs.showToday} onChange={() => togglePreference('showToday')} />
              <ToolbarCheck label="Comments" checked={toolbarPrefs.showComments} onChange={() => togglePreference('showComments')} />
              <ToolbarCheck label="Legend" checked={toolbarPrefs.showLegend} onChange={() => togglePreference('showLegend')} />
              <ToolbarCheck label="Minimap" checked={toolbarPrefs.showMinimap} onChange={() => togglePreference('showMinimap')} />
            </div>
          </details>

        </div>

        <div className="flex shrink-0 flex-nowrap items-center gap-1">
          <select aria-label="Group schedule by" className="h-9 rounded-md border border-ink-primary/[0.12] bg-surface-card px-2 text-body-sm text-ink-primary" value={segment} onChange={(e) => setSegment(e.target.value as GanttSegment)}>
            <option value="phase">Phase</option>
            <option value="assignee">Assignee</option>
            <option value="status">Status</option>
            <option value="owner">Owner Party</option>
          </select>
          <select aria-label="Sort schedule by" className="h-9 rounded-md border border-ink-primary/[0.12] bg-surface-card px-2 text-body-sm text-ink-primary" value={sort} onChange={(e) => setSort(e.target.value as GanttSort)}>
            <option value="manual">Sort: Manual order</option>
            <option value="automatic">Sort: Section, then start date</option>
          </select>
          <select aria-label="Timeline scale" className="h-9 rounded-md border border-ink-primary/[0.12] bg-surface-card px-2 text-body-sm text-ink-primary" value={scale} onChange={(e) => setScale(e.target.value as GanttScale)}>
            <option value="days">Days</option>
            <option value="weeks">Weeks</option>
            <option value="months">Months</option>
            <option value="quarters">Quarters</option>
            <option value="years">Years</option>
          </select>
          <select aria-label="Dependency type" className="h-9 rounded-md border border-ink-primary/[0.12] bg-surface-card px-2 text-body-sm text-ink-primary" value={dependencyType} onChange={(e) => setDependencyType(e.target.value as DependencyType)}>
            {DEPENDENCY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>

        <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-1">
          <button className="btn btn-outline btn-sm" onClick={scrollToToday} title="Center today in the timeline" aria-label="Today">
            <Crosshair className="size-3.5" />
          </button>
          <button className="btn btn-outline btn-sm" onClick={fitTimeline} title="Fit the full project in the timeline" aria-label="Fit timeline">
            <Maximize2 className="size-3.5" />
          </button>
          <button className="btn btn-outline btn-sm" onClick={undoLastScheduleChange} disabled={!lastScheduleChange || shiftSchedule.isPending} title="Undo last schedule change" aria-label="Undo last schedule change">
            <RotateCcw className="size-3.5" />
          </button>
          <button className="btn btn-outline btn-sm" onClick={duplicateSelected} disabled={!selectedRow?.activityId || addActivity.isPending} title={selectedRow ? `Duplicate ${selectedRow.title}` : 'Select a bar to duplicate'} aria-label="Duplicate selected task">
            <Copy className="size-3.5" />
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setShowAiAssistant(true)} title="Constrained AI Assistant" aria-label="Open AI assistant">
            <Sparkles className="size-3.5" />
          </button>
          <div className="flex items-center rounded-md border border-ink-primary/[0.12] bg-surface-card">
            <button className="px-2 py-1.5 text-ink-primary hover:bg-surface-hover" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.1).toFixed(2)))} aria-label="Zoom out">
              <Minus className="size-3.5" />
            </button>
            <span className="w-10 text-center text-xs font-medium text-ink-primary">{Math.round(zoom * 100)}%</span>
            <button className="px-2 py-1.5 text-ink-primary hover:bg-surface-hover" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.1).toFixed(2)))} aria-label="Zoom in">
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {toolbarPrefs.showCriticalPath && (
        <div className="border-b border-danger-500/20 bg-danger-50 px-3 py-1.5 text-xs font-medium text-danger-700">
          Critical path is highlighted in red on dated activities.
        </div>
      )}

      {toolbarPrefs.showLegend && (
      <div className="border-b border-ink-primary/[0.10] bg-surface-card px-2 py-1">
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-ink-secondary">
          <span className="inline-flex items-center gap-1"><span className="size-3 rounded-pill bg-project-baseline opacity-50" /> Baseline</span>
          <span className="inline-flex items-center gap-1"><span className="size-3 rounded-pill bg-project-status-started" /> Current</span>
          <span className="inline-flex items-center gap-1"><span className="size-3 rotate-45 bg-project-status-approved" /> Milestone</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-0 border-l border-danger-500" /> Today</span>
          <span className="inline-flex items-center gap-1"><span className="size-3 rounded-pill border-2 border-danger-500" /> Critical path</span>
        </div>
      </div>
      )}

      {toolbarPrefs.showMinimap && (
      <div className="border-b border-ink-primary/[0.10] bg-surface-card px-2 py-1">
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
        className="relative isolate h-[calc(100vh-205px)] min-h-[420px] overflow-auto bg-surface-card"
        onScroll={(e) => setScrollLeft((e.currentTarget as HTMLDivElement).scrollLeft)}
      >
        <div className="relative" style={{ width: leftWidth + timelineWidth, minWidth: '100%' }}>
          <div
            className="sticky top-0 z-20 grid border-b border-ink-primary/[0.12] bg-surface-card"
            style={{ gridTemplateColumns: `${leftWidth}px ${timelineWidth}px`, height: HEADER_HEIGHT }}
          >
            <div className="z-40 border-r border-ink-primary/[0.14] bg-surface-card shadow-[2px_0_0_rgba(0,0,0,0.04)] md:sticky md:left-0">
              <ScheduleGridHeader columns={visibleColumns} columnTemplate={columnTemplate} onResizeTaskColumnStart={resizeTaskColumnStart} />
              <button
                className="absolute right-[-4px] top-0 h-full w-2 cursor-col-resize touch-none bg-transparent hover:bg-primary-100"
                aria-label="Resize task list"
                type="button"
                onPointerDown={(e) => { e.preventDefault(); resizeStart(e.clientX) }}
              />
            </div>
            <div className="relative overflow-hidden">
              <div className="flex h-6 border-b border-ink-primary/[0.10] bg-surface-hover">
                {groups.map((g) => (
                  <div key={g.key} className="border-r border-ink-primary/[0.10] px-2 py-0.5 text-xs font-semibold text-ink-primary" style={{ width: g.width }}>
                    {g.label}
                  </div>
                ))}
              </div>
              <div className="flex h-6">
                {units.map((u) => (
                  <div
                    key={u.key}
                    className={cn('border-r border-ink-primary/[0.08] px-1 py-0.5 text-center text-xs font-medium text-ink-secondary', toolbarPrefs.showWeekends && isWeekendUnit(u) && 'bg-warning-500/[0.10]')}
                    style={{ width: u.width }}
                  >
                    {u.label}
                  </div>
                ))}
              </div>
              {todayX != null && (
                <div className="pointer-events-none absolute top-0 h-full border-l border-danger-500" style={{ left: todayX }}>
                  <div className="rounded-b bg-danger-500 px-1 py-0.5 text-xs font-medium text-primary-foreground">Today</div>
                </div>
              )}
            </div>
          </div>

          {todayX != null && visibleRows.length > 0 && (
            <div
              className="pointer-events-none absolute z-20 border-l-2 border-danger-500"
              style={{ left: leftWidth + todayX, top: HEADER_HEIGHT, height: virtualizer.getTotalSize() }}
              aria-hidden="true"
            />
          )}

          {visibleRows.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-body-sm text-ink-secondary">
              No schedule rows match the current search.
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorder}>
              <SortableContext items={visibleRows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
                <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
                  {toolbarPrefs.showDependencies && (
                    <GanttDependencyLayer
                      dependencies={project.dependencies}
                      rows={visibleRows}
                      units={units}
                      height={virtualizer.getTotalSize()}
                      leftOffset={leftWidth}
                      selectedActivityId={selectedActivityId}
                      onDelete={setDeleteTarget}
                    />
                  )}
                  {virtualItems.map((item) => {
                    const row = visibleRows[item.index]
                    const preview = row.activityId ? previewByActivity.get(row.activityId) : undefined
                    const isCritical = !!row.activityId && criticalActivityIds.has(row.activityId)
                    return (
                      <GanttSortableRow
                        key={row.id}
                        id={row.id}
                        top={item.start}
                        disabled={!reorderEnabled || reorderSchedule.isPending || row.type === 'actions'}
                        className={cn(selectedActivityId && row.activityId === selectedActivityId && 'bg-primary-500/[0.08]')}
                        gridTemplateColumns={`${leftWidth}px ${timelineWidth}px`}
                      >
                        {(dragHandleProps) => (
                          <>
                            <ScheduleGridRow
                              row={row}
                              collapsed={collapsed.has(row.id)}
                              columns={visibleColumns}
                              columnTemplate={columnTemplate}
                              users={users}
                              userNames={userNames}
                              clientName={project.clientName}
                              canEdit={canEdit}
                              reorderEnabled={reorderEnabled && !reorderSchedule.isPending}
                              dragHandleProps={dragHandleProps}
                              onToggle={() => setCollapsed((current) => toggleSetValue(current, row.id))}
                              onAddTask={() => openTaskCreator(row)}
                              onCreateTask={(title) => createInlineTask(row, title)}
                              onCreateSection={createInlineSection}
                              onOpenActivity={(activityId) => {
                                setSelectedActivityId(activityId)
                                onActivityOpen?.(activityId)
                              }}
                              onRenameActivity={renameActivity}
                              onUpdateActivity={updateGridActivity}
                              onUpdateDate={updateGridDate}
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
                              onCancelDependency={() => setLinkingFrom(null)}
                              onNudge={nudgeBar}
                              canEdit={canEdit}
                            />
                          </>
                        )}
                      </GanttSortableRow>
                    )
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-ink-primary/[0.12] bg-surface-card px-2 py-1 text-xs text-ink-secondary">
        <span>{visibleRows.length} visible rows of {allRows.length}</span>
        <span id="gantt-bar-keyboard-help" className="sr-only">
          Press Enter to open the task.{canEdit ? ' Left and Right arrows move it by one day, Shift with an arrow changes the due date, Alt with an arrow changes the start date.' : ''}
        </span>
        <span className="inline-flex items-center gap-3">
          <span className="text-primary-600" role="status">{linkingFrom ? 'Choose a successor activity... (Esc cancels)' : ''}</span>
          <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" /> {fmtDate(range.start)} to {fmtDate(range.end)}</span>
        </span>
      </div>
      {dragPreview && (
        <div
          className="pointer-events-none fixed z-50 rounded-md bg-ink-primary px-2 py-1 text-xs font-medium text-surface-card shadow-popover"
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
                  <label key={owner} className="flex items-center gap-1 rounded-md border border-ink-primary/[0.08] px-2 py-1 text-body-sm">
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
      <Modal
        open={createKind !== null}
        onClose={closeCreator}
        title={createKind === 'section' ? 'New section' : 'New task'}
        icon={Plus}
        size="sm"
        closeOnBackdrop={!addPhase.isPending && !addMilestone.isPending && !addActivity.isPending}
      >
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void createScheduleItem() }}>
          {createKind === 'task' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-body-sm font-medium text-ink-primary">Section</span>
                <select
                  className="input mt-1 w-full"
                  value={newTaskPhaseId}
                  onChange={(event) => {
                    const phaseId = event.target.value
                    const phase = project.phases.find((item) => item.id === phaseId)
                    setNewTaskPhaseId(phaseId)
                    setNewTaskMilestoneId(phase?.milestones[0]?.id ?? '')
                  }}
                  required
                >
                  {project.phases.length === 0
                    ? <option value={AUTO_SECTION_ID}>General (created automatically)</option>
                    : project.phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-body-sm font-medium text-ink-primary">Subsection</span>
                <select
                  className="input mt-1 w-full"
                  value={newTaskMilestoneId}
                  onChange={(event) => setNewTaskMilestoneId(event.target.value)}
                  disabled={newTaskPhaseId === AUTO_SECTION_ID}
                >
                  {newTaskPhaseId !== AUTO_SECTION_ID && project.phases.find((phase) => phase.id === newTaskPhaseId)?.milestones.length ? (
                    project.phases.find((phase) => phase.id === newTaskPhaseId)!.milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.name}</option>)
                  ) : (
                    <option value="">General (created automatically)</option>
                  )}
                </select>
              </label>
              {project.phases.length === 0 && (
                <p className="text-body-sm text-ink-secondary sm:col-span-2">A General section and subsection will be created with this first task.</p>
              )}
            </div>
          )}
          <label className="block">
            <span className="text-body-sm font-medium text-ink-primary">{createKind === 'section' ? 'Section name' : 'Task name'}</span>
            <input
              autoFocus
              className="input mt-1 w-full"
              value={newItemName}
              onChange={(event) => setNewItemName(event.target.value)}
              placeholder={createKind === 'section' ? 'e.g. Solution Delivery' : 'e.g. Review solution design'}
              minLength={createKind === 'section' ? 2 : 3}
              maxLength={200}
              required
            />
          </label>
          <div className="flex justify-end gap-2 border-t border-ink-primary/[0.08] pt-4">
            <button type="button" className="btn btn-ghost" onClick={closeCreator}>Cancel</button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!newItemName.trim() || (createKind === 'task' && !newTaskPhaseId) || addPhase.isPending || addMilestone.isPending || addActivity.isPending}
            >
              {addPhase.isPending || addMilestone.isPending || addActivity.isPending ? 'Creating…' : createKind === 'section' ? 'Create section' : 'Create task'}
            </button>
          </div>
        </form>
      </Modal>
      <CommitBaselineDialog
        open={commitBaselineOpen}
        onClose={() => setCommitBaselineOpen(false)}
        projectId={project.id}
        activityCount={project.phases.reduce((n, phase) => n + phase.milestones.reduce((m, milestone) => m + milestone.activities.length, 0), 0)}
        defaultNotes="Committed from Gantt toolbar"
      />
      <RebaselineDialog
        open={rebaselineOpen}
        onClose={() => setRebaselineOpen(false)}
        projectId={project.id}
        baselineVersion={project.baselineVersion}
      />
      <TextPromptDialog
        open={!!gateOverride}
        onClose={() => setGateOverride(null)}
        onSubmit={async (reason) => { await gateOverride?.apply(reason) }}
        title="Stage gate not passed"
        message={gateOverride ? `${gateOverride.message}\n\nStarting anyway records a gate override with your reason.` : undefined}
        label="Override reason"
        placeholder="Why must this activity start before the gate passes?"
        confirmLabel="Start anyway"
        multiline
      />
      <AiAssistantPanel
        projectId={project.id}
        open={showAiAssistant}
        onClose={() => setShowAiAssistant(false)}
      />
    </section>
  )
}

function GanttSortableRow({
  id,
  top,
  disabled,
  className,
  gridTemplateColumns,
  children,
}: {
  id: string
  top: number
  disabled: boolean
  className?: string
  gridTemplateColumns: string
  children: (dragHandleProps: React.ButtonHTMLAttributes<HTMLButtonElement>) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const dragHandleProps = { ...attributes, ...listeners } as React.ButtonHTMLAttributes<HTMLButtonElement>
  return (
    <div
      ref={setNodeRef}
      className={cn('absolute left-0 grid border-b border-ink-primary/[0.08] bg-surface-card', isDragging && 'z-30 opacity-80 shadow-popover', className)}
      style={{
        top,
        transform: CSS.Transform.toString(transform),
        transition,
        gridTemplateColumns,
        height: ROW_HEIGHT,
      }}
    >
      {children(dragHandleProps)}
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
  canEdit,
  onStartDrag,
  onSelect,
  onBeginDependency,
  onCompleteDependency,
  onCancelDependency,
  onNudge,
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
  canEdit: boolean
  onStartDrag: (row: GanttRow, mode: PendingScheduleChange['mode'], event: React.PointerEvent) => void
  onSelect: (activityId: string) => void
  onBeginDependency: (activityId: string, event: React.SyntheticEvent) => void
  onCompleteDependency: (activityId: string, event: React.SyntheticEvent) => void
  onCancelDependency: () => void
  onNudge: (row: GanttRow, mode: PendingScheduleChange['mode'], deltaDays: number) => void
}) {
  const actualStart = preview?.start ?? row.start
  const actualEnd = preview?.end ?? row.end
  const actual = spanToRect(actualStart, actualEnd, units)
  const baseline = baselined ? spanToRect(row.baselineStart, row.baselineEnd, units) : null
  const isMilestone = row.type === 'milestone' || row.isMilestone
  const canInteract = !!row.activityId && row.type !== 'phase' && row.type !== 'milestone'
  const overdue = isOverdueRow(row)
  const showLabelInside = !!actual && !isMilestone && row.type !== 'phase' && actual.width >= 150
  // Bars are operable without a pointer: Tab to focus, Enter/Space opens (or
  // completes a dependency), arrows nudge dates through the same slip-reason gate
  // as drag (see requestScheduleChange). Help text: #gantt-bar-keyboard-help.
  const barA11y = canInteract && row.activityId
    ? {
        role: 'button' as const,
        tabIndex: 0,
        'aria-label': `${row.title}: ${fmtDate(row.start)} to ${fmtDate(row.end)}, ${renderColumn(row, 'status')}`,
        'aria-describedby': 'gantt-bar-keyboard-help',
        onKeyDown: (event: React.KeyboardEvent) => {
          const activityId = row.activityId!
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            if (linkingFrom && linkingFrom !== activityId) onCompleteDependency(activityId, event)
            else onSelect(activityId)
            return
          }
          if (event.key === 'Escape' && linkingFrom) {
            event.preventDefault()
            onCancelDependency()
            return
          }
          if (!canEdit || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
          event.preventDefault()
          const mode: PendingScheduleChange['mode'] = event.shiftKey ? 'resize-end' : event.altKey ? 'resize-start' : 'move'
          onNudge(row, mode, event.key === 'ArrowRight' ? 1 : -1)
        },
      }
    : {}

  return (
    <div className={cn('group/timeline relative isolate overflow-hidden', row.type === 'phase' && 'bg-surface-muted/50', isSelected && 'bg-primary-500/[0.07]')}>
      <div className="flex h-full">
        {units.map((u) => (
          <div
            key={u.key}
            className={cn('h-full border-r border-ink-primary/[0.07]', showWeekends && isWeekendUnit(u) && 'bg-warning-500/[0.06]')}
            style={{ width: u.width }}
          />
        ))}
      </div>
      {baseline && (
        <div
          className={cn(
            'pointer-events-none absolute top-[25px] h-1 rounded-pill bg-project-baseline opacity-60',
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
            'absolute top-[9px] h-3.5 w-3.5 rotate-45 border border-ink-primary/25',
            canInteract && 'cursor-grab touch-none ap-focus-ring active:cursor-grabbing',
            statusClass(row),
            row.risk === 'HIGH' && 'ring-2 ring-danger-500/30',
            isCritical && 'ring-2 ring-danger-500',
            isSelected && 'outline outline-2 outline-primary-500'
          )}
          style={{ left: actual.left - 7 }}
          title={`${row.title} · ${renderColumn(row, 'status')}`}
          {...barA11y}
          onPointerDown={(event) => onStartDrag(row, 'move', event)}
          onClick={() => row.activityId && onSelect(row.activityId)}
          onPointerUp={(event) => row.activityId && completeIfLinking(linkingFrom, row.activityId, event, onCompleteDependency)}
        />
      ) : actual ? (
        <div
          className={cn(
            'group absolute min-w-[18px]',
            row.type === 'phase'
              ? 'top-[10px] h-2.5 overflow-visible rounded-none border-0 border-t-[3px] border-ink-primary bg-transparent shadow-none'
              : 'top-[7px] h-4 overflow-hidden rounded-sm border border-ink-primary/20 shadow-sm',
            canInteract && 'cursor-grab touch-none ap-focus-ring active:cursor-grabbing',
            row.type !== 'phase' && statusClass(row),
            overdue && 'border-danger-500 bg-danger-100 ring-1 ring-danger-500/30',
            row.risk === 'HIGH' && 'ring-2 ring-danger-500/30',
            isCritical && 'ring-2 ring-danger-500',
            isSelected && 'outline outline-2 outline-primary-500'
          )}
          style={{ left: actual.left, width: actual.width }}
          title={`${row.title} · ${renderColumn(row, 'status')} · ${Math.round(row.percentComplete)}%${overdue ? ' · Overdue' : ''}`}
          {...barA11y}
          onPointerDown={(event) => onStartDrag(row, 'move', event)}
          onClick={() => row.activityId && onSelect(row.activityId)}
          onPointerUp={(event) => row.activityId && completeIfLinking(linkingFrom, row.activityId, event, onCompleteDependency)}
        >
          {canInteract && (
            <>
              {/* Pointer-only grips; the keyboard equivalents are Alt+Arrow / Shift+Arrow on the bar. */}
              <span
                aria-hidden="true"
                className="absolute left-0 top-0 z-10 h-full w-2 cursor-ew-resize touch-none rounded-l-pill bg-black/25 opacity-0 transition-opacity group-hover:opacity-100"
                onPointerDown={(event) => onStartDrag(row, 'resize-start', event)}
              />
              <span
                aria-hidden="true"
                className="absolute right-0 top-0 z-10 h-full w-2 cursor-ew-resize touch-none rounded-r-pill bg-black/25 opacity-0 transition-opacity group-hover:opacity-100"
                onPointerDown={(event) => onStartDrag(row, 'resize-end', event)}
              />
            </>
          )}
          {row.type === 'phase' && (
            <>
              <span className="absolute -top-1 left-0 h-4 w-1 bg-ink-primary" />
              <span className="absolute -top-1 right-0 h-4 w-1 bg-ink-primary" />
            </>
          )}
          {showProgress && row.type !== 'phase' && (
            <div
              className="absolute inset-y-0 left-0 rounded-pill bg-black/20"
              style={{ width: `${Math.max(0, Math.min(100, row.percentComplete))}%` }}
            />
          )}
          {showLabelInside && (
            <span className="pointer-events-none absolute inset-0 z-10 truncate px-1.5 text-xs font-medium leading-4 text-ink-primary">
              {row.title}
            </span>
          )}
        </div>
      ) : null}
      {actual && canInteract && row.activityId && (
        <>
          <button
            className={cn(
              'absolute top-[7px] z-20 size-3.5 rounded-full border-2 border-primary-500 bg-surface-card opacity-0 shadow-sm transition-opacity focus:opacity-100 group-hover/timeline:opacity-100',
              (isSelected || linkingFrom === row.activityId) && 'opacity-100',
              linkingFrom === row.activityId && 'bg-primary-500'
            )}
            style={{ left: actual.left - 18 }}
            type="button"
            title="Start dependency"
            aria-label={`Start a dependency from ${row.title}`}
            aria-pressed={linkingFrom === row.activityId}
            onPointerDown={(event) => onBeginDependency(row.activityId!, event)}
            // Keyboard activation only (detail 0); pointer presses are handled on pointerdown.
            onClick={(event) => { if (event.detail === 0) onBeginDependency(row.activityId!, event) }}
            onKeyDown={(event) => { if (event.key === 'Escape' && linkingFrom) { event.preventDefault(); onCancelDependency() } }}
          />
          <button
            className={cn(
              'absolute top-[7px] z-20 size-3.5 rounded-full border-2 border-primary-500 bg-surface-card opacity-0 shadow-sm transition-opacity focus:opacity-100 group-hover/timeline:opacity-100',
              (isSelected || linkingFrom) && 'opacity-100',
              linkingFrom && linkingFrom !== row.activityId && 'ring-2 ring-primary-500/30'
            )}
            style={{ left: actual.left + actual.width + 4 }}
            type="button"
            title={linkingFrom ? 'Finish dependency' : 'Start dependency'}
            aria-label={linkingFrom && linkingFrom !== row.activityId ? `Finish the dependency on ${row.title}` : `Start a dependency from ${row.title}`}
            onPointerDown={(event) => linkingFrom ? onCompleteDependency(row.activityId!, event) : onBeginDependency(row.activityId!, event)}
            onClick={(event) => {
              if (event.detail !== 0) return
              if (linkingFrom) onCompleteDependency(row.activityId!, event)
              else onBeginDependency(row.activityId!, event)
            }}
            onKeyDown={(event) => { if (event.key === 'Escape' && linkingFrom) { event.preventDefault(); onCancelDependency() } }}
          />
        </>
      )}
      {actual && !showLabelInside && (
        <div className="absolute top-[7px] truncate pl-2 text-xs font-medium text-ink-primary" style={{ left: actual.left + actual.width, maxWidth: 200 }}>
          {row.title}
        </div>
      )}
      {actual && row.status === 'APPROVAL_REQUESTED' && row.waitingSince && (
        <span
          className="absolute top-[3px] inline-flex items-center gap-1 rounded bg-warning-50 px-1 py-0.5 text-[9px] font-medium text-warning-700 shadow-sm"
          style={{ left: actual.left + Math.max(8, actual.width - 6) }}
          title="Business days waiting for client approval"
        >
          <Clock className="size-3" /> {businessDaysBetween(row.waitingSince, new Date())}d
        </span>
      )}
      {actual && showComments && row.commentsCount > 0 && (
        <span
          className="absolute top-[17px] inline-flex items-center gap-1 rounded bg-surface-card px-1 py-0.5 text-[9px] font-medium text-ink-secondary shadow-sm ring-1 ring-ink-primary/[0.08]"
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
  leftOffset,
  selectedActivityId,
  onDelete,
}: {
  dependencies: ActivityDependencyNode[]
  rows: GanttRow[]
  units: TimelineUnit[]
  height: number
  leftOffset: number
  selectedActivityId: string | null
  onDelete: (dependency: ActivityDependencyNode) => void
}) {
  const byActivity = new Map(rows.map((row, index) => [row.activityId, { row, index }]).filter(([id]) => !!id) as [string, { row: GanttRow; index: number }][])
  const width = units.reduce((sum, unit) => sum + unit.width, 0)

  return (
    <svg className="pointer-events-none absolute top-0 z-10" style={{ left: leftOffset }} width={width} height={height}>
      <defs>
        <marker id="gantt-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L6,3 z" className="fill-ink-tertiary" />
        </marker>
        <marker id="gantt-arrow-selected" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L6,3 z" className="fill-primary-500" />
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
        const path = dependencyPath(dependency.type, points)
        const selected = selectedActivityId === dependency.predecessorId || selectedActivityId === dependency.successorId
        return (
          <g key={dependency.id} className="group/dependency pointer-events-auto cursor-pointer" onClick={() => onDelete(dependency)}>
            <title>{`${pred.row.title} to ${succ.row.title} (${dependency.type})`}</title>
            <path d={path} fill="none" stroke="transparent" strokeWidth="10" />
            <path d={path} fill="none" className="stroke-surface-card" strokeWidth={selected ? 5 : 4} strokeLinecap="round" strokeLinejoin="round" opacity="0.92" />
            <path
              d={path}
              fill="none"
              className={selected ? 'stroke-primary-500' : 'stroke-ink-secondary group-hover/dependency:stroke-primary-500'}
              strokeWidth={selected ? 2.4 : 1.5}
              opacity={selected ? 1 : 0.82}
              strokeLinecap="round"
              strokeLinejoin="round"
              markerEnd={selected ? 'url(#gantt-arrow-selected)' : 'url(#gantt-arrow)'}
            />
            <circle cx={points.startX} cy={points.startY} r={selected ? 3.5 : 2.5} className={selected ? 'fill-primary-500' : 'fill-ink-secondary group-hover/dependency:fill-primary-500'} />
            {selected && (
              <text x={(points.startX + points.endX) / 2 + 4} y={(points.startY + points.endY) / 2 - 4} className="fill-primary-700 text-[9px] font-semibold">
                {dependency.type}
              </text>
            )}
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
      <div className="text-xs font-medium uppercase tracking-[0.04em] text-ink-tertiary">Minimap</div>
      <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-surface-muted">
        <div
          className="absolute top-0 h-full rounded-md bg-primary-500/30 ring-1 ring-primary-500/40"
          style={{ left: `${visibleStartRatio * 100}%`, width: `${Math.max(8, visibleWidthRatio * 100)}%` }}
        />
      </div>
      <div className="w-44 text-right text-xs text-ink-tertiary">{fmtDate(start)} - {fmtDate(end)}</div>
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

function stripRowPrefix(rowId: string): string {
  return rowId.slice(rowId.indexOf(':') + 1)
}

function entityId(row: GanttRow): string {
  return row.activityId ?? row.milestoneId ?? stripRowPrefix(row.id)
}

function filterVisibleRows(rows: GanttRow[], collapsed: Set<string>, filters: GanttFilters): GanttRow[] {
  const q = filters.query.trim().toLowerCase()
  const byId = new Map(rows.map((r) => [r.id, r]))
  const matches = new Set<string>()
  const hasStructuredFilters = !!filters.status || !!filters.assignee || !!filters.priority || !!filters.risk
  if (q || hasStructuredFilters) {
    for (const row of rows) {
      if (rowMatchesFilters(row, filters, q)) {
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
    if ((q || hasStructuredFilters) && !matches.has(row.id)) {
      hiddenParents.add(row.id)
      continue
    }
    visible.push(row)
    if (collapsed.has(row.id)) hiddenParents.add(row.id)
  }
  return visible
}

function rowMatchesFilters(row: GanttRow, filters: GanttFilters, q: string): boolean {
  if (q) {
    const searchable = [
      row.title,
      row.status,
      row.ownerParty ?? '',
      row.priority ?? '',
      row.risk ?? '',
      row.assigneeId ?? '',
    ].map((value) => value.toLowerCase())
    if (!searchable.some((value) => value.includes(q))) return false
  }
  if (filters.status && row.status !== filters.status) return false
  if (filters.assignee && (filters.assignee === 'UNASSIGNED' ? !!row.assigneeId : row.assigneeId !== filters.assignee)) return false
  if (filters.priority && row.priority !== filters.priority) return false
  if (filters.risk && row.risk !== filters.risk) return false
  return true
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
  // Weekend shading is meaningful only for day-scale units. Weekly and wider
  // units contain a weekend by definition and would tint the entire timeline.
  const durationHours = (unit.end.getTime() - unit.start.getTime()) / (60 * 60 * 1000)
  if (durationHours > 36) return false
  const day = unit.start.getDay()
  return day === 0 || day === 6
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

function pixelsToDays(px: number, units: TimelineUnit[]): number {
  const timelineWidth = units.reduce((sum, unit) => sum + unit.width, 0)
  const timelineDays = units.reduce((sum, unit) => sum + Math.max(1, Math.round((unit.end.getTime() - unit.start.getTime()) / 86400000)), 0)
  if (!timelineWidth || !timelineDays) return 0
  return Math.round((px / timelineWidth) * timelineDays)
}

function completeIfLinking(
  linkingFrom: string | null,
  activityId: string,
  event: React.SyntheticEvent,
  onCompleteDependency: (activityId: string, event: React.SyntheticEvent) => void
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

function dependencyPath(
  type: DependencyType,
  points: { startX: number; startY: number; endX: number; endY: number }
): string {
  const { startX, startY, endX, endY } = points
  const gutter = 14

  if (type === 'SS') {
    const laneX = Math.min(startX, endX) - gutter
    return `M ${startX} ${startY} H ${laneX} V ${endY} H ${endX}`
  }
  if (type === 'FF') {
    const laneX = Math.max(startX, endX) + gutter
    return `M ${startX} ${startY} H ${laneX} V ${endY} H ${endX}`
  }
  if (type === 'SF') {
    const leftLane = Math.min(startX, endX) - gutter
    const rightLane = Math.max(startX, endX) + gutter
    const middleY = (startY + endY) / 2
    return `M ${startX} ${startY} H ${leftLane} V ${middleY} H ${rightLane} V ${endY} H ${endX}`
  }

  const startLead = startX + gutter
  const endLead = endX - gutter
  const laneX = startLead < endLead ? (startLead + endLead) / 2 : Math.max(startX, endX) + gutter
  return `M ${startX} ${startY} H ${laneX} V ${endY} H ${endX}`
}

function toggleSetValue(current: Set<string>, value: string): Set<string> {
  const next = new Set(current)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
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
