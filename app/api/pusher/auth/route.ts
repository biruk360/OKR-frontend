import { NextResponse } from 'next/server'
import { getPusherServer, userNotificationChannel } from '@/lib/pusher'
import { withAuth } from '@/lib/api/withAuth'
import { apiBadRequest, apiForbidden } from '@/lib/api/apiResponse'

/**
 * POST /api/pusher/auth — channel authorization for private Pusher channels.
 *
 * Required before anything can subscribe to `private-*`; its absence is why
 * PUSHER_EVENTS.NOTIFICATION_SENT was declared but never usable.
 *
 * The check that matters is the last one: a user may only subscribe to their
 * OWN notification channel. Without it, `private-user-<someone-else's-id>`
 * would authorize for any signed-in caller and hand them a live feed of
 * another person's notifications.
 */
export const POST = withAuth(async (req, { session }) => {
  const pusher = getPusherServer()
  // Realtime is optional. 503 rather than 500 so the client can treat it as
  // "degraded, poll instead" rather than as a bug.
  if (!pusher) {
    return NextResponse.json({ success: false, error: 'Realtime not configured' }, { status: 503 })
  }

  const form = await req.formData().catch(() => null)
  const socketId = form?.get('socket_id')
  const channel = form?.get('channel_name')
  if (typeof socketId !== 'string' || typeof channel !== 'string') {
    return apiBadRequest('socket_id and channel_name are required')
  }

  if (channel !== userNotificationChannel(session.user.id)) {
    return apiForbidden('Not your channel')
  }

  const auth = (pusher as unknown as {
    authorizeChannel?: (s: string, c: string) => unknown
    authenticate?: (s: string, c: string) => unknown
  })
  const payload = auth.authorizeChannel
    ? auth.authorizeChannel(socketId, channel)
    : auth.authenticate?.(socketId, channel)

  // Pusher's client expects the raw auth object, not the app's envelope.
  return NextResponse.json(payload)
})
