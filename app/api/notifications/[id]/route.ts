import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiNotFound, apiSuccess } from '@/lib/api/apiResponse'
import { withAuth } from '@/lib/api/withAuth'

interface Params { id: string }

/**
 * PATCH /api/notifications/[id] — mark one notification read or unread.
 *
 * Scoped to the session user via `updateMany`, not `update`: a bare
 * `update({ where: { id } })` would happily flip another user's row for anyone
 * who could guess a cuid. A miss is reported as 404 so the endpoint does not
 * confirm that someone else's id exists.
 */
export const PATCH = withAuth<Params>(async (req, { session, params }) => {
  const body = await req.json().catch(() => null) as { isRead?: unknown } | null
  if (!body || typeof body.isRead !== 'boolean') {
    return apiBadRequest('isRead (boolean) is required')
  }

  const result = await prisma.notification.updateMany({
    where: { id: params.id, userId: session.user.id },
    data: { isRead: body.isRead },
  })
  if (result.count === 0) return apiNotFound('Notification not found')

  return apiSuccess({ id: params.id, isRead: body.isRead })
})

/** DELETE /api/notifications/[id] — dismiss. Same ownership scoping as PATCH. */
export const DELETE = withAuth<Params>(async (_req, { session, params }) => {
  const result = await prisma.notification.deleteMany({
    where: { id: params.id, userId: session.user.id },
  })
  if (result.count === 0) return apiNotFound('Notification not found')
  return apiSuccess({ id: params.id, deleted: true })
})
