'use client'

/**
 * Schedule grid (left pane) shared by the Gantt and the Table view, plus the
 * pure row/column helpers both use. Split out of GanttChart.tsx so the Table
 * view does not pull the whole Gantt (timeline, dnd-kit, virtualiser, AI and
 * baseline dialogs) into its bundle — ProjectViewSwitcher loads GanttChart
 * lazily with next/dynamic.
 */
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ChevronDown, ChevronRight, GripVertical, Pencil, Plus } from 'lucide-react'
import type { UserForSelection } from '@/hooks/useUsersForSelection'
import { businessDaysBetween } from '@/lib/projects/business-days'
import { rollupActivityStatus } from '@/lib/projects/rollup'
import { compareScheduleItems, isOverdueActivity, type ScheduleSortMode } from '@/lib/projects/schedule-view'
import { cn } from '@/lib/utils'
import {
  ACTIVITY_STATUS_LABEL,
  ACTIVITY_STATUS_TOKEN,
  type ActivityStatus,
  type OwnerParty,
} from '../../types'
import type { ActivityNode, MilestoneNode, PhaseNode, ProjectDetail } from '../../hooks/useProject'
import { ProjectDatePicker } from '../ProjectDatePicker'

export const SCHEDULE_ROW_HEIGHT = 32
export const MIN_TASK_COLUMN_WIDTH = 210
export const DEFAULT_TASK_COLUMN_WIDTH = 260
export const MAX_TASK_COLUMN_WIDTH = 420
export const TASK_COLUMN_WIDTH_KEY = 'projects.gantt.taskColumnWidth.v1'

