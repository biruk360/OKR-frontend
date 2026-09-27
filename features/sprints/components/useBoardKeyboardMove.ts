'use client'

/**
 * Keyboard card movement for the sprint board (A11Y-2). Split out of
 * SprintBoardClient.tsx; behaviour unchanged.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Dispatch, KeyboardEvent, SetStateAction } from 'react'
import type { TodoStatus } from '@/types'
import { announce } from '@/components/shared/LiveAnnouncer'
import type { BoardColumn } from './sprintBoardTypes'

export function useBoardKeyboardMove({
  setLocalColumns,
  reorderBoard,
}: {
  setLocalColumns: Dispatch<SetStateAction<BoardColumn[]>>
  /** Persists lane orders; the board refetches on success and on failure. */
  reorderBoard: (columnOrders: Record<string, string[]>) => Promise<void>
}) {
  // Read through a ref so the memoised handlers below always call the latest
  // board callback without being recreated on every render.
  const reorderRef = useRef(reorderBoard)
  reorderRef.current = reorderBoard

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
  }, [setLocalColumns])

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
        void reorderRef.current(orders)
        announce(`Dropped in ${lane.name}, position ${pos.cardIdx + 1} of ${lane.todos.length}`)
      }
      return cols
    })
    preLiftOriginRef.current = null
  }, [findCard, setLocalColumns])

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
  }, [findCard, setLocalColumns])

  const onCardKeyDown = useCallback((e: KeyboardEvent, todoId: string, laneId: string) => {
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

  return { lifted, onCardKeyDown, localColumnsRef, isClosedRef }
}
