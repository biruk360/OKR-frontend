import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import NotificationsClient from './NotificationsClient'

export default async function NotificationsPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return (
    <NotificationsClient
      notifications={notifications.map((n) => {
        let deepLink: string | null = null
        if (n.metadata) {
          try {
            const m = JSON.parse(n.metadata) as { entityType?: string; entityId?: string; deepLink?: string }
            if (typeof m.deepLink === 'string') {
              deepLink = m.deepLink
            } else if (m.entityType === 'OBJECTIVE' && m.entityId) {
              deepLink = `/dashboard/objectives/${m.entityId}`
            } else if (m.entityType === 'KEY_RESULT' && m.entityId) {
              deepLink = `/dashboard/key-results/${m.entityId}`
            } else if (m.entityType === 'TODO' && m.entityId) {
              deepLink = `/dashboard/todos`
            }
          } catch { /* metadata not JSON — ignore */ }
        }
        return {
          id: n.id,
          title: n.title,
          message: n.message,
          type: n.type,
          isRead: n.isRead,
          createdAt: n.createdAt.toISOString(),
          deepLink,
        }
      })}
    />
  )
}
