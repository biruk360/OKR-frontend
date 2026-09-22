'use client'

/**
 * SprintBoardClient — Phase 3 Todo-backed sprint board (Sprints v2 §4.3).
 *
 * Reads /api/sprints/[id]/board (Todo single-source-of-truth) and renders three
 * status columns (PENDING / IN_PROGRESS / COMPLETED). Drag-drop updates Todo.status
 * via PATCH /api/todos/[id]. Click a card → opens TodoCardModal (a centred modal;
 * drawer mode was removed in the design refresh, §6.4).
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
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'
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
import SprintInboxView from './SprintInboxView'
import { useNotificationStore } from '@/lib/stores/notification-store'
import { Progress } from '@/components/ui/progress'
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
  return <Progress value={percent} fill={color ?? 'var(--ap-accent)'} />
}

// ─── Add Task inline form (Sprints v2 §4.3 / D) ─────────────────────────────

function AddTaskInline({
  sprintId, columnId, currentUserId, defaultDueDate, onCreated, openSignal, dark,
}: {
  sprintId: string
  /** Lane the card is created in. Without it the server would guess by status. */
  columnId: string | null
  currentUserId: string
  defaultDueDate: string | null
  onCreated: () => void
  /** Dark board ground (`graphite`). */
  dark?: boolean
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
    // Lane-footer affordance from the design: 32px ghost row, not a dashed box.
    // (The per-lane `+` in the lane HEADER stays deferred — Decision 0.)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-[32px] w-full items-center gap-2 rounded-[var(--ap-radius-md)] px-2 text-left text-[12.5px] font-semibold transition-colors',
          dark
            ? 'text-white/80 hover:bg-white/15 hover:text-white'
            : 'text-[var(--ap-fg-secondary)] hover:bg-[var(--ap-bg-sunken)] hover:text-[var(--ap-fg)]',
        )}
      >
        <Plus className="h-3.5 w-3.5" /> Add a card
      </button>
    )
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="rounded-[10px] border p-2"
      style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-raised)', boxShadow: 'var(--ap-shadow-card)' }}
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title…"
        className="w-full rounded-[var(--ap-radius-sm)] border px-2 py-1.5 text-[12px] outline-none"
        style={{ borderColor: 'var(--ap-border-strong)', background: 'var(--ap-bg-raised)', color: 'var(--ap-fg)' }}
      />
      {more && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <select value={priority} onChange={(e) => setPriority(e.target.value)}
              className="rounded-[var(--ap-radius-sm)] border bg-card px-2 py-1 text-[11px]"
              style={{ borderColor: 'var(--ap-border-strong)' }}>
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
            className="rounded-[var(--ap-radius-sm)] px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted">
            Cancel
          </button>
          <button type="submit" disabled={!title.trim() || submitting}
            className="rounded-[var(--ap-radius-sm)] px-2 py-1 text-[11px] font-semibold disabled:opacity-50"
            style={{ background: 'var(--ap-accent)', color: 'var(--ap-accent-fg)' }}>
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
  // Drives the Inbox tab's badge. Shared with the header bell and the Inbox
  // view, so reading something in one place clears it everywhere.
  const inboxUnread = useNotificationStore((st) => st.unreadCount)
  const [showEnd, setShowEnd] = useState(false)
  const [scheduleMode, setScheduleMode] = useState<'edit' | 'start' | null>(null)
  const [starting, setStarting] = useState(false)
  // BRD-3 — filters persist per sprint. Losing them on every reload made the
  // board feel like it forgot what you were doing.
  const FILTER_KEY = `sprint-filters-${sprintId}`
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null)
  const [filterLinked, setFilterLinked] = useState<'all' | 'linked' | 'unlinked'>('all')
  const [filtersLoaded, setFiltersLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FILTER_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as { assignee?: string | null; linked?: 'all' | 'linked' | 'unlinked' }
        if (saved.assignee !== undefined) setFilterAssignee(saved.assignee)
        if (saved.linked) setFilterLinked(saved.linked)
      }
    } catch { /* private mode — filters just start clean */ }
    setFiltersLoaded(true)
  }, [FILTER_KEY])

  useEffect(() => {
    // Only write after the initial read, or mount would clobber the saved value.
    if (!filtersLoaded) return
    try {
      window.localStorage.setItem(FILTER_KEY, JSON.stringify({ assignee: filterAssignee, linked: filterLinked }))
    } catch { /* ignore */ }
  }, [FILTER_KEY, filterAssignee, filterLinked, filtersLoaded])

  const filtersActive = (filterAssignee ? 1 : 0) + (filterLinked !== 'all' ? 1 : 0)
  const clearFilters = () => { setFilterAssignee(null); setFilterLinked('all') }
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
    // STA-1 — a board-shaped skeleton rather than the words "Loading sprint…",
    // so the layout does not jump when real lanes arrive.
    return (
      <div className="space-y-3 p-4" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading sprint…</span>
        <SkeletonCard className="h-[132px]" />
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((lane) => (
            <div
              key={lane}
              className="flex w-[272px] shrink-0 flex-col gap-2 rounded-[12px] border p-2"
              style={{ borderColor: 'var(--ap-border)' }}
            >
              <Skeleton className="h-4 w-24" />
              {Array.from({ length: 3 - lane }).map((_, card) => (
                <Skeleton key={card} className="h-[84px] w-full rounded-[8px]" />
              ))}
            </div>
          ))}
        </div>
      </div>
    )
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
          dark && 'text-white',
        )}
        style={{
          background: dark ? 'oklch(0.22 0.02 262 / 0.62)' : 'color-mix(in oklab, var(--ap-bg-raised) 70%, transparent)',
          borderColor: dark ? 'oklch(1 0 0 / 0.14)' : 'var(--ap-border)',
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/sprints"
            className="inline-flex items-center gap-1 text-[12px] font-semibold hover:underline"
            style={{ color: dark ? 'oklch(0.94 0.005 262)' : 'var(--ap-fg-secondary)' }}
          >
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
                  className="h-[32px] rounded-[var(--ap-radius-md)] border px-3 text-[12.5px] font-semibold"
                  style={{
                    borderColor: dark ? 'oklch(1 0 0 / 0.2)' : 'var(--ap-border-strong)',
                    background: dark ? 'oklch(1 0 0 / 0.1)' : 'var(--ap-bg-raised)',
                    color: dark ? 'oklch(1 0 0)' : 'var(--ap-fg-muted)',
                  }}
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
                  className="rounded-[var(--ap-radius-sm)] bg-primary px-3 py-1 text-[12px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {starting ? 'Starting…' : 'Start sprint'}
                </button>
              </>
            )}
            {sprint.state === 'ACTIVE' && (
              <button
                type="button"
                onClick={() => setShowEnd(true)}
                className="rounded-[var(--ap-radius-sm)] px-3 py-1 text-[12px] font-semibold transition-colors"
                style={{
                  border: '0.5px solid var(--ap-accent)',
                  color: 'var(--ap-accent)',
                  background: 'var(--ap-accent-soft)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--ap-accent)', e.currentTarget.style.color = 'var(--ap-accent-fg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--ap-accent-soft)', e.currentTarget.style.color = 'var(--ap-accent)')}
              >
                Complete sprint
              </button>
            )}
            {isClosed && (
              <Link
                href={`/dashboard/sprints/${sprintId}/report`}
                className="rounded-[var(--ap-radius-sm)] px-3 py-1 text-[12px] font-semibold"
                style={{ background: 'var(--ap-accent)', color: 'var(--ap-accent-fg)' }}
              >
                View sprint report
              </Link>
            )}
            {!isClosed && (
              <SprintBackgroundPicker
                sprintId={sprintId}
                current={(sprint.background as SprintBackgroundKey | null) ?? 'none'}
                onChanged={() => invalidate()}
                dark={dark}
              />
            )}
            <button
              type="button"
              aria-label="More board actions"
              title="More board actions"
              className="grid h-[32px] w-[32px] place-items-center rounded-[var(--ap-radius-md)] border"
              style={{
                borderColor: dark ? 'oklch(1 0 0 / 0.2)' : 'var(--ap-border-strong)',
                background: dark ? 'oklch(1 0 0 / 0.1)' : 'var(--ap-bg-raised)',
                color: dark ? 'oklch(1 0 0)' : 'var(--ap-fg-secondary)',
              }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Read-only banner (FR-04 / UX-05) */}
        {isClosed && (
          <div
            className="mt-3 flex items-center gap-2 rounded-[var(--ap-radius-sm)] px-3 py-2 text-[12px]"
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

        <div
          className="mt-2 flex items-center gap-3 text-[11px]"
          style={{ color: dark ? 'oklch(0.9 0.006 262)' : 'var(--ap-fg-subtle)' }}
        >
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
              <span
                className="font-mono tabular-nums"
                style={{ color: dark ? 'oklch(0.9 0.006 262)' : 'var(--ap-fg-subtle)' }}
              >
                {aggregates.taskDone}/{aggregates.taskTotal} done · {aggregates.taskPercent}%
              </span>
            </div>
            <div className="mt-1"><ProgressBar percent={aggregates.taskPercent} color="var(--ap-green)" /></div>
          </div>
          {sprint.goalTarget != null && sprint.goalTarget > 0 && (
            <div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold">{sprint.goalLabel ?? 'Goal'}</span>
                <span
                  className="font-mono tabular-nums"
                  style={{ color: dark ? 'oklch(0.9 0.006 262)' : 'var(--ap-fg-subtle)' }}
                >
                  {sprint.goalUnit ? `${sprint.goalUnit} ` : ''}{(sprint.goalCurrent ?? 0).toLocaleString()} / {sprint.goalTarget.toLocaleString()} · {aggregates.goalPercent ?? 0}%
                </span>
              </div>
              <div className="mt-1"><ProgressBar percent={aggregates.goalPercent ?? 0} color="var(--ap-accent)" /></div>
            </div>
          )}
        </div>

        {/* Action row */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div
            className="flex h-[32px] items-center gap-1.5 rounded-[var(--ap-radius-md)] border px-[11px] text-[12.5px] font-semibold"
            style={{
              borderColor: dark ? 'oklch(1 0 0 / 0.2)' : 'var(--ap-border-strong)',
              background: dark ? 'oklch(1 0 0 / 0.1)' : 'var(--ap-bg-raised)',
              color: dark ? 'oklch(1 0 0)' : 'var(--ap-fg-muted)',
            }}
          >
            <Filter className="h-[13px] w-[13px] opacity-60" />
            {filtersActive > 0 && (
              <span
                className="rounded-full px-1.5 text-[10px] font-bold leading-[16px] text-white"
                style={{ background: 'var(--ap-accent)' }}
                aria-label={`${filtersActive} filters active`}
              >
                {filtersActive}
              </span>
            )}
            <select
              value={filterAssignee ?? ''}
              onChange={(e) => setFilterAssignee(e.target.value || null)}
              aria-label="Filter cards by assignee"
              className="bg-transparent outline-none"
              style={{ color: 'inherit' }}
            >
              <option value="">All assignees</option>
              {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {/* Segmented control (§4.1): 3px track, 2px gap, 26px pills. */}
          <div
            className="flex items-center gap-[2px] rounded-[var(--ap-radius-md)] p-[3px]"
            style={{ background: dark ? 'oklch(1 0 0 / 0.14)' : 'var(--ap-bg-sunken)' }}
          >
            {(['all', 'linked', 'unlinked'] as const).map((f) => {
              const active = filterLinked === f
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilterLinked(f)}
                  aria-pressed={active}
                  className="h-[26px] rounded-[var(--ap-radius-sm)] px-[11px] text-[12.5px] font-semibold capitalize transition-colors"
                  style={
                    active
                      ? { background: 'var(--ap-bg-raised)', color: 'var(--ap-fg)' }
                      : { background: 'transparent', color: dark ? 'oklch(0.94 0.005 262)' : 'var(--ap-fg-secondary)' }
                  }
                >
                  {f}
                </button>
              )
            })}
          </div>
          {filtersActive > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[12px] font-semibold underline-offset-2 hover:underline"
              style={{ color: 'var(--ap-accent)' }}
            >
              Clear filters
            </button>
          )}
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
      <div
        className="flex gap-[2px] overflow-x-auto rounded-[var(--ap-radius-md)] p-[3px] lg:hidden"
        style={{
          background: dark ? 'oklch(1 0 0 / 0.14)' : 'var(--ap-bg-sunken)',
          border: `1px solid ${dark ? 'oklch(1 0 0 / 0.16)' : 'var(--ap-border)'}`,
        }}
      >
        {filteredColumns.map((col) => {
          const active = activeMobileCol === col.id
          return (
            <button
              key={col.id}
              type="button"
              onClick={() => setMobileCol(col.id)}
              aria-pressed={active}
              className="h-[26px] shrink-0 rounded-[var(--ap-radius-sm)] px-[11px] text-[12.5px] font-semibold transition-colors"
              style={
                active
                  ? { background: 'var(--ap-bg-raised)', color: 'var(--ap-fg)' }
                  : { background: 'transparent', color: dark ? 'oklch(0.94 0.005 262)' : 'var(--ap-fg-secondary)' }
              }
            >
              {col.name} <span className="ml-1 tabular-nums opacity-70">{col.todos.length}</span>
            </button>
          )
        })}
      </div>

      {view === 'board' ? (
        <div
          className="flex items-start gap-2 overflow-x-auto pb-2"
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
                  'flex w-[286px] shrink-0 flex-col gap-2 rounded-[var(--ap-radius-card)] border p-[10px] backdrop-blur-md',
                  dark && 'text-white',
                  isMobile && activeMobileCol !== col.id && 'hidden',
                )}
                style={{
                  background: dark ? 'oklch(0.28 0.02 262 / 0.62)' : 'color-mix(in oklab, var(--ap-bg-raised) 72%, transparent)',
                  borderColor: dark ? 'oklch(1 0 0 / 0.14)' : 'color-mix(in oklab, var(--ap-bg-raised) 80%, transparent)',
                  boxShadow: 'var(--ap-shadow-sm)',
                }}
              >
                <div className="flex items-center gap-2 px-[2px] pt-[2px]">
                  {col.color && (
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: col.color }}
                    />
                  )}
                  <span className="truncate text-[13.5px] font-bold tracking-[-0.01em]">{col.name}</span>
                  <span
                    className="shrink-0 rounded-[5px] px-1.5 py-px font-mono text-[10.5px] tabular-nums"
                    style={
                      dark
                        ? { background: 'oklch(1 0 0 / 0.16)', color: 'oklch(1 0 0)' }
                        : { background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-secondary)' }
                    }
                  >
                    {col.todos.length}
                  </span>
                  <span className="flex-1" />
                  <ListHeaderMenu
                    sprintId={sprintId}
                    lane={{ id: col.id, name: col.name, statusKey: col.statusKey, cardCount: col.cardCount }}
                    lanes={laneSummaries}
                    disabled={isClosed}
                    onChanged={invalidate}
                  />
                </div>

                <div
                  role="list"
                  aria-label={`${col.name}, ${col.todos.length} card${col.todos.length === 1 ? '' : 's'}`}
                  className="flex flex-col overflow-y-auto p-[2px]"
                  style={{ maxHeight: 'calc(100vh - 340px)' }}
                >
                {/* Drop indicator before first card. Stays mounted and animates
                    height 0→10 — deliberate anti-jank, see updateIndicator. */}
                <KanbanDropLine active={!!indicator && indicator.colId === col.id && indicator.afterIndex === -1} />

                {isEmpty && filtersActive > 0 && indicator?.colId !== col.id ? (
                  // STA-4 — distinct from a genuinely empty lane. Without this
                  // a filtered-out lane reads as "nothing to do here".
                  <div className="px-2 py-6 text-center">
                    <p className="text-[11px] text-muted-foreground">No cards match your filters</p>
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="mt-1 text-[11px] font-semibold underline-offset-2 hover:underline"
                      style={{ color: 'var(--ap-accent)' }}
                    >
                      Clear filters
                    </button>
                  </div>
                ) : isEmpty && indicator?.colId === col.id && !isClosed ? (
                  <div
                    className="flex min-h-[60px] items-center justify-center rounded-[10px] border border-dashed text-[12.5px] font-semibold"
                    style={{
                      borderColor: 'var(--ap-focus)',
                      background: 'var(--ap-accent-soft)',
                      color: 'var(--ap-accent-on-soft)',
                    }}
                  >
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
                        'rounded-[10px] transition-shadow',
                        // 8px between cards (design). Carried by the wrapper, not
                        // a flex `gap` — see the scroller comment above.
                        cardIdx < col.todos.length - 1 && 'pb-2',
                        // A lifted card needs to stay visually identifiable while
                        // the eye follows the arrow keys.
                        lifted === t.id && 'ring-2 ring-[var(--ap-focus)] ring-offset-2',
                      )}
                    >
                      <TaskCardTrello
                        todo={t as unknown as TrelloTodo}
                        isDragging={draggedId === t.id}
                        readOnly={isClosed}
                        dark={dark}
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

                {/* Empty lane (§4.1) — dashed panel, not a bare gap. Only when
                    nothing is being dragged over it; a drag shows "Drop here". */}
                {isEmpty && !(indicator?.colId === col.id && !isClosed) && (
                  <div
                    className="rounded-[10px] border border-dashed px-3 py-[18px] text-center text-[12.5px] leading-[1.5]"
                    style={{
                      borderColor: dark ? 'oklch(1 0 0 / 0.28)' : 'var(--ap-border-strong)',
                      color: dark ? 'oklch(0.88 0.006 262)' : 'var(--ap-fg-subtle)',
                    }}
                  >
                    {col.statusKey === 'STUCK'
                      ? 'Nothing stuck right now. Drag a card here when it needs help.'
                      : 'Nothing here yet. Drag a card here.'}
                  </div>
                )}

                </div>

                {col.id === quickAddLaneId && !isClosed && (
                  <AddTaskInline
                    sprintId={sprintId}
                    columnId={col.id}
                    openSignal={quickAddSignal}
                    currentUserId={currentUserId}
                    defaultDueDate={sprint.endDate}
                    onCreated={invalidate}
                    dark={dark}
                  />
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
          dark={dark}
        />
      ) : (
        <SprintInboxView dark={dark} />
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
        inboxCount={inboxUnread}
        dark={dark}
      />
    </div>
  )
}
