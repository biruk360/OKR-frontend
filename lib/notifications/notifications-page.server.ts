// Server-only: imports Prisma. Not re-exported from the lib/notifications
// barrel. (The `server-only` package is not installed; this comment is the marker.)
/**
 * Loader for the full-page notification list (/dashboard/notifications).
 * Deep links are derived by the shared serializer, which the header bell and
 * GET /api/notifications also use — the page used to parse `metadata` inline
 * and, among other things, dropped the card id from to-do links.
 */

import { prisma } from '@/lib/prisma'
import { toNotificationRow, type NotificationRow } from './row'

export async function loadNotificationsPage(userId: string): Promise<NotificationRow[]> {
  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return notifications.map(toNotificationRow)
}
