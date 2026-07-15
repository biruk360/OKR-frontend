'use client'

import { useMemo, useState } from 'react'
import ReactFlow, { Background, Controls, ReactFlowProvider, type Edge, type Node } from 'reactflow'
import 'reactflow/dist/style.css'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import {
  BarChart3,
  CalendarDays,
  Columns,
  GitFork,
  LayoutDashboard,
  Network,
  Search,
  Table2,
  Users,
} from 'lucide-react'
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
  const activeView = useProjectViewStore((s) => s.activeView)
  const search = useProjectViewStore((s) => s.search)
  const status = useProjectViewStore((s) => s.status)
  const setActiveView = useProjectViewStore((s) => s.setActiveView)
  const setSearch = useProjectViewStore((s) => s.setSearch)
  const setStatus = useProjectViewStore((s) => s.setStatus)
  const updateActivity = useUpdateActivity(project.id)
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)

  const rows = useMemo(() => flattenProjectActivities(project), [project])
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      const matchesSearch = !q || [row.title, row.phase, row.milestone, row.ownerParty, row.assigneeId ?? '']
        .some((value) => value.toLowerCase().includes(q))
      const matchesStatus = !status || row.status === status
      return matchesSearch && matchesStatus
    })
  }, [rows, search, status])

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
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-black/[0.08] bg-surface-card p-1">
          {VIEW_CONFIG.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveView(key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-body-sm transition',
                activeView === key ? 'bg-primary-500 text-white shadow-sm' : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary'
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      {activeView === 'gantt' && <GanttChart project={project} onActivityOpen={setSelectedActivityId} />}
      {activeView === 'table' && (
        <ProjectTableView
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
          rows={filteredRows}
          canEdit={canEdit}
          isSaving={updateActivity.isPending}
          onOpen={setSelectedActivityId}
          onStatusChange={changeActivityStatus}
        />
      )}
      {activeView === 'workload' && <ProjectWorkloadView />}
      {activeView === 'mindmap' && <ProjectMindmapView project={project} rows={filteredRows} />}
      {activeView === 'overview' && <ProjectOverviewView project={project} rows={filteredRows} allRows={rows} />}
      <ActivityDetailPanel project={project} activityId={selectedActivityId} canEdit={canEdit} onClose={() => setSelectedActivityId(null)} />
    </section>
  )
}

