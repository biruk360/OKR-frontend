'use client'

/**
 * One sprint board lane: header (colour, name, count, list menu), the card
 * list with drop lines, the filtered / empty / "drop here" states, and the
 * quick-add composer. Pointer drag-and-drop handlers are owned by
 * SprintBoardClient and passed in unchanged; keyboard movement comes from
 * useBoardKeyboardMove. Split out of SprintBoardClient.tsx; behaviour unchanged.
 */

import type { DragEvent, KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { KanbanDropLine } from '@/components/shared/KanbanDropLine'
import TaskCardTrello, { type TrelloTodo } from './TaskCardTrello'
import { ListHeaderMenu, type LaneSummary } from './SprintListManager'
import AddTaskInline from './SprintAddTaskInline'
import type { BoardColumn } from './sprintBoardTypes'

export interface SprintBoardLaneProps {
  col: BoardColumn
  sprintId: string
  currentUserId: string
  dark: boolean
  isClosed: boolean
  isMobile: boolean
  activeMobileCol: string | null
  laneSummaries: LaneSummary[]
  indicator: { colId: string; afterIndex: number } | null
  filtersActive: number
  clearFilters: () => void
  lifted: string | null
  draggedId: string | null
  setDraggedId: (id: string | null) => void
  clearIndicator: () => void
  onCardKeyDown: (e: KeyboardEvent, todoId: string, laneId: string) => void
  onOpenCard: (todoId: string) => void
  onLaneDragOver: (e: DragEvent<HTMLDivElement>, col: BoardColumn) => void
  onLaneDragLeave: (e: DragEvent<HTMLDivElement>) => void
  onLaneDrop: (e: DragEvent<HTMLDivElement>, col: BoardColumn) => void
  invalidate: () => void
  onAddCard: () => void
  onSort: (by: 'due' | 'priority' | 'created') => void
  /** This lane hosts the quick-add composer. */
  showQuickAdd: boolean
  quickAddSignal: number
  defaultDueDate: string | null
}

export default function SprintBoardLane({
  col, sprintId, currentUserId, dark, isClosed, isMobile, activeMobileCol, laneSummaries, indicator,
  filtersActive, clearFilters, lifted, draggedId, setDraggedId, clearIndicator, onCardKeyDown, onOpenCard,
  onLaneDragOver, onLaneDragLeave, onLaneDrop, invalidate, onAddCard, onSort, showQuickAdd, quickAddSignal,
  defaultDueDate,
}: SprintBoardLaneProps) {
  const isEmpty = col.todos.length === 0
  return (
    <div
      onDragOver={(e) => onLaneDragOver(e, col)}
      onDragLeave={onLaneDragLeave}
      onDrop={(e) => onLaneDrop(e, col)}
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
          // LST-3 — quick-add lives on the board, so the menu asks for it.
          onAddCard={onAddCard}
          onSort={onSort}
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
          <p className="text-caption text-muted-foreground">No cards match your filters</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-1 text-caption font-semibold underline-offset-2 hover:underline"
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
              onClick={() => onOpenCard(t.id)}
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

      {showQuickAdd && !isClosed && (
        <AddTaskInline
          sprintId={sprintId}
          columnId={col.id}
          openSignal={quickAddSignal}
          currentUserId={currentUserId}
          defaultDueDate={defaultDueDate}
          onCreated={invalidate}
          dark={dark}
        />
      )}
    </div>
  )
}
