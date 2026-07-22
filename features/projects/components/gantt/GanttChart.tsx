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
  ChevronDown,
  ChevronRight,
  Clock,
  Columns,
  Copy,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FileText,
  GitBranch,
  GripVertical,
  Image as ImageIcon,
  List,
  ListTree,
  Maximize2,
  Minus,
  MessageSquare,
  PanelTop,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
} from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { useUsersForSelection, type UserForSelection } from '@/hooks/useUsersForSelection'
import { businessDaysBetween } from '@/lib/projects/business-days'
import { AUTO_SECTION_ID, defaultTaskPlacement, ensureTaskPlacement } from '@/lib/projects/schedule-creation'
import { criticalPath, shiftSuccessorsFromChange } from '@/lib/projects/scheduling'
import { useProjectViewStore } from '@/lib/stores/project-view-store'
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
  type ActivityNode,
  type MilestoneNode,
  type PhaseNode,
  type ProjectDetail,
} from '../../hooks/useProject'
import { AiAssistantPanel } from '../ai/AiAssistantPanel'
import { ProjectDatePicker } from '../ProjectDatePicker'

type GanttScale = 'days' | 'weeks' | 'months' | 'quarters' | 'years'
export type GanttSort = 'position' | 'name' | 'date' | 'status' | 'priority'
export type GanttSegment = 'phase' | 'assignee' | 'status' | 'owner'
export type OptionalColumn = 'owner' | 'assignee' | 'subtasks' | 'tags' | 'start' | 'workingDays' | 'due' | 'calendarDays' | 'priority' | 'risk' | 'status' | 'percent' | 'estimatedHours' | 'actualHours' | 'estimatedCost' | 'actualCost' | 'slipDays'
type GanttRowType = 'phase' | 'milestone' | 'activity' | 'subactivity'
type ExportFormat = 'pdf' | 'png' | 'csv' | 'xml'

