import { NextResponse } from 'next/server'
import { getPusherServer, userNotificationChannel } from '@/lib/pusher'
import { withAuth } from '@/lib/api/withAuth'
import { apiBadRequest, apiForbidden } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'
import { canViewKeyResult, canViewObjective, canViewSprint, type UserRole } from '@/lib/permissions'
import { parseSprintRealtimeChannel } from '@/lib/sprints/realtime'
import { canSubscribeToOkrChannel, parseOkrRealtimeChannel } from '@/lib/okr/realtime'

/**
 * POST /api/pusher/auth — channel authorization for private Pusher channels.
 *
 * Required before anything can subscribe to `private-*`; its absence is why
 * PUSHER_EVENTS.NOTIFICATION_SENT was declared but never usable.
 *
 * Two channel families are authorised; everything else is refused:
 *   - `private-user-<id>` — a user may only subscribe to their OWN
 *     notification channel. Without this, `private-user-<someone-else's-id>`
 *     would hand any signed-in caller a live feed of another person's
 *     notifications.
 *   - `private-sprint-<id>` — sprint board events (lib/sprints/realtime.ts).
 *     Allowed only when `canViewSprint` passes — the same invite-only gate as
 *     GET /api/sprints/[id]/board (ADMIN/EXECUTIVE; otherwise owner or
 *     participant; never a portal session). A missing sprint reads as 403,
 *     like a forbidden one, so the endpoint cannot probe which ids exist.
 *   - `private-objective-<id>` / `private-keyresult-<id>` — OKR detail-page
 *     change signals (lib/okr/realtime.ts). Allowed only when canViewObjective /
 *     canViewKeyResult says the viewer sees the entity UNREDACTED; a redacted
 *     viewer, a missing/DELETED entity or a client-portal session gets 403.
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

  const sprintId = parseSprintRealtimeChannel(channel)
  const okr = parseOkrRealtimeChannel(channel)
  if (sprintId) {
    const sprint = await prisma.sprint.findUnique({
      where: { id: sprintId },
      select: { ownerId: true, departmentId: true, participants: { select: { userId: true } } },
    })
    const allowed = !!sprint && await canViewSprint(
      session.user.role as UserRole,
      session.user.id,
      { ownerId: sprint.ownerId, departmentId: sprint.departmentId, participants: sprint.participants },
      { userType: (session.user as { userType?: string | null }).userType ?? null },
    )
    if (!allowed) return apiForbidden('Not your channel')
  } else if (okr) {
    const role = session.user.role as UserRole
    const userType = (session.user as { userType?: string | null }).userType ?? null
    let verdict: { canView: boolean; isRedacted: boolean } | null = null
    if (okr.entity === 'objective') {
      const objective = await prisma.objective.findUnique({
        where: { id: okr.id },
        select: { level: true, ownerId: true, departmentId: true, isPrivate: true, status: true },
      })
      if (objective && objective.status !== 'DELETED') {
        verdict = await canViewObjective(role, session.user.id, objective)
      }
    } else {
      const keyResult = await prisma.keyResult.findUnique({
        where: { id: okr.id },
        select: { ownerId: true, objectiveId: true, isPrivate: true, status: true },
      })
      if (keyResult && keyResult.status !== 'DELETED') {
        verdict = await canViewKeyResult(role, session.user.id, keyResult)
      }
    }
    if (!canSubscribeToOkrChannel(verdict, { userType })) return apiForbidden('Not your channel')
  } else if (channel !== userNotificationChannel(session.user.id)) {
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
