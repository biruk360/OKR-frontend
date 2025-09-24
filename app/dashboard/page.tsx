import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import DashboardStats from '@/components/dashboard/DashboardStats'
import RecentObjectives from '@/components/dashboard/RecentObjectives'
import ProgressOverview from '@/components/dashboard/ProgressOverview'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    return null
  }

  // Fetch dashboard data based on user role
  const stats = await getDashboardStats(session.user.id, session.user.role)
  const recentObjectives = await getRecentObjectives(session.user.id, session.user.role)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {session.user.name}!
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Here's what's happening with your OKRs today.
        </p>
      </div>

      <DashboardStats stats={stats} />
      
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecentObjectives objectives={recentObjectives} />
        <ProgressOverview userId={session.user.id} />
      </div>
    </div>
  )
}

async function getDashboardStats(userId: string, userRole: string) {
  const baseWhere = {
    status: 'ACTIVE' as const,
  }

  // Adjust query based on user role
  let objectiveWhere = baseWhere
  if (userRole === 'EMPLOYEE') {
    objectiveWhere = { ...baseWhere, ownerId: userId }
  } else if (userRole === 'DEPARTMENT_LEAD') {
    // Get user's departments and their objectives
    const userDepartments = await prisma.departmentMembership.findMany({
      where: { userId },
      select: { departmentId: true }
    })
    const departmentIds = userDepartments.map(d => d.departmentId)
    objectiveWhere = { 
      ...baseWhere, 
      OR: [
        { ownerId: userId },
        { departmentId: { in: departmentIds } }
      ]
    }
  }

  const [
    totalObjectives,
    activeObjectives,
    completedObjectives,
    totalKeyResults,
    completedKeyResults,
    totalTodos,
    completedTodos,
  ] = await Promise.all([
    prisma.objective.count({ where: objectiveWhere }),
    prisma.objective.count({ where: { ...objectiveWhere, progress: { lt: 100 } } }),
    prisma.objective.count({ where: { ...objectiveWhere, progress: 100 } }),
    prisma.keyResult.count({ 
      where: { 
        objective: objectiveWhere 
      } 
    }),
    prisma.keyResult.count({ 
      where: { 
        objective: objectiveWhere,
        progress: 100 
      } 
    }),
    prisma.todo.count({ 
      where: { 
        keyResult: { 
          objective: objectiveWhere 
        } 
      } 
    }),
    prisma.todo.count({ 
      where: { 
        keyResult: { 
          objective: objectiveWhere 
        },
        status: 'COMPLETED' 
      } 
    }),
  ])

  const averageProgress = totalObjectives > 0 
    ? await prisma.objective.aggregate({
        where: objectiveWhere,
        _avg: { progress: true }
      }).then(result => result._avg.progress || 0)
    : 0

  return {
    totalObjectives,
    activeObjectives,
    completedObjectives,
    totalKeyResults,
    completedKeyResults,
    totalTodos,
    completedTodos,
    averageProgress: Math.round(averageProgress),
  }
}

async function getRecentObjectives(userId: string, userRole: string) {
  const baseWhere = {
    status: 'ACTIVE' as const,
  }

  let objectiveWhere = baseWhere
  if (userRole === 'EMPLOYEE') {
    objectiveWhere = { ...baseWhere, ownerId: userId }
  } else if (userRole === 'DEPARTMENT_LEAD') {
    const userDepartments = await prisma.departmentMembership.findMany({
      where: { userId },
      select: { departmentId: true }
    })
    const departmentIds = userDepartments.map(d => d.departmentId)
    objectiveWhere = { 
      ...baseWhere, 
      OR: [
        { ownerId: userId },
        { departmentId: { in: departmentIds } }
      ]
    }
  }

  return await prisma.objective.findMany({
    where: objectiveWhere,
    include: {
      owner: {
        select: { id: true, name: true, avatar: true }
      },
      timeframe: true,
      department: {
        select: { id: true, name: true }
      },
      _count: {
        select: { keyResults: true }
      }
    },
    orderBy: { updatedAt: 'desc' },
    take: 5
  })
}
