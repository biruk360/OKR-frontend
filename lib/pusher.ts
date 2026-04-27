import Pusher from 'pusher'
import PusherClient from 'pusher-js'

/**
 * Lazy-init Pusher so the build / type-collection step doesn't crash when
 * env vars are absent in CI. Runtime callers get a typed instance or null.
 */

let _server: Pusher | null = null
let _serverLogged = false

export function getPusherServer(): Pusher | null {
  if (_server) return _server
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) {
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
  if (!key || !cluster) {
    if (!_clientLogged) {
      console.warn('[pusher] client credentials not configured; realtime disabled')
      _clientLogged = true
    }
    return null
  }
  _client = new PusherClient(key, { cluster, forceTLS: true })
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

// Real-time event types
export const PUSHER_EVENTS = {
  OBJECTIVE_UPDATED: 'objective-updated',
  KEY_RESULT_UPDATED: 'key-result-updated',
  TODO_UPDATED: 'todo-updated',
  COMMENT_ADDED: 'comment-added',
  NOTIFICATION_SENT: 'notification-sent',
} as const

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
    await s.trigger(`sprint-${sprintId}`, eventName, payload)
  } catch (error) {
    console.error('[broadcastSprintEvent] failed:', error)
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
