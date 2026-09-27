import Pusher from 'pusher'
import PusherClient from 'pusher-js'
import { sprintRealtimeChannel } from '@/lib/sprints/realtime'
import {
  buildOkrRealtimePayload,
  keyResultEventChannels,
  objectiveRealtimeChannel,
  type OkrRealtimeEvent,
} from '@/lib/okr/realtime'

/**
 * Lazy-init Pusher so the build / type-collection step doesn't crash when
 * env vars are absent in CI. Runtime callers get a typed instance or null.
 */

let _server: Pusher | null = null
let _serverLogged = false

// Reject empty, "your-*" placeholders from env.example, "dev-placeholder" from
// the bootstrap script, and "0" appId. Otherwise the SDK happily ships every
// trigger() to api-mt1.pusher.com and waits for the 400 round-trip.
function isUsableCred(v: string | undefined): v is string {
  if (!v) return false
  if (v === '0') return false
  if (v.startsWith('your-')) return false
  if (v.includes('dev-placeholder')) return false
  return true
}

export function getPusherServer(): Pusher | null {
  if (_server) return _server
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env
  if (!isUsableCred(PUSHER_APP_ID) || !isUsableCred(PUSHER_KEY) || !isUsableCred(PUSHER_SECRET) || !isUsableCred(PUSHER_CLUSTER)) {
    if (!_serverLogged) {
      console.warn('[pusher] server credentials not configured; realtime disabled')
      _serverLogged = true
    }
    return null
  }
  _server = new Pusher({
    appId: PUSHER_APP_ID,
    key: PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: PUSHER_CLUSTER,
    useTLS: true,
  })
  return _server
}

let _client: PusherClient | null = null
let _clientLogged = false

export function getPusherClient(): PusherClient | null {
  if (typeof window === 'undefined') return null
  if (_client) return _client
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER
  if (!isUsableCred(key) || !isUsableCred(cluster)) {
    if (!_clientLogged) {
      console.warn('[pusher] client credentials not configured; realtime disabled')
      _clientLogged = true
    }
    return null
  }
  _client = new PusherClient(key, {
    cluster,
    forceTLS: true,
    // Needed for `private-*` channels. The notification channel is per-user and
    // must be private: a public channel named after a user id would let anyone
    // who knows the id subscribe to that person's notifications.
    authEndpoint: '/api/pusher/auth',
  })
  return _client
}

// Backward-compat shims for callers that imported the old eager singletons.
// These will be `null` when env is unconfigured rather than throwing at module load.
export const pusherServer = {
  trigger: async (channel: string, event: string, data: unknown) => {
    const s = getPusherServer()
    if (!s) return
    return s.trigger(channel, event, data)
  },
  authorizeChannel: (socketId: string, channel: string, presenceData?: any) => {
    const s = getPusherServer()
    if (!s) return null
    return (s as any).authorizeChannel
      ? (s as any).authorizeChannel(socketId, channel, presenceData)
      : (s as any).authenticate(socketId, channel, presenceData)
  },
}

export const pusherClient = new Proxy({}, {
  get(_t, prop: string) {
    const c = getPusherClient()
    if (!c) {
      // No-op stubs for the common methods so callers don't blow up
      if (prop === 'subscribe') return () => ({ bind: () => {}, unbind: () => {}, unbind_all: () => {} })
      if (prop === 'unsubscribe') return () => {}
      if (prop === 'connection') return { bind: () => {}, unbind: () => {} }
      return undefined
    }
    return (c as any)[prop]
  },
}) as unknown as PusherClient

// Real-time event types. OBJECTIVE_UPDATED / KEY_RESULT_UPDATED / COMMENT_ADDED
// are legacy names with no subscriber; OKR detail pages use the per-kind events
// in OKR_REALTIME_EVENTS (lib/okr/realtime.ts) via broadcastObjectiveEvent /
// broadcastKeyResultEvent below.
export const PUSHER_EVENTS = {
  OBJECTIVE_UPDATED: 'objective-updated',
  KEY_RESULT_UPDATED: 'key-result-updated',
  TODO_UPDATED: 'todo-updated',
  COMMENT_ADDED: 'comment-added',
  NOTIFICATION_SENT: 'notification-sent',
} as const