function ProjectTableView({
  rows,
  canEdit,
  isSaving,
  onOpen,
  onStatusChange,
  onPercentChange,
}: {
  rows: ProjectActivityRow[]
  canEdit: boolean
  isSaving: boolean
  onOpen: (activityId: string) => void
  onStatusChange: (activityId: string, status: ActivityStatus) => void
  onPercentChange: (activityId: string, percentComplete: number) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sorting, setSorting] = useState<SortingState>([])
  const helper = createColumnHelper<ProjectActivityRow>()
  const columns = useMemo(() => [
    helper.display({
      id: 'select',
      size: 36,
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={selected.has(row.original.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => setSelected((current) => toggleSet(current, row.original.id))}
          aria-label={`Select ${row.original.title}`}
        />
      ),
    }),
    helper.accessor('title', { header: 'Activity', cell: (info) => <span className="font-medium text-ink-primary">{info.getValue()}</span> }),
    helper.accessor('phase', { header: 'Phase' }),
    helper.accessor('milestone', { header: 'Milestone' }),
    helper.accessor('status', {
      header: 'Status',
      cell: (info) => canEdit ? (
        <select
          className="rounded border border-black/[0.08] bg-surface-card px-2 py-1 text-[12px]"
          value={info.getValue()}
          disabled={isSaving}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onStatusChange(info.row.original.id, e.target.value as ActivityStatus)}
        >
          {ACTIVITY_STATUSES.map((status) => <option key={status} value={status}>{ACTIVITY_STATUS_LABEL[status]}</option>)}
        </select>
      ) : <StatusPill status={info.getValue()} />,
    }),
    helper.accessor('percentComplete', {
      header: '%',
      cell: (info) => canEdit ? (
        <input
          type="number"
          min={0}
          max={100}
          defaultValue={Math.round(info.getValue())}
          className="w-16 rounded border border-black/[0.08] bg-surface-card px-2 py-1 text-[12px]"
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => onPercentChange(info.row.original.id, Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
        />
      ) : `${Math.round(info.getValue())}%`,
    }),
    helper.accessor('assigneeId', { header: 'Assignee', cell: (info) => info.getValue()?.slice(0, 8) ?? '-' }),
    helper.accessor('ownerParty', { header: 'Owner' }),
    helper.accessor('currentStart', { header: 'Start', cell: (info) => fmtDate(info.getValue()) }),
    helper.accessor('currentEnd', { header: 'Due', cell: (info) => fmtDate(info.getValue()) }),
    helper.accessor('risk', { header: 'Risk', cell: (info) => info.getValue() ?? '-' }),
    helper.accessor('slipDays', { header: 'Slip', cell: (info) => `${info.getValue()}d` }),
  ], [canEdit, helper, isSaving, onPercentChange, onStatusChange, selected])
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
  const selectedIds = [...selected].filter((id) => rows.some((row) => row.id === id))

  return (
    <div className="rounded-card border border-black/[0.08] bg-surface-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.08] px-3 py-2">
        <div className="text-body-sm text-ink-secondary">{rows.length} filtered activities</div>
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
        <table className="w-full min-w-[980px] text-left text-body-sm">
          <thead className="bg-surface-muted/50 text-[11px] uppercase tracking-[0.04em] text-ink-tertiary">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id} className="px-3 py-2 font-medium">
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        className={cn('inline-flex items-center gap-1', header.column.getCanSort() && 'hover:text-ink-primary')}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' ? '↑' : header.column.getIsSorted() === 'desc' ? '↓' : ''}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="cursor-pointer border-t border-black/[0.04] hover:bg-surface-hover" onClick={() => onOpen(row.original.id)}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 text-ink-secondary">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ProjectBoardView({
  rows,
  canEdit,
  isSaving,
  onOpen,
  onStatusChange,
}: {
  rows: ProjectActivityRow[]
  canEdit: boolean
  isSaving: boolean
  onOpen: (activityId: string) => void
  onStatusChange: (activityId: string, status: ActivityStatus) => void
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null)
  return (
    <div className="grid gap-3 overflow-x-auto pb-2" style={{ gridTemplateColumns: 'repeat(6, minmax(220px, 1fr))' }}>
      {ACTIVITY_STATUSES.map((status) => {
        const colRows = rows.filter((row) => row.status === status)
        return (
          <div
            key={status}
            className="min-h-[420px] rounded-card border border-black/[0.08] bg-surface-card"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (!canEdit || !draggedId || isSaving) return
              onStatusChange(draggedId, status)
              setDraggedId(null)
            }}
          >
            <div className="flex items-center gap-2 border-b border-black/[0.08] px-3 py-2">
              <span className={cn('size-2.5 rounded-full', statusBg(status))} />
              <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-secondary">{ACTIVITY_STATUS_LABEL[status]}</span>
              <span className="ml-auto text-[11px] text-ink-tertiary">{colRows.length}</span>
            </div>
            <div className="space-y-2 p-2">
              {colRows.length === 0 ? (
                <div className="flex h-24 items-center justify-center rounded border border-dashed border-black/[0.08] text-[12px] text-ink-tertiary">Drop here</div>
              ) : colRows.map((row) => (
                <div
                  key={row.id}
                  draggable={canEdit}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    setDraggedId(row.id)
                  }}
                  onDragEnd={() => setDraggedId(null)}
                  onClick={() => onOpen(row.id)}
                  className={cn('rounded-md border border-black/[0.08] bg-white p-3 shadow-sm', canEdit && 'cursor-grab active:cursor-grabbing')}
                  style={{ opacity: draggedId === row.id ? 0.45 : undefined }}
                >
                  <div className="text-body-sm font-medium text-ink-primary">{row.title}</div>
                  <div className="mt-1 text-[12px] text-ink-tertiary">{row.phase} / {row.milestone}</div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-ink-secondary">
                    <span>{Math.round(row.percentComplete)}%</span>
                    <span>{row.slipDays}d slip</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ProjectWorkloadView() {
  const { data, isLoading, isError } = useProjectWorkload()
  if (isLoading) return <div className="rounded-card border border-black/[0.08] bg-surface-card p-6 text-body-sm text-ink-secondary">Loading workload...</div>
  if (isError || !data) return <div className="rounded-card border border-black/[0.08] bg-surface-card p-6 text-body-sm text-danger-600">Workload unavailable.</div>

  return (
    <div className="rounded-card border border-black/[0.08] bg-surface-card shadow-card">
      <div className="flex items-center justify-between border-b border-black/[0.08] px-3 py-2">
        <div>
          <div className="text-body font-medium text-ink-primary">Capacity heatmap</div>
          <div className="text-body-sm text-ink-tertiary">Across all readable active projects, 40h/week capacity baseline</div>
        </div>
        <div className="text-body-sm text-ink-secondary">{data.people.length} people</div>
      </div>
      <div className="overflow-auto">
        <div className="min-w-[860px]">
          <div className="grid border-b border-black/[0.08] bg-surface-muted/40 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-tertiary" style={{ gridTemplateColumns: `220px repeat(${data.weeks.length}, minmax(84px, 1fr))` }}>
            <div className="px-3 py-2">Person</div>
            {data.weeks.map((week) => <div key={week} className="px-2 py-2 text-center">{fmtWeek(week)}</div>)}
          </div>
          {data.people.length === 0 ? (
            <div className="p-6 text-body-sm text-ink-secondary">No assigned active work in the next eight weeks.</div>
          ) : data.people.map((person) => (
            <div key={person.userId ?? 'unassigned'} className="grid border-b border-black/[0.04]" style={{ gridTemplateColumns: `220px repeat(${data.weeks.length}, minmax(84px, 1fr))` }}>
              <div className="px-3 py-2">
                <div className="font-medium text-ink-primary">{person.name}</div>
                <div className={cn('text-[11px]', person.maxAllocationPct > 100 ? 'text-danger-600' : 'text-ink-tertiary')}>
                  Max {person.maxAllocationPct}% · {person.totalHours}h
                </div>
              </div>
              {person.cells.map((cell) => (
                <div key={cell.weekStart} className="p-1">
                  <div className={cn('rounded px-2 py-2 text-center text-[12px] font-medium', workloadTone(cell.allocationPct))}>
                    {cell.allocationPct ? `${cell.allocationPct}%` : 'Idle'}
                    <div className="text-[10px] font-normal opacity-80">{cell.hours}h</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ProjectMindmapView({ project, rows }: { project: ProjectDetail; rows: ProjectActivityRow[] }) {
  const { nodes, edges } = useMemo(() => buildMindmap(project, rows), [project, rows])
  return (
    <div className="h-[640px] overflow-hidden rounded-card border border-black/[0.08] bg-surface-card shadow-card">
      <ReactFlowProvider>
        <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.3} maxZoom={1.5}>
          <Background />
          <Controls />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  )
}

function ProjectOverviewView({ project, rows, allRows }: { project: ProjectDetail; rows: ProjectActivityRow[]; allRows: ProjectActivityRow[] }) {
  const highRisk = allRows.filter((row) => row.risk === 'HIGH').length
  const waiting = allRows.filter((row) => row.status === 'APPROVAL_REQUESTED').length
  const slipping = allRows.filter((row) => row.slipDays > 0).length
  const done = allRows.filter((row) => row.status === 'FINISHED' || row.status === 'APPROVED').length

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
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

function workloadTone(allocation: number): string {
  if (allocation > 100) return 'bg-danger-50 text-danger-700 ring-1 ring-danger-500/30'
  if (allocation === 0) return 'bg-surface-muted text-ink-tertiary'
  if (allocation >= 80) return 'bg-warning-50 text-warning-700 ring-1 ring-warning-500/30'
  return 'bg-success-50 text-success-700 ring-1 ring-success-500/20'
}

function toggleSet(current: Set<string>, id: string) {
  const next = new Set(current)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

function fmtDate(value: string | null): string {
  if (!value) return '-'
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function fmtWeek(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
