import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function CommentsPage() {
  const session = await getServerSessionSafe()
  
  if (!session) {
    redirect('/auth/signin')
  }

  // Get comments based on user role
  let comments: any[] = []
  
  if (session.user.role === 'EMPLOYEE') {
    // Get comments on user's objectives and key results
    const userObjectives = await prisma.objective.findMany({
      where: { ownerId: session.user.id },
      select: { id: true }
    })
    const objectiveIds = userObjectives.map(obj => obj.id)
    
    const userKeyResults = await prisma.keyResult.findMany({
      where: { ownerId: session.user.id },
      select: { id: true }
    })
    const keyResultIds = userKeyResults.map(kr => kr.id)
    
    comments = await prisma.comment.findMany({
      where: {
        OR: [
          { objectiveId: { in: objectiveIds } },
          { keyResultId: { in: keyResultIds } }
        ]
      },
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
    })
  } else {
    // Admin, Executive, or Department Lead - see all comments
    comments = await prisma.comment.findMany({
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
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-gray-500">
          View and manage comments on objectives and key results.
        </p>
      </div>

      {/* Comments Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">💬</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Comments</dt>
                  <dd className="text-lg font-medium text-gray-900">{comments.length}</dd>
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
                  <span className="text-white text-sm font-medium">📝</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">This Week</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {comments.filter(comment => {
                      const weekAgo = new Date()
                      weekAgo.setDate(weekAgo.getDate() - 7)
                      return new Date(comment.createdAt) > weekAgo
                    }).length}
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
                  <span className="text-white text-sm font-medium">👥</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Active Users</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {new Set(comments.map(comment => comment.authorId)).size}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Comments List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Recent Comments
          </h3>
          <div className="space-y-4">
            {comments.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-500">No comments found.</div>
              </div>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="border rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium text-gray-700">
                          {comment.author.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-medium text-gray-900">
                          {comment.author.name}
                        </p>
                        <span className="text-xs text-gray-500">
                          {new Date(comment.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{comment.content}</p>
                      <div className="mt-2 text-xs text-gray-500">
                        {comment.objective && (
                          <span>On Objective: {comment.objective.title}</span>
                        )}
                        {comment.keyResult && (
                          <span>On Key Result: {comment.keyResult.title}</span>
                        )}
                      </div>
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

