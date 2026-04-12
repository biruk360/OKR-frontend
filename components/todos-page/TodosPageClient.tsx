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
import TodoDetailPanel from './TodoDetailPanel'

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
  const [rows, setRows] = useState<TodoRow[]>(initialRows)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('assigned')
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [openTodoId, setOpenTodoId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'modal' | 'sidebar'>('modal')

  // Load user preference for view mode
  useEffect(() => {
    fetch('/api/user-preferences')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.preferences?.todoViewMode) setViewMode(d.preferences.todoViewMode)
      })
      .catch(() => {})
  }, [])

  function toggleViewMode() {
    const next = viewMode === 'modal' ? 'sidebar' : 'modal'
    setViewMode(next)
    fetch('/api/user-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ todoViewMode: next }),
    }).catch(() => {})
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

  // ---------- Mutations ----------
  async function toggleComplete(row: TodoRow) {
    const next = row.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
    const snapshot = rows
    setRows((prev) =>
      prev.map((t) =>
        t.id === row.id
          ? { ...t, status: next, completedAt: next === 'COMPLETED' ? new Date().toISOString() : null }
          : t
      )
    )
    try {
      const res = await fetch(`/api/todos/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: next,
          completedAt: next === 'COMPLETED' ? new Date().toISOString() : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
    } catch (err: any) {
      setRows(snapshot)
      toast.error(err.message || 'Failed to update')
    }
  }

  async function deleteRow(rowId: string) {
    if (!confirm('Delete this to-do?')) return
    const snapshot = rows
    setRows((prev) => prev.filter((t) => t.id !== rowId))
    try {
      const res = await fetch(`/api/todos/${rowId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
    } catch (err: any) {
      setRows(snapshot)
      toast.error(err.message || 'Failed to delete')
    }
  }

  async function onCreated(newRow: TodoRow) {
    setRows((prev) => [newRow, ...prev])
    setShowCreate(false)
  }

  // ---------- Render ----------
  return (
    <div className="atlas-surface -m-3 sm:-m-6 min-h-full p-4 sm:p-6">
      <div className="mx-auto max-w-[1200px]">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="atlas-h1">To-dos</h1>
            <p className="atlas-text-tertiary mt-1">
              Everything on your plate — linked to OKRs or standalone. {counts.open} open
              {counts.overdue > 0 && <span className="text-[color:var(--atlas-danger)]"> · {counts.overdue} overdue</span>}
              {counts.dueToday > 0 && <span className="text-[color:var(--atlas-warning)]"> · {counts.dueToday} due today</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleViewMode}
              className="atlas-btn atlas-btn-ghost"
              title={`View mode: ${viewMode}. Click to switch.`}
            >
              {viewMode === 'modal' ? <Maximize2 className="h-3.5 w-3.5" /> : <PanelRight className="h-3.5 w-3.5" />}
              {viewMode === 'modal' ? 'Modal' : 'Sidebar'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="atlas-btn atlas-btn-primary"
            >
              <Plus className="h-3.5 w-3.5" /> Create to-do
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="atlas-card mb-4 p-2 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--atlas-n100)]" />
            <input
              type="search"
              placeholder="Filter by title, description, KR, or objective"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="atlas-input pl-7"
            />
          </div>
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value as ScopeFilter)}
            className="atlas-input atlas-select w-auto"
          >
            <option value="assigned">Assigned to me</option>
            <option value="created">Created by me</option>
            <option value="all">All visible</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="atlas-input atlas-select w-auto"
          >
            <option value="open">Open</option>
            <option value="completed">Completed</option>
            <option value="all">All statuses</option>
          </select>
          <select
            value={linkFilter}
            onChange={(e) => setLinkFilter(e.target.value as LinkFilter)}
            className="atlas-input atlas-select w-auto"
          >
            <option value="all">Any link</option>
            <option value="linked">Linked to OKR</option>
            <option value="standalone">Standalone</option>
          </select>
        </div>

        {/* Table */}
        <div className="atlas-card overflow-hidden">
          <table className="atlas-table">
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
                  <td colSpan={8} className="atlas-text-tertiary text-center !py-10">
                    No to-dos match your filters.
                  </td>
                </tr>
              )}
              {filteredRows.map((row) => (
                <TodoTableRow
                  key={row.id}
                  row={row}
                  onToggle={() => toggleComplete(row)}
                  onDelete={() => deleteRow(row.id)}
                  onOpen={() => setOpenTodoId(row.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {openTodoId && (() => {
        const todo = rows.find((r) => r.id === openTodoId)
        if (!todo) return null
        return (
          <TodoDetailPanel
            todo={todo}
            mode={viewMode}
            users={users}
            keyResults={keyResults}
            objectives={objectives}
            currentUserId={currentUserId}
            onClose={() => setOpenTodoId(null)}
            onUpdate={(patch) => {
              setRows((prev) => prev.map((r) => (r.id === openTodoId ? { ...r, ...patch } : r)))
            }}
            onDelete={() => {
              setRows((prev) => prev.filter((r) => r.id !== openTodoId))
              setOpenTodoId(null)
            }}
            onToggleMode={toggleViewMode}
          />
        )
      })()}

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
          className="atlas-checkbox"
          aria-label={isDone ? 'Mark pending' : 'Mark completed'}
        />
      </td>
      <td>
        <div className="min-w-0">
          <div
            className={`truncate text-[14px] ${
              isDone ? 'text-[color:var(--atlas-n100)] line-through' : 'text-[color:var(--atlas-n800)]'
            }`}
          >
            {row.title}
          </div>
          {row.description && (
            <div className="truncate text-[12px] text-[color:var(--atlas-n100)]">
              {row.description}
            </div>
          )}
        </div>
      </td>
      <td>
        {row.keyResult ? (
          <Link
            href={`/dashboard/key-results/${row.keyResult.id}`}
            className="inline-flex items-center gap-1.5 atlas-chip"
            data-tone="primary"
            title={row.keyResult.objective.title}
          >
            <Link2 className="h-3 w-3" />
            <span className="max-w-[170px] truncate">{row.keyResult.title}</span>
          </Link>
        ) : row.objective ? (
          <Link
            href={`/dashboard/objectives/${row.objective.id}`}
            className="inline-flex items-center gap-1.5 atlas-chip"
            data-tone="primary"
          >
            <Target className="h-3 w-3" />
            <span className="max-w-[170px] truncate">{row.objective.title}</span>
          </Link>
        ) : (
          <span className="atlas-text-tertiary">—</span>
        )}
        {link && 'objective' in (row.keyResult ?? {}) && (
          <div className="truncate text-[11px] text-[color:var(--atlas-n100)] mt-0.5">
            {row.keyResult?.objective.title}
          </div>
        )}
      </td>
      <td>
        {timeframeName ? (
          <span className="text-[12px] text-[color:var(--atlas-n200)]">{timeframeName}</span>
        ) : (
          <span className="atlas-text-tertiary">—</span>
        )}
      </td>
      <td>
        {row.dueDate ? (
          <span
            className={`inline-flex items-center gap-1 text-[12px] ${
              overdue
                ? 'text-[color:var(--atlas-danger)] font-medium'
                : 'text-[color:var(--atlas-n200)]'
            }`}
          >
            <Calendar className="h-3 w-3" />
            {new Date(row.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        ) : (
          <span className="atlas-text-tertiary">—</span>
        )}
      </td>
      <td>
        <span className="atlas-avatar" title={`Assigned to ${row.assignee.name}`}>
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
          className="atlas-icon-btn opacity-0 group-hover:opacity-100"
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
    <span className="atlas-lozenge" data-tone={v.tone === 'default' ? undefined : v.tone}>
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
      const t = data.todo
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] atlas-surface"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="atlas-card relative w-full max-w-[560px]"
        style={{ boxShadow: 'var(--atlas-shadow-popover)' }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[color:var(--atlas-n30)]">
          <h2 className="atlas-h2">Create to-do</h2>
          <button onClick={onClose} className="atlas-icon-btn" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4 space-y-3">
          <div>
            <label className="atlas-eyebrow block mb-1">Title</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
              className="atlas-input"
              required
            />
          </div>

          <div>
            <label className="atlas-eyebrow block mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Add any context…"
              className="atlas-input min-h-[80px] py-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="atlas-eyebrow block mb-1">Assignee</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="atlas-input atlas-select"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="atlas-eyebrow block mb-1">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="atlas-input"
              />
            </div>
          </div>

          <div>
            <label className="atlas-eyebrow block mb-1">Link to Key Result (optional)</label>
            <div className="atlas-card p-1 max-h-[140px] overflow-auto">
              <div className="px-2 py-1">
                <input
                  type="text"
                  value={krSearch}
                  onChange={(e) => setKrSearch(e.target.value)}
                  placeholder="Search key results…"
                  className="atlas-input"
                />
              </div>
              <button
                type="button"
                onClick={() => setKeyResultId('')}
                className={`atlas-menu-item ${keyResultId === '' ? 'bg-[color:var(--atlas-primary-bg)]' : ''}`}
              >
                <X className="h-3 w-3" /> None
              </button>
              {filteredKrs.map((kr) => (
                <button
                  key={kr.id}
                  type="button"
                  onClick={() => setKeyResultId(kr.id)}
                  className={`atlas-menu-item ${keyResultId === kr.id ? 'bg-[color:var(--atlas-primary-bg)]' : ''}`}
                >
                  <Link2 className="h-3 w-3 flex-shrink-0 text-[color:var(--atlas-n100)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{kr.title}</span>
                    <span className="block truncate text-[11px] text-[color:var(--atlas-n100)]">
                      {kr.objective.title}
                    </span>
                  </span>
                  {keyResultId === kr.id && <Check className="h-3 w-3 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="atlas-eyebrow block mb-1">Or link to Objective (optional)</label>
            <div className="atlas-card p-1 max-h-[140px] overflow-auto">
              <div className="px-2 py-1">
                <input
                  type="text"
                  value={objSearch}
                  onChange={(e) => setObjSearch(e.target.value)}
                  placeholder="Search objectives…"
                  className="atlas-input"
                />
              </div>
              <button
                type="button"
                onClick={() => setObjectiveId('')}
                className={`atlas-menu-item ${objectiveId === '' ? 'bg-[color:var(--atlas-primary-bg)]' : ''}`}
              >
                <X className="h-3 w-3" /> None
              </button>
              {filteredObjs.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setObjectiveId(o.id)}
                  className={`atlas-menu-item ${objectiveId === o.id ? 'bg-[color:var(--atlas-primary-bg)]' : ''}`}
                >
                  <Target className="h-3 w-3 flex-shrink-0 text-[color:var(--atlas-n100)]" />
                  <span className="truncate flex-1">{o.title}</span>
                  <span className="atlas-text-tertiary text-[10px]">{o.level.toLowerCase()}</span>
                  {objectiveId === o.id && <Check className="h-3 w-3 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[color:var(--atlas-n30)]">
            <button type="button" onClick={onClose} className="atlas-btn">
              Cancel
            </button>
            <button type="submit" disabled={!title.trim() || submitting} className="atlas-btn atlas-btn-primary">
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
