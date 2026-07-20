'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import ReactFlow, { Background, Controls, ReactFlowProvider, type Edge, type Node } from 'reactflow'
import 'reactflow/dist/style.css'
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Columns,
  GitFork,
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
import { GanttChart } from '../gantt/GanttChart'
import { ActivityDetailPanel } from '../activity/ActivityDetailPanel'
import { ProjectChartsLibrary } from '../charts/ProjectChartsLibrary'

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
    <section className="min-h-0 flex-1 bg-[#f7f8fa]">
      <div className="flex min-h-12 flex-wrap items-end justify-between gap-3 border-b border-black/[0.08] bg-white px-4">
        <div className="flex self-stretch">
          {VIEW_CONFIG.map(({ key, label, Icon }) => (
            <div key={key} className="relative flex items-center">
              <button
                type="button"
                onClick={() => setActiveView(key)}
                className={cn(
                  'inline-flex h-full items-center gap-1.5 px-3 py-3 text-[13px] font-medium transition',
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
        <div className="flex flex-wrap items-center gap-2 py-2">
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
            className="rounded-md border border-black/[0.08] bg-surface-card px-2 py-1 text-body-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {ACTIVITY_STATUSES.map((s) => <option key={s} value={s}>{ACTIVITY_STATUS_LABEL[s]}</option>)}
          </select>
        </div>
      </div>

      <div className="p-3">
      {activeView === 'gantt' && <GanttChart project={project} canEdit={canEdit} onActivityOpen={setSelectedActivityId} />}
      {activeView === 'table' && (
        <ProjectTableView
          project={project}
          rows={filteredRows}
          canEdit={canEdit}
          isSaving={updateActivity.isPending}
          onOpen={setSelectedActivityId}
          onStatusChange={changeActivityStatus}
          onPercentChange={(activityId, percentComplete) => updateActivity.mutate({ activityId, percentComplete })}
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
      {activeView === 'mindmap' && <ProjectMindmapView project={project} rows={filteredRows} onOpen={setSelectedActivityId} />}
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
  isSaving,
  onOpen,
  onStatusChange,
  onPercentChange,
}: {
  project: ProjectDetail
  rows: ProjectActivityRow[]
  canEdit: boolean
  isSaving: boolean
  onOpen: (activityId: string) => void
  onStatusChange: (activityId: string, status: ActivityStatus) => void
  onPercentChange: (activityId: string, percentComplete: number) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const addActivity = useAddActivity(project.id)
  const addPhase = useAddPhase(project.id)
  const addMilestone = useAddMilestone(project.id)
  const { users } = useUsersForSelection()
  const visibleIds = useMemo(() => new Set(rows.map((row) => row.id)), [rows])
  const userNames = useMemo(() => new Map(users.map((user) => [user.id, user.name ?? user.email])), [users])
  const selectedIds = [...selected].filter((id) => rows.some((row) => row.id === id))

  const addTaskToMilestone = async (milestoneId: string) => {
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
    <div className="w-full rounded-card border border-black/[0.08] bg-surface-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.08] px-3 py-2">
        <div>
          <div className="text-body font-medium text-ink-primary">Schedule table</div>
          <div className="text-[12px] text-ink-tertiary">{rows.length} visible activities · timeline hidden</div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border border-black/[0.08] bg-surface-card px-2 py-1 text-body-sm"
            disabled={!canEdit || selectedIds.length === 0 || isSaving}
            defaultValue=""
            onChange={(e) => {
              const next = e.target.value as ActivityStatus
              if (!next) return
              selectedIds.forEach((id) => onStatusChange(id, next))
              e.currentTarget.value = ''
            }}
          >
            <option value="">Bulk status</option>
            {ACTIVITY_STATUSES.map((status) => <option key={status} value={status}>{ACTIVITY_STATUS_LABEL[status]}</option>)}
          </select>
          <button className="btn btn-outline btn-sm" onClick={() => setSelected(new Set())} disabled={selectedIds.length === 0}>
            Clear
          </button>
        </div>
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[1500px] table-fixed text-left text-[12px]">
          <thead className="sticky top-0 z-10 border-b border-black/[0.08] bg-surface-muted/80 uppercase tracking-[0.04em] text-ink-tertiary backdrop-blur">
            <tr>
              <th className="w-[360px] px-3 py-2 font-medium">Activity</th>
              <th className="w-[150px] px-2 py-2 font-medium">Assignee</th>
              <th className="w-[105px] px-2 py-2 font-medium">Owner</th>
              <th className="w-[74px] px-2 py-2 text-right font-medium">Est. h</th>
              <th className="w-[74px] px-2 py-2 text-right font-medium">Act. h</th>
              <th className="w-[90px] px-2 py-2 text-right font-medium">Est. cost</th>
              <th className="w-[90px] px-2 py-2 text-right font-medium">Act. cost</th>
              <th className="w-[105px] px-2 py-2 font-medium">Start</th>
              <th className="w-[76px] px-2 py-2 text-right font-medium">Days</th>
              <th className="w-[105px] px-2 py-2 font-medium">Due</th>
              <th className="w-[90px] px-2 py-2 font-medium">Priority</th>
              <th className="w-[80px] px-2 py-2 font-medium">Risk</th>
              <th className="w-[145px] px-2 py-2 font-medium">Status</th>
              <th className="w-[76px] px-2 py-2 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {project.phases.map((phase) => {
              const phaseActivities = phase.milestones.flatMap((milestone) => milestone.activities)
              if (!phaseActivities.some((activity) => visibleIds.has(activity.id))) return null
              const phaseCollapsed = collapsed.has(`phase:${phase.id}`)
              return (
                <Fragment key={phase.id}>
                  <tr className="border-y border-black/[0.08] bg-surface-muted/70">
                    <td colSpan={14} className="px-3 py-2">
                      <button className="flex w-full items-center gap-2 text-left" onClick={() => setCollapsed((current) => toggleSet(current, `phase:${phase.id}`))}>
                        {phaseCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                        <span className="font-semibold text-ink-primary">{phase.name}</span>
                        <span className="text-[11px] text-ink-tertiary">{phaseActivities.filter((activity) => visibleIds.has(activity.id)).length} activities</span>
                        <span className="ml-auto font-medium text-ink-secondary">{Math.round(phase.percentComplete)}%</span>
                      </button>
                    </td>
                  </tr>
                  {!phaseCollapsed && phase.milestones.map((milestone) => {
                    const ordered = orderTableActivities(milestone.activities).filter((item) => visibleIds.has(item.activity.id))
                    if (ordered.length === 0) return null
                    const milestoneCollapsed = collapsed.has(`milestone:${milestone.id}`)
                    return (
                      <Fragment key={milestone.id}>
                        <tr className="border-b border-black/[0.06] bg-primary-50/35">
                          <td colSpan={14} className="px-5 py-2">
                            <button className="flex w-full items-center gap-2 text-left" onClick={() => setCollapsed((current) => toggleSet(current, `milestone:${milestone.id}`))}>
                              {milestoneCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                              <span className="font-medium text-ink-primary">{milestone.name}</span>
                              <span className="text-[11px] text-ink-tertiary">{ordered.length}</span>
                              <span className="ml-auto text-[11px] font-medium text-ink-secondary">{Math.round(milestone.percentComplete)}%</span>
                            </button>
                          </td>
                        </tr>
                        {!milestoneCollapsed && ordered.map(({ activity, depth }) => (
                          <TableActivityRow
                            key={activity.id}
                            activity={activity}
                            depth={depth}
                            assigneeName={activity.assigneeId ? userNames.get(activity.assigneeId) ?? 'Assigned' : 'Unassigned'}
                            selected={selected.has(activity.id)}
                            canEdit={canEdit}
                            isSaving={isSaving}
                            onSelect={() => setSelected((current) => toggleSet(current, activity.id))}
                            onOpen={() => onOpen(activity.id)}
                            onStatusChange={(status) => onStatusChange(activity.id, status)}
                            onPercentChange={(percent) => onPercentChange(activity.id, percent)}
                          />
                        ))}
                        {!milestoneCollapsed && canEdit && (
                          <tr className="border-b border-black/[0.04]">
                            <td colSpan={14} className="px-8 py-2">
                              <button className="inline-flex items-center gap-1 text-[12px] font-medium text-primary-700 hover:underline" onClick={() => void addTaskToMilestone(milestone.id)}>
                                <Plus className="size-3.5" /> Add task
                              </button>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="border-t border-black/[0.08] px-3 py-2">
          <button className="btn btn-outline btn-sm" disabled={addPhase.isPending || addMilestone.isPending} onClick={() => void addSection()}>
            <Plus className="mr-1 size-3.5" /> Add section
          </button>
        </div>
      )}
    </div>
  )
}

function TableActivityRow({
  activity,
  depth,
  assigneeName,
  selected,
  canEdit,
  isSaving,
  onSelect,
  onOpen,
  onStatusChange,
  onPercentChange,
}: {
  activity: ActivityNode
  depth: number
  assigneeName: string
  selected: boolean
  canEdit: boolean
  isSaving: boolean
  onSelect: () => void
  onOpen: () => void
  onStatusChange: (status: ActivityStatus) => void
  onPercentChange: (percent: number) => void
}) {
  return (
    <tr className="border-b border-black/[0.04] text-ink-secondary hover:bg-surface-hover">
      <td className="px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: depth * 24 }}>
          <input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${activity.title}`} />
          <button className="min-w-0 truncate text-left font-medium text-ink-primary hover:text-primary-700 hover:underline" onClick={onOpen}>{activity.title}</button>
        </div>
      </td>
      <td className="truncate px-2 py-1.5">{assigneeName}</td>
      <td className="px-2 py-1.5">{activity.ownerParty === '360GROUND' ? '360Ground' : labelizeTable(activity.ownerParty)}</td>
      <td className="px-2 py-1.5 text-right">{numberCell(activity.estimatedHours)}</td>
      <td className="px-2 py-1.5 text-right">{numberCell(activity.actualHours)}</td>
      <td className="px-2 py-1.5 text-right">{numberCell(activity.estimatedCost)}</td>
      <td className="px-2 py-1.5 text-right">{numberCell(activity.actualCost)}</td>
      <td className="px-2 py-1.5">{fmtDate(activity.currentStart)}</td>
      <td className="px-2 py-1.5 text-right">{activityDurationDays(activity)}d</td>
      <td className="px-2 py-1.5">{fmtDate(activity.currentEnd)}</td>
      <td className="px-2 py-1.5">{activity.priority ? labelizeTable(activity.priority) : '-'}</td>
      <td className="px-2 py-1.5">{activity.risk ? labelizeTable(activity.risk) : '-'}</td>
      <td className="px-2 py-1.5">
        {canEdit ? (
          <select className="w-full rounded border border-black/[0.08] bg-surface-card px-2 py-1 text-[12px]" value={activity.status} disabled={isSaving} onChange={(event) => onStatusChange(event.target.value as ActivityStatus)}>
            {ACTIVITY_STATUSES.map((status) => <option key={status} value={status}>{ACTIVITY_STATUS_LABEL[status]}</option>)}
          </select>
        ) : <StatusPill status={activity.status} />}
      </td>
      <td className="px-2 py-1.5 text-right">
        {canEdit ? (
          <input
            type="number"
            min={0}
            max={100}
            defaultValue={Math.round(activity.percentComplete)}
            className="w-14 rounded border border-black/[0.08] bg-surface-card px-1.5 py-1 text-right text-[12px]"
            onBlur={(event) => onPercentChange(Math.max(0, Math.min(100, Number(event.target.value) || 0)))}
          />
        ) : `${Math.round(activity.percentComplete)}%`}
      </td>
    </tr>
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
          <div className="grid border-b border-black/[0.08]" style={{ gridTemplateColumns: '250px minmax(900px,1fr)' }}>
            <div className="bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Project members</div>
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
              <div key={member.id} className="grid border-b border-black/[0.05]" style={{ gridTemplateColumns: '250px minmax(900px,1fr)' }}>
                <div className="bg-white px-3 py-3" style={{ height }}>
                  <div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-700">{member.name.slice(0, 2).toUpperCase()}</span><div><div className="text-body-sm font-medium text-ink-primary">{member.name}</div><div className="text-[11px] text-ink-tertiary">{member.hours}h estimated · {capacity?.maxAllocationPct ?? 0}% max allocation</div></div></div>
                </div>
                <div className="relative bg-[repeating-linear-gradient(to_right,transparent_0,transparent_calc(12.5%-1px),rgba(0,0,0,0.055)_calc(12.5%-1px),rgba(0,0,0,0.055)_12.5%)]" style={{ height }}>
                  {member.tasks.map((task, taskIndex) => {
                    const leftDays = differenceInCalendarDays(new Date(task.currentStart!), start)
                    const duration = Math.max(1, differenceInCalendarDays(new Date(task.currentEnd!), new Date(task.currentStart!)) + 1)
                    if (leftDays >= days || leftDays + duration < 0) return null
                    return <div key={task.id} title={task.title} className="absolute h-5 truncate rounded border border-primary-500 bg-sky-200 px-1.5 text-[10px] leading-5 text-primary-900" style={{ top: 10 + taskIndex * 26, left: `${Math.max(0, leftDays) / days * 100}%`, width: `${Math.min(duration, days - Math.max(0, leftDays)) / days * 100}%` }}>{task.title}</div>
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

function ProjectMindmapView({ project, rows, onOpen }: { project: ProjectDetail; rows: ProjectActivityRow[]; onOpen: (activityId: string) => void }) {
  const { nodes, edges } = useMemo(() => buildMindmap(project, rows), [project, rows])
  return (
    <div className="h-[640px] overflow-hidden rounded-card border border-black/[0.08] bg-surface-card shadow-card">
      <ReactFlowProvider>
        <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.3} maxZoom={1.5} onNodeDoubleClick={(_event, node) => { if (node.id.startsWith('activity:')) onOpen(node.id.slice('activity:'.length)) }}>
          <Background />
          <Controls />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  )
}

function ProjectOverviewView({ project, rows, allRows }: { project: ProjectDetail; rows: ProjectActivityRow[]; allRows: ProjectActivityRow[] }) {
  const { users } = useUsersForSelection()
  const userNames = useMemo(() => new Map(users.map((user) => [user.id, user.name ?? user.email])), [users])
  const highRisk = allRows.filter((row) => row.risk === 'HIGH').length
  const waiting = allRows.filter((row) => row.status === 'APPROVAL_REQUESTED').length
  const slipping = allRows.filter((row) => row.slipDays > 0).length
  const done = allRows.filter((row) => row.status === 'FINISHED' || row.status === 'APPROVED').length
  const resourceRows = useMemo(() => {
    const grouped = new Map<string, ProjectActivityRow[]>()
    for (const row of allRows) {
      const key = row.assigneeId ?? 'UNASSIGNED'
      grouped.set(key, [...(grouped.get(key) ?? []), row])
    }
    return [...grouped.entries()].map(([id, tasks]) => ({ id, name: id === 'UNASSIGNED' ? 'Unassigned' : userNames.get(id) ?? 'Project member', tasks, hours: tasks.reduce((sum, task) => sum + (task.estimatedHours ?? 0), 0) }))
  }, [allRows, userNames])

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="lg:col-span-2"><OverviewTimeline project={project} /></div>
      <div className="rounded-card border border-black/[0.08] bg-surface-card p-5 shadow-card">
        <div className="text-body font-medium text-ink-primary">C24 Completion</div>
        <div className="mt-4 flex justify-center">
          <div
            className="relative flex size-56 items-center justify-center rounded-full"
            style={{ background: `conic-gradient(#007AFF ${project.percentComplete * 3.6}deg, #E5E5EA 0)` }}
          >
            <div className="flex size-36 flex-col items-center justify-center rounded-full bg-surface-card shadow-card">
              <span className="text-[34px] font-semibold text-ink-primary">{Math.round(project.percentComplete)}%</span>
              <span className="text-body-sm text-ink-tertiary">Actual</span>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Metric label="Expected" value={`${Math.round(project.percentPlanned)}%`} />
          <Metric label="Variance" value={`${Math.round(project.percentComplete - project.percentPlanned)}%`} />
        </div>
      </div>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <MetricCard icon={BarChart3} label="Visible" value={rows.length} />
          <MetricCard icon={CalendarDays} label="Done" value={`${done}/${allRows.length}`} />
          <MetricCard icon={GitFork} label="Waiting" value={waiting} tone={waiting ? 'warning' : 'normal'} />
          <MetricCard icon={Users} label="Slipping" value={slipping} tone={slipping ? 'danger' : 'normal'} />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Register title="High Risk" rows={allRows.filter((row) => row.risk === 'HIGH').slice(0, 6)} empty="No high-risk activities." />
          <Register title="Approval Queue" rows={allRows.filter((row) => row.status === 'APPROVAL_REQUESTED').slice(0, 6)} empty="No approvals waiting." />
          <Register title="Slip Register" rows={allRows.filter((row) => row.slipDays > 0).sort((a, b) => b.slipDays - a.slipDays).slice(0, 6)} empty="No slipped activities." />
        </div>
        <div className="text-body-sm text-ink-tertiary">{highRisk} high-risk · {waiting} approvals · {slipping} slipped activities</div>
      </div>
      <div className="lg:col-span-2">
        <div className="mb-3 mt-4 flex items-center justify-between">
          <h3 className="text-section-title text-ink-primary">Charts Library</h3>
          <span className="text-body-sm text-ink-tertiary">C1-C24 · PNG export</span>
        </div>
        <ProjectChartsLibrary project={project} />
      </div>
      <div className="overflow-hidden rounded-card border border-black/[0.08] bg-white shadow-card lg:col-span-2">
        <div className="border-b border-black/[0.08] px-4 py-3"><h3 className="text-section-title text-ink-primary">Users and resources on this project</h3></div>
        <table className="w-full text-left text-body-sm">
          <thead className="bg-surface-muted/50 text-[11px] uppercase tracking-wide text-ink-tertiary"><tr><th className="px-4 py-2">User / resource</th><th className="px-4 py-2 text-right">Total tasks</th><th className="px-4 py-2 text-right">Estimated hours</th><th className="px-4 py-2 text-right">Completed</th><th className="px-4 py-2">Status</th></tr></thead>
          <tbody>{resourceRows.map((resource) => { const completed = resource.tasks.filter((task) => task.status === 'FINISHED' || task.status === 'APPROVED').length; return <tr key={resource.id} className="border-t border-black/[0.05]"><td className="px-4 py-2 font-medium text-ink-primary">{resource.name}</td><td className="px-4 py-2 text-right">{resource.tasks.length}</td><td className="px-4 py-2 text-right">{resource.hours}</td><td className="px-4 py-2 text-right">{completed}</td><td className="px-4 py-2"><span className={cn('rounded-pill px-2 py-0.5 text-[11px]', completed === resource.tasks.length && resource.tasks.length ? 'bg-success-50 text-success-700' : 'bg-primary-50 text-primary-700')}>{completed === resource.tasks.length && resource.tasks.length ? 'Complete' : 'In progress'}</span></td></tr> })}</tbody>
        </table>
      </div>
    </div>
  )
}

function OverviewTimeline({ project }: { project: ProjectDetail }) {
  const start = new Date(project.plannedStart)
  const end = new Date(project.plannedEnd)
  const totalDays = Math.max(1, differenceInCalendarDays(end, start) + 1)
  return (
    <div className="overflow-hidden rounded-card border border-black/[0.08] bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-black/[0.08] px-4 py-3"><h3 className="text-section-title text-ink-primary">Timeline</h3><span className="text-[11px] text-ink-tertiary">Auto scale · {fmtDate(project.plannedStart)} – {fmtDate(project.plannedEnd)}</span></div>
      <div className="relative min-h-[190px] overflow-hidden bg-[repeating-linear-gradient(to_right,transparent_0,transparent_calc(12.5%-1px),rgba(0,0,0,0.055)_calc(12.5%-1px),rgba(0,0,0,0.055)_12.5%)] p-5">
        {project.phases.map((phase, index) => {
          const activities = phase.milestones.flatMap((milestone) => milestone.activities).filter((activity) => activity.currentStart && activity.currentEnd)
          const phaseStart = activities.length ? new Date(Math.min(...activities.map((activity) => new Date(activity.currentStart!).getTime()))) : null
          const phaseEnd = activities.length ? new Date(Math.max(...activities.map((activity) => new Date(activity.currentEnd!).getTime()))) : null
          if (!phaseStart || !phaseEnd) return null
          const left = Math.max(0, differenceInCalendarDays(phaseStart, start)) / totalDays * 100
          const width = Math.max(1.5, (differenceInCalendarDays(phaseEnd, phaseStart) + 1) / totalDays * 100)
          return <div key={phase.id} className="absolute h-9 truncate rounded bg-sky-500 px-3 text-[11px] font-medium leading-9 text-white shadow-sm" style={{ top: 28 + index * 42, left: `${left}%`, width: `${Math.min(100 - left, width)}%` }} title={phase.name}>{phase.name}</div>
        })}
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
    percentComplete: activity.percentComplete,
    estimatedHours: activity.estimatedHours,
    currentStart: activity.currentStart,
    currentEnd: activity.currentEnd,
    slipDays: activity.slipDays,
    commentsCount: activity._count.comments,
  })
}

function buildMindmap(project: ProjectDetail, rows: ProjectActivityRow[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [{ id: project.id, data: { label: project.name }, position: { x: 0, y: 0 }, className: 'rounded-md border border-primary-500 bg-primary-50 px-3 py-2 text-ink-primary' }]
  const edges: Edge[] = []
  const phaseRadius = 240
  const milestoneRadius = 420
  const activityRadius = 620
  const visibleActivityIds = new Set(rows.map((row) => row.id))
  project.phases.forEach((phase, phaseIndex) => {
    const phaseAngle = (Math.PI * 2 * phaseIndex) / Math.max(1, project.phases.length)
    const phaseId = `phase:${phase.id}`
    nodes.push({ id: phaseId, data: { label: phase.name }, position: polar(phaseRadius, phaseAngle), className: 'rounded-md border border-black/[0.08] bg-white px-3 py-2 text-ink-primary' })
    edges.push({ id: `${project.id}-${phaseId}`, source: project.id, target: phaseId })
    phase.milestones.forEach((milestone, milestoneIndex) => {
      const milestoneAngle = phaseAngle - 0.35 + (0.7 * milestoneIndex) / Math.max(1, phase.milestones.length - 1)
      const milestoneId = `milestone:${milestone.id}`
      nodes.push({ id: milestoneId, data: { label: milestone.name }, position: polar(milestoneRadius, milestoneAngle), className: 'rounded-md border border-black/[0.08] bg-surface-muted px-3 py-2 text-ink-primary' })
      edges.push({ id: `${phaseId}-${milestoneId}`, source: phaseId, target: milestoneId })
      const activities = milestone.activities.filter((activity) => visibleActivityIds.has(activity.id)).slice(0, 16)
      activities.forEach((activity, activityIndex) => {
        const spread = 0.42
        const angle = milestoneAngle - spread / 2 + (spread * activityIndex) / Math.max(1, activities.length - 1)
        const id = `activity:${activity.id}`
        nodes.push({ id, data: { label: activity.title }, position: polar(activityRadius, angle), className: 'rounded-md border border-black/[0.08] bg-surface-card px-2 py-1 text-[11px] text-ink-secondary' })
        edges.push({ id: `${milestoneId}-${id}`, source: milestoneId, target: id })
      })
    })
  })
  return { nodes, edges }
}

function polar(radius: number, angle: number) {
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}

function StatusPill({ status }: { status: ActivityStatus }) {
  return <span className={cn('rounded-pill px-2 py-0.5 text-[11px] font-medium', statusBg(status), 'text-ink-primary')}>{ACTIVITY_STATUS_LABEL[status]}</span>
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-muted/60 px-3 py-2">
      <div className="text-[11px] text-ink-tertiary">{label}</div>
      <div className="text-body font-semibold text-ink-primary">{value}</div>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, tone = 'normal' }: { icon: typeof BarChart3; label: string; value: string | number; tone?: 'normal' | 'warning' | 'danger' }) {
  return (
    <div className={cn('rounded-card border border-black/[0.08] bg-surface-card p-4 shadow-card', tone === 'warning' && 'border-warning-500/30 bg-warning-50', tone === 'danger' && 'border-danger-500/30 bg-danger-50')}>
      <Icon className="mb-2 size-4 text-ink-tertiary" />
      <div className="text-[11px] text-ink-tertiary">{label}</div>
      <div className="text-section-title text-ink-primary">{value}</div>
    </div>
  )
}

function Register({ title, rows, empty }: { title: string; rows: ProjectActivityRow[]; empty: string }) {
  return (
    <div className="rounded-card border border-black/[0.08] bg-surface-card p-3 shadow-card">
      <div className="mb-2 text-body font-medium text-ink-primary">{title}</div>
      {rows.length === 0 ? (
        <div className="text-body-sm text-ink-tertiary">{empty}</div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-md bg-surface-muted/50 px-2 py-1.5">
              <div className="truncate text-body-sm font-medium text-ink-primary">{row.title}</div>
              <div className="text-[11px] text-ink-tertiary">{row.phase} · {ACTIVITY_STATUS_LABEL[row.status]}</div>
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

function toggleSet(current: Set<string>, id: string) {
  const next = new Set(current)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

function orderTableActivities(activities: ActivityNode[]): Array<{ activity: ActivityNode; depth: number }> {
  const sorted = [...activities].sort((a, b) => a.position - b.position)
  const children = new Map<string, ActivityNode[]>()
  for (const activity of sorted) {
    if (!activity.parentActivityId) continue
    const list = children.get(activity.parentActivityId) ?? []
    list.push(activity)
    children.set(activity.parentActivityId, list)
  }
  const result: Array<{ activity: ActivityNode; depth: number }> = []
  const included = new Set<string>()
  for (const activity of sorted.filter((item) => !item.parentActivityId)) {
    result.push({ activity, depth: 0 })
    included.add(activity.id)
    for (const child of children.get(activity.id) ?? []) {
      result.push({ activity: child, depth: 1 })
      included.add(child.id)
    }
  }
  for (const activity of sorted) {
    if (!included.has(activity.id)) result.push({ activity, depth: activity.parentActivityId ? 1 : 0 })
  }
  return result
}

function activityDurationDays(activity: ActivityNode): number {
  if (!activity.currentStart || !activity.currentEnd) return 0
  const start = new Date(activity.currentStart)
  const end = new Date(activity.currentEnd)
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
}

function numberCell(value: number | null): string {
  return value == null ? '-' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)
}

function labelizeTable(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase())
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
