'use client'

/**
 * SprintBoardClient — Phase 3 Todo-backed sprint board (Sprints v2 §4.3).
 *
 * Reads /api/sprints/[id]/board (Todo single-source-of-truth) and renders three
 * status columns (PENDING / IN_PROGRESS / COMPLETED). Drag-drop updates Todo.status
 * via PATCH /api/todos/[id]. Click a card → opens TodoCardModal in drawer mode.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Plus, Target, MoreHorizontal, Briefcase, Phone, Mail, Monitor,
  Users, FileText, RefreshCw, Square, Calendar, Filter, AlertCircle,
} from 'lucide-react'
import { TodoCardModal } from '@/components/todos/TodoCardModal'
import StatusPill from '@/components/shared/StatusPill'
import { EmptyState } from '@/components/ui/EmptyState'
import EndSprintModal from '@/components/sprints/EndSprintModal'
import ScheduleSprintModal from '@/components/sprints/ScheduleSprintModal'
import LinkToOkrPopover, { type OkrLinkValue } from '@/components/sprints/LinkToOkrPopover'
import { useIsMobile } from '@/hooks'
import { cn } from '@/lib/utils'
import type { TodoStatus } from '@/types'

// ─── Types matching /api/sprints/[id]/board ─────────────────────────────────

interface BoardUser { id: string; name: string; avatar: string | null }
interface BoardTodo {
  id: string
  title: string
  status: TodoStatus
  priority: string
  taskType?: string | null
  dueDate: string | null
  assigneeId: string
  assignee: BoardUser
  keyResult: { id: string; title: string; objective?: { id: string; title: string } } | null
  objective: { id: string; title: string } | null
}
interface BoardColumn {
  id: TodoStatus
  name: string
  status: TodoStatus
  todos: BoardTodo[]
}
interface BoardSprint {
  id: string
  name: string
  description: string | null
  state: 'PLANNING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  status: string
  startDate: string | null
  endDate: string | null
  goal: string | null
  goalLabel: string | null
  goalTarget: number | null
  goalCurrent: number | null
  goalUnit: string | null
  owner: BoardUser
}
interface BoardData {
  sprint: BoardSprint
  columns: BoardColumn[]
  participants: BoardUser[]
  aggregates: { taskTotal: number; taskDone: number; taskPercent: number; goalPercent: number | null }
}

// ─── Re-export legacy SprintBoardData type for back-compat ─────────────────

export type SprintBoardData = BoardData
// Legacy shape (Phase 2/3 compat): SprintCardModal — deprecated component — references this.
export interface SprintBoardActivity {
  id: string
  title: string
  description: string | null
  ownerId: string
  owner: { id: string; name: string; avatar: string | null }
  keyResultId: string | null
  keyResult: { id: string; title: string; objective: { id: string; title: string } } | null
  objectiveId: string | null
  objective: { id: string; title: string } | null
  convertedInitiativeId: string | null
  dueDate: string | null
  position: number
  columnId: string
  commentCount: number
  tasksTotal: number
  tasksCompleted: number
}

interface Props {
  sprintId: string
  currentUserId: string
}

// ─── Task type → icon map (spec §4.3) ───────────────────────────────────────

const TYPE_ICONS: Record<string, any> = {
  CALL: Phone, EMAIL: Mail, DEMO: Monitor, MEETING: Users,
  PROPOSAL: FileText, FOLLOW_UP: RefreshCw, ADMIN: Briefcase, GENERAL: Square,
}

const PRIORITY_COLORS: Record<string, string> = {
  LOW: '#8E8E93', MEDIUM: '#FF9500', HIGH: '#FF3B30', URGENT: '#AF52DE',
}

function Avatar({ user, size = 22 }: { user: BoardUser; size?: number }) {
  const initials = user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return user.avatar ? (
    <img src={user.avatar} alt={user.name} title={user.name} className="rounded-full object-cover"
      style={{ width: size, height: size }} />
  ) : (
    <span title={user.name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: 'var(--ap-accent)' }}>
      {initials}
    </span>
  )
}

function ProgressBar({ percent, color }: { percent: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--ap-bg-sunken)' }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, background: color ?? 'var(--ap-accent)' }} />
    </div>
  )
}

// ─── Add Task inline form (Sprints v2 §4.3 / D) ─────────────────────────────

function AddTaskInline({
  sprintId, currentUserId, defaultDueDate, onCreated,
}: {
  sprintId: string
  currentUserId: string
  defaultDueDate: string | null
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [more, setMore] = useState(false)
  const [priority, setPriority] = useState('MEDIUM')
  const [dueDate, setDueDate] = useState<string>(defaultDueDate?.slice(0, 10) ?? '')
  const [okr, setOkr] = useState<OkrLinkValue | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          assigneeId: currentUserId,
          sprintId,
          priority,
          dueDate: dueDate || null,
          keyResultId: okr?.keyResultId ?? null,
          objectiveId: okr?.objectiveId ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed')
      toast.success('Task added')
      setTitle('')
      setOkr(null)
      setMore(false)
      setOpen(false)
      onCreated()
    } catch (err: any) {
      toast.error(err.message || 'Failed to add task')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-[10px] border-2 border-dashed px-3 py-2 text-[12px] text-muted-foreground hover:bg-muted/40"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <Plus className="h-3.5 w-3.5" /> Add task
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-[10px] border bg-card p-2" style={{ borderColor: 'var(--ap-border)' }}>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title…"
        className="w-full rounded-[8px] border-0 bg-muted/40 px-2 py-1.5 text-[12px] outline-none focus:bg-muted"
      />
      {more && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <select value={priority} onChange={(e) => setPriority(e.target.value)}
              className="rounded-[8px] border bg-card px-2 py-1 text-[11px]"
              style={{ borderColor: 'var(--ap-border)' }}>
              {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="rounded-[8px] border bg-card px-2 py-1 text-[11px]"
              style={{ borderColor: 'var(--ap-border)' }} />
          </div>
          <LinkToOkrPopover value={okr} onChange={setOkr} />
        </div>
      )}
      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={() => setMore((m) => !m)} className="text-[11px] text-muted-foreground hover:underline">
          {more ? 'Less' : 'More options'}
        </button>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => { setOpen(false); setTitle('') }}
            className="rounded-[8px] px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted">
            Cancel
          </button>
          <button type="submit" disabled={!title.trim() || submitting}
            className="rounded-[8px] px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--ap-accent)' }}>
            {submitting ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </form>
  )
}

// ─── Task card (spec §4.3) ─────────────────────────────────────────────────

function TaskCard({
  todo, onClick, onDragStart,
}: {
  todo: BoardTodo
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
}) {
  const TypeIcon = TYPE_ICONS[todo.taskType ?? 'GENERAL'] ?? Square
  const due = todo.dueDate ? new Date(todo.dueDate) : null
  const overdue = due && due < new Date() && todo.status !== 'COMPLETED'

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
      className="ap-hover-lift cursor-pointer rounded-[10px] border bg-card p-3 text-left transition"
      style={{ borderColor: 'var(--ap-border)' }}
    >
      <div className="flex items-start gap-2">
        <TypeIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="flex-1 text-[12px] font-medium leading-tight">{todo.title}</p>
      </div>

      {todo.keyResult && (
        <div
          className="mt-2 inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}
        >
          <Target className="h-3 w-3 shrink-0" />
          <span className="truncate">{todo.keyResult.title}</span>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {due && (
            <span className={cn('inline-flex items-center gap-0.5', overdue && 'text-[var(--ap-red)]')}>
              {overdue && <AlertCircle className="h-3 w-3" />}
              <Calendar className="h-3 w-3" />
              {due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
            style={{ background: `${PRIORITY_COLORS[todo.priority] ?? '#8E8E93'}22`, color: PRIORITY_COLORS[todo.priority] ?? '#8E8E93' }}
          >
            {todo.priority}
          </span>
        </div>
        <Avatar user={todo.assignee} size={20} />
      </div>
    </div>
  )
}

// ─── Main board ─────────────────────────────────────────────────────────────

export default function SprintBoardClient({ sprintId, currentUserId }: Props) {
  const router = useRouter()
  const qc = useQueryClient()
  const [openTodoId, setOpenTodoId] = useState<string | null>(null)
  const [showEnd, setShowEnd] = useState(false)
  const [scheduleMode, setScheduleMode] = useState<'edit' | 'start' | null>(null)
  const [starting, setStarting] = useState(false)
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null)
  const [filterLinked, setFilterLinked] = useState<'all' | 'linked' | 'unlinked'>('all')
  const isMobile = useIsMobile()
  const [mobileCol, setMobileCol] = useState<TodoStatus>('PENDING')

  const { data, isLoading } = useQuery({
    queryKey: ['sprint-board', sprintId],
    queryFn: async () => {
      const res = await fetch(`/api/sprints/${sprintId}/board`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed')
      return json.data as BoardData
    },
    refetchOnWindowFocus: false,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['sprint-board', sprintId] })

  async function startSprintNow() {
    setStarting(true)
    try {
      const res = await fetch(`/api/sprints/${sprintId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'ACTIVE' }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed')
      toast.success('Sprint started')
      invalidate()
    } catch (err: any) {
      toast.error(err.message || 'Failed to start sprint')
    } finally {
      setStarting(false)
    }
  }

  function handleStartSprintClick() {
    if (!data) return
    if (!data.sprint.startDate || !data.sprint.endDate) {
      setScheduleMode('start')
      return
    }
    void startSprintNow()
  }

  async function moveTodo(todoId: string, newStatus: BoardColumn['status']) {
    try {
      const res = await fetch(`/api/todos/${todoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed')
      invalidate()
    } catch (err: any) {
      toast.error(err.message || 'Failed to move task')
    }
  }

  const filteredColumns = useMemo(() => {
    if (!data) return []
    return data.columns.map((c) => ({
      ...c,
      todos: c.todos.filter((t) => {
        if (filterAssignee && t.assigneeId !== filterAssignee) return false
        if (filterLinked === 'linked' && !t.keyResult) return false
        if (filterLinked === 'unlinked' && t.keyResult) return false
        return true
      }),
    }))
  }, [data, filterAssignee, filterLinked])

  if (isLoading || !data) {
    return <div className="p-6 text-[13px] text-muted-foreground">Loading sprint…</div>
  }

  const { sprint, aggregates, participants } = data
  const daysLeft = sprint.endDate ? Math.max(0, Math.ceil((new Date(sprint.endDate).getTime() - Date.now()) / 86400000)) : null

  const incompleteTodos = data.columns
    .filter((c) => c.status !== 'COMPLETED')
    .flatMap((c) => c.todos.map((t) => ({ id: t.id, title: t.title, status: t.status })))
  const completedCount = data.columns.find((c) => c.status === 'COMPLETED')?.todos.length ?? 0

  return (
    <div className="space-y-3">
      {/* Sticky header (spec §4.3) */}
      <div className="sticky top-0 z-20 -mx-4 border-b bg-[var(--ap-bg)] px-4 py-3" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/dashboard/sprints" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Sprints
          </Link>
          <h1 className="text-[18px] font-semibold leading-tight" style={{ letterSpacing: '-0.01em' }}>{sprint.name}</h1>
          <StatusPill status={sprint.state.toLowerCase().replace('_', '-')} />
          <div className="ml-auto flex items-center gap-2">
            {sprint.state === 'PLANNING' && (
              <>
                <button
                  type="button"
                  onClick={() => setScheduleMode('edit')}
                  className="rounded-[10px] border px-3 py-1 text-[12px] font-semibold hover:bg-muted"
                  style={{ borderColor: 'var(--ap-border)' }}
                >
                  {sprint.startDate && sprint.endDate ? 'Edit dates' : 'Schedule'}
                </button>
                <button
                  type="button"
                  onClick={handleStartSprintClick}
                  disabled={starting}
                  className="rounded-[10px] bg-primary px-3 py-1 text-[12px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {starting ? 'Starting…' : 'Start sprint'}
                </button>
              </>
            )}
            {sprint.state === 'ACTIVE' && (
              <button
                type="button"
                onClick={() => setShowEnd(true)}
                className="rounded-[10px] border px-3 py-1 text-[12px] font-semibold hover:bg-muted"
                style={{ borderColor: 'var(--ap-border)' }}
              >
                End sprint
              </button>
            )}
            <button type="button" className="rounded-[10px] border p-1 hover:bg-muted" style={{ borderColor: 'var(--ap-border)' }}>
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
          {sprint.startDate && sprint.endDate && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(sprint.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {' → '}
              {new Date(sprint.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          {daysLeft !== null && <span>{daysLeft} days remaining</span>}
        </div>

        {/* Dual progress bars */}
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold">Tasks</span>
              <span className="tabular-nums text-muted-foreground">
                {aggregates.taskDone}/{aggregates.taskTotal} done ({aggregates.taskPercent}%)
              </span>
            </div>
            <div className="mt-1"><ProgressBar percent={aggregates.taskPercent} color="var(--ap-green)" /></div>
          </div>
          {sprint.goalTarget != null && sprint.goalTarget > 0 && (
            <div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold">{sprint.goalLabel ?? 'Goal'}</span>
                <span className="tabular-nums text-muted-foreground">
                  {sprint.goalUnit ? `${sprint.goalUnit} ` : ''}{(sprint.goalCurrent ?? 0).toLocaleString()} / {sprint.goalTarget.toLocaleString()} ({aggregates.goalPercent ?? 0}%)
                </span>
              </div>
              <div className="mt-1"><ProgressBar percent={aggregates.goalPercent ?? 0} color="var(--ap-accent)" /></div>
            </div>
          )}
        </div>

        {/* Action row */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-[10px] border p-0.5 text-[11px]" style={{ borderColor: 'var(--ap-border)' }}>
            <Filter className="ml-1 h-3 w-3 text-muted-foreground" />
            <select
              value={filterAssignee ?? ''}
              onChange={(e) => setFilterAssignee(e.target.value || null)}
              className="bg-transparent px-1 py-0.5 outline-none"
            >
              <option value="">All assignees</option>
              {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1 rounded-[10px] border p-0.5 text-[11px]" style={{ borderColor: 'var(--ap-border)' }}>
            {(['all', 'linked', 'unlinked'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilterLinked(f)}
                className={cn('rounded px-2 py-0.5 capitalize',
                  filterLinked === f ? 'bg-muted font-semibold' : 'text-muted-foreground hover:bg-muted/50')}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="ml-auto flex -space-x-1">
            {participants.slice(0, 5).map((u) => <Avatar key={u.id} user={u} size={22} />)}
            {participants.length > 5 && (
              <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                +{participants.length - 5}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Columns */}
      {aggregates.taskTotal === 0 ? (
        <EmptyState
          title="This sprint is empty"
          description="Add tasks from the backlog or create new ones."
          action={{ label: 'Create task', onClick: () => { /* opens via inline form below */ } }}
        />
      ) : null}

      {/* Mobile column tab switcher (hidden on lg+) */}
      <div className="flex gap-1 rounded-[10px] border p-1 lg:hidden" style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)' }}>
        {(['PENDING', 'IN_PROGRESS', 'COMPLETED'] as const).map((s) => {
          const col = filteredColumns.find((c) => c.status === s)
          const label = s === 'PENDING' ? 'To Do' : s === 'IN_PROGRESS' ? 'In Progress' : 'Done'
          const count = col?.todos.length ?? 0
          const active = mobileCol === s
          return (
            <button
              key={s}
              type="button"
              onClick={() => setMobileCol(s)}
              className={cn(
                'flex-1 rounded-[8px] px-2 py-1.5 text-[12px] font-semibold transition-colors',
                active ? 'bg-[var(--ap-bg-raised)] text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label} <span className="ml-1 tabular-nums opacity-70">{count}</span>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {filteredColumns.map((col) => (
          <div
            key={col.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const todoId = e.dataTransfer.getData('todoId')
              if (todoId) moveTodo(todoId, col.status)
            }}
            className={cn(
              'rounded-[14px] border p-3',
              isMobile && mobileCol !== col.status && 'hidden',
            )}
            style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)' }}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {col.name} <span className="ml-1 tabular-nums">{col.todos.length}</span>
              </p>
            </div>

            <div className="space-y-2">
              {col.todos.map((t) => (
                <TaskCard
                  key={t.id}
                  todo={t}
                  onClick={() => setOpenTodoId(t.id)}
                  onDragStart={(e) => e.dataTransfer.setData('todoId', t.id)}
                />
              ))}
            </div>

            {col.id === 'PENDING' && (
              <div className="mt-2">
                <AddTaskInline
                  sprintId={sprintId}
                  currentUserId={currentUserId}
                  defaultDueDate={sprint.endDate}
                  onCreated={invalidate}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Centered task detail modal (Trello-style) */}
      <TodoCardModal
        todoId={openTodoId}
        currentUserId={currentUserId}
        onClose={() => setOpenTodoId(null)}
        onUpdated={invalidate}
        mode="modal"
      />

      {/* Schedule / start sprint modal */}
      <ScheduleSprintModal
        open={scheduleMode !== null}
        onClose={() => setScheduleMode(null)}
        sprintId={sprintId}
        sprintName={sprint.name}
        initialStart={sprint.startDate}
        initialEnd={sprint.endDate}
        activateOnSave={scheduleMode === 'start'}
        onSaved={invalidate}
      />

      {/* End sprint modal */}
      <EndSprintModal
        open={showEnd}
        onClose={() => setShowEnd(false)}
        sprintId={sprintId}
        sprintName={sprint.name}
        completedCount={completedCount}
        incompleteTodos={incompleteTodos}
        goalLabel={sprint.goalLabel}
        goalCurrent={sprint.goalCurrent}
        goalTarget={sprint.goalTarget}
        goalUnit={sprint.goalUnit}
      />
    </div>
  )
}
