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
import TodoKanbanView from './TodoKanbanView'
import TodoTreeView from './TodoTreeView'
import { useTodoStore } from '@/lib/stores/todo-store'
import { useUserPrefsStore } from '@/lib/stores/user-prefs-store'

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
  assignee: UserOption
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
  const { todos: rows, setTodos, toggleComplete, changeStatus, changeAssignee, changeDueDate, deleteTodo, addTodo, updateTodo, fetchTodos } = useTodoStore()
  const { todoViewMode: viewMode, load: loadPrefs, setTodoViewMode } = useUserPrefsStore()

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('assigned')
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [openTodoId, setOpenTodoId] = useState<string | null>(null)
  const [viewType, setViewType] = useState<'list' | 'kanban' | 'tree'>('list')

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
      list = list.filter((t) => t.assignee.id === currentUserId)
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
    <div className=" -m-3 sm:-m-6 min-h-full p-4 sm:p-6">
      <div className="mx-auto max-w-[1200px]">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">To-dos</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Everything on your plate — linked to OKRs or standalone. {counts.open} open
              {counts.overdue > 0 && <span className="text-destructive"> · {counts.overdue} overdue</span>}
              {counts.dueToday > 0 && <span className="text-amber-600"> · {counts.dueToday} due today</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleViewMode}
              className="btn-outline btn-ghost"
              title={`View mode: ${viewMode}. Click to switch.`}
            >
              {viewMode === 'modal' ? <Maximize2 className="h-3.5 w-3.5" /> : <PanelRight className="h-3.5 w-3.5" />}
              {viewMode === 'modal' ? 'Modal' : 'Sidebar'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="btn-outline btn-primary"
            >
              <Plus className="h-3.5 w-3.5" /> Create to-do
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="rounded-lg border border-border bg-card mb-4 p-2 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Filter by title, description, KR, or objective"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input pl-7"
            />
          </div>
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value as ScopeFilter)}
            className="input input w-auto"
          >
            <option value="assigned">Assigned to me</option>
            <option value="created">Created by me</option>
            <option value="all">All visible</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="input input w-auto"
          >
            <option value="open">Open</option>
            <option value="completed">Completed</option>
            <option value="all">All statuses</option>
          </select>
          <select
            value={linkFilter}
            onChange={(e) => setLinkFilter(e.target.value as LinkFilter)}
            className="input input w-auto"
          >
            <option value="all">Any link</option>
            <option value="linked">Linked to OKR</option>
            <option value="standalone">Standalone</option>
          </select>
        </div>

        {/* View switcher */}
        <div className="mb-3 flex items-center gap-1 border-b border-border">
          {(['list', 'kanban', 'tree'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={viewType === v}
              className="inline-flex items-center gap-1 px-2.5 py-2 text-sm font-medium border-b-2 border-transparent cursor-pointer text-muted-foreground hover:text-foreground"
              onClick={() => setViewType(v)}
            >
              {v === 'list' ? 'List' : v === 'kanban' ? 'Board' : 'Tree'}
            </button>
          ))}
        </div>

        {/* Views */}
        {viewType === 'list' && (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="inline-flex items-center gap-1 px-2.5 py-2 text-sm font-medium border-b-2 border-transparent cursor-pointer text-muted-foreground hover:text-foregroundle">
              <thead>
                <tr>
                  <th style={{ width: '34px' }}></th>
                  <th>To-do</th>
                  <th style={{ width: '220px' }}>Linked to</th>
                  <th style={{ width: '110px' }}>Timeframe</th>
                  <th style={{ width: '120px' }}>Due</th>
                  <th style={{ width: '50px' }}>Owner</th>
                  <th style={{ width: '90px' }}>Status</th>
                  <th style={{ width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-xs text-muted-foreground text-center !py-10">
                      No to-dos match your filters.
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
  const link = row.keyResult || row.objective
  const timeframeName = row.keyResult?.objective.timeframeName ?? row.objective?.timeframeName
  const overdue = !isDone && row.dueDate && new Date(row.dueDate).getTime() < Date.now()

  return (
    <tr className="group cursor-pointer" onClick={onOpen}>
      <td onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isDone}
          onChange={onToggle}
          className="appearance-none w-3.5 h-3.5 rounded border border-border"
          aria-label={isDone ? 'Mark pending' : 'Mark completed'}
        />
      </td>
      <td>
        <div className="min-w-0">
          <div
            className={`truncate text-[14px] ${
              isDone ? 'text-muted-foreground line-through' : 'text-foreground'
            }`}
          >
            {row.title}
          </div>
          {row.description && (
            <div className="truncate text-[12px] text-muted-foreground">
              {row.description}
            </div>
          )}
        </div>
      </td>
      <td>
        {row.keyResult ? (
          <Link
            href={`/dashboard/key-results/${row.keyResult.id}`}
            className="inline-flex items-center gap-1.5 inline-flex items-center h-5 px-1.5 text-xs font-medium rounded"
            data-tone="primary"
            title={row.keyResult.objective.title}
          >
            <Link2 className="h-3 w-3" />
            <span className="max-w-[170px] truncate">{row.keyResult.title}</span>
          </Link>
        ) : row.objective ? (
          <Link
            href={`/dashboard/objectives/${row.objective.id}`}
            className="inline-flex items-center gap-1.5 inline-flex items-center h-5 px-1.5 text-xs font-medium rounded"
            data-tone="primary"
          >
            <Target className="h-3 w-3" />
            <span className="max-w-[170px] truncate">{row.objective.title}</span>
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        {link && 'objective' in (row.keyResult ?? {}) && (
          <div className="truncate text-[11px] text-muted-foreground mt-0.5">
            {row.keyResult?.objective.title}
          </div>
        )}
      </td>
      <td>
        {timeframeName ? (
          <span className="text-[12px] text-muted-foreground">{timeframeName}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td>
        {row.dueDate ? (
          <span
            className={`inline-flex items-center gap-1 text-[12px] ${
              overdue
                ? 'text-destructive font-medium'
                : 'text-muted-foreground'
            }`}
          >
            <Calendar className="h-3 w-3" />
            {new Date(row.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td>
        <span className="inline-flex items-center justify-center size-6 rounded-full bg-muted text-xs font-semibold" title={`Assigned to ${row.assignee.name}`}>
          {row.assignee.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.assignee.avatar} alt="" />
          ) : (
            row.assignee.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
          )}
        </span>
      </td>
      <td>
        <StatusLozenge status={row.status} />
      </td>
      <td>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center justify-center size-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer opacity-0 group-hover:opacity-100"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}

function StatusLozenge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: string }> = {
    PENDING: { label: 'To do', tone: 'default' },
    IN_PROGRESS: { label: 'In progress', tone: 'primary' },
    COMPLETED: { label: 'Done', tone: 'success' },
    CANCELLED: { label: 'Cancelled', tone: 'danger' },
  }
  const v = map[status] ?? { label: status.toLowerCase(), tone: 'default' }
  return (
    <span className="inline-flex items-center h-4 px-1 text-[11px] font-bold uppercase rounded" data-tone={v.tone === 'default' ? undefined : v.tone}>
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
  const [assigneeId, setAssigneeId] = useState(currentUserId)
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
          assigneeId,
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] "
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-lg border border-border bg-card relative w-full max-w-[560px]"
        style={{ boxShadow: '0 4px 8px -2px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.08)' }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-base font-semibold">Create to-do</h2>
          <button onClick={onClose} className="inline-flex items-center justify-center size-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4 space-y-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Title</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
              className="input"
              required
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Add any context…"
              className="input min-h-[80px] py-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Assignee</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="input input"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Link to Key Result (optional)</label>
            <div className="rounded-lg border border-border bg-card p-1 max-h-[140px] overflow-auto">
              <div className="px-2 py-1">
                <input
                  type="text"
                  value={krSearch}
                  onChange={(e) => setKrSearch(e.target.value)}
                  placeholder="Search key results…"
                  className="input"
                />
              </div>
              <button
                type="button"
                onClick={() => setKeyResultId('')}
                className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted cursor-pointer ${keyResultId === '' ? 'bg-[color:#dbeafe]' : ''}`}
              >
                <X className="h-3 w-3" /> None
              </button>
              {filteredKrs.map((kr) => (
                <button
                  key={kr.id}
                  type="button"
                  onClick={() => setKeyResultId(kr.id)}
                  className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted cursor-pointer ${keyResultId === kr.id ? 'bg-[color:#dbeafe]' : ''}`}
                >
                  <Link2 className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{kr.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {kr.objective.title}
                    </span>
                  </span>
                  {keyResultId === kr.id && <Check className="h-3 w-3 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Or link to Objective (optional)</label>
            <div className="rounded-lg border border-border bg-card p-1 max-h-[140px] overflow-auto">
              <div className="px-2 py-1">
                <input
                  type="text"
                  value={objSearch}
                  onChange={(e) => setObjSearch(e.target.value)}
                  placeholder="Search objectives…"
                  className="input"
                />
              </div>
              <button
                type="button"
                onClick={() => setObjectiveId('')}
                className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted cursor-pointer ${objectiveId === '' ? 'bg-[color:#dbeafe]' : ''}`}
              >
                <X className="h-3 w-3" /> None
              </button>
              {filteredObjs.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setObjectiveId(o.id)}
                  className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted cursor-pointer ${objectiveId === o.id ? 'bg-[color:#dbeafe]' : ''}`}
                >
                  <Target className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1">{o.title}</span>
                  <span className="text-xs text-muted-foreground text-[10px]">{o.level.toLowerCase()}</span>
                  {objectiveId === o.id && <Check className="h-3 w-3 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button type="button" onClick={onClose} className="btn-outline">
              Cancel
            </button>
            <button type="submit" disabled={!title.trim() || submitting} className="btn-outline btn-primary">
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