export interface GanttRow {
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
  actualHours?: number | null
  estimatedCost?: number | null
  actualCost?: number | null
  tags: string[]
  subtasksCount: number
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

export const SCHEDULE_ROW_HEIGHT = 32
const ROW_HEIGHT = SCHEDULE_ROW_HEIGHT
const HEADER_HEIGHT = 48
const MIN_LEFT_WIDTH = 520
const DEFAULT_LEFT_WIDTH = 680
const MAX_LEFT_WIDTH = 900
export const MIN_TASK_COLUMN_WIDTH = 210
export const DEFAULT_TASK_COLUMN_WIDTH = 260
export const MAX_TASK_COLUMN_WIDTH = 420
const MIN_ZOOM = 0.45
const MAX_ZOOM = 1.8
const LEFT_WIDTH_KEY = 'projects.gantt.leftWidth.v4'
export const TASK_COLUMN_WIDTH_KEY = 'projects.gantt.taskColumnWidth.v1'
const COLLAPSE_KEY = 'projects.gantt.collapsed'
const PREFS_KEY = 'projects.gantt.toolbarPrefs.v2'
const SEGMENT_KEY = 'projects.gantt.segment'
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
export const COLUMN_LABEL: Record<OptionalColumn, string> = {
  assignee: 'Assignee',
  subtasks: 'Sub',
  tags: 'Tags',
  estimatedHours: 'EH',
  actualHours: 'AH',
  estimatedCost: 'EC',
  actualCost: 'AC',
  start: 'Start',
  workingDays: 'WD',
  due: 'Due',
  calendarDays: 'CD',
  status: 'Status',
  priority: 'Priority',
  risk: 'Risk',
  percent: '%',
  owner: 'Owner Party',
  slipDays: 'Slip Days',
}

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
  const [sort, setSort] = useState<GanttSort>('position')
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
    setWidthPrefsHydrated(true)
  }, [])

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
  const reorderEnabled = canEdit && sort === 'position' && segment === 'phase' && query.trim() === ''

  const resizeStart = (clientX: number) => {
    const startX = clientX
    const startWidth = leftWidth
    const onMove = (event: MouseEvent) => {
      setLeftWidth(Math.min(MAX_LEFT_WIDTH, Math.max(MIN_LEFT_WIDTH, startWidth + event.clientX - startX)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const resizeTaskColumnStart = (clientX: number) => {
    const startX = clientX
    const startTaskWidth = taskColumnWidth
    const startLeftWidth = leftWidth
    const onMove = (event: MouseEvent) => {
      const requestedDelta = event.clientX - startX
      const minDelta = Math.max(MIN_TASK_COLUMN_WIDTH - startTaskWidth, MIN_LEFT_WIDTH - startLeftWidth)
      const maxDelta = Math.min(MAX_TASK_COLUMN_WIDTH - startTaskWidth, MAX_LEFT_WIDTH - startLeftWidth)
      const delta = Math.min(maxDelta, Math.max(minDelta, requestedDelta))
      setTaskColumnWidth(startTaskWidth + delta)
      setLeftWidth(startLeftWidth + delta)
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
        const reason = window.prompt(`${message}\n\nOverride reason:`)
        if (reason?.trim()) {
          await updateActivity.mutateAsync({ activityId: row.activityId, ...patch, gateOverrideReason: reason.trim() })
        }
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
    const change: PendingScheduleChange = {
      row,
      mode: field === 'start' ? 'resize-start' : 'resize-end',
      currentStart,
      currentEnd,
    }
    if (project.baselineCommittedAt) {
      setPendingChange(change)
      setSlipReason('')
      setSlipOwner('CLIENT')
      setSlipDetail('')
    } else {
      void persistScheduleChange(change)
    }
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

  const handleReorder = (event: DragEndEvent) => {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    if (!reorderEnabled || !overId || activeId === overId) return
    const activeRow = allRows.find((row) => row.id === activeId)
    const overRow = allRows.find((row) => row.id === overId)
    if (!activeRow || !overRow || activeRow.type !== overRow.type || activeRow.parentId !== overRow.parentId) return
    const siblings = allRows.filter((row) => row.type === activeRow.type && row.parentId === activeRow.parentId)
    const from = siblings.findIndex((row) => row.id === activeId)
    const to = siblings.findIndex((row) => row.id === overId)
    if (from < 0 || to < 0) return
    const orderedRows = arrayMove(siblings, from, to)
    const kind = activeRow.type === 'phase' ? 'phase' : activeRow.type === 'milestone' ? 'milestone' : 'activity'
    reorderSchedule.mutate({
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
    const onMove = (move: MouseEvent) => {
      const preview = buildPreview(move.clientX, move.clientY)
      if (preview) setDragPreview(preview)
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
    <section className="rounded border border-black/[0.12] bg-surface-card shadow-sm">
      <div className="flex flex-nowrap items-center gap-1 overflow-x-auto border-b border-black/[0.12] bg-white px-2 py-1 md:overflow-visible [&_.btn]:h-8 [&_.btn]:px-2 [&_.btn]:py-0 [&_.btn]:text-[11px] [&_select]:h-8 [&_select]:text-[11px]">
        <div className="flex shrink-0 flex-nowrap items-center gap-1 border-r border-black/[0.10] pr-1">
          <div className="flex h-8 items-center gap-1 rounded border border-black/[0.12] bg-white px-2">
            <Search className="size-3.5 text-ink-secondary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search schedule"
              className="w-28 bg-transparent text-[11px] text-ink-primary outline-none placeholder:text-ink-secondary"
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

        <div className="flex shrink-0 flex-nowrap items-center gap-1 border-r border-black/[0.10] pr-1">
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
            <div className="absolute left-0 top-9 z-30 w-56 rounded-md border border-black/[0.12] bg-white p-1 shadow-popover">
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
            <div className="absolute left-0 top-9 z-30 w-64 space-y-2 rounded-md border border-black/[0.12] bg-white p-2 shadow-popover">
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
            <div className="absolute left-0 top-9 z-30 w-64 space-y-1 rounded-md border border-black/[0.12] bg-white p-2 shadow-popover">
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
          <select aria-label="Group schedule by" className="h-9 rounded-md border border-black/[0.12] bg-white px-2 text-body-sm text-ink-primary" value={segment} onChange={(e) => setSegment(e.target.value as GanttSegment)}>
            <option value="phase">Phase</option>
            <option value="assignee">Assignee</option>
            <option value="status">Status</option>
            <option value="owner">Owner Party</option>
          </select>
          <select aria-label="Sort schedule by" className="h-9 rounded-md border border-black/[0.12] bg-white px-2 text-body-sm text-ink-primary" value={sort} onChange={(e) => setSort(e.target.value as GanttSort)}>
            <option value="position">Schedule</option>
            <option value="date">Date</option>
            <option value="name">Name</option>
            <option value="status">Status</option>
            <option value="priority">Priority</option>
          </select>
          <select aria-label="Timeline scale" className="h-9 rounded-md border border-black/[0.12] bg-white px-2 text-body-sm text-ink-primary" value={scale} onChange={(e) => setScale(e.target.value as GanttScale)}>
            <option value="days">Days</option>
            <option value="weeks">Weeks</option>
            <option value="months">Months</option>
            <option value="quarters">Quarters</option>
            <option value="years">Years</option>
          </select>
          <select aria-label="Dependency type" className="h-9 rounded-md border border-black/[0.12] bg-white px-2 text-body-sm text-ink-primary" value={dependencyType} onChange={(e) => setDependencyType(e.target.value as DependencyType)}>
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
          <div className="flex items-center rounded-md border border-black/[0.12] bg-white">
            <button className="px-2 py-1.5 text-ink-primary hover:bg-surface-hover" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.1).toFixed(2)))} aria-label="Zoom out">
              <Minus className="size-3.5" />
            </button>
            <span className="w-10 text-center text-[11px] font-medium text-ink-primary">{Math.round(zoom * 100)}%</span>
            <button className="px-2 py-1.5 text-ink-primary hover:bg-surface-hover" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.1).toFixed(2)))} aria-label="Zoom in">
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {toolbarPrefs.showCriticalPath && (
        <div className="border-b border-danger-500/20 bg-danger-50 px-3 py-1.5 text-[11px] font-medium text-danger-700">
          Critical path is highlighted in red on dated activities.
        </div>
      )}

      {toolbarPrefs.showLegend && (
      <div className="border-b border-black/[0.10] bg-white px-2 py-1">
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-ink-secondary">
          <span className="inline-flex items-center gap-1"><span className="size-3 rounded-pill bg-project-baseline opacity-50" /> Baseline</span>
          <span className="inline-flex items-center gap-1"><span className="size-3 rounded-pill bg-project-status-started" /> Current</span>
          <span className="inline-flex items-center gap-1"><span className="size-3 rotate-45 bg-project-status-approved" /> Milestone</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-0 border-l border-danger-500" /> Today</span>
          <span className="inline-flex items-center gap-1"><span className="size-3 rounded-pill border-2 border-danger-500" /> Critical path</span>
        </div>
      </div>
      )}

      {toolbarPrefs.showMinimap && (
      <div className="border-b border-black/[0.10] bg-white px-2 py-1">
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
        className="relative isolate h-[calc(100vh-205px)] min-h-[420px] overflow-auto bg-white"
        onScroll={(e) => setScrollLeft((e.currentTarget as HTMLDivElement).scrollLeft)}
      >
        <div style={{ width: leftWidth + timelineWidth, minWidth: '100%' }}>
          <div
            className="sticky top-0 z-20 grid border-b border-black/[0.12] bg-white"
            style={{ gridTemplateColumns: `${leftWidth}px ${timelineWidth}px`, height: HEADER_HEIGHT }}
          >
            <div className="z-40 border-r border-black/[0.14] bg-white shadow-[2px_0_0_rgba(0,0,0,0.04)] md:sticky md:left-0">
              <ScheduleGridHeader columns={visibleColumns} columnTemplate={columnTemplate} onResizeTaskColumnStart={resizeTaskColumnStart} />
              <button
                className="absolute right-[-4px] top-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-primary-100"
                aria-label="Resize task list"
                onMouseDown={(e) => resizeStart(e.clientX)}
              />
            </div>
            <div className="relative overflow-hidden">
              <div className="flex h-6 border-b border-black/[0.10] bg-surface-hover">
                {groups.map((g) => (
                  <div key={g.key} className="border-r border-black/[0.10] px-2 py-0.5 text-[10px] font-semibold text-ink-primary" style={{ width: g.width }}>
                    {g.label}
                  </div>
                ))}
              </div>
              <div className="flex h-6">
                {units.map((u) => (
                  <div
                    key={u.key}
                    className={cn('border-r border-black/[0.08] px-1 py-0.5 text-center text-[10px] font-medium text-ink-secondary', toolbarPrefs.showWeekends && isWeekendUnit(u) && 'bg-warning-500/[0.10]')}
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
                        disabled={!reorderEnabled || reorderSchedule.isPending}
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

      <div className="flex items-center justify-between border-t border-black/[0.12] bg-white px-2 py-1 text-[10px] text-ink-secondary">
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
          <div className="flex justify-end gap-2 border-t border-black/[0.08] pt-4">
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
      className={cn('absolute left-0 grid border-b border-black/[0.08] bg-white', isDragging && 'z-30 opacity-80 shadow-popover', className)}
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

export function ScheduleGridHeader({
  columns,
  columnTemplate,
  onResizeTaskColumnStart,
  stickyTaskColumn = false,
}: {
  columns: OptionalColumn[]
  columnTemplate: string
  onResizeTaskColumnStart: (clientX: number) => void
  stickyTaskColumn?: boolean
}) {
  return (
    <div className={cn('grid h-full items-center text-[10px] font-semibold uppercase text-ink-secondary', stickyTaskColumn ? 'overflow-visible' : 'overflow-hidden')} style={{ gridTemplateColumns: columnTemplate }}>
      <div className={cn('relative flex h-full items-center px-2', stickyTaskColumn && 'sticky left-0 z-20 bg-white shadow-[2px_0_0_rgba(0,0,0,0.06)]')}>
        <span>Section / Task</span>
        <button
          type="button"
          className="absolute right-[-4px] top-0 z-10 h-full w-2 cursor-col-resize bg-transparent hover:bg-primary-100 focus:bg-primary-100 focus:outline-none"
          aria-label="Resize section and task column"
          title="Drag to resize section and task column"
          onMouseDown={(event) => {
            event.preventDefault()
            onResizeTaskColumnStart(event.clientX)
          }}
        />
      </div>
      {columns.map((column) => <div key={column} className="truncate px-2" title={COLUMN_LABEL[column]}>{COLUMN_LABEL[column]}</div>)}
    </div>
  )
}

export function ScheduleGridRow({
  row,
  collapsed,
  columns,
  columnTemplate,
  users,
  userNames,
  clientName,
  canEdit,
  reorderEnabled,
  dragHandleProps,
  onToggle,
  onAddTask,
  onOpenActivity,
  onRenameActivity,
  onUpdateActivity,
  onUpdateDate,
  stickyPane = true,
  stickyTaskColumn = false,
}: {
  row: GanttRow
  collapsed: boolean
  columns: OptionalColumn[]
  columnTemplate: string
  users: UserForSelection[]
  userNames: Map<string, string>
  clientName: string
  canEdit: boolean
  reorderEnabled: boolean
  dragHandleProps: React.ButtonHTMLAttributes<HTMLButtonElement>
  onToggle: () => void
  onAddTask: () => void
  onOpenActivity: (activityId: string) => void
  onRenameActivity: (activityId: string, title: string) => Promise<void>
  onUpdateActivity: (row: GanttRow, patch: Record<string, unknown>) => Promise<void>
  onUpdateDate: (row: GanttRow, field: 'start' | 'due', value: string) => void
  stickyPane?: boolean
  stickyTaskColumn?: boolean
}) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(row.title)

  const commitTitle = async () => {
    const title = draftTitle.trim()
    setEditingTitle(false)
    if (!row.activityId || !title || title === row.title) {
      setDraftTitle(row.title)
      return
    }
    try {
      await onRenameActivity(row.activityId, title)
    } catch (error) {
      setDraftTitle(row.title)
      toast.error(error instanceof Error ? error.message : 'Unable to rename task')
    }
  }

  return (
    <div
      className={cn(
        'z-30 grid h-full items-center border-r border-black/[0.14] bg-white text-[11px]',
        stickyTaskColumn ? 'overflow-visible' : 'overflow-hidden',
        stickyPane && 'shadow-[2px_0_0_rgba(0,0,0,0.04)] md:sticky md:left-0',
        row.type === 'phase' && 'border-y border-black/[0.12] bg-[#eef0f3]',
        row.type === 'milestone' && 'bg-[#eef5ff]'
      )}
      style={{ gridTemplateColumns: columnTemplate }}
    >
      <div
        className={cn('group/task flex h-full min-w-0 items-center gap-0.5 px-2', stickyTaskColumn && 'sticky left-0 z-20 shadow-[2px_0_0_rgba(0,0,0,0.06)]')}
        style={{ paddingLeft: 8 + row.depth * 14, backgroundColor: stickyTaskColumn ? 'inherit' : undefined }}
      >
        {canEdit && (
          <button
            type="button"
            className={cn('rounded p-0.5 text-ink-secondary hover:bg-surface-hover hover:text-ink-primary', !reorderEnabled && 'cursor-not-allowed opacity-35')}
            disabled={!reorderEnabled}
            title={reorderEnabled ? `Drag to reorder ${row.title}` : 'Use the natural schedule view to reorder'}
            aria-label={`Drag to reorder ${row.title}`}
            {...dragHandleProps}
          >
            <GripVertical className="size-3.5" />
          </button>
        )}
        {row.hasChildren ? (
          <button className="rounded p-0.5 hover:bg-surface-hover" onClick={onToggle} aria-label={collapsed ? 'Expand row' : 'Collapse row'}>
            {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        {row.activityId && editingTitle ? (
          <input
            autoFocus
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={() => void commitTitle()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') {
                setDraftTitle(row.title)
                setEditingTitle(false)
              }
            }}
            aria-label={`Rename ${row.title}`}
            className="h-6 min-w-0 flex-1 rounded border border-primary-500 bg-white px-1.5 text-[11px] text-ink-primary outline-none ring-2 ring-primary-500/20"
          />
        ) : row.activityId ? (
          <button
            type="button"
            className="min-w-0 flex-1 truncate rounded px-1 text-left text-[11px] text-ink-primary hover:bg-primary-50 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            onClick={() => onOpenActivity(row.activityId!)}
            title={`Open ${row.title}`}
          >
            {row.title}
          </button>
        ) : (
          <span className={row.type === 'phase' ? 'truncate font-semibold text-ink-primary' : 'truncate font-medium text-ink-primary'}>
            {row.title}
          </span>
        )}
        {canEdit && row.activityId && !editingTitle && (
          <button
            type="button"
            className="shrink-0 rounded p-1 text-ink-secondary opacity-0 transition-opacity hover:bg-surface-hover hover:text-ink-primary focus:opacity-100 group-hover/task:opacity-100"
            onClick={(event) => {
              event.stopPropagation()
              setDraftTitle(row.title)
              setEditingTitle(true)
            }}
            title={`Rename ${row.title}`}
            aria-label={`Rename ${row.title}`}
          >
            <Pencil className="size-3" />
          </button>
        )}
        {canEdit && (row.type === 'phase' || row.type === 'milestone') && (
          <button type="button" className="ml-auto rounded p-1 text-primary-600 hover:bg-primary-100" onClick={onAddTask} title={`Add task to ${row.title}`} aria-label={`Add task to ${row.title}`}>
            <Plus className="size-3.5" />
          </button>
        )}
      </div>
      {columns.map((col) => (
        <GanttGridCell
          key={col}
          row={row}
          column={col}
          users={users}
          userNames={userNames}
          clientName={clientName}
          canEdit={canEdit}
          onUpdateActivity={onUpdateActivity}
          onUpdateDate={onUpdateDate}
        />
      ))}
    </div>
  )
}

function GanttGridCell({
  row,
  column,
  users,
  userNames,
  clientName,
  canEdit,
  onUpdateActivity,
  onUpdateDate,
}: {
  row: GanttRow
  column: OptionalColumn
  users: UserForSelection[]
  userNames: Map<string, string>
  clientName: string
  canEdit: boolean
  onUpdateActivity: (row: GanttRow, patch: Record<string, unknown>) => Promise<void>
  onUpdateDate: (row: GanttRow, field: 'start' | 'due', value: string) => void
}) {
  const editable = canEdit && !!row.activityId
  const controlClass = 'h-6 w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-[10px] text-ink-primary outline-none hover:border-black/[0.12] hover:bg-white focus:border-primary-400 focus:bg-white'
  const [percentDraft, setPercentDraft] = useState(String(Math.round(row.percentComplete)))

  useEffect(() => {
    setPercentDraft(String(Math.round(row.percentComplete)))
  }, [row.percentComplete])

  if (!editable) {
    const value = column === 'assignee'
      ? row.assigneeId ? userNames.get(row.assigneeId) ?? 'Assigned' : '-'
      : column === 'owner'
        ? ownerPartyLabel(row.ownerParty, clientName)
        : renderColumn(row, column)
    return <div className="truncate px-2 text-[10px] text-ink-secondary" title={value}>{value}</div>
  }

  if (column === 'owner') {
    return (
      <div className="px-1">
        <select
          className={controlClass}
          value={row.ownerParty ?? '360GROUND'}
          aria-label={`Owner party for ${row.title}`}
          onChange={(event) => {
            const ownerParty = event.target.value as OwnerParty
            void onUpdateActivity(row, ownerParty === 'CLIENT' ? { ownerParty, assigneeId: null } : { ownerParty })
          }}
        >
          <option value="360GROUND">360Ground</option>
          <option value="CLIENT">{clientName}</option>
          <option value="SHARED">Shared</option>
        </select>
      </div>
    )
  }

  if (column === 'assignee') {
    if (row.ownerParty === 'CLIENT') {
      return <div className="truncate px-2 text-[10px] font-medium text-primary-700" title={`${clientName} team`}>Client team</div>
    }
    return (
      <div className="px-1">
        <select
          className={controlClass}
          value={row.assigneeId ?? ''}
          aria-label={`Assignee for ${row.title}`}
          onChange={(event) => void onUpdateActivity(row, {
            assigneeId: event.target.value || null,
            ...(event.target.value ? { ownerParty: '360GROUND' } : {}),
          })}
        >
          <option value="">Unassigned</option>
          {row.assigneeId && !users.some((user) => user.id === row.assigneeId) && <option value={row.assigneeId} disabled>Unavailable account</option>}
          {users.length === 0 ? (
            <option value="__none__" disabled>No active system users</option>
          ) : (
            <optgroup label="360Ground team">
              {users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}
            </optgroup>
          )}
        </select>
      </div>
    )
  }

  if (column === 'start' || column === 'due') {
    const value = isoDateOnly(column === 'start' ? row.start : row.end) ?? ''
    return (
      <div className="px-1">
        <ProjectDatePicker
          value={value}
          ariaLabel={`${column === 'start' ? 'Start date' : 'Due date'} for ${row.title}`}
          onChange={(next) => onUpdateDate(row, column, next)}
          displayFormat="dd/MM/yy"
          showIcon={false}
          align="center"
          className="h-7 border-transparent bg-transparent px-1 text-[10px] hover:border-black/[0.1]"
        />
      </div>
    )
  }

  if (column === 'calendarDays') {
    return <div className="px-1 text-center text-[11px] tabular-nums text-ink-secondary">{calendarDaysBetween(row.start, row.end)}</div>
  }

  if (column === 'priority' || column === 'risk' || column === 'status') {
    const values = column === 'priority'
      ? [['', '-'], ['LOW', 'Low'], ['MEDIUM', 'Medium'], ['HIGH', 'High'], ['CRITICAL', 'Critical']]
      : column === 'risk'
        ? [['', '-'], ['LOW', 'Low'], ['MEDIUM', 'Medium'], ['HIGH', 'High']]
        : [['NOT_STARTED', 'Not started'], ['STARTED', 'Started'], ['FINISHED', 'Finished'], ['APPROVAL_REQUESTED', 'Approval'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected']]
    const value = column === 'status' ? row.status : row[column] ?? ''
    return (
      <div className="px-1">
        <select
          className={cn(controlClass, column === 'risk' && row.risk === 'HIGH' && 'font-semibold text-danger-700', column === 'priority' && row.priority === 'CRITICAL' && 'font-semibold text-danger-700')}
          value={value}
          aria-label={`${COLUMN_LABEL[column]} for ${row.title}`}
          onChange={(event) => void onUpdateActivity(row, { [column]: event.target.value || null })}
        >
          {values.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}
        </select>
      </div>
    )
  }

  if (column === 'percent') {
    return (
      <div className="flex items-center px-1">
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          className={`${controlClass} pr-0 text-right tabular-nums`}
          value={percentDraft}
          aria-label={`Percent complete for ${row.title}`}
          onChange={(event) => setPercentDraft(event.target.value)}
          onBlur={() => {
            const percentComplete = Math.max(0, Math.min(100, Number(percentDraft || 0)))
            setPercentDraft(String(percentComplete))
            if (percentComplete !== Math.round(row.percentComplete)) void onUpdateActivity(row, { percentComplete })
          }}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
        />
        <span className="text-[10px] text-ink-tertiary">%</span>
      </div>
    )
  }

  return <div className="truncate px-2 text-[11px] text-ink-secondary">{renderColumn(row, column)}</div>
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
  const showLabelInside = !!actual && !isMilestone && row.type !== 'phase' && actual.width >= 150

  return (
    <div className={cn('group/timeline relative isolate overflow-hidden', row.type === 'phase' && 'bg-[#f4f5f7]', isSelected && 'bg-[#eef5ff]')}>
      <div className="flex h-full">
        {units.map((u) => (
          <div
            key={u.key}
            className={cn('h-full border-r border-black/[0.07]', showWeekends && isWeekendUnit(u) && 'bg-warning-500/[0.06]')}
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
            'absolute top-[9px] h-3.5 w-3.5 rotate-45 border border-black/25',
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
            'group absolute min-w-[18px]',
            row.type === 'phase'
              ? 'top-[10px] h-2.5 overflow-visible rounded-none border-0 border-t-[3px] border-ink-primary bg-transparent shadow-none'
              : 'top-[7px] h-4 overflow-hidden rounded-sm border border-black/20 shadow-sm',
            canInteract && 'cursor-grab active:cursor-grabbing',
            row.type !== 'phase' && statusClass(row),
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
                className="absolute left-0 top-0 z-10 h-full w-2 cursor-ew-resize rounded-l-pill bg-black/25 opacity-0 transition-opacity group-hover:opacity-100"
                onMouseDown={(event) => onStartDrag(row, 'resize-start', event)}
              />
              <span
                className="absolute right-0 top-0 z-10 h-full w-2 cursor-ew-resize rounded-r-pill bg-black/25 opacity-0 transition-opacity group-hover:opacity-100"
                onMouseDown={(event) => onStartDrag(row, 'resize-end', event)}
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
            <span className="pointer-events-none absolute inset-0 z-10 truncate px-1.5 text-[10px] font-medium leading-4 text-ink-primary">
              {row.title}
            </span>
          )}
        </div>
      ) : null}
      {actual && canInteract && row.activityId && (
        <>
          <button
            className={cn(
              'absolute top-[9px] z-20 size-2.5 rounded-full border border-primary-500 bg-surface-card opacity-0 shadow-sm transition-opacity focus:opacity-100 group-hover/timeline:opacity-100',
              (isSelected || linkingFrom === row.activityId) && 'opacity-100',
              linkingFrom === row.activityId && 'bg-primary-500'
            )}
            style={{ left: actual.left - 16 }}
            title="Start dependency"
            onMouseDown={(event) => onBeginDependency(row.activityId!, event)}
          />
          <button
            className={cn(
              'absolute top-[9px] z-20 size-2.5 rounded-full border border-primary-500 bg-surface-card opacity-0 shadow-sm transition-opacity focus:opacity-100 group-hover/timeline:opacity-100',
              (isSelected || linkingFrom) && 'opacity-100',
              linkingFrom && linkingFrom !== row.activityId && 'ring-2 ring-primary-500/30'
            )}
            style={{ left: actual.left + actual.width + 4 }}
            title={linkingFrom ? 'Finish dependency' : 'Start dependency'}
            onMouseDown={(event) => linkingFrom ? onCompleteDependency(row.activityId!, event) : onBeginDependency(row.activityId!, event)}
          />
        </>
      )}
      {actual && !showLabelInside && (
        <div className="absolute top-[7px] truncate pl-2 text-[10px] font-medium text-ink-primary" style={{ left: actual.left + actual.width, maxWidth: 200 }}>
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
          className="absolute top-[17px] inline-flex items-center gap-1 rounded bg-surface-card px-1 py-0.5 text-[9px] font-medium text-ink-secondary shadow-sm ring-1 ring-black/[0.08]"
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
          <g key={dependency.id} className="pointer-events-auto cursor-pointer" onClick={() => onDelete(dependency)}>
            <title>{`${pred.row.title} to ${succ.row.title} (${dependency.type})`}</title>
            <path d={path} fill="none" stroke="transparent" strokeWidth="10" />
            <path
              d={path}
              fill="none"
              className={selected ? 'stroke-primary-500' : 'stroke-ink-tertiary'}
              strokeWidth={selected ? 2 : 1.25}
              opacity={selected ? 1 : 0.75}
              markerEnd={selected ? 'url(#gantt-arrow-selected)' : 'url(#gantt-arrow)'}
            />
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

export function buildRows(project: ProjectDetail, sort: GanttSort, segment: GanttSegment): GanttRow[] {
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
      actualHours: null,
      estimatedCost: null,
      actualCost: null,
      tags: [],
      subtasksCount: phaseActivities.length,
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
        actualHours: null,
        estimatedCost: null,
        actualCost: null,
        tags: [],
        subtasksCount: milestone.activities.length,
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
    actualHours: activity.actualHours,
    estimatedCost: activity.estimatedCost,
    actualCost: activity.actualCost,
    tags: activity.tags.map((tag) => tag.label),
    subtasksCount: activity._count.subtasks,
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

export function buildColumnTemplate(columns: OptionalColumn[], taskColumnWidth: number): string {
  const weights: Record<OptionalColumn, number> = {
    owner: 1.1,
    assignee: 1.25,
    subtasks: 0.45,
    tags: 1.1,
    estimatedHours: 0.7,
    actualHours: 0.7,
    estimatedCost: 0.8,
    actualCost: 0.8,
    start: 0.88,
    workingDays: 0.5,
    due: 0.88,
    calendarDays: 0.45,
    status: 1.15,
    priority: 0.75,
    risk: 0.65,
    percent: 0.6,
    slipDays: 0.85,
  }
  return `${taskColumnWidth}px ${columns.map((column) => `minmax(0, ${weights[column]}fr)`).join(' ')}`
}

function renderColumn(row: GanttRow, col: OptionalColumn): string {
  if (col === 'assignee') return row.assigneeId ? shortId(row.assigneeId) : '-'
  if (col === 'subtasks') return row.subtasksCount ? String(row.subtasksCount) : '-'
  if (col === 'tags') return row.tags.length ? row.tags.join(', ') : '-'
  if (col === 'estimatedHours') return row.estimatedHours == null ? '-' : String(row.estimatedHours)
  if (col === 'actualHours') return row.actualHours == null ? '-' : String(row.actualHours)
  if (col === 'estimatedCost') return row.estimatedCost == null ? '-' : String(row.estimatedCost)
  if (col === 'actualCost') return row.actualCost == null ? '-' : String(row.actualCost)
  if (col === 'start') return fmtDate(row.start)
  if (col === 'workingDays') return row.start && row.end ? String(businessDaysBetween(row.start, row.end)) : '-'
  if (col === 'due') return fmtDate(row.end)
  if (col === 'calendarDays') return String(calendarDaysBetween(row.start, row.end))
  if (col === 'status') return ACTIVITY_STATUS_LABEL[row.status as ActivityStatus] ?? labelize(row.status)
  if (col === 'priority') return row.priority ? labelize(row.priority) : '-'
  if (col === 'risk') return row.risk ? labelize(row.risk) : '-'
  if (col === 'percent') return `${Math.round(row.percentComplete)}%`
  if (col === 'owner') return row.ownerParty ? (row.ownerParty === '360GROUND' ? '360Ground' : labelize(row.ownerParty)) : '-'
  if (col === 'slipDays') return row.activityId ? String(row.slipDays) : '-'
  return ''
}

function ownerPartyLabel(ownerParty: string | undefined, clientName: string): string {
  if (ownerParty === 'CLIENT') return clientName
  if (ownerParty === 'SHARED') return 'Shared'
  return ownerParty ? '360Ground' : '-'
}

function calendarDaysBetween(start: Date | null, end: Date | null): number | '-' {
  if (!start || !end || end < start) return '-'
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.floor((endUtc - startUtc) / 86_400_000) + 1
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
