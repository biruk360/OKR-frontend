import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { loadNotificationsPage } from '@/lib/notifications/notifications-page.server'
import NotificationsClient from './NotificationsClient'

export default async function NotificationsPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const notifications = await loadNotificationsPage(session.user.id)

  return <NotificationsClient notifications={notifications} />
}
