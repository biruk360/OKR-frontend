'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { Plus, Search, Filter, Users, Tag, X, LayoutGrid, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TodoCard } from '@/components/todos/TodoCard'
import { LazyTodoCardModal } from '@/components/todos/LazyTodoCardModal'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterSelect } from '@/components/ui/FilterSelect'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TodoRow {
  id: string
  title: string
  status: string
  priority: string
  coverColor: string | null
  dueDate: string | null
  assigneeId: string
  assignee: { id: string; name: string; avatar: string | null }
  members: { user: { id: string; name: string; avatar: string | null } }[]
  labels: { labelDef: { id: string; name: string; color: string } }[]
  checklists: { items: { id: string; completed: boolean }[] }[]
  attachments: { id: string }[]
  keyResult?: { id: string; title: string; objective?: { id: string; title: string } } | null
  objective?: { id: string; title: string } | null
}

interface User { id: string; name: string; email: string; role: string }
interface LabelDef { id: string; name: string; color: string }

interface Props {
  initialTodos: TodoRow[]
  users: User[]
  labelDefs: LabelDef[]
  currentUserId: string
  currentUserRole: string
}

// ─── Column config ────────────────────────────────────────────────────────────

const COLUMNS = [
  { id: 'PENDING',     label: 'To Do',       color: 'var(--ap-none)',    bgLight: 'color-mix(in oklab, var(--ap-none) 10%, transparent)' },
  { id: 'IN_PROGRESS', label: 'In Progress',  color: 'var(--ap-warn)',    bgLight: 'color-mix(in oklab, var(--ap-warn) 8%, transparent)' },
  { id: 'COMPLETED',   label: 'Done',         color: 'var(--ap-ok)',      bgLight: 'color-mix(in oklab, var(--ap-ok) 8%, transparent)' },
  { id: 'CANCELLED',   label: 'Cancelled',    color: 'var(--ap-danger)',  bgLight: 'color-mix(in oklab, var(--ap-danger) 6%, transparent)' },
] as const

