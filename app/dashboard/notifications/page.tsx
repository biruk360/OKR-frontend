import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { StatCard, StatGrid } from '@/components/ui'

export default async function NotificationsPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  })

  const unreadCount = notifications.filter((n) => !n.isRead).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Stay updated with OKR activities and important updates.
        </p>
        {unreadCount > 0 && (
          <button className="inline-flex items-center px-3 py-2 border border-border shadow-sm text-sm leading-4 font-medium rounded-md text-muted-foreground bg-card hover:bg-muted">
            Mark All as Read
          </button>
        )}
      </div>

      <StatGrid columns={3}>
        <StatCard label="Total Notifications" value={notifications.length} iconText="🔔" tone="blue" />
        <StatCard label="Unread" value={unreadCount} iconText="!" tone="red" />
        <StatCard label="Read" value={notifications.length - unreadCount} iconText="✓" tone="green" />
      </StatGrid>

      <div className="bg-card shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-foreground mb-4">All Notifications</h3>
          <div className="space-y-4">
            {notifications.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-muted-foreground">No notifications yet.</div>
                <div className="text-sm text-muted-foreground mt-1">
                  You&apos;ll receive notifications when there are updates to your OKRs.
                </div>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`border rounded-lg p-4 ${
                    !notification.isRead ? 'bg-blue-50 border-blue-200' : 'bg-card'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-medium text-foreground">
                          {notification.title}
                        </h4>
                        {!notification.isRead && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            New
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{notification.message}</p>
                      <div className="mt-2 flex items-center space-x-4 text-xs text-muted-foreground">
                        <span>{new Date(notification.createdAt).toLocaleDateString()}</span>
                        <span>{new Date(notification.createdAt).toLocaleTimeString()}</span>
                        <span className="capitalize">{notification.type.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      {!notification.isRead && (
                        <button className="text-blue-600 hover:text-blue-500 text-sm">
                          Mark as Read
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
