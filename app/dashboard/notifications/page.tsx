import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { toNotificationRow } from '@/lib/notifications'
import NotificationsClient from './NotificationsClient'

export default async function NotificationsPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  // Deep links are derived by the shared serializer, which the header bell and
  // GET /api/notifications also use — this page used to parse `metadata` inline
  // and, among other things, dropped the card id from to-do links.
  return <NotificationsClient notifications={notifications.map(toNotificationRow)} />
}
