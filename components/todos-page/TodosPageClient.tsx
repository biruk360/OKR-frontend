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
} from 'lucide-react'
import { TodoCardModal } from '@/components/todos/TodoCardModal'
import { EmptyState } from '@/components/ui/EmptyState'
import { CheckSquare } from 'lucide-react'
import TodoKanbanView from './TodoKanbanView'
import TodoTreeView from './TodoTreeView'
import { useTodoStore } from '@/lib/stores/todo-store'
import { todoStatusMeta } from '@/lib/todo-status'
import { userColor, userInitials } from '@/lib/user-color'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { useUserPrefsStore } from '@/lib/stores/user-prefs-store'
import { useCreateIntentStore } from '@/lib/stores/create-intent-store'
import { isOverdue } from '@/lib/todos/due-tone'

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
  /** Short, stable reference rendered as "#482". */
  cardNumber: number
  /** Non-null when soft-archived. Hidden unless the Archived filter is on. */
  archivedAt: string | null
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

type StatusFilter = 'all' | 'open' | 'completed' | 'archived'
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
  const { load: loadPrefs } = useUserPrefsStore()

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('assigned')
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [openTodoId, setOpenTodoId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
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
    setTodos(initialRows)
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


  // ---------- Filter pipeline ----------
  const filteredRows = useMemo(() => {
    let list = rows

    // Scope
    if (scopeFilter === 'assigned') {
      list = list.filter((t) => t.assignee?.id === currentUserId)
    } else if (scopeFilter === 'created') {
      list = list.filter((t) => t.creator.id === currentUserId)
    }

    // Archive is a separate axis from status: an archived card keeps whatever
    // status it had. Every view except "Archived" hides archived rows, so the
    // default experience is unchanged by the feature existing.
    if (statusFilter === 'archived') {
      list = list.filter((t) => t.archivedAt)
    } else {
      list = list.filter((t) => !t.archivedAt)
      if (statusFilter === 'open') {
        list = list.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
      } else if (statusFilter === 'completed') {
        list = list.filter((t) => t.status === 'COMPLETED')
      }
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
    const live = rows.filter((t) => !t.archivedAt)
    const open = live.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED').length
    // `isOverdue` treats an all-day task as due at the END of its day, so a
    // task due today no longer counts as overdue from 00:01 — which is also
    // what lib/todos/due-reminders.ts has always assumed.
    const overdue = live.filter((t) =>
      isOverdue(t.dueDate, { done: t.status === 'COMPLETED' || t.status === 'CANCELLED' }),
    ).length
    const dueToday = live.filter((t) => {
      if (t.status === 'COMPLETED' || !t.dueDate) return false
      return isSameDay(new Date(t.dueDate), new Date())
    }).length
    return { total: live.length, open, overdue, dueToday }
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
    setPendingDelete(rowId)
  }

  function onCreated(newRow: TodoRow) {
    addTodo(newRow)
    setShowCreate(false)
  }

  // ---------- Render ----------
  return (
    <div className="-m-3 min-h-full px-4 pb-20 pt-4 sm:-m-6 sm:px-[26px] sm:pb-20 sm:pt-[22px]">
      <div className="mx-auto max-w-[1180px]">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-bold tracking-[-0.02em] text-[var(--ap-fg)]">To-dos</h1>
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
              onClick={() => setShowCreate(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-[var(--ap-radius-md)] bg-[var(--ap-accent)] px-[15px] text-[13px] font-semibold text-[var(--ap-accent-fg)] transition-colors hover:bg-[var(--ap-accent-hover)]"
            >
              <Plus className="h-3.5 w-3.5" /> Create to-do
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="mb-4 mt-[18px] flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-[var(--ap-fg-subtle)]" />
            <input
              type="search"
              placeholder="Filter by title, description, KR, or objective"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-[38px] w-full rounded-[var(--ap-radius-md)] border border-[var(--ap-border-strong)] bg-[var(--ap-bg-raised)] pl-9 pr-3 text-[13.5px] text-[var(--ap-fg)] outline-none transition-colors placeholder:text-[var(--ap-fg-subtle)] focus:border-[var(--ap-focus)]"
            />
          </div>
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value as ScopeFilter)}
            className="h-[38px] cursor-pointer rounded-[var(--ap-radius-md)] border border-[var(--ap-border-strong)] bg-[var(--ap-bg-raised)] px-3 text-[13px] font-semibold text-[var(--ap-fg-muted)] outline-none transition-colors focus:border-[var(--ap-focus)]"
          >
            <option value="assigned">Assigned to me</option>
            <option value="created">Created by me</option>
            <option value="all">All visible</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-[38px] cursor-pointer rounded-[var(--ap-radius-md)] border border-[var(--ap-border-strong)] bg-[var(--ap-bg-raised)] px-3 text-[13px] font-semibold text-[var(--ap-fg-muted)] outline-none transition-colors focus:border-[var(--ap-focus)]"
          >
            <option value="open">Open</option>
            <option value="completed">Completed</option>
            <option value="all">All statuses</option>
            <option value="archived">Archived</option>
          </select>
          <select
            value={linkFilter}
            onChange={(e) => setLinkFilter(e.target.value as LinkFilter)}
            className="h-[38px] cursor-pointer rounded-[var(--ap-radius-md)] border border-[var(--ap-border-strong)] bg-[var(--ap-bg-raised)] px-3 text-[13px] font-semibold text-[var(--ap-fg-muted)] outline-none transition-colors focus:border-[var(--ap-focus)]"
          >
            <option value="all">Any link</option>
            <option value="linked">Linked to OKR</option>
            <option value="standalone">Standalone</option>
          </select>
        </div>

        {/* View switcher */}
        <div className="mt-[18px] flex items-center gap-0.5 border-b border-[var(--ap-border)]">
          {(['list', 'kanban', 'tree'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={viewType === v}
              onClick={() => setViewType(v)}
              className={`h-[38px] cursor-pointer border-b-2 px-3.5 text-[13.5px] font-semibold transition-colors ${
                viewType === v
                  ? 'border-[var(--ap-accent)] text-[var(--ap-accent-on-soft)]'
                  : 'border-transparent text-[var(--ap-fg-subtle)] hover:text-[var(--ap-fg)]'
              }`}
            >
              {v === 'list' ? 'List' : v === 'kanban' ? 'Board' : 'Tree'}
            </button>
          ))}
          <span className="flex-1" />
          <span className="pr-1 font-mono text-[10.5px] text-[var(--ap-fg-subtle)]">
            Showing {filteredRows.length} of {rows.length}
          </span>
        </div>

        {/* Views */}
        {viewType === 'list' && (
          <div className="mt-3.5 overflow-hidden rounded-[var(--ap-radius-card)] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)]">
            {/* `table-fixed` is load-bearing: with the default auto layout the
                browser ignores the w-[…] on each <th> whenever a cell's content
                is wider, so one long OKR title stretched the Linked-to column,
                pushed the table past its wrapper, and the wrapper's
                overflow-hidden clipped Timeframe/Due/Who/Status off the right
                edge entirely. Fixed layout makes the widths real and lets the
                per-cell truncation actually take effect. */}
            <table className="w-full table-fixed border-collapse text-[13px]">
              <thead>
                <tr className="h-[42px] border-b border-[var(--ap-border)] bg-[var(--ap-bg-sunken)]">
                  <th className="w-9 px-3 py-2.5"></th>
                  <th className="min-w-[220px] px-3.5 text-left font-mono text-[9.5px] font-medium uppercase tracking-[0.11em] text-[var(--ap-fg-subtle)]">To-do</th>
                  <th className="px-3.5 text-left font-mono text-[9.5px] font-medium uppercase tracking-[0.11em] text-[var(--ap-fg-subtle)] w-[200px]">Linked to</th>
                  <th className="px-3.5 text-left font-mono text-[9.5px] font-medium uppercase tracking-[0.11em] text-[var(--ap-fg-subtle)] w-[100px]">Timeframe</th>
                  <th className="px-3.5 text-left font-mono text-[9.5px] font-medium uppercase tracking-[0.11em] text-[var(--ap-fg-subtle)] w-[110px]">Due</th>
                  <th className="px-3.5 text-center font-mono text-[9.5px] font-medium uppercase tracking-[0.11em] text-[var(--ap-fg-subtle)] w-[50px]">Who</th>
                  <th className="px-3.5 text-left font-mono text-[9.5px] font-medium uppercase tracking-[0.11em] text-[var(--ap-fg-subtle)] w-[112px]">Status</th>
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

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteTodo(pendingDelete)
          setPendingDelete(null)
        }}
        variant="danger"
        title="Delete to-do"
        message="This removes the to-do and everything on it — checklists, comments and attachments."
        confirmLabel="Delete"
      />

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

/**
 * Plain-text preview of a rich-text description.
 *
 * This row used to render `description.replace(/<[^>]+>/g, '')` through
 * `dangerouslySetInnerHTML`, which is a regex sanitiser feeding an HTML sink —
 * malformed or nested tags can survive it. Returning a string and letting React
 * escape it removes the sink entirely; there is no HTML to inject into.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

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
  const overdue = isOverdue(row.dueDate, { done: isDone })

  return (
    <tr
      className="group cursor-pointer border-b border-[var(--ap-border-soft)] transition-colors last:border-0 hover:bg-[var(--ap-bg-sunken)]"
      onClick={onOpen}
    >
      <td className="px-3.5 py-[11px] w-9" onClick={(e) => e.stopPropagation()}>
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
      <td className="px-3.5 py-[11px] min-w-0">
        <div className="min-w-0">
          <div className={`text-[13px] font-medium truncate ${isDone ? 'text-[var(--ap-fg-muted)] line-through' : 'text-[var(--ap-fg)]'}`}>
            {row.title}
          </div>
          {row.description && (
            <div className="mt-0.5 truncate text-[12px] text-[var(--ap-fg-subtle)]">
              {stripHtml(row.description)}
            </div>
          )}
        </div>
      </td>
      <td className="px-3.5 py-[11px] w-[200px]">
        {row.keyResult ? (
          <div className="min-w-0">
            <Link
              href={`/dashboard/key-results/${row.keyResult.id}`}
              onClick={(e) => e.stopPropagation()}
              className="flex w-full min-w-0 items-center gap-1 text-[12px] text-[var(--ap-accent)] hover:underline"
              title={row.keyResult.objective.title}
            >
              <Link2 className="h-3 w-3 flex-shrink-0" />
              <span className="min-w-0 truncate">{row.keyResult.title}</span>
            </Link>
            <div className="text-[11px] text-[var(--ap-fg-muted)] truncate mt-0.5">{row.keyResult.objective.title}</div>
          </div>
        ) : row.objective ? (
          <Link
            href={`/dashboard/objectives/${row.objective.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex w-full min-w-0 items-center gap-1 text-[12px] text-[var(--ap-accent)] hover:underline"
          >
            <Target className="h-3 w-3 flex-shrink-0" />
            <span className="min-w-0 truncate">{row.objective.title}</span>
          </Link>
        ) : (
          <span className="text-[12px] text-[var(--ap-fg-muted)]">—</span>
        )}
      </td>
      <td className="px-3.5 py-[11px] w-[100px]">
        <span className="text-[12px] text-[var(--ap-fg-muted)]">{timeframeName ?? '—'}</span>
      </td>
      <td className="px-3.5 py-[11px] w-[110px]">
        {row.dueDate ? (
          <span className={`inline-flex items-center gap-1 text-[12px] font-medium ${overdue ? 'text-[var(--ap-red)]' : 'text-[var(--ap-fg-secondary)]'}`}>
            <Calendar className="h-3 w-3" />
            {new Date(row.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        ) : (
          <span className="text-[12px] text-[var(--ap-fg-muted)]">—</span>
        )}
      </td>
      <td className="w-[50px] px-3.5 py-[11px] text-center">
        {row.assignee ? (
          <span
            className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full text-[9.5px] font-bold text-white"
            style={{ background: userColor(row.assignee.id, row.assignee.name) }}
            title={row.assignee.name}
          >
            {row.assignee.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.assignee.avatar} alt="" className="h-[26px] w-[26px] rounded-full object-cover" />
            ) : (
              userInitials(row.assignee.name)
            )}
          </span>
        ) : (
          <span
            title="Unassigned"
            className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full border border-dashed border-[var(--ap-border-strong)] text-[var(--ap-fg-subtle)]"
          >
            <Plus className="h-3 w-3" />
          </span>
        )}
      </td>
      <td className="w-[112px] px-3.5 py-[11px]">
        <StatusLozenge status={row.status} />
      </td>
      <td className="px-2 py-[11px] w-10">
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
  // Single source of truth — this used to carry a private 4-status map, so
  // IN_REVIEW and STUCK rendered as raw uppercase strings.
  const meta = todoStatusMeta(status)
  return (
    <span
      className="inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-[var(--ap-radius-xs)] px-2 text-[11px] font-semibold"
      style={{ background: meta.bg, color: meta.fg }}
    >
      {meta.label}
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

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
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
        cardNumber: t.cardNumber,
        archivedAt: t.archivedAt ?? null,
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
    <Modal
      open
      onClose={onClose}
      title="Create to-do"
      size="md"
      scrollBehavior="internal"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!title.trim() || submitting}>
            {submitting ? 'Creating…' : 'Create to-do'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4 py-1">
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
                <option value="">Unassigned</option>
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

      </form>
    </Modal>
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
