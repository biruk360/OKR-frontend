import Pusher from 'pusher'
import PusherClient from 'pusher-js'

// Server-side Pusher instance
export const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true
})

// Client-side Pusher instance
export const pusherClient = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  forceTLS: true
})

// Real-time event types
export const PUSHER_EVENTS = {
  OBJECTIVE_UPDATED: 'objective-updated',
  KEY_RESULT_UPDATED: 'key-result-updated',
  TODO_UPDATED: 'todo-updated',
  COMMENT_ADDED: 'comment-added',
  NOTIFICATION_SENT: 'notification-sent'
} as const

/**
 * Sprint v2 realtime — broadcast events on the per-sprint channel.
 * Channel: `sprint-${sprintId}`. Failures are swallowed (logged) so domain
 * actions never fail because realtime is degraded.
 */
export async function broadcastSprintEvent(
  sprintId: string,
  eventName: 'task:moved' | 'task:created' | 'task:updated' | 'goal:updated' | 'participants:changed',
  payload: Record<string, unknown>
): Promise<void> {
  if (!sprintId) return
  try {
    await pusherServer.trigger(`sprint-${sprintId}`, eventName, payload)
  } catch (error) {
    console.error('[broadcastSprintEvent] failed:', error)
  }
}

// Helper function to trigger real-time updates
export async function triggerRealtimeUpdate(
  channel: string,
  event: string,
  data: any
) {
  try {
    await pusherServer.trigger(channel, event, data)
  } catch (error) {
    console.error('Error triggering real-time update:', error)
  }
}
