import { prisma } from '@/lib/prisma'
import { apiSuccess } from '@/lib/api/apiResponse'
import { withAuth } from '@/lib/api/withAuth'
import { toNotificationRow } from '@/lib/notifications'

/**
 * GET /api/notifications — the current user's in-app notifications.
 *
 * The `Notification` table has been written to since the dispatcher shipped, but
 * nothing could read it over HTTP: the only reader was the server component at
 * /dashboard/notifications. This is what the header bell and the store need.
 *
 * Query: `limit` (1-100, default 20), `unreadOnly=1`, `cursor` (a notification id).
 * Hits @@index([userId, isRead, createdAt]) as written.
 */
export const GET = withAuth(async (req, { session }) => {
  const url = new URL(req.url)
  const rawLimit = Number(url.searchParams.get('limit'))
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 20
  const unreadOnly = url.searchParams.get('unreadOnly') === '1'
  const cursor = url.searchParams.get('cursor')

  const where = { userId: session.user.id, ...(unreadOnly ? { isRead: false } : {}) }

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      // Over-fetch by one to tell "there is another page" from "this is the end"
      // without a second count query.
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    prisma.notification.count({ where: { userId: session.user.id, isRead: false } }),
  ])

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  return apiSuccess({
    items: page.map(toNotificationRow),
    unreadCount,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  })
})
