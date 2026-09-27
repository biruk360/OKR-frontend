'use client'

/**
 * SprintBoardClient — Phase 3 Todo-backed sprint board (Sprints v2 §4.3).
 *
 * Reads /api/sprints/[id]/board (Todo single-source-of-truth) and renders the
 * board's lanes. Drag-drop updates Todo.status via the reorder endpoint. Click
 * a card → opens TodoCardModal (a centred modal; drawer mode was removed in the
 * design refresh, §6.4).
 *
 * This file owns the board's data, filter and drag state. The pieces it
 * renders live beside it:
 *   SprintBoardHeader      sticky header, sprint actions, progress, filter row
 *   SprintBoardLane        one lane: header, cards, empty states, quick-add
 *   SprintAddTaskInline    the quick-add composer
 *   useBoardKeyboardMove   keyboard card movement (A11Y-2)
 */

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CalendarClock, CalendarRange, CalendarX2, Tag, UserX } from 'lucide-react'
import { LazyTodoCardModal } from '@/components/todos/LazyTodoCardModal'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'
import EndSprintModal from '@/components/sprints/EndSprintModal'
import ScheduleSprintModal from '@/components/sprints/ScheduleSprintModal'
import { type FilterMultiSelectOption } from '@/components/ui/FilterMultiSelect'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { useIsMobile } from '@/hooks'
import { cn } from '@/lib/utils'
import type { TodoStatus } from '@/types'
import {
  UNASSIGNED_FILTER_ID,
  countUnassignedCards,
  deriveBoardPeople,
  pruneSelection,
} from '@/lib/sprints/board-people'
import {
  DUE_FILTERS,
  DUE_FILTER_LABELS,
  NO_LABEL_FILTER_ID,
  compileBoardFilter,
  countActiveFilters,
  countDueBuckets,
  countUnlabelledCards,
  deriveBoardLabels,
  emptyBoardFilters,
  pruneLabelSelection,
  readSavedBoardFilters,
  serializeBoardFilters,
  type BoardFilterState,
  type DueFilter,
} from '@/lib/sprints/board-filters'
import { SPRINT_REALTIME_EVENTS, sprintRealtimeChannel } from '@/lib/sprints/realtime'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import { swatchStyle } from '@/lib/card-visuals'
import { useUserPrefsStore } from '@/lib/stores/user-prefs-store'
import { announce } from '@/components/shared/LiveAnnouncer'
import AddListColumn, { type LaneSummary } from './SprintListManager'
import SprintFloatingBar, { type SprintBoardView } from './SprintFloatingBar'
import SprintSwitcher from './SprintSwitcher'
import SprintMembersDialog from './SprintMembersDialog'
import SprintPlannerView from './SprintPlannerView'
import SprintInboxView from './SprintInboxView'
import SprintBoardHeader from './SprintBoardHeader'
import SprintBoardLane from './SprintBoardLane'
import { useBoardKeyboardMove } from './useBoardKeyboardMove'
import type { BoardColumn, BoardData } from './sprintBoardTypes'
import { useNotificationStore } from '@/lib/stores/notification-store'
import {
  getBackgroundStyle,
  isDarkBackground,
  type SprintBackgroundKey,
} from '@/lib/sprint-backgrounds'

// ─── Re-export legacy SprintBoardData type for back-compat ─────────────────

export type SprintBoardData = BoardData