export type GanttSort = ScheduleSortMode
export type GanttSegment = 'phase' | 'assignee' | 'status' | 'owner'
export type OptionalColumn = 'owner' | 'assignee' | 'subtasks' | 'tags' | 'start' | 'workingDays' | 'due' | 'calendarDays' | 'priority' | 'risk' | 'status' | 'percent' | 'estimatedHours' | 'actualHours' | 'estimatedCost' | 'actualCost' | 'slipDays'
export type GanttRowType = 'phase' | 'milestone' | 'activity' | 'subactivity' | 'actions'

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
    <div className={cn('grid h-full items-center text-xs font-semibold uppercase text-ink-secondary', stickyTaskColumn ? 'overflow-visible' : 'overflow-hidden')} style={{ gridTemplateColumns: columnTemplate }}>
      <div className={cn('relative flex h-full items-center px-2', stickyTaskColumn && 'sticky left-0 z-20 bg-surface-card shadow-[2px_0_0_rgba(0,0,0,0.06)]')}>
        <span>Section / Task</span>
        <button
          type="button"
          className="absolute right-[-4px] top-0 z-10 h-full w-2 cursor-col-resize touch-none bg-transparent hover:bg-primary-100 focus:bg-primary-100 focus:outline-none"
          aria-label="Resize section and task column"
          title="Drag to resize section and task column"
          onPointerDown={(event) => {
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
  onCreateTask,
  onCreateSection,
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
  onCreateTask?: (title: string) => Promise<void>
  onCreateSection?: (name: string) => Promise<void>
  onOpenActivity: (activityId: string) => void
  onRenameActivity: (activityId: string, title: string) => Promise<void>
  onUpdateActivity: (row: GanttRow, patch: Record<string, unknown>) => Promise<void>
  onUpdateDate: (row: GanttRow, field: 'start' | 'due', value: string) => void
  stickyPane?: boolean
  stickyTaskColumn?: boolean
}) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(row.title)
  const [createMode, setCreateMode] = useState<'task' | 'section' | null>(null)
  const [createDraft, setCreateDraft] = useState('')
  const [creating, setCreating] = useState(false)

  const submitInlineCreate = async () => {
    const value = createDraft.trim()
    if (!value || !createMode) return
    setCreating(true)
    try {
      if (createMode === 'task') await onCreateTask?.(value)
      else await onCreateSection?.(value)
      setCreateDraft('')
      setCreateMode(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create schedule item')
    } finally {
      setCreating(false)
    }
  }

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

  if (row.type === 'actions') {
    return (
      <div className="z-30 grid h-full items-center border-r border-ink-primary/[0.14] bg-surface-card text-xs" style={{ gridTemplateColumns: columnTemplate }}>
        <div className={cn('flex h-full min-w-0 items-center gap-1 px-2', stickyTaskColumn && 'sticky left-0 z-20 bg-surface-card shadow-[2px_0_0_rgba(0,0,0,0.06)]')} style={{ paddingLeft: 36 }}>
          {createMode ? (
            <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={(event) => { event.preventDefault(); void submitInlineCreate() }}>
              <input
                autoFocus
                value={createDraft}
                onChange={(event) => setCreateDraft(event.target.value)}
                placeholder={createMode === 'task' ? 'Create a new task...' : 'Create a new section...'}
                minLength={createMode === 'task' ? 3 : 2}
                maxLength={200}
                className="h-7 min-w-0 flex-1 border-b border-primary-400 bg-transparent px-1 text-xs outline-none"
              />
              <button type="submit" className="h-6 rounded bg-primary-500 px-2 font-medium text-primary-foreground disabled:opacity-50" disabled={creating || !createDraft.trim()}>Add</button>
              <button type="button" className="h-6 rounded px-1.5 text-ink-secondary hover:bg-surface-hover" onClick={() => { setCreateMode(null); setCreateDraft('') }} disabled={creating}>Cancel</button>
            </form>
          ) : (
            <>
              <button type="button" className="inline-flex h-6 items-center gap-1 rounded bg-primary-500 px-2 font-medium text-primary-foreground hover:bg-primary-700" onClick={() => setCreateMode('task')} disabled={!canEdit || !row.milestoneId}>
                <Plus className="size-3" /> Add task
              </button>
              <button type="button" className="inline-flex h-6 items-center gap-1 rounded border border-primary-400 px-2 font-medium text-primary-700 hover:bg-primary-50" onClick={() => setCreateMode('section')} disabled={!canEdit}>
                <Plus className="size-3" /> Add section
              </button>
            </>
          )}
        </div>
        {columns.map((column) => <div key={column} />)}
      </div>
    )
  }

  const overdue = isOverdueRow(row)

  return (
    <div
      className={cn(
        'z-30 grid h-full items-center border-r border-ink-primary/[0.14] bg-surface-card text-xs',
        stickyTaskColumn ? 'overflow-visible' : 'overflow-hidden',
        stickyPane && 'shadow-[2px_0_0_rgba(0,0,0,0.04)] md:sticky md:left-0',
        row.type === 'phase' && 'border-y border-ink-primary/[0.12] bg-surface-muted/60',
        row.type === 'milestone' && 'bg-primary-500/[0.07]'
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
            className="h-6 min-w-0 flex-1 rounded border border-primary-500 bg-surface-card px-1.5 text-xs text-ink-primary outline-none ring-2 ring-primary-500/20"
          />
        ) : row.activityId ? (
          <button
            type="button"
            className="min-w-0 flex-1 truncate rounded px-1 text-left text-xs text-ink-primary hover:bg-primary-50 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
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
        {overdue && <span className="shrink-0 rounded bg-danger-50 px-1 py-0.5 text-xs font-semibold uppercase text-danger-700">Overdue</span>}
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

export function GanttGridCell({
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
  const overdue = isOverdueRow(row)
  const controlClass = 'h-6 w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-xs text-ink-primary outline-none hover:border-ink-primary/[0.12] hover:bg-surface-card focus:border-primary-400 focus:bg-surface-card'
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
    return <div className="truncate px-2 text-xs text-ink-secondary" title={value}>{value}</div>
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
      return <div className="truncate px-2 text-xs font-medium text-primary-700" title={`${clientName} team`}>Client team</div>
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
          className={cn('h-7 border-transparent bg-transparent px-1 text-xs hover:border-ink-primary/[0.1]', column === 'due' && overdue && 'font-semibold text-danger-700')}
        />
      </div>
    )
  }

  if (column === 'calendarDays') {
    return <div className="px-1 text-center text-xs tabular-nums text-ink-secondary">{calendarDaysBetween(row.start, row.end)}</div>
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
          className={cn(
            controlClass,
            column === 'risk' && row.risk === 'HIGH' && 'font-semibold text-danger-700',
            column === 'priority' && row.priority === 'CRITICAL' && 'font-semibold text-danger-700',
            column === 'status' && statusClass(row),
            column === 'status' && statusTextClass(row.status as ActivityStatus),
            column === 'status' && overdue && 'ring-1 ring-danger-500'
          )}
          value={value}
          aria-label={`${COLUMN_LABEL[column]} for ${row.title}`}
          onChange={(event) => void onUpdateActivity(row, { [column]: event.target.value || null })}
        >
          {values.map(([optionValue, label]) => (
            <option
              key={optionValue}
              value={optionValue}
              className={column === 'status' && optionValue ? cn(`bg-${ACTIVITY_STATUS_TOKEN[optionValue as ActivityStatus]}`, statusTextClass(optionValue as ActivityStatus)) : undefined}
            >
              {label}
            </option>
          ))}
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
        <span className="text-xs text-ink-tertiary">%</span>
      </div>
    )
  }

  return <div className="truncate px-2 text-xs text-ink-secondary">{renderColumn(row, column)}</div>
}


export function buildRows(project: ProjectDetail, sort: GanttSort, segment: GanttSegment): GanttRow[] {
  const rows: GanttRow[] = []
  const phases = [...project.phases].sort(comparePhase(sort))
  for (const phase of phases) {
    const phaseId = `phase:${phase.id}`
    const phaseActivities = phase.milestones.flatMap((m) => m.activities)
    const phaseLeafStatuses = phaseActivities
      .filter((activity) => !phaseActivities.some((candidate) => candidate.parentActivityId === activity.id))
      .map((activity) => activity.status)
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
      status: rollupActivityStatus(phaseLeafStatuses, phase.status as ActivityStatus),
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
      const milestoneLeafStatuses = milestone.activities
        .filter((activity) => !milestone.activities.some((candidate) => candidate.parentActivityId === activity.id))
        .map((activity) => activity.status)
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
        status: rollupActivityStatus(milestoneLeafStatuses, milestone.status as ActivityStatus),
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
    rows.push({
      id: `actions:${phase.id}`,
      activityId: null,
      milestoneId: phase.milestones[0]?.id ?? null,
      parentActivityId: null,
      parentId: phaseId,
      type: 'actions',
      depth: 1,
      title: `Add to ${phase.name}`,
      position: Number.MAX_SAFE_INTEGER,
      status: '',
      assigneeId: null,
      percentComplete: 0,
      tags: [],
      subtasksCount: 0,
      slipDays: 0,
      commentsCount: 0,
      start: null,
      end: null,
      baselineStart: null,
      baselineEnd: null,
      isMilestone: false,
      waitingSince: null,
      hasChildren: false,
    })
  }
  return rows
}

export function pushActivityRows(rows: GanttRow[], activity: ActivityNode, all: ActivityNode[], parentId: string, depth: number, sort: GanttSort, segment: GanttSegment) {
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


export function statusClass(row: GanttRow): string {
  const status = row.status as ActivityStatus
  const token = ACTIVITY_STATUS_TOKEN[status] ?? ACTIVITY_STATUS_TOKEN.NOT_STARTED
  return `bg-${token}`
}

export function statusTextClass(status: ActivityStatus): string {
  return status === 'FINISHED' ? 'text-white' : status === 'REJECTED' ? 'text-ink-primary' : 'text-ink-primary'
}

export function isOverdueRow(row: GanttRow, now = new Date()): boolean {
  return !!row.activityId && isOverdueActivity(row.status, row.end, now)
}

export function activitySpan(activities: ActivityNode[], kind: 'current' | 'baseline'): { start: Date | null; end: Date | null } | null {
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


export function isoDateOnly(date: Date | null): string | null {
  if (!date) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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

export function renderColumn(row: GanttRow, col: OptionalColumn): string {
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

export function ownerPartyLabel(ownerParty: string | undefined, clientName: string): string {
  if (ownerParty === 'CLIENT') return clientName
  if (ownerParty === 'SHARED') return 'Shared'
  return ownerParty ? '360Ground' : '-'
}

export function calendarDaysBetween(start: Date | null, end: Date | null): number | '-' {
  if (!start || !end || end < start) return '-'
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.floor((endUtc - startUtc) / 86_400_000) + 1
}


export function comparePhase(_sort: GanttSort) {
  return (a: PhaseNode, b: PhaseNode) => a.position - b.position
}

export function compareMilestone(_sort: GanttSort) {
  return (a: MilestoneNode, b: MilestoneNode) => a.position - b.position
}

export function compareActivity(sort: GanttSort, segment: GanttSegment) {
  return (a: ActivityNode, b: ActivityNode) => {
    const segmentCompare = segmentValue(a, segment).localeCompare(segmentValue(b, segment))
    if (segmentCompare) return segmentCompare
    return compareScheduleItems(sort, a, b)
  }
}

export function segmentValue(activity: ActivityNode, segment: GanttSegment): string {
  if (segment === 'assignee') return activity.assigneeId ?? ''
  if (segment === 'status') return activity.status
  if (segment === 'owner') return activity.ownerParty
  return ''
}


export function parseDate(value: string | Date | null): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function fmtDate(value: Date | string | null): string {
  const d = parseDate(value)
  if (!d) return '-'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function labelize(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

export function shortId(value: string): string {
  return value.length > 8 ? value.slice(0, 8) : value
}
