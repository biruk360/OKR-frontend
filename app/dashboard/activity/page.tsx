import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { StatCard, StatGrid } from '@/components/ui'

export default async function ActivityFeedPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const [comments, objectives, keyResults] = await Promise.all([
    prisma.comment.findMany({
      take: 50,
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        objective: { select: { id: true, title: true } },
        keyResult: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.objective.findMany({
      take: 20,
      where: { OR: [{ ownerId: session.user.id }, { status: 'ACTIVE' }] },
      include: { owner: { select: { id: true, name: true, avatar: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.keyResult.findMany({
      take: 20,
      where: { OR: [{ ownerId: session.user.id }, { status: 'ACTIVE' }] },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        objective: { select: { id: true, title: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ])

  const activities: any[] = [
    ...comments.map((c) => ({
      type: 'comment',
      id: c.id,
      user: c.author,
      content: c.content,
      target: c.objective
        ? { type: 'objective', ...c.objective }
        : { type: 'keyResult', ...c.keyResult },
      timestamp: c.createdAt,
    })),
    ...objectives.map((o) => ({
      type: 'objective_update',
      id: o.id,
      user: o.owner,
      content: `Updated objective: ${o.title}`,
      target: { type: 'objective', id: o.id, title: o.title },
      timestamp: o.updatedAt,
    })),
    ...keyResults.map((kr) => ({
      type: 'keyresult_update',
      id: kr.id,
      user: kr.owner,
      content: `Updated key result: ${kr.title}`,
      target: { type: 'keyResult', id: kr.id, title: kr.title, objectiveId: kr.objectiveId },
      timestamp: kr.updatedAt,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  const commentCount = activities.filter((a) => a.type === 'comment').length
  const objUpdateCount = activities.filter((a) => a.type === 'objective_update').length
  const krUpdateCount = activities.filter((a) => a.type === 'keyresult_update').length

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Recent check-ins, edits, comments, and assignments across your OKRs.
      </p>

      <StatGrid columns={4}>
        <StatCard label="Total Activities" value={activities.length} iconText="📝" tone="blue" />
        <StatCard label="Comments" value={commentCount} iconText="💬" tone="green" />
        <StatCard label="Objective Updates" value={objUpdateCount} iconText="🎯" tone="yellow" />
        <StatCard label="KR Updates" value={krUpdateCount} iconText="✓" tone="purple" />
      </StatGrid>

      <div className="bg-card shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-foreground mb-4">Recent Activity</h3>
          <div className="space-y-4">
            {activities.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-muted-foreground">No activity yet.</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Activity will appear here as you and your team work on OKRs.
                </div>
              </div>
            ) : (
              activities.map((activity) => (
                <div key={`${activity.type}-${activity.id}`} className="border rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      {activity.user.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={activity.user.avatar}
                          alt={activity.user.name}
                          className="h-8 w-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-muted-foreground">
                            {activity.user.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-medium text-foreground">{activity.user.name}</p>
                        <span className="text-xs text-muted-foreground">
                          {new Date(activity.timestamp).toLocaleDateString()} at{' '}
                          {new Date(activity.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{activity.content}</p>
                      {activity.target && (
                        <div className="mt-2 text-xs text-muted-foreground">
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
