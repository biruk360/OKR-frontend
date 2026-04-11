import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function ActivityFeedPage() {
  const session = await getServerSessionSafe()
  
  if (!session) {
    redirect('/auth/signin')
  }

  // Get activity feed data (comments, objective updates, key result updates)
  const [comments, objectives, keyResults] = await Promise.all([
    prisma.comment.findMany({
      take: 50,
      include: {
        author: {
          select: { id: true, name: true, avatar: true }
        },
        objective: {
          select: { id: true, title: true }
        },
        keyResult: {
          select: { id: true, title: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.objective.findMany({
      take: 20,
      where: {
        OR: [
          { ownerId: session.user.id },
          { status: 'ACTIVE' }
        ]
      },
      include: {
        owner: {
          select: { id: true, name: true, avatar: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    }),
    prisma.keyResult.findMany({
      take: 20,
      where: {
        OR: [
          { ownerId: session.user.id },
          { status: 'ACTIVE' }
        ]
      },
      include: {
        owner: {
          select: { id: true, name: true, avatar: true }
        },
        objective: {
          select: { id: true, title: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })
  ])

  // Combine and sort activities
  const activities: any[] = [
    ...comments.map(c => ({
      type: 'comment',
      id: c.id,
      user: c.author,
      content: c.content,
      target: c.objective ? { type: 'objective', ...c.objective } : { type: 'keyResult', ...c.keyResult },
      timestamp: c.createdAt
    })),
    ...objectives.map(o => ({
      type: 'objective_update',
      id: o.id,
      user: o.owner,
      content: `Updated objective: ${o.title}`,
      target: { type: 'objective', id: o.id, title: o.title },
      timestamp: o.updatedAt
    })),
    ...keyResults.map(kr => ({
      type: 'keyresult_update',
      id: kr.id,
      user: kr.owner,
      content: `Updated key result: ${kr.title}`,
      target: { type: 'keyResult', id: kr.id, title: kr.title, objectiveId: kr.objectiveId },
      timestamp: kr.updatedAt
    }))
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-gray-500">
          Recent check-ins, edits, comments, and assignments across your OKRs.
        </p>
      </div>

      {/* Activity Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">📝</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Activities</dt>
                  <dd className="text-lg font-medium text-gray-900">{activities.length}</dd>
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
                  <span className="text-white text-sm font-medium">💬</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Comments</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {activities.filter(a => a.type === 'comment').length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-yellow-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">🎯</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Objective Updates</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {activities.filter(a => a.type === 'objective_update').length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">✓</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">KR Updates</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {activities.filter(a => a.type === 'keyresult_update').length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Recent Activity
          </h3>
          <div className="space-y-4">
            {activities.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-500">No activity yet.</div>
                <div className="text-sm text-gray-400 mt-1">
                  Activity will appear here as you and your team work on OKRs.
                </div>
              </div>
            ) : (
              activities.map((activity) => (
                <div key={`${activity.type}-${activity.id}`} className="border rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      {activity.user.avatar ? (
                        <img
                          src={activity.user.avatar}
                          alt={activity.user.name}
                          className="h-8 w-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-gray-700">
                            {activity.user.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-medium text-gray-900">
                          {activity.user.name}
                        </p>
                        <span className="text-xs text-gray-500">
                          {new Date(activity.timestamp).toLocaleDateString()} at {new Date(activity.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{activity.content}</p>
                      {activity.target && (
                        <div className="mt-2 text-xs text-gray-500">
                          {activity.target.type === 'objective' ? (
                            <a
                              href={`/dashboard/objectives/${activity.target.id}`}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              View Objective: {activity.target.title}
                            </a>
                          ) : (
                            <span>Key Result: {activity.target.title}</span>
                          )}
                        </div>
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

