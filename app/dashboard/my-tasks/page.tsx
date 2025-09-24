import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import MyTasksList from '@/components/todos/MyTasksList'

export default async function MyTasksPage() {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    redirect('/auth/signin')
  }

  // Fetch todos assigned to the current user
  const assignedTodos = await prisma.todo.findMany({
    where: {
      assigneeId: session.user.id,
      status: {
        in: ['PENDING', 'IN_PROGRESS']
      }
    },
    include: {
      keyResult: {
        include: {
          objective: {
            include: {
              owner: {
                select: { id: true, name: true, avatar: true }
              },
              timeframe: {
                select: { id: true, name: true }
              }
            }
          }
        }
      },
      creator: {
        select: { id: true, name: true, avatar: true }
      }
    },
    orderBy: [
      { status: 'asc' },
      { createdAt: 'desc' }
    ]
  })

  // Fetch completed todos for the current user (last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const completedTodos = await prisma.todo.findMany({
    where: {
      assigneeId: session.user.id,
      status: 'COMPLETED',
      completedAt: {
        gte: thirtyDaysAgo
      }
    },
    include: {
      keyResult: {
        include: {
          objective: {
            include: {
              owner: {
                select: { id: true, name: true, avatar: true }
              },
              timeframe: {
                select: { id: true, name: true }
              }
            }
          }
        }
      },
      creator: {
        select: { id: true, name: true, avatar: true }
      }
    },
    orderBy: {
      completedAt: 'desc'
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Tasks</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your assigned to-dos and track your progress
        </p>
      </div>

      <MyTasksList 
        assignedTodos={assignedTodos}
        completedTodos={completedTodos}
      />
    </div>
  )
}






