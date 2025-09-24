import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function NotificationsPage() {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    return null
  }

  // Get user's notifications
  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' }
  })

  const unreadCount = notifications.filter(n => !n.isRead).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="mt-1 text-sm text-gray-500">
            Stay updated with OKR activities and important updates.
          </p>
        </div>
        {unreadCount > 0 && (
          <button className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
            Mark All as Read
          </button>
        )}
      </div>

      {/* Notification Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">🔔</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Notifications</dt>
                  <dd className="text-lg font-medium text-gray-900">{notifications.length}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-red-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">!</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Unread</dt>
                  <dd className="text-lg font-medium text-gray-900">{unreadCount}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">✓</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Read</dt>
                  <dd className="text-lg font-medium text-gray-900">{notifications.length - unreadCount}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            All Notifications
          </h3>
          <div className="space-y-4">
            {notifications.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-500">No notifications yet.</div>
                <div className="text-sm text-gray-400 mt-1">
                  You'll receive notifications when there are updates to your OKRs.
                </div>
              </div>
            ) : (
              notifications.map((notification) => (
                <div 
                  key={notification.id} 
                  className={`border rounded-lg p-4 ${
                    !notification.isRead ? 'bg-blue-50 border-blue-200' : 'bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-medium text-gray-900">
                          {notification.title}
                        </h4>
                        {!notification.isRead && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            New
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{notification.message}</p>
                      <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
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

