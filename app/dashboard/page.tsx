import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import DashboardStats from '@/components/dashboard/DashboardStats'
import RecentObjectives from '@/components/dashboard/RecentObjectives'
import ProgressOverview from '@/components/dashboard/ProgressOverview'
import AtAGlanceRow, { type GlanceCounts } from '@/components/dashboard/AtAGlanceRow'

export default async function DashboardPage() {
  const session = await getServerSessionSafe()
  
  if (!session) {
    redirect('/auth/signin')
  }

  // Fetch dashboard data based on user role
  const stats = await getDashboardStats(session.user.id, session.user.role)
  const recentObjectives = await getRecentObjectives(session.user.id, session.user.role)
  const glanceCounts = await getGlanceCounts(session.user.id)

  return (
    <div className="space-y-8">
      <div>
        <p className="text-body font-medium text-ink-primary">Welcome back, {session.user.name}!</p>
        <p className="mt-1 text-body-sm text-ink-secondary">Here&apos;s what&apos;s happening with your OKRs today.</p>
      </div>

      <AtAGlanceRow counts={glanceCounts} />

      <DashboardStats stats={stats} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        <RecentObjectives objectives={recentObjectives} />
        <ProgressOverview userId={session.user.id} />
      </div>
    </div>
  )
}

async function getDashboardStats(userId: string, userRole: string) {
  const baseWhere: Prisma.ObjectiveWhereInput = {
    status: 'ACTIVE',
  }

  // Adjust query based on user role
  let objectiveWhere: Prisma.ObjectiveWhereInput = baseWhere
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
  const baseWhere: Prisma.ObjectiveWhereInput = {
    status: 'ACTIVE',
  }

  let objectiveWhere: Prisma.ObjectiveWhereInput = baseWhere
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

/**
 * Aggregate "My OKR at a glance" — confidence buckets across the user's owned key results,
 * average KR progress, and initiative completion ratio.
 */
async function getGlanceCounts(userId: string): Promise<GlanceCounts> {
  const krWhere: Prisma.KeyResultWhereInput = {
    ownerId: userId,
    status: 'ACTIVE',
  }

  const [offTrack, atRisk, onTrack, pending, krAvg, initiativesClosed, initiativesTotal] = await Promise.all([
    prisma.keyResult.count({ where: { ...krWhere, confidence: 'OFF_TRACK' } }),
    prisma.keyResult.count({ where: { ...krWhere, confidence: 'AT_RISK' } }),
    prisma.keyResult.count({ where: { ...krWhere, confidence: 'ON_TRACK', progress: { gt: 0 } } }),
    prisma.keyResult.count({ where: { ...krWhere, progress: 0 } }),
    prisma.keyResult.aggregate({ where: krWhere, _avg: { progress: true } }),
    prisma.todo.count({
      where: { OR: [{ assigneeId: userId }, { creatorId: userId }], status: 'COMPLETED' },
    }),
    prisma.todo.count({
      where: { OR: [{ assigneeId: userId }, { creatorId: userId }] },
    }),
  ])

  return {
    offTrack,
    atRisk,
    onTrack,
    pending,
    keyResultsProgress: krAvg._avg.progress ?? 0,
    initiativesClosed,
    initiativesTotal,
  }
}
