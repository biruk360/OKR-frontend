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
      notifications={notifications.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      }))}
    />
  )
}
