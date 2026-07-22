'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Columns,
  LayoutDashboard,
  MoreHorizontal,
  Network,
  Search,
  Star,
  Table2,
  Users,
  Plus,
} from 'lucide-react'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { useProjectViewStore, type ProjectScheduleView } from '@/lib/stores/project-view-store'
import { cn } from '@/lib/utils'
import { ProjectProgress } from '../ProjectProgress'
import {
  ACTIVITY_STATUS_LABEL,
  ACTIVITY_STATUS_TOKEN,
  ACTIVITY_STATUSES,
  type ActivityStatus,
} from '../../types'
import {
  useProjectWorkload,
  useAddActivity,
  useAddMilestone,
  useAddPhase,
  useUpdateActivity,
  type ActivityNode,
  type ProjectDetail,
} from '../../hooks/useProject'
import {
  DEFAULT_TASK_COLUMN_WIDTH,
  GanttChart,
  MAX_TASK_COLUMN_WIDTH,
  MIN_TASK_COLUMN_WIDTH,
  SCHEDULE_ROW_HEIGHT,
  ScheduleGridHeader,
  ScheduleGridRow,
  TASK_COLUMN_WIDTH_KEY,
  buildColumnTemplate,
  buildRows,
  type GanttRow,
  type OptionalColumn,
} from '../gantt/GanttChart'
import { ActivityDetailPanel } from '../activity/ActivityDetailPanel'
import { ProjectChartsLibrary } from '../charts/ProjectChartsLibrary'
import { ProjectHierarchyMap } from '../mindmap/ProjectHierarchyMap'

interface Props {
  project: ProjectDetail
  canEdit: boolean
}

interface ProjectActivityRow {
  id: string
  title: string
  phase: string
  milestone: string
  status: ActivityStatus
  assigneeId: string | null
  ownerParty: string
  priority: string | null
  risk: string | null
  isBlocked: boolean
  percentComplete: number
  estimatedHours: number | null
  currentStart: string | null
  currentEnd: string | null
  slipDays: number
  commentsCount: number
}

const VIEW_CONFIG: Array<{ key: ProjectScheduleView; label: string; Icon: typeof CalendarDays }> = [
  { key: 'gantt', label: 'Gantt', Icon: CalendarDays },
  { key: 'table', label: 'Table', Icon: Table2 },
  { key: 'board', label: 'Board', Icon: Columns },
  { key: 'workload', label: 'Workload', Icon: Users },
  { key: 'mindmap', label: 'Mindmap', Icon: Network },
  { key: 'overview', label: 'Overview', Icon: LayoutDashboard },
]

const TABLE_COLUMNS: OptionalColumn[] = [
  'subtasks',
  'assignee',
  'owner',
  'tags',
  'estimatedHours',
  'actualHours',
  'estimatedCost',
  'actualCost',
  'start',
  'workingDays',
  'calendarDays',
  'due',
  'priority',
  'risk',
  'slipDays',
  'status',
  'percent',
]
const TABLE_GRID_WIDTH = 1840