interface Props {
  sprintId: string
  currentUserId: string
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
  // Invite-only boards: who can open this board, and (for its managers) invite/remove.
  const [showMembers, setShowMembers] = useState(false)
  const [scheduleMode, setScheduleMode] = useState<'edit' | 'start' | null>(null)
  const [starting, setStarting] = useState(false)
  // BRD-3 — filters persist per sprint. Losing them on every reload made the
  // board feel like it forgot what you were doing.
  const FILTER_KEY = `sprint-filters-${sprintId}`
  // BRD-2 facets (lib/sprints/board-filters): assignee (AFL), label, due,
  // watching and OKR linkage — OR within a facet, AND across facets.
  const [filters, setFilters] = useState<BoardFilterState>(emptyBoardFilters)
  const [filtersLoaded, setFiltersLoaded] = useState(false)
  const colorBlind = useUserPrefsStore((st) => st.colorBlindMode)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FILTER_KEY)
      // Reads every shape the board has written: legacy `assignee: string`
      // (AFL-6), `{ assignees, linked }`, and the full facet object.
      setFilters(raw ? readSavedBoardFilters(JSON.parse(raw)) : emptyBoardFilters())
    } catch { /* private mode or bad JSON — filters just start clean */ }
    setFiltersLoaded(true)
  }, [FILTER_KEY])

  useEffect(() => {
    // Only write after the initial read, or mount would clobber the saved value.
    if (!filtersLoaded) return
    try {
      window.localStorage.setItem(FILTER_KEY, JSON.stringify(serializeBoardFilters(filters)))
    } catch { /* ignore */ }
  }, [FILTER_KEY, filters, filtersLoaded])

  const patchFilters = useCallback(
    (patch: Partial<BoardFilterState>) => setFilters((cur) => ({ ...cur, ...patch })),
    [],
  )
  // BRD-2 badge — each facet counts once however many values are picked (AFL-5).
  const filtersActive = countActiveFilters(filters)
  const clearFilters = () => setFilters(emptyBoardFilters())
  const toggleAssignee = (id: string) =>
    setFilters((cur) => ({
      ...cur,
      assignees: cur.assignees.includes(id) ? cur.assignees.filter((x) => x !== id) : [...cur.assignees, id],
    }))
  const isMobile = useIsMobile()
  // Lane id, not a status — several lanes can share a status now.
  const [mobileCol, setMobileCol] = useState<string | null>(null)
  const [view, setView] = useState<SprintBoardView>('board')
  const [showSwitcher, setShowSwitcher] = useState(false)
  // STA-2 — bumping this opens the quick-add composer. The empty-state button
  // used to carry an empty handler, so "Create task" did nothing at all.
  const [quickAddSignal, setQuickAddSignal] = useState(0)
  const [quickAddLane, setQuickAddLane] = useState<string | null>(null)

  /**
   * LST-3 — reorder one lane and persist it.
   *
   * Sorting writes real positions rather than sorting on read, so the order
   * survives a reload and matches what everyone else sees.
   */
  const sortLane = useCallback((laneId: string, by: 'due' | 'priority' | 'created') => {
    const RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
    // Side effects stay out of the setLocalColumns updater: updaters run during
    // render, and announce() there triggered React's "Cannot update a
    // component (LiveAnnouncer) while rendering" warning. localColumnsRef is
    // the keyboard-move hook's live mirror of localColumns (declared below;
    // only read when the callback runs).
    const cols = localColumnsRef.current
    const lane = cols.find((c) => c.id === laneId)
    if (!lane) return
    const sorted = [...lane.todos].sort((a, b) => {
      if (by === 'priority') return (RANK[a.priority] ?? 9) - (RANK[b.priority] ?? 9)
      if (by === 'due') {
        // Undated cards sink rather than sorting as epoch-zero.
        const av = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY
        const bv = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY
        return av - bv
      }
      return 0   // 'created' — the API already returns creation order
    })
    const order = by === 'created'
      ? [...lane.todos].map((t) => t.id)
      : sorted.map((t) => t.id)
    const next = cols.map((c) => (c.id === laneId ? { ...c, todos: sorted } : c))
    localColumnsRef.current = next
    setLocalColumns(next)
    void reorderBoard({ [laneId]: order })
    announce(`${lane.name} sorted by ${by === 'due' ? 'due date' : by === 'priority' ? 'priority' : 'date created'}`)
  }, [])

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
  // A PARALLEL keyboard path over the same reorder endpoint; pointer drag is
  // untouched. See useBoardKeyboardMove for the model.
  const { lifted, onCardKeyDown, localColumnsRef, isClosedRef } = useBoardKeyboardMove({
    setLocalColumns,
    reorderBoard,
  })


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

  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: ['sprint-board', sprintId] }),
    [qc, sprintId],
  )

  // Realtime: other people's moves/edits on this board refetch it. The event
  // is only a signal — the refetch goes through the board API and its
  // canViewSprint gate. Own actions are skipped (this tab already invalidated
  // after its optimistic update) and a refresh waits while a card is being
  // dragged or keyboard-lifted. With placeholder Pusher credentials this is a
  // no-op (see hooks/useRealtimeRefresh).
  const boardBusyRef = useRef(false)
  useRealtimeRefresh({
    channel: sprintRealtimeChannel(sprintId),
    events: SPRINT_REALTIME_EVENTS,
    onRefresh: invalidate,
    ignoreActorId: currentUserId,
    shouldDefer: () => boardBusyRef.current,
  })

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

  // AFL-1/2/8 — the people on the board: card assignees + card members +
  // participants + owner. Counts are over ALL cards, not the filtered view.
  const boardPeople = useMemo(
    () => (data
      ? deriveBoardPeople({
          columns: data.columns,
          participants: data.participants,
          owner: data.sprint.owner,
          currentUserId,
        })
      : []),
    [data, currentUserId],
  )
  const unassignedCount = useMemo(() => (data ? countUnassignedCards(data.columns) : 0), [data])

  // AFL-7 — once the board has loaded, drop saved ids that are no longer on it,
  // so a stale selection can never silently hide every card. pruneSelection
  // returns the same array when nothing changed, which makes this a no-op.
  const boardLabels = useMemo(() => (data ? deriveBoardLabels(data.columns) : []), [data])
  const unlabelledCount = useMemo(() => (data ? countUnlabelledCards(data.columns) : 0), [data])
  // Due counts use the same clock as the filter below, recomputed per board load.
  const dueCounts = useMemo(
    () => (data ? countDueBuckets(data.columns, new Date()) : { overdue: 0, today: 0, week: 0, none: 0 }),
    [data],
  )

  useEffect(() => {
    if (!data || !filtersLoaded) return
    // Same rule for labels: a label removed from every card stops filtering.
    setFilters((cur) => {
      const assignees = pruneSelection(cur.assignees, boardPeople)
      const labels = pruneLabelSelection(cur.labels, boardLabels)
      return assignees === cur.assignees && labels === cur.labels ? cur : { ...cur, assignees, labels }
    })
  }, [data, filtersLoaded, boardPeople, boardLabels])

  const assigneeOptions: FilterMultiSelectOption[] = useMemo(
    () => [
      ...boardPeople.map((p) => ({
        value: p.id,
        label: p.id === currentUserId ? `Me (${p.name})` : p.name,
        hint: String(p.cardCount),
        // The option label already shows the full name (UNH-6).
        leading: <UserAvatar user={p} size={20} tooltip={false} />,
      })),
      {
        value: UNASSIGNED_FILTER_ID,
        label: 'Unassigned',
        hint: String(unassignedCount),
        leading: (
          <span
            aria-hidden
            className="inline-flex h-5 w-5 items-center justify-center rounded-full"
            style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-subtle)' }}
          >
            <UserX className="h-3 w-3" />
          </span>
        ),
      },
    ],
    [boardPeople, currentUserId, unassignedCount],
  )

  const labelOptions: FilterMultiSelectOption[] = useMemo(
    () => [
      ...boardLabels.map((l) => ({
        value: l.id,
        label: l.name || 'Untitled label',
        hint: String(l.cardCount),
        leading: (
          <span
            aria-hidden
            className="inline-block h-3 w-5 rounded-[3px]"
            style={swatchStyle(l.color, { colorBlind, pattern: l.pattern })}
          />
        ),
      })),
      {
        value: NO_LABEL_FILTER_ID,
        label: 'No label',
        hint: String(unlabelledCount),
        leading: (
          <span
            aria-hidden
            className="inline-flex h-3 w-5 items-center justify-center rounded-[3px] border border-dashed"
            style={{ borderColor: 'var(--ap-border-strong)', color: 'var(--ap-fg-subtle)' }}
          >
            <Tag className="h-2 w-2" />
          </span>
        ),
      },
    ],
    [boardLabels, unlabelledCount, colorBlind],
  )

  const dueOptions: FilterMultiSelectOption[] = useMemo(() => {
    const ICON: Record<DueFilter, React.ReactNode> = {
      overdue: <AlertCircle className="h-3.5 w-3.5" style={{ color: 'var(--ap-danger-fg)' }} />,
      today: <CalendarClock className="h-3.5 w-3.5" style={{ color: 'var(--ap-warn-fg)' }} />,
      week: <CalendarRange className="h-3.5 w-3.5" style={{ color: 'var(--ap-fg-muted)' }} />,
      none: <CalendarX2 className="h-3.5 w-3.5" style={{ color: 'var(--ap-fg-subtle)' }} />,
    }
    return DUE_FILTERS.map((d) => ({
      value: d,
      label: DUE_FILTER_LABELS[d],
      hint: String(dueCounts[d]),
      leading: <span aria-hidden className="inline-flex">{ICON[d]}</span>,
    }))
  }, [dueCounts])

  const filteredColumns = useMemo(() => {
    if (!data) return []
    // AND across facets, OR within each (BRD-2 / AFL-4).
    const matches = compileBoardFilter(filters, { currentUserId, now: new Date() })
    return data.columns.map((c) => ({ ...c, todos: c.todos.filter(matches) }))
  }, [data, filters, currentUserId])

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

  useEffect(() => { localColumnsRef.current = localColumns }, [localColumns, localColumnsRef])
  useEffect(() => { boardBusyRef.current = draggedId !== null || lifted !== null }, [draggedId, lifted])

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

  const { sprint, aggregates } = data
  const daysLeft = sprint.endDate ? Math.max(0, Math.ceil((new Date(sprint.endDate).getTime() - Date.now()) / 86400000)) : null

  // FR-04 — closed sprints render read-only (banner, no drag, no quick-add).
  const isClosed = sprint.state === 'COMPLETED' || sprint.state === 'CANCELLED'
  isClosedRef.current = isClosed

  const bgKey = (sprint.background as SprintBackgroundKey | null) ?? 'none'
  const dark = isDarkBackground(bgKey)


  // ── Pointer drag-and-drop (lane handlers) ────────────────────────────────
  // Unchanged logic; SprintBoardLane wires these to each lane element.
  const handleLaneDragOver = (e: React.DragEvent<HTMLDivElement>, col: BoardColumn) => {
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
  }

  const handleLaneDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (isClosed) return
    if (!e.currentTarget.contains(e.relatedTarget as Node)) clearIndicator()
  }

  const handleLaneDrop = (e: React.DragEvent<HTMLDivElement>, col: BoardColumn) => {
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
  }

  return (
    <div
      className={cn('-mx-4 -my-4 min-h-[calc(100vh-64px)] space-y-3 px-4 py-4 pb-24 transition-colors', dark && 'text-white')}
      style={getBackgroundStyle(bgKey)}
    >
      <SprintBoardHeader
        sprintId={sprintId}
        currentUserId={currentUserId}
        data={data}
        dark={dark}
        isClosed={isClosed}
        daysLeft={daysLeft}
        starting={starting}
        setScheduleMode={setScheduleMode}
        handleStartSprintClick={handleStartSprintClick}
        setShowEnd={setShowEnd}
        setShowMembers={setShowMembers}
        onSwitchBoards={() => setShowSwitcher(true)}
        invalidate={invalidate}
        filters={filters}
        patchFilters={patchFilters}
        assigneeOptions={assigneeOptions}
        labelOptions={labelOptions}
        dueOptions={dueOptions}
        filtersActive={filtersActive}
        clearFilters={clearFilters}
        boardPeople={boardPeople}
        toggleAssignee={toggleAssignee}
      />

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
              setQuickAddLane(null)
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
          {localColumns.map((col) => (
            <SprintBoardLane
              key={col.id}
              col={col}
              sprintId={sprintId}
              currentUserId={currentUserId}
              dark={dark}
              isClosed={isClosed}
              isMobile={isMobile}
              activeMobileCol={activeMobileCol}
              laneSummaries={laneSummaries}
              indicator={indicator}
              filtersActive={filtersActive}
              clearFilters={clearFilters}
              lifted={lifted}
              draggedId={draggedId}
              setDraggedId={setDraggedId}
              clearIndicator={clearIndicator}
              onCardKeyDown={onCardKeyDown}
              onOpenCard={setOpenTodoId}
              onLaneDragOver={handleLaneDragOver}
              onLaneDragLeave={handleLaneDragLeave}
              onLaneDrop={handleLaneDrop}
              invalidate={invalidate}
              // LST-3 — quick-add lives on the board, so the menu asks for it.
              onAddCard={() => {
                setQuickAddLane(col.id)
                setQuickAddSignal((n) => n + 1)
              }}
              onSort={(by) => sortLane(col.id, by)}
              showQuickAdd={col.id === (quickAddLane ?? quickAddLaneId)}
              quickAddSignal={quickAddSignal}
              defaultDueDate={sprint.endDate}
            />
          ))}

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


      {/* Centered task detail modal (Trello-style). Code-split: the card
          modal chunk loads the first time a card is opened. */}
      {openTodoId && (
        <LazyTodoCardModal
          todoId={openTodoId}
          currentUserId={currentUserId}
          onClose={() => setOpenTodoId(null)}
          onUpdated={invalidate}
        />
      )}

      {/* Board members (invite-only boards) */}
      <SprintMembersDialog
        sprintId={sprintId}
        open={showMembers}
        onClose={() => setShowMembers(false)}
        onChanged={invalidate}
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
