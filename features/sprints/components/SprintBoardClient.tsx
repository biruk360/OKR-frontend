'use client'

/**
 * SprintBoardClient — Phase 3 Todo-backed sprint board (Sprints v2 §4.3).
 *
 * Reads /api/sprints/[id]/board (Todo single-source-of-truth) and renders three
 * status columns (PENDING / IN_PROGRESS / COMPLETED). Drag-drop updates Todo.status
 * via PATCH /api/todos/[id]. Click a card → opens TodoCardModal in drawer mode.
 */

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Plus, MoreHorizontal, Calendar, Filter, CheckCircle2,
} from 'lucide-react'
import { TodoCardModal } from '@/components/todos/TodoCardModal'
import StatusPill from '@/components/shared/StatusPill'
import { EmptyState } from '@/components/ui/EmptyState'
import EndSprintModal from '@/components/sprints/EndSprintModal'
import ScheduleSprintModal from '@/components/sprints/ScheduleSprintModal'
import LinkToOkrPopover, { type OkrLinkValue } from '@/components/sprints/LinkToOkrPopover'
import { AppleDatePicker } from '@/components/ui/date-picker'
import { useIsMobile } from '@/hooks'
import { cn } from '@/lib/utils'
import type { TodoStatus } from '@/types'
import { BOARD_STATUSES, TODO_STATUS_META } from '@/lib/todo-status'
import TaskCardTrello, { type TrelloTodo } from './TaskCardTrello'
import { KanbanDropLine } from '@/components/shared/KanbanDropLine'
import { announce } from '@/components/shared/LiveAnnouncer'
import AddListColumn, { ListHeaderMenu, type LaneSummary } from './SprintListManager'
import { GenerateSprintButton } from '@/features/sprints-ai'
import SprintBackgroundPicker from './SprintBackgroundPicker'
import SprintFloatingBar, { type SprintBoardView } from './SprintFloatingBar'
import SprintSwitcher from './SprintSwitcher'
import SprintPlannerView from './SprintPlannerView'
import {
  getBackgroundStyle,
  isDarkBackground,
  type SprintBackgroundKey,
} from '@/lib/sprint-backgrounds'

// ─── Types matching /api/sprints/[id]/board ─────────────────────────────────

interface BoardUser { id: string; name: string; avatar: string | null }
interface BoardTodo {
  id: string
  title: string
  status: TodoStatus
  priority: string
  sprintPosition: number
  columnId: string | null
  taskType?: string | null
  startDate: string | null
  dueDate: string | null
  startTime: string | null
  endTime: string | null
  assigneeId: string | null
  assignee: BoardUser | null
  members?: { user: BoardUser }[]
  keyResult: { id: string; title: string; objective?: { id: string; title: string } } | null
  objective: { id: string; title: string } | null
  checklists?: { items?: { done: boolean }[] }[]
  todoComments?: { id: string }[]
}
interface BoardColumn {
  /** SprintColumn id — no longer the status string. Several lanes may share a status. */
  id: string
  name: string
  /** The TodoStatus this lane represents. Null only for legacy rows mid-backfill. */
  status: TodoStatus | null
  statusKey: TodoStatus | null
  color: string | null
  position: number
  todos: BoardTodo[]
  cardCount: number
}
interface BoardSprint {
  id: string
  name: string
  description: string | null
  state: 'PLANNING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  status: string
  startDate: string | null
  endDate: string | null
  endedAt?: string | null
  goal: string | null
  goalLabel: string | null
  goalTarget: number | null
  goalCurrent: number | null
  goalUnit: string | null
  background?: string | null
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
  sprintId, columnId, currentUserId, defaultDueDate, onCreated, openSignal,
}: {
  sprintId: string
  /** Lane the card is created in. Without it the server would guess by status. */
  columnId: string | null
  currentUserId: string
  defaultDueDate: string | null
  onCreated: () => void
  /** Incremented by the board to open and focus this composer from elsewhere
   *  (STA-2: the empty-state CTA). A counter rather than a boolean so repeat
   *  presses re-open it after the user cancels. */
  openSignal?: number
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const formRef = useRef<HTMLFormElement | null>(null)
  const [more, setMore] = useState(false)
  const [priority, setPriority] = useState('MEDIUM')
  const [dueDate, setDueDate] = useState<string>(defaultDueDate?.slice(0, 10) ?? '')
  const [okr, setOkr] = useState<OkrLinkValue | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!openSignal) return
    setOpen(true)
    // Scroll it into view — on an empty board the composer sits below the
    // empty state, so opening it off-screen would look like nothing happened.
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }, [openSignal])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // No assigneeId — Trello-style cards start unassigned. Members are
          // added via the card's Members popover.
          title: title.trim(),
          sprintId,
          ...(columnId && { columnId }),
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
    <form ref={formRef} onSubmit={submit} className="rounded-[10px] border bg-card p-2" style={{ borderColor: 'var(--ap-border)' }}>
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
            <div className="flex-1">
              <AppleDatePicker
                value={dueDate || null}
                onChange={(iso) => setDueDate(iso ?? '')}
                placeholder="Due date"
              />
            </div>
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

