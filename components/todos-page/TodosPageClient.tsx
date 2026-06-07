'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  Plus,
  Search,
  Calendar,
  Link2,
  Target,
  X,
  Check,
  ChevronDown,
  User as UserIcon,
  Trash2,
  PanelRight,
  Maximize2,
} from 'lucide-react'
import { TodoCardModal } from '@/components/todos/TodoCardModal'
import { EmptyState } from '@/components/ui/EmptyState'
import { CheckSquare } from 'lucide-react'
import TodoKanbanView from './TodoKanbanView'
import TodoTreeView from './TodoTreeView'
import { useTodoStore } from '@/lib/stores/todo-store'
import { useUserPrefsStore } from '@/lib/stores/user-prefs-store'
import { useCreateIntentStore } from '@/lib/stores/create-intent-store'

export interface UserOption {
  id: string
  name: string
  avatar: string | null
}

export interface KrOption {
  id: string
  title: string
  objective: { id: string; title: string }
}

export interface ObjectiveOption {
  id: string
  title: string
  level: string
}

export interface TodoRow {
  id: string
  title: string
  description: string | null
  status: string
  dueDate: string | null
  completedAt: string | null
  /** Optional Trello-style — a card may have no primary assignee. */
  assignee: UserOption | null
  creator: UserOption
  keyResultId: string | null
  keyResult: {
    id: string
    title: string
    objective: { id: string; title: string; level: string; timeframeName: string }
  } | null
  objectiveId: string | null
  objective: { id: string; title: string; level: string; timeframeName: string } | null
  createdAt: string
  updatedAt: string
}

interface Props {
  initialRows: TodoRow[]
  users: UserOption[]
  keyResults: KrOption[]
  objectives: ObjectiveOption[]
  currentUserId: string
}

type StatusFilter = 'all' | 'open' | 'completed'
type ScopeFilter = 'assigned' | 'created' | 'all'
type LinkFilter = 'all' | 'linked' | 'standalone'