export function ProjectViewSwitcher({ project, canEdit }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeView = useProjectViewStore((s) => s.activeView)
  const search = useProjectViewStore((s) => s.search)
  const status = useProjectViewStore((s) => s.status)
  const assignee = useProjectViewStore((s) => s.assignee)
  const priority = useProjectViewStore((s) => s.priority)
  const risk = useProjectViewStore((s) => s.risk)
  const favoriteViews = useProjectViewStore((s) => s.favoriteViews)
  const setActiveView = useProjectViewStore((s) => s.setActiveView)
  const toggleFavorite = useProjectViewStore((s) => s.toggleFavorite)
  const setSearch = useProjectViewStore((s) => s.setSearch)
  const setStatus = useProjectViewStore((s) => s.setStatus)
  const updateActivity = useUpdateActivity(project.id)
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)

  useEffect(() => {
    const activityId = searchParams.get('activity')
    if (activityId) setSelectedActivityId(activityId)
  }, [searchParams])

  const rows = useMemo(() => flattenProjectActivities(project), [project])
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      const matchesSearch = !q || [row.title, row.phase, row.milestone, row.ownerParty, row.assigneeId ?? '']
        .some((value) => value.toLowerCase().includes(q))
      const matchesStatus = !status || row.status === status
      const matchesAssignee = !assignee || (assignee === 'UNASSIGNED' ? !row.assigneeId : row.assigneeId === assignee)
      const matchesPriority = !priority || row.priority === priority
      const matchesRisk = !risk || row.risk === risk
      return matchesSearch && matchesStatus && matchesAssignee && matchesPriority && matchesRisk
    })
  }, [rows, search, status, assignee, priority, risk])
  const filteredActivityIds = useMemo(() => filteredRows.map((row) => row.id), [filteredRows])

  const changeActivityStatus = async (activityId: string, nextStatus: ActivityStatus) => {
    try {
      await updateActivity.mutateAsync({ activityId, status: nextStatus })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Stage gate has not passed. Proceed anyway?'
      if (nextStatus !== 'STARTED' || !/has not passed/i.test(message)) return
      const reason = window.prompt(`${message}\n\nOverride reason:`)
      if (!reason?.trim()) return
      await updateActivity.mutateAsync({ activityId, status: nextStatus, gateOverrideReason: reason.trim() })
    }
  }

  return (
    <section className="min-h-0 flex-1 bg-surface-app">
      <div className="flex min-h-10 flex-wrap items-end justify-between gap-2 border-b border-black/[0.08] bg-white px-3">
        <div className="flex self-stretch">
          {VIEW_CONFIG.map(({ key, label, Icon }) => (
            <div key={key} className="relative flex items-center">
              <button
                type="button"
                onClick={() => setActiveView(key)}
                className={cn(
                  'inline-flex h-full items-center gap-1 px-2 py-2 text-[12px] font-medium transition',
                  activeView === key ? 'text-ink-primary' : 'text-ink-tertiary hover:text-ink-primary'
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
              {favoriteViews.includes(key) && <Star className="mr-1 size-3.5 fill-current text-ink-secondary" aria-label={`${label} is a favorite`} />}
              {activeView === key && (
                <>
                  <button type="button" onClick={() => toggleFavorite(key)} className="mr-1 rounded p-1 text-ink-secondary hover:bg-surface-hover" aria-label={`Toggle ${label} favorite`}>
                    <MoreHorizontal className="size-3.5" />
                  </button>
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary-500" />
                </>
              )}
            </div>
          ))}
        </div>
        {activeView !== 'gantt' && <div className="flex flex-wrap items-center gap-2 py-2">
          <div className="flex items-center gap-1 rounded-md border border-black/[0.08] bg-surface-card px-2 py-1">
            <Search className="size-3.5 text-ink-tertiary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter activities"
              className="w-52 bg-transparent text-body-sm text-ink-primary outline-none placeholder:text-ink-tertiary"
            />
          </div>
          <select
            className={cn('rounded-md border border-black/[0.08] px-2 py-1 text-body-sm', status ? statusBg(status as ActivityStatus) : 'bg-surface-card')}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {ACTIVITY_STATUSES.map((s) => <option key={s} value={s} className={statusBg(s)}>{ACTIVITY_STATUS_LABEL[s]}</option>)}
          </select>
        </div>}
      </div>

      <div className={activeView === 'gantt' || activeView === 'table' ? 'p-1.5' : 'p-3'}>
      {activeView === 'gantt' && <GanttChart project={project} canEdit={canEdit} onActivityOpen={setSelectedActivityId} />}
      {activeView === 'table' && (
        <ProjectTableView
          project={project}
          rows={filteredRows}
          canEdit={canEdit}
          onOpen={setSelectedActivityId}
          onStatusChange={changeActivityStatus}
        />
      )}
      {activeView === 'board' && (
        <ProjectBoardView
          project={project}
          rows={filteredRows}
          canEdit={canEdit}
          isSaving={updateActivity.isPending}
          onOpen={setSelectedActivityId}
        />
      )}
      {activeView === 'workload' && <ProjectWorkloadView project={project} rows={filteredRows} />}
      {activeView === 'mindmap' && (
        <ProjectHierarchyMap
          project={project}
          visibleActivityIds={filteredActivityIds}
          isFiltered={filteredRows.length !== rows.length}
          onOpenActivity={setSelectedActivityId}
        />
      )}
      {activeView === 'overview' && <ProjectOverviewView project={project} rows={filteredRows} allRows={rows} />}
      </div>
      <ActivityDetailPanel project={project} activityId={selectedActivityId} canEdit={canEdit} onClose={() => { setSelectedActivityId(null); if (searchParams.has('activity')) router.replace(pathname, { scroll: false }) }} />
    </section>
  )
}

function ProjectTableView({
  project,
  rows,
  canEdit,
  onOpen,
  onStatusChange,
}: {
  project: ProjectDetail
  rows: ProjectActivityRow[]
  canEdit: boolean
  onOpen: (activityId: string) => void
  onStatusChange: (activityId: string, status: ActivityStatus) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [taskColumnWidth, setTaskColumnWidth] = useState(DEFAULT_TASK_COLUMN_WIDTH)
  const [widthHydrated, setWidthHydrated] = useState(false)
  const addActivity = useAddActivity(project.id)
  const addPhase = useAddPhase(project.id)
  const addMilestone = useAddMilestone(project.id)
  const updateActivity = useUpdateActivity(project.id)
  const { users } = useUsersForSelection()
  const visibleIds = useMemo(() => new Set(rows.map((row) => row.id)), [rows])
  const userNames = useMemo(() => new Map(users.map((user) => [user.id, user.name ?? user.email])), [users])
  const allScheduleRows = useMemo(() => buildRows(project, 'manual', 'phase'), [project])
  const scheduleRows = useMemo(() => visibleScheduleRows(allScheduleRows, visibleIds, collapsed), [allScheduleRows, collapsed, visibleIds])
  const columnTemplate = buildColumnTemplate(TABLE_COLUMNS, taskColumnWidth)

  useEffect(() => {
    const savedValue = localStorage.getItem(TASK_COLUMN_WIDTH_KEY)
    const savedWidth = savedValue === null ? null : Number(savedValue)
    if (savedWidth !== null && Number.isFinite(savedWidth)) {
      setTaskColumnWidth(Math.min(MAX_TASK_COLUMN_WIDTH, Math.max(MIN_TASK_COLUMN_WIDTH, savedWidth)))
    }
    setWidthHydrated(true)
  }, [])

  useEffect(() => {
    if (!widthHydrated) return
    localStorage.setItem(TASK_COLUMN_WIDTH_KEY, String(taskColumnWidth))
  }, [taskColumnWidth, widthHydrated])

  const addTaskToMilestone = async (milestoneId: string) => {
    const title = window.prompt('Task name')?.trim()
    if (!title) return
    await createTaskInMilestone(milestoneId, title)
  }

  const createTaskInMilestone = async (milestoneId: string, title: string) => {
    await addActivity.mutateAsync({ milestoneId, title, ownerParty: '360GROUND', weight: 1 })
  }

  const addSection = async () => {
    const name = window.prompt('Section name')?.trim()
    if (!name) return
    await createSection(name)
  }

  const createSection = async (name: string) => {
    const phase = await addPhase.mutateAsync({ name, weight: 1 }) as { id: string }
    await addMilestone.mutateAsync({ phaseId: phase.id, name: 'General', weight: 1 })
  }

  const resizeTaskColumnStart = (clientX: number) => {
    const startX = clientX
    const startWidth = taskColumnWidth
    const onMove = (event: MouseEvent) => {
      setTaskColumnWidth(Math.min(MAX_TASK_COLUMN_WIDTH, Math.max(MIN_TASK_COLUMN_WIDTH, startWidth + event.clientX - startX)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const updateGridActivity = async (row: GanttRow, patch: Record<string, unknown>) => {
    if (!row.activityId) return
    if (typeof patch.status === 'string') {
      await onStatusChange(row.activityId, patch.status as ActivityStatus)
      return
    }
    await updateActivity.mutateAsync({ activityId: row.activityId, ...patch })
  }

  const updateGridDate = (row: GanttRow, field: 'start' | 'due', value: string) => {
    if (!row.activityId || !value) return
    const date = new Date(`${value}T00:00:00`)
    const currentStart = field === 'start' ? date : (row.start ?? date)
    const currentEnd = field === 'due' ? date : (row.end ?? date)
    if (currentEnd < currentStart) return
    updateActivity.mutate({ activityId: row.activityId, currentStart: currentStart.toISOString(), currentEnd: currentEnd.toISOString() })
  }

  const openTaskCreator = (row: GanttRow) => {
    if (row.type === 'phase') {
      const phase = project.phases.find((item) => `phase:${item.id}` === row.id)
      const milestoneId = phase?.milestones[0]?.id
      if (milestoneId) void addTaskToMilestone(milestoneId)
      return
    }
    if (row.milestoneId) void addTaskToMilestone(row.milestoneId)
  }

  return (
    <div className="w-full overflow-hidden border border-black/[0.08] bg-white">
      <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 178px)' }}>
        <div style={{ width: TABLE_GRID_WIDTH, minWidth: '100%' }}>
          <div className="sticky top-0 z-40 h-10 border-b border-black/[0.12] bg-white">
            <ScheduleGridHeader columns={TABLE_COLUMNS} columnTemplate={columnTemplate} onResizeTaskColumnStart={resizeTaskColumnStart} stickyTaskColumn />
          </div>
          {scheduleRows.map((row) => (
            <div key={row.id} style={{ height: SCHEDULE_ROW_HEIGHT }}>
              <ScheduleGridRow
                row={row}
                collapsed={collapsed.has(row.id)}
                columns={TABLE_COLUMNS}
                columnTemplate={columnTemplate}
                users={users}
                userNames={userNames}
                clientName={project.clientName}
                canEdit={canEdit}
                reorderEnabled={false}
                dragHandleProps={{}}
                onToggle={() => setCollapsed((current) => toggleSet(current, row.id))}
                onAddTask={() => openTaskCreator(row)}
                onCreateTask={async (title) => {
                  if (!row.milestoneId) throw new Error('This section needs a subsection before tasks can be added.')
                  await createTaskInMilestone(row.milestoneId, title)
                }}
                onCreateSection={createSection}
                onOpenActivity={onOpen}
                onRenameActivity={async (activityId, title) => { await updateActivity.mutateAsync({ activityId, title }) }}
                onUpdateActivity={updateGridActivity}
                onUpdateDate={updateGridDate}
                stickyPane={false}
                stickyTaskColumn
              />
            </div>
          ))}
          {scheduleRows.length === 0 && <div className="flex h-48 items-center justify-center text-body-sm text-ink-secondary">No schedule rows match the current filters.</div>}
        </div>
      </div>
      <div className="flex h-9 items-center justify-between border-t border-black/[0.08] bg-white px-2 text-[11px] text-ink-tertiary">
        <span>{scheduleRows.length} visible rows · timeline hidden</span>
        {canEdit && <button className="inline-flex items-center gap-1 font-medium text-primary-700 hover:underline" disabled={addPhase.isPending || addMilestone.isPending} onClick={() => void addSection()}><Plus className="size-3.5" /> Add section</button>}
      </div>
    </div>
  )
}

function ProjectBoardView({
  project,
  rows,
  canEdit,
  isSaving,
  onOpen,
}: {
  project: ProjectDetail
  rows: ProjectActivityRow[]
  canEdit: boolean
  isSaving: boolean
  onOpen: (activityId: string) => void
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const addActivity = useAddActivity(project.id)
  const addPhase = useAddPhase(project.id)
  const addMilestone = useAddMilestone(project.id)
  const updateActivity = useUpdateActivity(project.id)
  const visible = useMemo(() => new Set(rows.map((row) => row.id)), [rows])

  const addTask = async (milestoneId: string) => {
    const title = window.prompt('Task name')?.trim()
    if (!title) return
    await addActivity.mutateAsync({ milestoneId, title, ownerParty: '360GROUND', weight: 1 })
  }

  const addSection = async () => {
    const name = window.prompt('Section name')?.trim()
    if (!name) return
    const phase = await addPhase.mutateAsync({ name, weight: 1 }) as { id: string }
    await addMilestone.mutateAsync({ phaseId: phase.id, name: 'General', weight: 1 })
  }

  return (
    <div className="flex min-h-[calc(100vh-165px)] gap-4 overflow-x-auto bg-[#f2f3f6] p-1 pb-4">
      {project.phases.map((phase) => {
        const phaseRows = phase.milestones.flatMap((milestone) => milestone.activities).filter((activity) => visible.has(activity.id))
        const targetMilestone = phase.milestones[0]
        return (
          <div
            key={phase.id}
            className="w-[315px] shrink-0 self-start overflow-hidden rounded-md border border-black/[0.1] bg-white shadow-sm"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (!canEdit || !draggedId || isSaving || !targetMilestone) return
              updateActivity.mutate({ activityId: draggedId, milestoneId: targetMilestone.id })
              setDraggedId(null)
            }}
          >
            <div className="flex items-center gap-2 border-b border-black/[0.08] px-3 py-3">
              <span className="truncate text-[13px] font-semibold text-ink-primary">{phase.name}</span>
              <span className="ml-auto text-[11px] text-ink-tertiary">{phaseRows.length}</span>
              {canEdit && targetMilestone && <button type="button" className="rounded p-1 hover:bg-surface-hover" onClick={() => void addTask(targetMilestone.id)} aria-label={`Add task to ${phase.name}`}><Plus className="size-4" /></button>}
            </div>
            <div className="space-y-2 p-2">
              {phaseRows.length === 0 ? (
                <div className="flex h-24 items-center justify-center rounded border border-dashed border-black/[0.08] text-[12px] text-ink-tertiary">Drop here</div>
              ) : phaseRows.map((activity) => {
                const row = rows.find((candidate) => candidate.id === activity.id)!
                const childCount = activity._count.subtasks
                return (
                <div
                  key={row.id}
                  draggable={canEdit}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    setDraggedId(row.id)
                  }}
                  onDragEnd={() => setDraggedId(null)}
                  onClick={() => onOpen(row.id)}
                  className={cn('rounded-md border border-black/[0.08] bg-white p-3 shadow-sm transition hover:border-primary-300 hover:shadow-card', canEdit && 'cursor-grab active:cursor-grabbing')}
                  style={{ opacity: draggedId === row.id ? 0.45 : undefined }}
                >
                  <div className="text-body-sm font-medium text-ink-primary">{row.title}</div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-tertiary">
                    <span>{row.assigneeId ? 'Assigned' : 'Unassigned'}</span>
                    {childCount > 0 && <span>{childCount} subtask{childCount === 1 ? '' : 's'}</span>}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-ink-secondary">
                    <StatusPill status={row.status} />
                    <span className="flex size-8 items-center justify-center rounded-full border-[3px] border-primary-100 font-semibold">{Math.round(row.percentComplete)}%</span>
                  </div>
                </div>
              )})}
              {canEdit && targetMilestone && <button type="button" className="flex w-full items-center gap-1 rounded-md border border-dashed border-black/[0.12] px-3 py-2 text-[12px] font-medium text-ink-secondary hover:bg-surface-hover" onClick={() => void addTask(targetMilestone.id)}><Plus className="size-3.5" /> Create new task</button>}
            </div>
          </div>
        )
      })}
      {canEdit && <button type="button" className="flex w-[315px] shrink-0 items-center gap-2 self-start rounded-md border border-dashed border-black/[0.14] bg-white px-4 py-3 text-[13px] font-semibold text-ink-secondary shadow-sm hover:bg-surface-hover" onClick={() => void addSection()}><Plus className="size-4" /> Create new section</button>}
    </div>
  )
}

function ProjectWorkloadView({ project, rows }: { project: ProjectDetail; rows: ProjectActivityRow[] }) {
  const { data, isLoading, isError } = useProjectWorkload()
  const { users } = useUsersForSelection()
  const userNames = useMemo(() => new Map(users.map((user) => [user.id, user.name ?? user.email])), [users])
  const start = useMemo(() => {
    const dated = rows.flatMap((row) => row.currentStart ? [new Date(row.currentStart)] : [])
    const earliest = dated.length ? new Date(Math.min(...dated.map((date) => date.getTime()))) : new Date(project.plannedStart)
    earliest.setHours(0, 0, 0, 0)
    return earliest
  }, [project.plannedStart, rows])
  const days = 56
  const members = useMemo(() => {
    const map = new Map<string, ProjectActivityRow[]>()
    for (const row of rows) {
      const key = row.assigneeId ?? 'UNASSIGNED'
      map.set(key, [...(map.get(key) ?? []), row])
    }
    if (!map.has('UNASSIGNED')) map.set('UNASSIGNED', [])
    return [...map.entries()].map(([id, tasks]) => ({
      id,
      name: id === 'UNASSIGNED' ? 'Unassigned' : userNames.get(id) ?? 'Project member',
      tasks: tasks.filter((task) => task.currentStart && task.currentEnd),
      hours: tasks.reduce((sum, task) => sum + (task.estimatedHours ?? 0), 0),
      ownerParties: [...new Set(tasks.map((task) => task.ownerParty))],
      ownerPartyCounts: tasks.reduce<Record<string, number>>((counts, task) => {
        counts[task.ownerParty] = (counts[task.ownerParty] ?? 0) + 1
        return counts
      }, {}),
    }))
  }, [rows, userNames])
  if (isLoading) return <div className="rounded-card border border-black/[0.08] bg-surface-card p-6 text-body-sm text-ink-secondary">Loading workload...</div>
  if (isError || !data) return <div className="rounded-card border border-black/[0.08] bg-surface-card p-6 text-body-sm text-danger-600">Workload unavailable.</div>

  return (
    <div className="overflow-hidden rounded-card border border-black/[0.08] bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-black/[0.08] px-3 py-2">
        <div><div className="text-body font-medium text-ink-primary">Project workload</div><div className="text-[11px] text-ink-tertiary">Dated tasks by project member · organization capacity remains available in the allocation summary</div></div>
        <div className="text-body-sm text-ink-secondary">{members.length} members · {data.people.length} active organization-wide</div>
      </div>
      <div className="overflow-auto">
        <div className="min-w-[1180px]">
          <div className="grid border-b border-black/[0.08]" style={{ gridTemplateColumns: '230px 140px minmax(900px,1fr)' }}>
            <div className="bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Project members</div>
            <div className="border-l border-black/[0.06] bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Owner party</div>
            <div className="grid bg-surface-muted/40" style={{ gridTemplateColumns: 'repeat(8,1fr)' }}>
              {Array.from({ length: 8 }, (_, index) => {
                const date = addCalendarDays(start, index * 7)
                return <div key={index} className="border-l border-black/[0.06] px-2 py-2 text-center text-[11px] font-medium text-ink-secondary">W{isoWeek(date)} · {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
              })}
            </div>
          </div>
          {members.map((member) => {
            const capacity = data.people.find((person) => person.userId === (member.id === 'UNASSIGNED' ? null : member.id))
            const height = Math.max(72, member.tasks.length * 26 + 18)
            return (
              <div key={member.id} className="grid border-b border-black/[0.05]" style={{ gridTemplateColumns: '230px 140px minmax(900px,1fr)' }}>
                <div className="bg-white px-3 py-3" style={{ height }}>
                  <div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-700">{member.name.slice(0, 2).toUpperCase()}</span><div><div className="text-body-sm font-medium text-ink-primary">{member.name}</div><div className="text-[11px] text-ink-tertiary">{member.hours}h estimated · {capacity?.maxAllocationPct ?? 0}% max allocation</div></div></div>
                </div>
                <div className="flex flex-wrap content-start gap-1 border-l border-black/[0.06] bg-white px-2 py-3" style={{ height }}>
                  {member.ownerParties.length === 0
                    ? <span className="text-[11px] text-ink-tertiary">-</span>
                    : member.ownerParties.map((party) => <span key={party} className={cn('h-5 rounded px-1.5 text-[10px] font-medium leading-5', ownerPartyTone(party))}>{ownerPartyLabel(party, project.clientName)} · {member.ownerPartyCounts[party]}</span>)}
                </div>
                <div className="relative bg-[repeating-linear-gradient(to_right,transparent_0,transparent_calc(12.5%-1px),rgba(0,0,0,0.055)_calc(12.5%-1px),rgba(0,0,0,0.055)_12.5%)]" style={{ height }}>
                  {member.tasks.map((task, taskIndex) => {
                    const leftDays = differenceInCalendarDays(new Date(task.currentStart!), start)
                    const duration = Math.max(1, differenceInCalendarDays(new Date(task.currentEnd!), new Date(task.currentStart!)) + 1)
                    if (leftDays >= days || leftDays + duration < 0) return null
                    return <div key={task.id} title={`${task.title} · ${ownerPartyLabel(task.ownerParty, project.clientName)}`} className={cn('absolute flex h-5 min-w-0 items-center gap-1 overflow-hidden rounded border px-1.5 text-[10px] leading-5', ownerPartyBarTone(task.ownerParty))} style={{ top: 10 + taskIndex * 26, left: `${Math.max(0, leftDays) / days * 100}%`, width: `${Math.min(duration, days - Math.max(0, leftDays)) / days * 100}%` }}><span className="shrink-0 rounded bg-white/70 px-1 font-semibold">{ownerPartyShortLabel(task.ownerParty, project.clientName)}</span><span className="truncate">{task.title}</span></div>
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ProjectOverviewView({ project, rows, allRows }: { project: ProjectDetail; rows: ProjectActivityRow[]; allRows: ProjectActivityRow[] }) {
  const { users } = useUsersForSelection()
  const userNames = useMemo(() => new Map(users.map((user) => [user.id, user.name ?? user.email])), [users])
  const highRisk = allRows.filter((row) => row.risk === 'HIGH').length
  const waiting = allRows.filter((row) => row.status === 'APPROVAL_REQUESTED').length
  const slipping = allRows.filter((row) => row.slipDays > 0).length
  const blocked = allRows.filter((row) => row.isBlocked).length
  const active = allRows.filter((row) => row.status === 'STARTED' || row.status === 'APPROVAL_REQUESTED').length
  const done = allRows.filter((row) => row.status === 'FINISHED' || row.status === 'APPROVED').length
  const variance = project.percentComplete - project.percentPlanned
  const resourceRows = useMemo(() => {
    const grouped = new Map<string, ProjectActivityRow[]>()
    for (const row of allRows) {
      const key = row.assigneeId ?? 'UNASSIGNED'
      grouped.set(key, [...(grouped.get(key) ?? []), row])
    }
    return [...grouped.entries()].map(([id, tasks]) => ({ id, name: id === 'UNASSIGNED' ? 'Unassigned' : userNames.get(id) ?? 'Project member', tasks, hours: tasks.reduce((sum, task) => sum + (task.estimatedHours ?? 0), 0) }))
  }, [allRows, userNames])

  return (
    <div className="space-y-3">
      <OverviewTimeline project={project} />

      <section className="overflow-hidden rounded-lg border border-black/[0.08] bg-surface-card shadow-sm">
        <div className="grid grid-cols-2 divide-y divide-black/[0.06] sm:grid-cols-3 lg:grid-cols-[minmax(260px,1.35fr)_repeat(6,minmax(105px,1fr))] lg:divide-x lg:divide-y-0">
          <div className="col-span-2 p-3 sm:col-span-3 lg:col-span-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-body-sm font-semibold text-ink-primary">Overall project completion</div>
                <div className="mt-0.5 text-[11px] text-ink-tertiary">Weighted from activity completion through sections and phases</div>
              </div>
              <ProjectProgress actual={project.percentComplete} planned={project.percentPlanned} variant="value" className="shrink-0 font-semibold" />
            </div>
            <ProjectProgress actual={project.percentComplete} planned={project.percentPlanned} className="mt-2" />
          </div>
          <OverviewMetric icon={BarChart3} label="Activities shown" value={rows.length} helper={`of ${allRows.length} total`} />
          <OverviewMetric icon={CheckCircle2} label="Completed activities" value={done} helper={`${allRows.length ? Math.round(done / allRows.length * 100) : 0}% of total`} />
          <OverviewMetric icon={Clock3} label="Active activities" value={active} helper="started or awaiting approval" />
          <OverviewMetric icon={AlertTriangle} label="High-risk activities" value={highRisk} tone={highRisk ? 'warning' : 'normal'} />
          <OverviewMetric icon={AlertTriangle} label="Baseline-delayed activities" value={slipping} tone={slipping ? 'danger' : 'normal'} />
          <OverviewMetric icon={Clock3} label="Schedule variance" value={`${variance > 0 ? '+' : ''}${Math.round(variance)}%`} helper="actual minus planned" tone={variance < -5 ? 'warning' : 'normal'} />
        </div>
        <div className="grid border-t border-black/[0.06] md:grid-cols-3 md:divide-x md:divide-black/[0.06]">
          <Register title="High-risk activities" rows={allRows.filter((row) => row.risk === 'HIGH').slice(0, 5)} empty="No high-risk activities." />
          <Register title="Activities awaiting approval" rows={allRows.filter((row) => row.status === 'APPROVAL_REQUESTED').slice(0, 5)} empty="No activities are awaiting approval." />
          <Register title="Activities delayed from baseline" rows={allRows.filter((row) => row.slipDays > 0).sort((a, b) => b.slipDays - a.slipDays).slice(0, 5)} empty="No baseline schedule delays are recorded." />
        </div>
        {(waiting > 0 || blocked > 0) && <div className="border-t border-black/[0.06] px-3 py-1.5 text-[11px] text-ink-tertiary">{waiting} awaiting approval · {blocked} blocked</div>}
      </section>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-body-sm font-semibold text-ink-primary">Project reports</h3>
          <span className="text-[11px] text-ink-tertiary">Calculated from current project records</span>
        </div>
        <ProjectChartsLibrary project={project} />
      </div>

      <div className="overflow-hidden rounded-lg border border-black/[0.08] bg-white shadow-sm">
        <div className="border-b border-black/[0.08] px-3 py-2"><h3 className="text-body-sm font-semibold text-ink-primary">Project resource activity</h3></div>
        <table className="w-full text-left text-body-sm">
          <thead className="bg-surface-muted/50 text-[10px] uppercase tracking-wide text-ink-tertiary"><tr><th className="px-3 py-1.5">User or resource</th><th className="px-3 py-1.5 text-right">Assigned activities</th><th className="px-3 py-1.5 text-right">Estimated hours</th><th className="px-3 py-1.5 text-right">Completed activities</th><th className="px-3 py-1.5">Delivery status</th></tr></thead>
          <tbody>{resourceRows.map((resource) => { const completed = resource.tasks.filter((task) => task.status === 'FINISHED' || task.status === 'APPROVED').length; return <tr key={resource.id} className="border-t border-black/[0.05]"><td className="px-3 py-1.5 font-medium text-ink-primary">{resource.name}</td><td className="px-3 py-1.5 text-right tabular-nums">{resource.tasks.length}</td><td className="px-3 py-1.5 text-right tabular-nums">{resource.hours}</td><td className="px-3 py-1.5 text-right tabular-nums">{completed}</td><td className="px-3 py-1.5"><span className={cn('rounded-full px-2 py-0.5 text-[10px]', completed === resource.tasks.length && resource.tasks.length ? 'bg-success-50 text-success-700' : 'bg-primary-50 text-primary-700')}>{completed === resource.tasks.length && resource.tasks.length ? 'Complete' : 'In progress'}</span></td></tr> })}</tbody>
        </table>
      </div>
    </div>
  )
}

function OverviewTimeline({ project }: { project: ProjectDetail }) {
  const phaseRows = project.phases.map((phase) => {
    const activities = phase.milestones.flatMap((milestone) => milestone.activities).filter((activity) => activity.currentStart && activity.currentEnd)
    const start = activities.length ? new Date(Math.min(...activities.map((activity) => new Date(activity.currentStart!).getTime()))) : null
    const end = activities.length ? new Date(Math.max(...activities.map((activity) => new Date(activity.currentEnd!).getTime()))) : null
    return { id: phase.id, name: phase.name, start, end }
  }).filter((phase): phase is { id: string; name: string; start: Date; end: Date } => Boolean(phase.start && phase.end))
  const rangeStart = new Date(Math.min(new Date(project.plannedStart).getTime(), ...phaseRows.map((phase) => phase.start.getTime())))
  const rangeEnd = new Date(Math.max(new Date(project.plannedEnd).getTime(), ...phaseRows.map((phase) => phase.end.getTime())))
  const totalDays = Math.max(1, differenceInCalendarDays(rangeEnd, rangeStart) + 1)
  const todayOffset = differenceInCalendarDays(new Date(), rangeStart) / totalDays * 100
  return (
    <div className="overflow-hidden rounded-lg border border-black/[0.08] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-black/[0.08] px-3 py-2"><h3 className="text-body-sm font-semibold text-ink-primary">Current phase schedule</h3><span className="text-[11px] text-ink-tertiary">{fmtDate(rangeStart.toISOString())} – {fmtDate(rangeEnd.toISOString())}</span></div>
      <div className="overflow-x-auto p-3">
        <div className="min-w-[680px] space-y-1.5">
        {phaseRows.map((phase) => {
          const left = Math.max(0, differenceInCalendarDays(phase.start, rangeStart)) / totalDays * 100
          const width = Math.max(1.5, (differenceInCalendarDays(phase.end, phase.start) + 1) / totalDays * 100)
          return <div key={phase.id} className="grid grid-cols-[minmax(150px,220px)_1fr_110px] items-center gap-3">
            <div className="truncate text-[11px] font-medium text-ink-secondary" title={phase.name}>{phase.name}</div>
            <div className="relative h-5 overflow-hidden rounded bg-surface-muted">
              {todayOffset >= 0 && todayOffset <= 100 && <span className="absolute inset-y-0 z-10 w-px bg-danger-500" style={{ left: `${todayOffset}%` }} title="Today" />}
              <div className="absolute inset-y-1 rounded bg-primary-500" style={{ left: `${left}%`, width: `${Math.min(100 - left, width)}%` }} />
            </div>
            <div className="text-right text-[10px] tabular-nums text-ink-tertiary">{fmtDate(phase.start.toISOString())} – {fmtDate(phase.end.toISOString())}</div>
          </div>
        })}
        {phaseRows.length === 0 && <div className="py-4 text-center text-body-sm text-ink-tertiary">No scheduled phase activities.</div>}
        </div>
      </div>
    </div>
  )
}

function flattenProjectActivities(project: ProjectDetail): ProjectActivityRow[] {
  const rows: ProjectActivityRow[] = []
  for (const phase of project.phases) {
    for (const milestone of phase.milestones) {
      for (const activity of milestone.activities) {
        pushActivity(rows, activity, phase.name, milestone.name)
      }
    }
  }
  return rows
}

function pushActivity(rows: ProjectActivityRow[], activity: ActivityNode, phase: string, milestone: string) {
  rows.push({
    id: activity.id,
    title: activity.title,
    phase,
    milestone,
    status: activity.status,
    assigneeId: activity.assigneeId,
    ownerParty: activity.ownerParty,
    priority: activity.priority,
    risk: activity.risk,
    isBlocked: activity.isBlocked,
    percentComplete: activity.percentComplete,
    estimatedHours: activity.estimatedHours,
    currentStart: activity.currentStart,
    currentEnd: activity.currentEnd,
    slipDays: activity.slipDays,
    commentsCount: activity._count.comments,
  })
}

function StatusPill({ status }: { status: ActivityStatus }) {
  return <span className={cn('rounded-pill px-2 py-0.5 text-[11px] font-medium', statusBg(status), 'text-ink-primary')}>{ACTIVITY_STATUS_LABEL[status]}</span>
}

function OverviewMetric({ icon: Icon, label, value, helper, tone = 'normal' }: { icon: typeof BarChart3; label: string; value: string | number; helper?: string; tone?: 'normal' | 'warning' | 'danger' }) {
  return (
    <div className={cn('min-w-0 p-3', tone === 'warning' && 'bg-warning-50', tone === 'danger' && 'bg-danger-50')}>
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-ink-tertiary"><Icon className="size-3.5" /> <span className="truncate">{label}</span></div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-ink-primary">{value}</div>
      {helper && <div className="truncate text-[10px] text-ink-tertiary">{helper}</div>}
    </div>
  )
}

function Register({ title, rows, empty }: { title: string; rows: ProjectActivityRow[]; empty: string }) {
  return (
    <div className="min-w-0 p-3">
      <div className="mb-1.5 text-[11px] font-semibold text-ink-primary">{title}</div>
      {rows.length === 0 ? (
        <div className="py-1 text-[11px] text-ink-tertiary">{empty}</div>
      ) : (
        <div className="divide-y divide-black/[0.05]">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3 py-1.5">
              <div className="min-w-0"><div className="truncate text-[11px] font-medium text-ink-primary">{row.title}</div><div className="truncate text-[10px] text-ink-tertiary">{row.phase}</div></div>
              <span className="shrink-0 text-[10px] text-ink-tertiary">{row.slipDays > 0 ? `${row.slipDays} days` : ACTIVITY_STATUS_LABEL[row.status]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function statusBg(status: ActivityStatus): string {
  return `bg-${ACTIVITY_STATUS_TOKEN[status]}`
}

function ownerPartyLabel(party: string, clientName: string): string {
  if (party === 'CLIENT') return clientName
  if (party === 'SHARED') return 'Shared'
  return '360Ground'
}

function ownerPartyShortLabel(party: string, clientName: string): string {
  if (party === 'CLIENT') return clientName.length > 14 ? 'Client' : clientName
  if (party === 'SHARED') return 'Shared'
  return '360Ground'
}

function ownerPartyTone(party: string): string {
  if (party === 'CLIENT') return 'bg-warning-50 text-warning-800'
  if (party === 'SHARED') return 'bg-[#f1ecff] text-[#5b3fa8]'
  return 'bg-primary-50 text-primary-700'
}

function ownerPartyBarTone(party: string): string {
  if (party === 'CLIENT') return 'border-warning-500 bg-warning-100 text-warning-900'
  if (party === 'SHARED') return 'border-[#8b6dcc] bg-[#e5dcfa] text-[#442d7c]'
  return 'border-primary-500 bg-sky-200 text-primary-900'
}

function toggleSet(current: Set<string>, id: string) {
  const next = new Set(current)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

function visibleScheduleRows(allRows: GanttRow[], visibleActivityIds: Set<string>, collapsed: Set<string>): GanttRow[] {
  const byId = new Map(allRows.map((row) => [row.id, row]))
  const included = new Set<string>()

  for (const row of allRows) {
    if (!row.activityId || !visibleActivityIds.has(row.activityId)) continue
    let current: GanttRow | undefined = row
    while (current) {
      included.add(current.id)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
  }

  for (const row of allRows) {
    if (row.type === 'actions' && row.parentId && included.has(row.parentId)) included.add(row.id)
  }

  return allRows.filter((row) => {
    if (!included.has(row.id)) return false
    let parentId = row.parentId
    while (parentId) {
      if (collapsed.has(parentId)) return false
      parentId = byId.get(parentId)?.parentId ?? null
    }
    return true
  })
}

function fmtDate(value: string | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function addCalendarDays(value: Date, days: number): Date {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function differenceInCalendarDays(a: Date, b: Date): number {
  const left = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const right = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((left - right) / 86_400_000)
}

function isoWeek(value: Date): number {
  const date = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)
}