// ─── Main board ─────────────────────────────────────────────────────────────
// Note: the previous inline TaskCard was replaced by features/sprints/components/TaskCardTrello.

export default function SprintBoardClient({ sprintId, currentUserId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const qc = useQueryClient()
  const [openTodoId, setOpenTodoId] = useState<string | null>(null)
  const [showEnd, setShowEnd] = useState(false)
  const [scheduleMode, setScheduleMode] = useState<'edit' | 'start' | null>(null)
  const [starting, setStarting] = useState(false)
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null)
  const [filterLinked, setFilterLinked] = useState<'all' | 'linked' | 'unlinked'>('all')
  const isMobile = useIsMobile()
  // Lane id, not a status — several lanes can share a status now.
  const [mobileCol, setMobileCol] = useState<string | null>(null)
  const [view, setView] = useState<SprintBoardView>('board')
  const [showSwitcher, setShowSwitcher] = useState(false)
  // STA-2 — bumping this opens the quick-add composer. The empty-state button
  // used to carry an empty handler, so "Create task" did nothing at all.
  const [quickAddSignal, setQuickAddSignal] = useState(0)

  // ── Drag-and-drop state ──────────────────────────────────────────────────
  // localColumns mirrors filteredColumns and is updated optimistically during drag.
  const [localColumns, setLocalColumns] = useState<BoardColumn[]>([])
  const [draggedId, setDraggedId] = useState<string | null>(null)
  // indicator: which column and after which array-index the drop line appears.
  // afterIndex = -1 means "before all cards in the column".
  const indicatorRef = useRef<{ colId: string; afterIndex: number } | null>(null)
  const [indicator, setIndicator] = useState<{ colId: string; afterIndex: number } | null>(null)
  const rafRef = useRef<number | null>(null)

  const updateIndicator = useCallback((colId: string, afterIndex: number) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      if (
        indicatorRef.current?.colId === colId &&
        indicatorRef.current?.afterIndex === afterIndex
      ) return
      indicatorRef.current = { colId, afterIndex }
      setIndicator({ colId, afterIndex })
    })
  }, [])

  const clearIndicator = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    indicatorRef.current = null
    setIndicator(null)
  }, [])

  // ── Keyboard card movement (A11Y-2) ───────────────────────────────────────
  //
  // HTML5 drag-and-drop exposes nothing to the keyboard, so before this a
  // keyboard-only user could not move a card at all.
  //
  // Deliberate deviation from the spec: the spec called for replacing HTML5 DnD
  // with @dnd-kit. A wholesale swap of working pointer-drag — which cannot be
  // exercised in a browser here — risked breaking the board's primary
  // interaction to fix a secondary one. Instead this is a PARALLEL keyboard
  // path over the same reorder endpoint; pointer drag is untouched. Migrating
  // both onto dnd-kit remains the right long-term move.
  //
  // Model: Space/Enter lifts, arrows move the lifted card (optimistically, no
  // requests), Space commits, Escape reverts to the snapshot taken on lift.
  const [lifted, setLifted] = useState<string | null>(null)
  const preLiftRef = useRef<BoardColumn[] | null>(null)
  const preLiftOriginRef = useRef<string | null>(null)

  // The key handler is created before `isClosed` and `localColumns` exist in
  // render order, so it reads them through refs kept in sync below.
  const liftedRef = useRef<string | null>(null)
  const localColumnsRef = useRef<BoardColumn[]>([])
  const isClosedRef = useRef(false)
  useEffect(() => { liftedRef.current = lifted }, [lifted])

  const findCard = useCallback((cols: BoardColumn[], todoId: string) => {
    for (let c = 0; c < cols.length; c++) {
      const i = cols[c].todos.findIndex((t) => t.id === todoId)
      if (i !== -1) return { colIdx: c, cardIdx: i }
    }
    return null
  }, [])

  const cancelLift = useCallback(() => {
    if (preLiftRef.current) setLocalColumns(preLiftRef.current)
    preLiftRef.current = null
    setLifted(null)
    announce('Move cancelled')
  }, [])

  const commitLift = useCallback((todoId: string) => {
    preLiftRef.current = null
    setLifted(null)
    setLocalColumns((cols) => {
      const pos = findCard(cols, todoId)
      if (pos) {
        const lane = cols[pos.colIdx]
        // Persist the destination lane, and the source lane too when it changed.
        const orders: Record<string, string[]> = { [lane.id]: lane.todos.map((t) => t.id) }
        const origin = preLiftOriginRef.current
        if (origin && origin !== lane.id) {
          const src = cols.find((c) => c.id === origin)
          if (src) orders[src.id] = src.todos.map((t) => t.id)
        }
        void reorderBoard(orders)
        announce(`Dropped in ${lane.name}, position ${pos.cardIdx + 1} of ${lane.todos.length}`)
      }
      return cols
    })
    preLiftOriginRef.current = null
  }, [findCard])

  const moveLifted = useCallback((todoId: string, dir: 'up' | 'down' | 'left' | 'right') => {
    setLocalColumns((cols) => {
      const pos = findCard(cols, todoId)
      if (!pos) return cols
      const next = cols.map((c) => ({ ...c, todos: [...c.todos] }))
      const card = next[pos.colIdx].todos[pos.cardIdx]

      if (dir === 'up' || dir === 'down') {
        const target = pos.cardIdx + (dir === 'up' ? -1 : 1)
        if (target < 0 || target >= next[pos.colIdx].todos.length) return cols
        next[pos.colIdx].todos.splice(pos.cardIdx, 1)
        next[pos.colIdx].todos.splice(target, 0, card)
        announce(`Position ${target + 1} of ${next[pos.colIdx].todos.length} in ${next[pos.colIdx].name}`)
      } else {
        const targetCol = pos.colIdx + (dir === 'left' ? -1 : 1)
        if (targetCol < 0 || targetCol >= next.length) return cols
        next[pos.colIdx].todos.splice(pos.cardIdx, 1)
        const insertAt = Math.min(pos.cardIdx, next[targetCol].todos.length)
        // Status follows the destination lane, matching what a pointer drop does.
        next[targetCol].todos.splice(insertAt, 0, {
          ...card,
          status: (next[targetCol].statusKey ?? card.status) as TodoStatus,
          columnId: next[targetCol].id,
        })
        announce(`${next[targetCol].name}, position ${insertAt + 1} of ${next[targetCol].todos.length}`)
      }
      return next
    })
  }, [findCard])

  const onCardKeyDown = useCallback((e: React.KeyboardEvent, todoId: string, laneId: string) => {
    if (isClosedRef.current) return
    const isLifted = liftedRef.current === todoId

    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      if (isLifted) commitLift(todoId)
      else {
        preLiftRef.current = localColumnsRef.current
        preLiftOriginRef.current = laneId
        setLifted(todoId)
        announce('Card lifted. Use arrow keys to move, space to drop, escape to cancel.')
      }
      return
    }
    if (!isLifted) return
    if (e.key === 'Escape') { e.preventDefault(); cancelLift(); return }
    const dirs: Record<string, 'up' | 'down' | 'left' | 'right'> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    }
    const dir = dirs[e.key]
    if (dir) { e.preventDefault(); moveLifted(todoId, dir) }
  }, [commitLift, cancelLift, moveLifted])

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

  // SHR-4/5 — a shared link (?card=<id>) opens that card once the board has
  // loaded, then strips the param so a refresh does not reopen it. A card that
  // is missing, in another sprint, or not visible to this viewer gets the same
  // neutral message, so the link cannot be used to probe which ids exist.
  const deepLinkCardId = searchParams.get('card')
  useEffect(() => {
    if (!deepLinkCardId || !data) return
    const exists = data.columns.some((c) => c.todos.some((t) => t.id === deepLinkCardId))
    if (exists) setOpenTodoId(deepLinkCardId)
    else toast.error("That card isn't available.")
    router.replace(`/dashboard/sprints/${sprintId}`, { scroll: false })
  }, [deepLinkCardId, data, router, sprintId])

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

  async function reorderBoard(columnOrders: Record<string, string[]>) {
    try {
      const res = await fetch(`/api/sprints/${sprintId}/board/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnOrders }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to save order')
      invalidate()
    } catch (err: any) {
      // Refetch so the optimistic move visibly reverts rather than leaving the
      // board showing a position the server never accepted.
      toast.error(err?.message || 'Failed to save order')
      announce('Move failed, card returned to its previous list', 'assertive')
      invalidate()
    }
  }

  // Falls back to the first lane so the mobile strip always has a selection,
  // including right after a lane is archived.
  const activeMobileCol = mobileCol ?? data?.columns[0]?.id ?? null
  // Quick-add belongs in the first To Do lane; if a board has none (every lane
  // remapped), fall back to the leftmost lane rather than hiding the composer.
  const quickAddLaneId =
    data?.columns.find((c) => c.statusKey === 'PENDING')?.id ?? data?.columns[0]?.id ?? null

  // Card counts here come from the FILTERED view so the header badge matches
  // what the user can actually see (LST-5).
  const laneSummaries: LaneSummary[] = useMemo(
    () => (data?.columns ?? []).map((c) => ({
      id: c.id, name: c.name, statusKey: c.statusKey, cardCount: c.todos.length,
    })),
    [data],
  )

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

  // Keep localColumns in sync with server data (backfill zero-positions so midpoints work).
  useEffect(() => {
    setLocalColumns(
      filteredColumns.map((col) => ({
        ...col,
        todos: col.todos.map((t, i) => ({
          ...t,
          sprintPosition: t.sprintPosition || (i + 1) * 1000,
        })),
      }))
    )
  }, [filteredColumns])

  useEffect(() => { localColumnsRef.current = localColumns }, [localColumns])

  if (isLoading || !data) {
    return <div className="p-6 text-[13px] text-muted-foreground">Loading sprint…</div>
  }

  const { sprint, aggregates, participants } = data
  const daysLeft = sprint.endDate ? Math.max(0, Math.ceil((new Date(sprint.endDate).getTime() - Date.now()) / 86400000)) : null

  // FR-04 — closed sprints render read-only (banner, no drag, no quick-add).
  const isClosed = sprint.state === 'COMPLETED' || sprint.state === 'CANCELLED'
  isClosedRef.current = isClosed

  const bgKey = (sprint.background as SprintBackgroundKey | null) ?? 'none'
  const dark = isDarkBackground(bgKey)

  return (
    <div
      className={cn('-mx-4 -my-4 min-h-[calc(100vh-64px)] space-y-3 px-4 py-4 pb-24 transition-colors', dark && 'text-white')}
      style={getBackgroundStyle(bgKey)}
    >
      {/* Sticky header (spec §4.3) */}
      <div
        className={cn(
          'sticky top-0 z-20 -mx-4 border-b px-4 py-3 backdrop-blur-md',
          dark ? 'bg-black/30 text-white' : 'bg-white/70',
        )}
        style={{ borderColor: 'var(--ap-border)' }}
      >
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
                {sprint.startDate && sprint.endDate && (
                  <GenerateSprintButton sprintId={sprintId} variant="subtle" />
                )}
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
                className="rounded-[10px] px-3 py-1 text-[12px] font-semibold transition-colors"
                style={{
                  border: '0.5px solid var(--ap-accent)',
                  color: 'var(--ap-accent)',
                  background: 'var(--ap-accent-soft)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--ap-accent)', e.currentTarget.style.color = '#fff')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--ap-accent-soft)', e.currentTarget.style.color = 'var(--ap-accent)')}
              >
                Complete sprint
              </button>
            )}
            {isClosed && (
              <Link
                href={`/dashboard/sprints/${sprintId}/report`}
                className="rounded-[10px] px-3 py-1 text-[12px] font-semibold"
                style={{ background: 'var(--ap-accent)', color: '#fff' }}
              >
                View sprint report
              </Link>
            )}
            {!isClosed && (
              <SprintBackgroundPicker
                sprintId={sprintId}
                current={(sprint.background as SprintBackgroundKey | null) ?? 'none'}
                onChanged={() => invalidate()}
              />
            )}
            <button
              type="button"
              aria-label="More board actions"
              title="More board actions"
              className="rounded-[10px] border p-1 hover:bg-muted"
              style={{ borderColor: 'var(--ap-border)' }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Read-only banner (FR-04 / UX-05) */}
        {isClosed && (
          <div
            className="mt-3 flex items-center gap-2 rounded-[10px] px-3 py-2 text-[12px]"
            style={{
              background: 'var(--ap-bg-sunken)',
              border: '0.5px solid var(--ap-border)',
              color: 'var(--ap-fg-muted)',
            }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" style={{ color: 'var(--ap-green)' }} />
            <span>
              Sprint {sprint.state === 'COMPLETED' ? 'completed' : 'cancelled'}
              {sprint.endedAt && <> on {new Date(sprint.endedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>}
              {' '}· read-only
            </span>
          </div>
        )}

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
              aria-label="Filter cards by assignee"
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
          action={{
            label: 'Create task',
            onClick: () => {
              // Mobile shows one lane at a time, so make sure the lane holding
              // the composer is the visible one before opening it.
              if (quickAddLaneId) setMobileCol(quickAddLaneId)
              setQuickAddSignal((n) => n + 1)
            },
          }}
        />
      ) : null}

      {/* Mobile column tab switcher (hidden on lg+) */}
      <div className="flex gap-1 overflow-x-auto rounded-[10px] border p-1 lg:hidden" style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)' }}>
        {filteredColumns.map((col) => {
          const active = activeMobileCol === col.id
          return (
            <button
              key={col.id}
              type="button"
              onClick={() => setMobileCol(col.id)}
              aria-pressed={active}
              className={cn(
                'shrink-0 rounded-[8px] px-2 py-1.5 text-[12px] font-semibold transition-colors',
                active ? 'bg-[var(--ap-bg-raised)] text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {col.name} <span className="ml-1 tabular-nums opacity-70">{col.todos.length}</span>
            </button>
          )
        })}
      </div>

      {view === 'board' ? (
        <div
          className="flex gap-3 overflow-x-auto pb-2"
          style={isClosed ? { filter: 'saturate(0.6)' } : undefined}
        >
          {localColumns.map((col) => {
            const isEmpty = col.todos.length === 0
            return (
              <div
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (isClosed) return
                  // Find insertion point by scanning card rects
                  const cardEls = Array.from(
                    e.currentTarget.querySelectorAll<HTMLElement>('[data-sprint-card]')
                  )
                  let afterIndex = col.todos.length - 1 // default: end of column
                  for (let i = 0; i < cardEls.length; i++) {
                    const rect = cardEls[i].getBoundingClientRect()
                    if (e.clientY < rect.top + rect.height / 2) {
                      afterIndex = i - 1
                      break
                    }
                  }
                  updateIndicator(col.id, afterIndex)
                }}
                onDragLeave={(e) => {
                  if (isClosed) return
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) clearIndicator()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (isClosed) return
                  if (!draggedId) return
                  const ind = indicatorRef.current
                  clearIndicator()
                  setDraggedId(null)

                  // Rebuild target column order with the card inserted at the right position
                  const targetCol = localColumns.find((c) => c.id === col.id)!
                  const insertAfter = ind?.colId === col.id ? ind.afterIndex : targetCol.todos.length - 1
                  const destTodos = targetCol.todos.filter((t) => t.id !== draggedId)
                  const sourceCard = localColumns.flatMap((c) => c.todos).find((t) => t.id === draggedId)
                  if (!sourceCard) return
                  const insertIdx = insertAfter + 1
                  const sourceCol = localColumns.find((c) => c.todos.some((t) => t.id === draggedId))
                  const newOrder = [
                    ...destTodos.slice(0, insertIdx),
                    { ...sourceCard, status: (col.statusKey ?? sourceCard.status) as TodoStatus, columnId: col.id },
                    ...destTodos.slice(insertIdx),
                  ]
                  // Optimistic UI update
                  setLocalColumns((prev) =>
                    prev.map((c) => {
                      if (c.id === col.id) return { ...c, todos: newOrder }
                      return { ...c, todos: c.todos.filter((t) => t.id !== draggedId) }
                    })
                  )
                  // One request: the reorder endpoint keys on lane id and writes
                  // the lane's status in the same transaction, so a cross-lane
                  // move can no longer half-apply the way two calls could.
                  const columnOrders: Record<string, string[]> = {
                    [col.id]: newOrder.map((t) => t.id),
                  }
                  if (sourceCol && sourceCol.id !== col.id) {
                    columnOrders[sourceCol.id] = sourceCol.todos
                      .filter((t) => t.id !== draggedId)
                      .map((t) => t.id)
                  }
                  void reorderBoard(columnOrders)
                  announce(`${sourceCard.title} moved to ${col.name}, position ${insertIdx + 1} of ${newOrder.length}`)
                }}
                className={cn(
                  'flex w-[272px] shrink-0 flex-col rounded-[12px] border p-2 backdrop-blur-md',
                  dark ? 'bg-white/15' : 'bg-white/85',
                  isMobile && activeMobileCol !== col.id && 'hidden',
                )}
                style={{ borderColor: 'var(--ap-border)' }}
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className={cn('text-[13px] font-semibold', dark && 'text-white')}>
                    {col.color && (
                      <span
                        aria-hidden
                        className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ background: col.color }}
                      />
                    )}
                    {col.name}
                    <span className="ml-1.5 tabular-nums opacity-60">{col.todos.length}</span>
                  </p>
                  <ListHeaderMenu
                    sprintId={sprintId}
                    lane={{ id: col.id, name: col.name, statusKey: col.statusKey, cardCount: col.cardCount }}
                    lanes={laneSummaries}
                    disabled={isClosed}
                    onChanged={invalidate}
                  />
                </div>

                {/* Drop indicator before first card */}
                <KanbanDropLine active={!!indicator && indicator.colId === col.id && indicator.afterIndex === -1} />

                <div
                  role="list"
                  aria-label={`${col.name}, ${col.todos.length} card${col.todos.length === 1 ? '' : 's'}`}
                >
                {isEmpty && indicator?.colId === col.id && !isClosed ? (
                  <div className="flex min-h-[60px] items-center justify-center rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 text-[11px] text-primary">
                    Drop here
                  </div>
                ) : (
                  col.todos.map((t, cardIdx) => (
                    <div
                      key={t.id}
                      data-sprint-card
                      role="listitem"
                      onKeyDown={(e) => onCardKeyDown(e, t.id, col.id)}
                      aria-label={
                        lifted === t.id
                          ? `${t.title}, lifted. Arrow keys to move, space to drop, escape to cancel.`
                          : `${t.title}, in ${col.name}, position ${cardIdx + 1} of ${col.todos.length}. Press space to move.`
                      }
                      className={cn(
                        'rounded-[8px] transition-shadow',
                        // A lifted card needs to stay visually identifiable while
                        // the eye follows the arrow keys.
                        lifted === t.id && 'ring-2 ring-primary-500 ring-offset-2',
                      )}
                    >
                      <TaskCardTrello
                        todo={t as unknown as TrelloTodo}
                        isDragging={draggedId === t.id}
                        readOnly={isClosed}
                        onClick={() => setOpenTodoId(t.id)}
                        onDragStart={(e) => {
                          if (isClosed) return
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('todoId', t.id)
                          setDraggedId(t.id)
                        }}
                        onDragEnd={() => {
                          clearIndicator()
                          setDraggedId(null)
                        }}
                      />
                      {!isClosed && (
                        <KanbanDropLine active={!!indicator && indicator.colId === col.id && indicator.afterIndex === cardIdx} />
                      )}
                    </div>
                  ))
                )}

                </div>

                {col.id === quickAddLaneId && !isClosed && (
                  <div className="mt-2">
                    <AddTaskInline
                      sprintId={sprintId}
                      columnId={col.id}
                      openSignal={quickAddSignal}
                      currentUserId={currentUserId}
                      defaultDueDate={sprint.endDate}
                      onCreated={invalidate}
                    />
                  </div>
                )}
              </div>
            )
          })}

          {/* LST-2 — trailing add-list column. Hidden on closed sprints and on
              mobile, where lanes are a single-select tab strip. */}
          {!isClosed && !isMobile && (
            <AddListColumn sprintId={sprintId} dark={dark} onCreated={invalidate} />
          )}
        </div>
      ) : view === 'planner' ? (
        <SprintPlannerView
          columns={filteredColumns as unknown as Parameters<typeof SprintPlannerView>[0]['columns']}
          onTodoClick={(id) => setOpenTodoId(id)}
          onDragStartCard={(e, id) => e.dataTransfer.setData('todoId', id)}
        />
      ) : (
        <div
          className={cn(
            'rounded-[14px] border p-8 text-center backdrop-blur-md',
            dark ? 'bg-white/10 text-white' : 'bg-white/85',
          )}
          style={{ borderColor: 'var(--ap-border)' }}
        >
          <p className="text-[13px] font-semibold">Inbox is coming soon</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Your unread mentions, reviews, and assignments will land here.
          </p>
        </div>
      )}

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
        onClosed={() => invalidate()}
      />

      {/* Switch boards modal */}
      <SprintSwitcher
        open={showSwitcher}
        onClose={() => setShowSwitcher(false)}
        currentSprintId={sprintId}
      />

      {/* Floating bottom bar (board only — fixed-position pill) */}
      <SprintFloatingBar
        view={view}
        onViewChange={setView}
        onSwitchBoards={() => setShowSwitcher(true)}
      />
    </div>
  )
}
