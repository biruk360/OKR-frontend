/**
 * Sprint board lanes (SprintColumn) — shared service.
 *
 * Before Phase 2 the board ignored this table entirely and rendered a hardcoded
 * array of five statuses, which left the column API unreachable and made
 * "+ Add another list" impossible. Lanes are now the source of truth for board
 * layout, while `Todo.status` remains the source of truth for *meaning*
 * (completion %, AI carryover, the end-sprint disposition engine).
 *
 * The invariant that makes both work at once: every lane carries a `statusKey`,
 * and several lanes may share one. Moving a card into a lane writes that lane's
 * statusKey onto the card.
 *
 * Spec: docs/trello_parity_sprint_board_REQUIREMENTS.md LST-1..10, API-1..7.
 */

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { BOARD_STATUSES } from '@/lib/todo-status'
import type { TodoStatus } from '@/types'

export interface LaneShape {
  id: string
  sprintId: string
  name: string
  statusKey: string | null
  position: number
  color: string | null
  archivedAt: Date | null
}

/** The lanes every new sprint starts with. Mirrors DEFAULT_COLUMNS in app/api/sprints/route.ts. */
export const DEFAULT_LANES: { name: string; statusKey: TodoStatus; position: number; color: string | null }[] = [
  { name: 'To Do', statusKey: 'PENDING', position: 0, color: null },
  { name: 'In Progress', statusKey: 'IN_PROGRESS', position: 1, color: '#0A84FF' },
  { name: 'In Review', statusKey: 'IN_REVIEW', position: 2, color: '#AF52DE' },
  { name: 'Stuck', statusKey: 'STUCK', position: 3, color: '#FF9500' },
  { name: 'Done', statusKey: 'COMPLETED', position: 4, color: '#34C759' },
]

export function isBoardStatusKey(value: unknown): value is TodoStatus {
  return typeof value === 'string' && (BOARD_STATUSES as readonly string[]).includes(value)
}

/**
 * Active lanes for a sprint, ordered for display.
 *
 * Self-healing: a sprint with no lanes at all (created before lanes existed, or
 * with every lane somehow archived) gets the default set rather than rendering
 * an empty board. Creation is best-effort — a race with a concurrent request is
 * resolved by re-reading.
 */
export async function getSprintLanes(sprintId: string): Promise<LaneShape[]> {
  const select = {
    id: true, sprintId: true, name: true, statusKey: true,
    position: true, color: true, archivedAt: true,
  } as const

  const lanes = await prisma.sprintColumn.findMany({
    where: { sprintId, archivedAt: null },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select,
  })
  if (lanes.length > 0) return lanes

  try {
    await prisma.sprintColumn.createMany({
      data: DEFAULT_LANES.map((l) => ({ ...l, sprintId })),
      skipDuplicates: true,
    })
  } catch {
    // Unique-name collision from a concurrent create — the re-read below wins.
  }
  return prisma.sprintColumn.findMany({
    where: { sprintId, archivedAt: null },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select,
  })
}

/**
 * The lane a card of `status` belongs in when it has no explicit `columnId`:
 * the first active lane carrying that statusKey. Returns null when no lane
 * represents the status (e.g. CANCELLED), which the board treats as "not shown".
 */
export function laneForStatus(lanes: LaneShape[], status: string): LaneShape | null {
  return lanes.find((l) => l.statusKey === status) ?? null
}

/**
 * Resolve which lane a card should render in: its own `columnId` when that lane
 * is still active, otherwise the status fallback. Keeps cards visible after
 * their lane is archived and during the columnId backfill window.
 */
export function resolveLane(
  lanes: LaneShape[],
  todo: { columnId: string | null; status: string },
): LaneShape | null {
  if (todo.columnId) {
    const own = lanes.find((l) => l.id === todo.columnId)
    if (own) return own
  }
  return laneForStatus(lanes, todo.status)
}

/**
 * Next `sprintPosition` for appending to a lane. Positions are spaced by 1000
 * (matching board/reorder) so a single card can be inserted between two others
 * without renumbering the lane.
 */
export async function nextLanePosition(
  client: Prisma.TransactionClient | typeof prisma,
  sprintId: string,
  columnId: string,
): Promise<number> {
  const last = await client.todo.findFirst({
    where: { sprintId, columnId },
    orderBy: { sprintPosition: 'desc' },
    select: { sprintPosition: true },
  })
  return (last?.sprintPosition ?? 0) + 1000
}