type ColId = typeof COLUMNS[number]['id']

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkBoardClient({ initialTodos, users, labelDefs, currentUserId, currentUserRole }: Props) {
  const [todos, setTodos] = useState<TodoRow[]>(initialTodos)
  const [openTodoId, setOpenTodoId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [query, setQuery] = useState('')
  const [filterMemberId, setFilterMemberId] = useState<string | null>(null)
  const [filterLabelId, setFilterLabelId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<ColId | null>(null)
  const createTitleRef = useRef<HTMLInputElement>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newColId, setNewColId] = useState<ColId>('PENDING')
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => {
    let rows = todos
    if (query) {
      const q = query.toLowerCase()
      rows = rows.filter((t) => t.title.toLowerCase().includes(q))
    }
    if (filterMemberId) {
      rows = rows.filter((t) => t.assigneeId === filterMemberId || t.members.some((m) => m.user.id === filterMemberId))
    }
    if (filterLabelId) {
      rows = rows.filter((t) => t.labels.some((l) => l.labelDef.id === filterLabelId))
    }
    return rows
  }, [todos, query, filterMemberId, filterLabelId])

  const byCol = useMemo(() => {
    const map: Record<ColId, TodoRow[]> = { PENDING: [], IN_PROGRESS: [], COMPLETED: [], CANCELLED: [] }
    for (const t of filtered) {
      const col = (COLUMNS.find((c) => c.id === t.status)?.id ?? 'PENDING') as ColId
      map[col].push(t)
    }
    return map
  }, [filtered])

  // ── Drag & drop ──
  const handleDrop = useCallback(async (targetColId: ColId) => {
    if (!draggingId || draggingId === targetColId) return
    const todo = todos.find((t) => t.id === draggingId)
    if (!todo || todo.status === targetColId) { setDraggingId(null); setDragOverCol(null); return }

    // Optimistic
    setTodos((prev) => prev.map((t) => t.id === draggingId ? { ...t, status: targetColId } : t))
    setDraggingId(null); setDragOverCol(null)

    const res = await fetch(`/api/todos/${draggingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: targetColId,
        completedAt: targetColId === 'COMPLETED' ? new Date().toISOString() : null,
      }),
    })
    if (!res.ok) {
      toast.error('Failed to move card')
      setTodos((prev) => prev.map((t) => t.id === draggingId ? { ...t, status: todo.status } : t))
    }
  }, [draggingId, todos])

  // ── Refresh from the server ──
  // `surface=work` is the page's own SSR query and include (lib/todos/visibility.ts,
  // CPM-2). The old `?mine=all` rows had no members/labels/checklists/attachments,
  // so the member/label filters threw on `t.members.some(...)` after an edit.
  const refreshTodos = useCallback(async () => {
    try {
      const res = await fetch('/api/todos?surface=work')
      const json = await res.json()
      if (json.success && Array.isArray(json.data)) setTodos(json.data)
    } catch {
      toast.error('Failed to refresh the board')
    }
  }, [])

  // ── Create card ──
  const createCard = async (colId: ColId) => {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No assigneeId — Trello-style: cards start unassigned, members added later.
        body: JSON.stringify({ title: newTitle.trim(), status: colId }),
      })
      const json = await res.json()
      if (json.success) {
        // POST returns the list include (no members/labels/checklists); refetch the
        // board's own shape instead of inserting a row the filters can't read.
        setNewTitle('')
        setShowCreate(false)
        await refreshTodos()
      } else toast.error(json.error ?? 'Failed to create')
    } finally { setCreating(false) }
  }

  // ── After modal closes ──
  const handleUpdated = refreshTodos

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--ap-border)] px-5 py-3">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-[var(--ap-accent)]" />
          <h1 className="text-body font-bold text-[var(--ap-fg)]">Work Board</h1>
          <span className="rounded-full bg-[var(--ap-bg-sunken)] px-2 py-0.5 text-caption font-semibold text-[var(--ap-fg-subtle)]">{todos.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ap-fg-faint)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cards…"
              aria-label="Search cards"
              className="ap-input h-8 w-48 pl-8 text-xs"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ap-fg-faint)] hover:text-[var(--ap-fg)]">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Member filter */}
          <FilterSelect
            label="Member"
            placeholder="All members"
            value={filterMemberId ?? undefined}
            onValueChange={(v) => setFilterMemberId(v ?? null)}
            options={users.map((u) => ({ value: u.id, label: u.name ?? u.email }))}
          />

          {/* Label filter */}
          {labelDefs.length > 0 && (
            <FilterSelect
              label="Label"
              placeholder="All labels"
              value={filterLabelId ?? undefined}
              onValueChange={(v) => setFilterLabelId(v ?? null)}
              options={labelDefs.map((l) => ({ value: l.id, label: l.name }))}
            />
          )}

          <button
            onClick={() => { setShowCreate(true); setNewColId('PENDING') }}
            className="ap-btn ap-btn-primary ap-btn-sm gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> New card
          </button>
        </div>
      </div>

      {/* ── Board ── */}
      {todos.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={LayoutGrid}
            title="No to-dos"
            description="Create one to get started"
            action={{ label: 'New card', onClick: () => { setShowCreate(true); setNewColId('PENDING') } }}
            className="w-full max-w-md"
          />
        </div>
      ) : (
      <div className="flex flex-1 gap-3 overflow-x-auto p-4">
        {COLUMNS.map((col) => {
          const cards = byCol[col.id]
          return (
            <div
              key={col.id}
              className={cn(
                'flex w-72 shrink-0 flex-col rounded-[var(--ap-radius-card)] transition-colors',
                dragOverCol === col.id ? 'ring-2 ring-[var(--ap-accent)]' : '',
              )}
              style={{ background: col.bgLight }}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id) }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={() => handleDrop(col.id)}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: col.color }} />
                  <span className="text-xs font-bold text-[var(--ap-fg)]">{col.label}</span>
                  <span className="rounded-full bg-[rgba(0,0,0,0.06)] px-1.5 py-0.5 text-micro font-semibold text-[var(--ap-fg-subtle)]">{cards.length}</span>
                </div>
                <button
                  onClick={() => { setShowCreate(true); setNewColId(col.id) }}
                  className="rounded-md p-1 text-[var(--ap-fg-faint)] hover:bg-[rgba(0,0,0,0.06)] hover:text-[var(--ap-fg)] transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Cards */}
              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {cards.length === 0 && !(showCreate && newColId === col.id) && (
                  <div className="flex flex-col items-center gap-1 py-6 text-caption text-muted-foreground">
                    <Inbox className="size-4 opacity-60" />
                    <span>No items</span>
                  </div>
                )}
                {cards.map((t) => {
                  const checklistTotal = t.checklists.reduce((s, cl) => s + cl.items.length, 0)
                  const checklistDone = t.checklists.reduce((s, cl) => s + cl.items.filter((i) => i.completed).length, 0)
                  return (
                    <TodoCard
                      key={t.id}
                      id={t.id}
                      title={t.title}
                      coverColor={t.coverColor}
                      labels={t.labels.map((l) => l.labelDef)}
                      assignee={t.assignee}
                      members={t.members.map((m) => m.user)}
                      dueDate={t.dueDate}
                      checklist={checklistTotal > 0 ? { total: checklistTotal, done: checklistDone } : undefined}
                      attachmentCount={t.attachments.length}
                      status={t.status}
                      priority={t.priority}
                      onClick={() => setOpenTodoId(t.id)}
                      draggable
                      onDragStart={() => setDraggingId(t.id)}
                      onDragEnd={() => { setDraggingId(null); setDragOverCol(null) }}
                      className={cn(draggingId === t.id && 'opacity-40')}
                    />
                  )
                })}

                {/* Inline add */}
                {showCreate && newColId === col.id && (
                  <div className="rounded-[12px] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] p-2 shadow-[shadow:var(--ap-shadow-sm)] space-y-2">
                    <input
                      ref={createTitleRef}
                      autoFocus
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') createCard(col.id)
                        if (e.key === 'Escape') { setShowCreate(false); setNewTitle('') }
                      }}
                      placeholder="Card title…"
                      className="ap-input w-full h-8 text-body-sm"
                    />
                    <div className="flex gap-1.5">
                      <button onClick={() => createCard(col.id)} disabled={creating} className="ap-btn ap-btn-primary ap-btn-sm">
                        {creating ? 'Adding…' : 'Add card'}
                      </button>
                      <button onClick={() => { setShowCreate(false); setNewTitle('') }} className="ap-btn ap-btn-ghost ap-btn-sm">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      )}

      {/* ── Card modal ── */}
      {openTodoId && (
        <LazyTodoCardModal
          todoId={openTodoId}
          currentUserId={currentUserId}
          onClose={() => setOpenTodoId(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  )
}
