/**
 * Response shape of GET /api/sprints/[id]/board, shared by SprintBoardClient
 * and its parts (header, lane, keyboard-move controller).
 */

import type { TodoStatus } from '@/types'


export interface BoardUser { id: string; name: string; avatar: string | null }
export interface BoardTodo {
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
  /** Label chips (TodoLabel → TodoLabelDef) — the board filter's label facet. */
  labels?: { labelDef: { id: string; name: string; color: string; pattern?: string | null } }[]
  /** Scoped to the viewer by the board API: non-empty means "you watch this". */
  watchers?: { userId: string }[]
}
export interface BoardColumn {
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
export interface BoardSprint {
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
export interface BoardData {
  sprint: BoardSprint
  columns: BoardColumn[]
  participants: BoardUser[]
  aggregates: { taskTotal: number; taskDone: number; taskPercent: number; goalPercent: number | null }
}
