import { prisma } from '@/lib/prisma'
import { apiSuccess } from '@/lib/api/apiResponse'
import { withAuth } from '@/lib/api/withAuth'

/**
 * POST /api/notifications/mark-all-read — clear the current user's unread count.
 *
 * Backs the "Mark all as read" button on /dashboard/notifications, which has
 * been rendered without an onClick since the page was written.
 */
export const POST = withAuth(async (_req, { session }) => {
  const result = await prisma.notification.updateMany({
    where: { userId: session.user.id, isRead: false },
    data: { isRead: true },
  })
  return apiSuccess({ updated: result.count })
})
