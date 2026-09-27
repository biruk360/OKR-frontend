/**
 * Sprint board realtime — channel naming and event contract.
 *
 * Pure (no Pusher import) so the server broadcaster, the channel-auth route and
 * the board's subscription all agree on one name without a circular import.
 *
 * The channel is PRIVATE. Sprint boards are invite-only (ADMIN/EXECUTIVE see
 * all; others only as owner or participant) and `task:created` carries the
 * whole card, so a public `sprint-<id>` channel would let anyone who learned a
 * sprint id read its cards live. `private-*` channels must be authorised by
 * POST /api/pusher/auth, which applies `canViewSprint` — the same gate as
 * GET /api/sprints/[id]/board.
 */

export const SPRINT_CHANNEL_PREFIX = 'private-sprint-'

/** Events `broadcastSprintEvent` (lib/pusher.ts) triggers on a sprint channel. */
export const SPRINT_REALTIME_EVENTS = [
  'task:moved',
  'task:created',
  'task:updated',
  'goal:updated',
  'participants:changed',
] as const

export type SprintRealtimeEvent = (typeof SPRINT_REALTIME_EVENTS)[number]

// cuid/uuid-shaped ids only — keeps odd channel names out of the DB lookup.
const SPRINT_ID = /^[A-Za-z0-9_-]{1,64}$/

/** The private Pusher channel carrying one sprint's board events. */
export function sprintRealtimeChannel(sprintId: string): string {
  return `${SPRINT_CHANNEL_PREFIX}${sprintId}`
}

/**
 * The sprint id a channel name refers to, or null when the name is not a
 * well-formed sprint channel. Used by the channel-auth route.
 */
export function parseSprintRealtimeChannel(channel: string): string | null {
  if (typeof channel !== 'string' || !channel.startsWith(SPRINT_CHANNEL_PREFIX)) return null
  const id = channel.slice(SPRINT_CHANNEL_PREFIX.length)
  return SPRINT_ID.test(id) ? id : null
}

/**
 * True when an event was caused by `selfId` — the tab that made the change
 * has already updated optimistically and invalidated its own board, so a
 * second refetch would only cause flicker. Payloads without an `actorId`
 * are never ignored.
 */
export function isOwnRealtimeEvent(payload: unknown, selfId: string | null | undefined): boolean {
  if (!selfId || !payload || typeof payload !== 'object') return false
  const actorId = (payload as { actorId?: unknown }).actorId
  return typeof actorId === 'string' && actorId === selfId
}