export default function TodosPageClient({
  initialRows,
  users,
  keyResults,
  objectives,
  currentUserId,
}: Props) {
  // ─── Zustand stores ───
  const { todos: rows, setTodos, toggleComplete, changeStatus, changeAssignee, changeDueDate, deleteTodo, addTodo, updateTodo, fetchTodos, reorder } = useTodoStore()
  const { todoViewMode: viewMode, load: loadPrefs, setTodoViewMode } = useUserPrefsStore()

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('assigned')
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [openTodoId, setOpenTodoId] = useState<string | null>(null)
  const [viewType, setViewType] = useState<'list' | 'kanban' | 'tree'>('list')

  // Cmd-K "Create to-do" → open the create modal.
  const createIntent = useCreateIntentStore((s) => s.intent)
  const createNonce = useCreateIntentStore((s) => s.nonce)
  const clearCreateIntent = useCreateIntentStore((s) => s.clear)
  useEffect(() => {
    if (createIntent === 'todo') {
      setShowCreate(true)
      clearCreateIntent()
    }
  }, [createIntent, createNonce, clearCreateIntent])

  // Hydrate stores from server-provided initial data + user prefs
  useEffect(() => {
    setTodos(initialRows as any)
    loadPrefs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Deep-link support: /dashboard/todos?open=<id> auto-opens that initiative's
  // detail panel. Used by the OKR hierarchy + other deep-links.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    const openId = sp.get('open')
    if (openId) setOpenTodoId(openId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleViewMode() {
    setTodoViewMode(viewMode === 'modal' ? 'sidebar' : 'modal')
  }

  // ---------- Filter pipeline ----------
  const filteredRows = useMemo(() => {
    let list = rows

    // Scope
    if (scopeFilter === 'assigned') {
      list = list.filter((t) => t.assignee?.id === currentUserId)
    } else if (scopeFilter === 'created') {
      list = list.filter((t) => t.creator.id === currentUserId)
    }

    // Status
    if (statusFilter === 'open') {
      list = list.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
    } else if (statusFilter === 'completed') {
      list = list.filter((t) => t.status === 'COMPLETED')
    }

    // Link
    if (linkFilter === 'linked') {
      list = list.filter((t) => t.keyResult || t.objective)
    } else if (linkFilter === 'standalone') {
      list = list.filter((t) => !t.keyResult && !t.objective)
    }

    // Search
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description?.toLowerCase().includes(q) ?? false) ||
          (t.keyResult?.title.toLowerCase().includes(q) ?? false) ||
          (t.objective?.title.toLowerCase().includes(q) ?? false)
      )
    }

    return list
  }, [rows, scopeFilter, statusFilter, linkFilter, query, currentUserId])

  const counts = useMemo(() => {
    const open = rows.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED').length
    const overdue = rows.filter((t) => {
      if (t.status === 'COMPLETED' || !t.dueDate) return false
      return new Date(t.dueDate).getTime() < Date.now()
    }).length
    const dueToday = rows.filter((t) => {
      if (t.status === 'COMPLETED' || !t.dueDate) return false
      return isSameDay(new Date(t.dueDate), new Date())
    }).length
    return { total: rows.length, open, overdue, dueToday }
  }, [rows])

  // ---------- Mutations (delegated to Zustand store) ----------

  function handleToggle(row: TodoRow) {
    toggleComplete(row.id)
  }

  function handleChangeStatus(rowId: string, status: string) {
    changeStatus(rowId, status)
  }

  function handleChangeAssignee(rowId: string, assigneeId: string) {
    const user = users.find((u) => u.id === assigneeId)
    if (!user) return
    changeAssignee(rowId, assigneeId, user)
  }

  function handleChangeDueDate(rowId: string, dueDate: string | null) {
    changeDueDate(rowId, dueDate)
  }

  function handleDelete(rowId: string) {
    if (!confirm('Delete this to-do?')) return
    deleteTodo(rowId)
  }

  function onCreated(newRow: TodoRow) {
    addTodo(newRow as any)
    setShowCreate(false)
  }

  // ---------- Render ----------
  return (
    <div className="-m-3 sm:-m-6 min-h-full p-4 sm:p-6">
      <div className="mx-auto max-w-[1200px]">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-[var(--ap-fg)]">To-dos</h1>
            <p className="text-[13px] text-[var(--ap-fg-muted)] mt-0.5">
              Everything on your plate — linked to OKRs or standalone.{' '}
              <span className="font-medium text-[var(--ap-fg-secondary)]">{counts.open} open</span>
              {counts.overdue > 0 && <span className="text-[var(--ap-red)] font-medium"> · {counts.overdue} overdue</span>}
              {counts.dueToday > 0 && <span className="text-[var(--ap-orange)] font-medium"> · {counts.dueToday} due today</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleViewMode}
              title={`View mode: ${viewMode}. Click to switch.`}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] text-[13px] font-medium text-[var(--ap-fg-secondary)] hover:bg-[var(--ap-bg-hover)] transition-colors"
            >
              {viewMode === 'modal' ? <Maximize2 className="h-3.5 w-3.5" /> : <PanelRight className="h-3.5 w-3.5" />}
              {viewMode === 'modal' ? 'Modal' : 'Sidebar'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] bg-[var(--ap-accent)] text-white text-[13px] font-medium hover:bg-[var(--ap-accent-hover)] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Create to-do
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="rounded-[10px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] mb-4 px-3 py-2 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ap-fg-muted)]" />
            <input
              type="search"
              placeholder="Filter by title, description, KR, or objective"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 rounded-[8px] border border-[var(--ap-border)] bg-[rgba(120,120,128,0.06)] text-[13px] text-[var(--ap-fg)] placeholder:text-[var(--ap-fg-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ap-accent)] focus:ring-offset-0 focus:border-[var(--ap-accent)]"
            />
          </div>
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value as ScopeFilter)}
            className="h-8 px-2.5 rounded-[8px] border border-[var(--ap-border)] bg-[rgba(120,120,128,0.06)] text-[13px] text-[var(--ap-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--ap-accent)]"
          >
            <option value="assigned">Assigned to me</option>
            <option value="created">Created by me</option>
            <option value="all">All visible</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-8 px-2.5 rounded-[8px] border border-[var(--ap-border)] bg-[rgba(120,120,128,0.06)] text-[13px] text-[var(--ap-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--ap-accent)]"
          >
            <option value="open">Open</option>
            <option value="completed">Completed</option>
            <option value="all">All statuses</option>
          </select>
          <select
            value={linkFilter}
            onChange={(e) => setLinkFilter(e.target.value as LinkFilter)}
            className="h-8 px-2.5 rounded-[8px] border border-[var(--ap-border)] bg-[rgba(120,120,128,0.06)] text-[13px] text-[var(--ap-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--ap-accent)]"
          >
            <option value="all">Any link</option>
            <option value="linked">Linked to OKR</option>
            <option value="standalone">Standalone</option>
          </select>
        </div>

        {/* View switcher */}
        <div className="mb-3 flex items-center gap-0 border-b border-[var(--ap-border)]">
          {(['list', 'kanban', 'tree'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={viewType === v}
              onClick={() => setViewType(v)}
              className={`px-3 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer ${
                viewType === v
                  ? 'border-[var(--ap-accent)] text-[var(--ap-accent)]'
                  : 'border-transparent text-[var(--ap-fg-muted)] hover:text-[var(--ap-fg)]'
              }`}
            >
              {v === 'list' ? 'List' : v === 'kanban' ? 'Board' : 'Tree'}
            </button>
          ))}
        </div>

        {/* Views */}
        {viewType === 'list' && (
          <div className="rounded-[10px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] overflow-hidden">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[var(--ap-border)] bg-[rgba(120,120,128,0.04)]">
                  <th className="w-9 px-3 py-2.5"></th>
                  <th className="text-left px-3 py-2.5 font-medium text-[var(--ap-fg-muted)] text-[11px] uppercase tracking-wide">To-do</th>
                  <th className="text-left px-3 py-2.5 font-medium text-[var(--ap-fg-muted)] text-[11px] uppercase tracking-wide w-[200px]">Linked to</th>
                  <th className="text-left px-3 py-2.5 font-medium text-[var(--ap-fg-muted)] text-[11px] uppercase tracking-wide w-[100px]">Timeframe</th>
                  <th className="text-left px-3 py-2.5 font-medium text-[var(--ap-fg-muted)] text-[11px] uppercase tracking-wide w-[110px]">Due</th>
                  <th className="text-center px-3 py-2.5 font-medium text-[var(--ap-fg-muted)] text-[11px] uppercase tracking-wide w-[50px]">Owner</th>
                  <th className="text-left px-3 py-2.5 font-medium text-[var(--ap-fg-muted)] text-[11px] uppercase tracking-wide w-[100px]">Status</th>
                  <th className="w-10 px-2 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-2">
                      <EmptyState
                        bare
                        icon={CheckSquare}
                        title="No to-dos"
                        description="Create one to get started"
                      />
                    </td>
                  </tr>
                )}
                {filteredRows.map((row) => (
                  <TodoTableRow
                    key={row.id}
                    row={row}
                    onToggle={() => handleToggle(row)}
                    onDelete={() => handleDelete(row.id)}
                    onOpen={() => setOpenTodoId(row.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {viewType === 'kanban' && (
          <TodoKanbanView
            rows={filteredRows}
            users={users}
            onToggle={handleToggle}
            onStatusChange={handleChangeStatus}
            onReorder={(columnOrders) => void reorder(columnOrders)}
            onOpen={setOpenTodoId}
            onAssigneeChange={handleChangeAssignee}
          />
        )}

        {viewType === 'tree' && (
          <TodoTreeView
            rows={filteredRows}
            users={users}
            onToggle={handleToggle}
            onOpen={setOpenTodoId}
            onStatusChange={handleChangeStatus}
            onAssigneeChange={handleChangeAssignee}
            onDueDateChange={handleChangeDueDate}
          />
        )}
      </div>

      {openTodoId && (
        <TodoCardModal
          todoId={openTodoId}
          currentUserId={currentUserId}
          onClose={() => setOpenTodoId(null)}
          onUpdated={() => fetchTodos()}
        />
      )}

      {showCreate && (
        <CreateTodoModal
          users={users}
          keyResults={keyResults}
          objectives={objectives}
          currentUserId={currentUserId}
          onClose={() => setShowCreate(false)}
          onCreated={onCreated}
        />
      )}
    </div>
  )
}

// ───────────────────────── row ─────────────────────────

function TodoTableRow({
  row,
  onToggle,
  onDelete,
  onOpen,
}: {
  row: TodoRow
  onToggle: () => void
  onDelete: () => void
  onOpen: () => void
}) {
  const isDone = row.status === 'COMPLETED'
  const timeframeName = row.keyResult?.objective.timeframeName ?? row.objective?.timeframeName
  const overdue = !isDone && row.dueDate && new Date(row.dueDate).getTime() < Date.now()

  return (
    <tr
      className="group border-b border-[var(--ap-border)] last:border-0 hover:bg-[var(--ap-bg-hover)] cursor-pointer transition-colors"
      onClick={onOpen}
    >
      <td className="px-3 py-2.5 w-9" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onToggle}
          className={`flex items-center justify-center w-[18px] h-[18px] rounded-full border-2 transition-colors ${
            isDone
              ? 'bg-[var(--ap-accent)] border-[var(--ap-accent)]'
              : 'border-[var(--ap-border-strong)] hover:border-[var(--ap-accent)]'
          }`}
          aria-label={isDone ? 'Mark pending' : 'Mark completed'}
        >
          {isDone && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
        </button>
      </td>
      <td className="px-3 py-2.5 min-w-0">
        <div className="min-w-0">
          <div className={`text-[13px] font-medium truncate ${isDone ? 'text-[var(--ap-fg-muted)] line-through' : 'text-[var(--ap-fg)]'}`}>
            {row.title}
          </div>
          {row.description && (
            <div className="truncate text-[12px] text-[var(--ap-fg-muted)] mt-0.5"
              dangerouslySetInnerHTML={{ __html: row.description.replace(/<[^>]+>/g, '') }}
            />
          )}
        </div>
      </td>
      <td className="px-3 py-2.5 w-[200px]">
        {row.keyResult ? (
          <div className="min-w-0">
            <Link
              href={`/dashboard/key-results/${row.keyResult.id}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[12px] text-[var(--ap-accent)] hover:underline max-w-full"
              title={row.keyResult.objective.title}
            >
              <Link2 className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{row.keyResult.title}</span>
            </Link>
            <div className="text-[11px] text-[var(--ap-fg-muted)] truncate mt-0.5">{row.keyResult.objective.title}</div>
          </div>
        ) : row.objective ? (
          <Link
            href={`/dashboard/objectives/${row.objective.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[12px] text-[var(--ap-accent)] hover:underline max-w-full"
          >
            <Target className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{row.objective.title}</span>
          </Link>
        ) : (
          <span className="text-[12px] text-[var(--ap-fg-muted)]">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 w-[100px]">
        <span className="text-[12px] text-[var(--ap-fg-muted)]">{timeframeName ?? '—'}</span>
      </td>
      <td className="px-3 py-2.5 w-[110px]">
        {row.dueDate ? (
          <span className={`inline-flex items-center gap-1 text-[12px] font-medium ${overdue ? 'text-[var(--ap-red)]' : 'text-[var(--ap-fg-secondary)]'}`}>
            <Calendar className="h-3 w-3" />
            {new Date(row.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        ) : (
          <span className="text-[12px] text-[var(--ap-fg-muted)]">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 w-[50px] text-center">
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--ap-accent-soft)] text-[var(--ap-accent)] text-[11px] font-semibold"
          title={`Assigned to ${row.assignee?.name ?? ''}`}
        >
          {row.assignee?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.assignee.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
          ) : (
            (row.assignee?.name ?? '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
          )}
        </span>
      </td>
      <td className="px-3 py-2.5 w-[100px]">
        <StatusLozenge status={row.status} />
      </td>
      <td className="px-2 py-2.5 w-10">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="inline-flex items-center justify-center w-7 h-7 rounded-[6px] text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-sunken)] hover:text-[var(--ap-red)] transition-colors opacity-0 group-hover:opacity-100"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}

function StatusLozenge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    PENDING:     { label: 'To do',      bg: 'bg-[rgba(120,120,128,0.12)]', text: 'text-[var(--ap-fg-secondary)]' },
    IN_PROGRESS: { label: 'In progress',bg: 'bg-[rgba(0,122,255,0.12)]',   text: 'text-[var(--ap-accent)]' },
    COMPLETED:   { label: 'Done',       bg: 'bg-[rgba(52,199,89,0.12)]',   text: 'text-[var(--ap-green)]' },
    CANCELLED:   { label: 'Cancelled',  bg: 'bg-[rgba(255,59,48,0.12)]',   text: 'text-[var(--ap-red)]' },
  }
  const v = map[status] ?? { label: status, bg: 'bg-[rgba(120,120,128,0.12)]', text: 'text-[var(--ap-fg-secondary)]' }
  return (
    <span className={`inline-flex items-center h-5 px-2 text-[11px] font-semibold rounded-full ${v.bg} ${v.text}`}>
      {v.label}
    </span>
  )
}

// ───────────────────────── create modal ─────────────────────────

function CreateTodoModal({
  users,
  keyResults,
  objectives,
  currentUserId,
  onClose,
  onCreated,
}: {
  users: UserOption[]
  keyResults: KrOption[]
  objectives: ObjectiveOption[]
  currentUserId: string
  onClose: () => void
  onCreated: (row: TodoRow) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  // Trello-style: cards start unassigned. Caller can still pick someone before
  // submitting via the Assignee dropdown if they want.
  const [assigneeId, setAssigneeId] = useState<string>('')
  const [dueDate, setDueDate] = useState('')
  const [keyResultId, setKeyResultId] = useState<string>('')
  const [objectiveId, setObjectiveId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [krSearch, setKrSearch] = useState('')
  const [objSearch, setObjSearch] = useState('')

  const filteredKrs = useMemo(() => {
    const q = krSearch.trim().toLowerCase()
    if (!q) return keyResults.slice(0, 50)
    return keyResults
      .filter((k) => k.title.toLowerCase().includes(q) || k.objective.title.toLowerCase().includes(q))
      .slice(0, 50)
  }, [keyResults, krSearch])

  const filteredObjs = useMemo(() => {
    const q = objSearch.trim().toLowerCase()
    if (!q) return objectives.slice(0, 50)
    return objectives.filter((o) => o.title.toLowerCase().includes(q)).slice(0, 50)
  }, [objectives, objSearch])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          assigneeId: assigneeId || undefined,
          dueDate: dueDate || undefined,
          keyResultId: keyResultId || undefined,
          objectiveId: objectiveId || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')

      // Shape the returned todo into a TodoRow for optimistic append. We trust the
      // API to include the joined relations.
      const t = data.data
      const row: TodoRow = {
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        dueDate: t.dueDate,
        completedAt: t.completedAt,
        assignee: t.assignee,
        creator: t.creator,
        keyResultId: t.keyResultId,
        keyResult: t.keyResult
          ? {
              id: t.keyResult.id,
              title: t.keyResult.title,
              objective: {
                id: t.keyResult.objective.id,
                title: t.keyResult.objective.title,
                level: t.keyResult.objective.level,
                timeframeName: '',
              },
            }
          : null,
        objectiveId: t.objectiveId,
        objective: t.objective
          ? {
              id: t.objective.id,
              title: t.objective.title,
              level: t.objective.level,
              timeframeName: '',
            }
          : null,
        createdAt: t.createdAt || new Date().toISOString(),
        updatedAt: t.updatedAt || new Date().toISOString(),
      }
      toast.success('To-do created')
      onCreated(row)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = "w-full h-8 px-3 rounded-[8px] border border-[var(--ap-border)] bg-[rgba(120,120,128,0.06)] text-[13px] text-[var(--ap-fg)] placeholder:text-[var(--ap-fg-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ap-accent)] focus:border-[var(--ap-accent)]"
  const labelCls = "block text-[11px] font-semibold uppercase tracking-wide text-[var(--ap-fg-muted)] mb-1"

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4 pt-[8vh]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ap-modal-enter relative w-full max-w-[560px] rounded-[14px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)]"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05)' }}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--ap-border)]">
          <h2 className="text-[15px] font-semibold text-[var(--ap-fg)]">Create to-do</h2>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[rgba(120,120,128,0.12)] text-[var(--ap-fg-muted)] hover:text-[var(--ap-fg)] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4 space-y-4">
          <div>
            <label className={labelCls}>Title</label>
            <input autoFocus type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?" className={inputCls} required />
          </div>

          <div>
            <label className={labelCls}>Description (optional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              rows={3} placeholder="Add any context…"
              className={`${inputCls} h-auto min-h-[72px] py-2 resize-none`} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Assignee</label>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputCls}>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Due date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Link to Key Result (optional)</label>
            <div className="rounded-[8px] border border-[var(--ap-border)] bg-[var(--ap-bg)] overflow-hidden max-h-[160px] overflow-y-auto">
              <div className="p-2 border-b border-[var(--ap-border)]">
                <input type="text" value={krSearch} onChange={(e) => setKrSearch(e.target.value)}
                  placeholder="Search key results…" className={inputCls} />
              </div>
              <button type="button" onClick={() => setKeyResultId('')}
                className={`flex items-center gap-2 w-full px-3 py-2 text-[13px] transition-colors cursor-pointer ${keyResultId === '' ? 'bg-[var(--ap-accent-soft)] text-[var(--ap-accent)]' : 'text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-hover)]'}`}>
                <X className="h-3 w-3" /> None
              </button>
              {filteredKrs.map((kr) => (
                <button key={kr.id} type="button" onClick={() => setKeyResultId(kr.id)}
                  className={`flex items-center gap-2 w-full px-3 py-2 text-left text-[13px] transition-colors cursor-pointer ${keyResultId === kr.id ? 'bg-[var(--ap-accent-soft)] text-[var(--ap-accent)]' : 'text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)]'}`}>
                  <Link2 className="h-3 w-3 flex-shrink-0 text-[var(--ap-fg-muted)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{kr.title}</span>
                    <span className="block truncate text-[11px] text-[var(--ap-fg-muted)]">{kr.objective.title}</span>
                  </span>
                  {keyResultId === kr.id && <Check className="h-3 w-3 flex-shrink-0 text-[var(--ap-accent)]" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Or link to Objective (optional)</label>
            <div className="rounded-[8px] border border-[var(--ap-border)] bg-[var(--ap-bg)] overflow-hidden max-h-[160px] overflow-y-auto">
              <div className="p-2 border-b border-[var(--ap-border)]">
                <input type="text" value={objSearch} onChange={(e) => setObjSearch(e.target.value)}
                  placeholder="Search objectives…" className={inputCls} />
              </div>
              <button type="button" onClick={() => setObjectiveId('')}
                className={`flex items-center gap-2 w-full px-3 py-2 text-[13px] transition-colors cursor-pointer ${objectiveId === '' ? 'bg-[var(--ap-accent-soft)] text-[var(--ap-accent)]' : 'text-[var(--ap-fg-muted)] hover:bg-[var(--ap-bg-hover)]'}`}>
                <X className="h-3 w-3" /> None
              </button>
              {filteredObjs.map((o) => (
                <button key={o.id} type="button" onClick={() => setObjectiveId(o.id)}
                  className={`flex items-center gap-2 w-full px-3 py-2 text-left text-[13px] transition-colors cursor-pointer ${objectiveId === o.id ? 'bg-[var(--ap-accent-soft)] text-[var(--ap-accent)]' : 'text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)]'}`}>
                  <Target className="h-3 w-3 flex-shrink-0 text-[var(--ap-fg-muted)]" />
                  <span className="truncate flex-1">{o.title}</span>
                  <span className="text-[10px] text-[var(--ap-fg-muted)]">{o.level.toLowerCase()}</span>
                  {objectiveId === o.id && <Check className="h-3 w-3 flex-shrink-0 text-[var(--ap-accent)]" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--ap-border)]">
            <button type="button" onClick={onClose}
              className="h-8 px-4 rounded-[8px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] text-[13px] font-medium text-[var(--ap-fg-secondary)] hover:bg-[var(--ap-bg-hover)] transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!title.trim() || submitting}
              className="h-8 px-4 rounded-[8px] bg-[var(--ap-accent)] text-white text-[13px] font-medium hover:bg-[var(--ap-accent-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {submitting ? 'Creating…' : 'Create to-do'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ───────────────────────── utils ─────────────────────────

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
