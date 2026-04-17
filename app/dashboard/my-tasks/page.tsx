import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MyTasksList } from '@/features/todos'

export default async function MyTasksPage() {
  const session = await getServerSessionSafe()
  
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
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">
          Manage your assigned initiatives and track your progress
        </p>
      </div>

      <MyTasksList
        assignedTodos={assignedTodos}
        completedTodos={completedTodos}
      />
    </div>
  )
}