/** The private channel carrying one user's notifications. */
export function userNotificationChannel(userId: string): string {
  return `private-user-${userId}`
}

/**
 * Push a freshly written notification to the recipient's open tabs.
 *
 * PUSHER_EVENTS.NOTIFICATION_SENT was declared when the constant table was
 * written and never triggered or bound by anything, so the bell only ever
 * updated on mount or on open. Failures are swallowed: realtime is an
 * enhancement, and a notification that is already persisted must not be
 * reported as failed because a websocket was unreachable.
 */
export async function broadcastUserNotification(
  userId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!userId) return
  const s = getPusherServer()
  if (!s) return
  try {
    await s.trigger(userNotificationChannel(userId), PUSHER_EVENTS.NOTIFICATION_SENT, payload)
  } catch (error) {
    console.error('[broadcastUserNotification] failed:', error)
  }
}

/**
 * Sprint v2 realtime — broadcast events on the per-sprint channel.
 * Channel: `sprint-${sprintId}`. Failures are swallowed (logged) so domain
 * actions never fail because realtime is degraded.
 */
export async function broadcastSprintEvent(
  sprintId: string,
  eventName: 'task:moved' | 'task:created' | 'task:updated' | 'goal:updated' | 'participants:changed',
  payload: Record<string, unknown>,
): Promise<void> {
  if (!sprintId) return
  const s = getPusherServer()
  if (!s) return
  try {
    // Private channel: authorised per viewer by canViewSprint in /api/pusher/auth.
    await s.trigger(sprintRealtimeChannel(sprintId), eventName, payload)
  } catch (error) {
    console.error('[broadcastSprintEvent] failed:', error)
  }
}

/**
 * OKR realtime — tell open objective detail pages that something changed.
 * Private channel `private-objective-<id>`, authorised in /api/pusher/auth only
 * for viewers who see the objective UNREDACTED. Payload is ids + kind + actorId
 * (lib/okr/realtime.ts); the page refetches through its permission-checked path.
 *
 * Fire-and-forget: returns synchronously, never throws, never delays or fails
 * the mutation that called it. Call it AFTER the write has committed.
 */
export function broadcastObjectiveEvent(
  objectiveId: string | null | undefined,
  kind: OkrRealtimeEvent,
  actorId: string | null | undefined,
): void {
  if (!objectiveId) return
  try {
    const s = getPusherServer()
    if (!s) return
    const payload = buildOkrRealtimePayload({ entity: 'objective', id: objectiveId, kind, actorId })
    void s.trigger(objectiveRealtimeChannel(objectiveId), kind, payload).catch((error: unknown) => {
      console.error('[broadcastObjectiveEvent] failed:', error)
    })
  } catch (error) {
    console.error('[broadcastObjectiveEvent] failed:', error)
  }
}

/**
 * OKR realtime — key-result change. Sent to `private-keyresult-<id>` and, when
 * `objectiveId` is known, relayed to the parent `private-objective-<id>` (the
 * objective page lists the KR and its progress). Same fire-and-forget contract
 * as broadcastObjectiveEvent.
 */
export function broadcastKeyResultEvent(
  keyResultId: string | null | undefined,
  objectiveId: string | null | undefined,
  kind: OkrRealtimeEvent,
  actorId: string | null | undefined,
): void {
  if (!keyResultId) return
  try {
    const s = getPusherServer()
    if (!s) return
    const payload = buildOkrRealtimePayload({
      entity: 'keyResult',
      id: keyResultId,
      kind,
      actorId,
      objectiveId,
      keyResultId,
    })
    void s.trigger(keyResultEventChannels(keyResultId, objectiveId), kind, payload).catch((error: unknown) => {
      console.error('[broadcastKeyResultEvent] failed:', error)
    })
  } catch (error) {
    console.error('[broadcastKeyResultEvent] failed:', error)
  }
}

// Helper function to trigger real-time updates
export async function triggerRealtimeUpdate(
  channel: string,
  event: string,
  data: unknown,
) {
  const s = getPusherServer()
  if (!s) return
  try {
    await s.trigger(channel, event, data)
  } catch (error) {
    console.error('Error triggering real-time update:', error)
  }
}
