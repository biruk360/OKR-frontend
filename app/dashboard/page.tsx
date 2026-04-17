import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import DashboardStats from '@/components/dashboard/DashboardStats'
import RecentObjectives from '@/components/dashboard/RecentObjectives'
import ProgressOverview from '@/components/dashboard/ProgressOverview'
import AtAGlanceRow, { type GlanceCounts } from '@/components/dashboard/AtAGlanceRow'
import UserOkrTree, { type OkrTreeObjective } from '@/components/dashboard/UserOkrTree'
import SprintWidget, { type SprintWidgetData } from '@/components/dashboard/SprintWidget'
import ConfidenceTracker, { type ConfidenceTrackerData } from '@/components/dashboard/ConfidenceTracker'

export default async function DashboardPage() {
  const session = await getServerSessionSafe()
  
  if (!session) {
    redirect('/auth/signin')
  }

  // Fetch dashboard data based on user role
  const [stats, recentObjectives, glanceCounts, userOkrTree, sprintData, confidenceData] =
    await Promise.all([
      getDashboardStats(session.user.id, session.user.role),
      getRecentObjectives(session.user.id, session.user.role),
      getGlanceCounts(session.user.id),
      getUserOkrTree(session.user.id),
      getSprintWidgetData(session.user.id),
      getConfidenceTrackerData(session.user.id),
    ])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Welcome back, {session.user.name}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Here&apos;s what&apos;s happening with your OKRs today.</p>
      </div>

      <AtAGlanceRow counts={glanceCounts} />

      <DashboardStats stats={stats} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <UserOkrTree objectives={userOkrTree} />
        <SprintWidget sprint={sprintData.sprint} recommendedActivities={sprintData.recommendations} />
        <ConfidenceTracker data={confidenceData} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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

/**
 * Expandable OKR tree for the current user: their objectives → key results
 * with progress, confidence, and initiative counts.
 */
async function getUserOkrTree(userId: string): Promise<OkrTreeObjective[]> {
  const objectives = await prisma.objective.findMany({
    where: { ownerId: userId, status: 'ACTIVE' },
    include: {
      keyResults: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          title: true,
          progress: true,
          confidence: true,
          _count: { select: { todos: true } },
        },
      },
    },
    orderBy: [{ level: 'asc' }, { title: 'asc' }],
  })
  return objectives.map((o) => ({
    id: o.id,
    title: o.title,
    level: o.level,
    progress: o.progress,
    goalStatus: o.goalStatus,
    keyResults: o.keyResults.map((kr) => ({
      id: kr.id,
      title: kr.title,
      progress: kr.progress,
      confidence: kr.confidence,
      initiativeCount: kr._count.todos,
    })),
  }))
}

/**
 * Sprint activity widget: find the user's current sprint (one they own or have
 * activities in that's ACTIVE and overlaps today). If none, generate recommended
 * activities from their overdue/at-risk KRs.
 */
async function getSprintWidgetData(userId: string): Promise<{
  sprint: SprintWidgetData | null
  recommendations: string[]
}> {
  const now = new Date()
  const activeSprint = await prisma.sprint.findFirst({
    where: {
      status: 'ACTIVE',
      OR: [
        { ownerId: userId },
        { activities: { some: { ownerId: userId } } },
      ],
      startDate: { lte: now },
      endDate: { gte: now },
    },
    include: {
      _count: { select: { activities: true } },
      activities: { select: { id: true }, where: { column: { name: 'Done' } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (activeSprint) {
    return {
      sprint: {
        id: activeSprint.id,
        name: activeSprint.name,
        activitiesTotal: activeSprint._count.activities,
        activitiesDone: activeSprint.activities.length,
        startDate: activeSprint.startDate?.toISOString() ?? null,
        endDate: activeSprint.endDate?.toISOString() ?? null,
      },
      recommendations: [],
    }
  }

  // No active sprint — generate recommendations from at-risk/off-track KRs
  const atRiskKrs = await prisma.keyResult.findMany({
    where: { ownerId: userId, status: 'ACTIVE', confidence: { in: ['AT_RISK', 'OFF_TRACK'] } },
    select: { title: true, confidence: true },
    take: 5,
  })
  const overdueTodos = await prisma.todo.findMany({
    where: { assigneeId: userId, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { lt: now } },
    select: { title: true },
    take: 3,
  })

  const recommendations: string[] = []
  for (const kr of atRiskKrs) {
    recommendations.push(`Check in on "${kr.title}" (${kr.confidence.replace('_', ' ').toLowerCase()})`)
  }
  for (const t of overdueTodos) {
    recommendations.push(`Complete overdue: "${t.title}"`)
  }
  if (recommendations.length === 0) {
    recommendations.push('All your KRs are on track — consider planning ahead for next sprint')
  }

  return { sprint: null, recommendations }
}

/**
 * Confidence tracker: aggregates the user's KR confidence scores and
 * recent confidence changes from ConfidenceSnapshot history.
 */
async function getConfidenceTrackerData(userId: string): Promise<ConfidenceTrackerData> {
  const krs = await prisma.keyResult.findMany({
    where: { ownerId: userId, status: 'ACTIVE' },
    select: { id: true, title: true, confidence: true, progress: true },
  })

  const onTrack = krs.filter((kr) => kr.confidence === 'ON_TRACK').length
  const atRisk = krs.filter((kr) => kr.confidence === 'AT_RISK').length
  const offTrack = krs.filter((kr) => kr.confidence === 'OFF_TRACK').length
  const total = krs.length
  const overallScore = total > 0
    ? Math.round(krs.reduce((s, kr) => s + (kr.confidence === 'ON_TRACK' ? 100 : kr.confidence === 'AT_RISK' ? 50 : 0), 0) / total)
    : 0

  // Recent confidence changes from snapshots
  const recentSnapshots = await prisma.confidenceSnapshot.findMany({
    where: {
      entityType: 'KEY_RESULT',
      entityId: { in: krs.map((kr) => kr.id) },
      previousConf: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  const recentChanges = recentSnapshots
    .filter((s) => s.previousConf && s.previousConf !== s.confidence)
    .map((s) => {
      const kr = krs.find((k) => k.id === s.entityId)
      return {
        krId: s.entityId,
        krTitle: kr?.title ?? 'Unknown KR',
        from: s.previousConf!,
        to: s.confidence,
      }
    })
    .slice(0, 5)

  // Recommendations
  const recommendations: string[] = []
  const offTrackKrs = krs.filter((kr) => kr.confidence === 'OFF_TRACK')
  const atRiskKrs = krs.filter((kr) => kr.confidence === 'AT_RISK')
  for (const kr of offTrackKrs.slice(0, 2)) {
    recommendations.push(`Priority: "${kr.title}" is off track at ${Math.round(kr.progress)}% — needs immediate attention`)
  }
  for (const kr of atRiskKrs.slice(0, 2)) {
    recommendations.push(`Watch: "${kr.title}" is at risk — consider accelerating or adjusting scope`)
  }
  if (recommendations.length === 0 && total > 0) {
    recommendations.push('All KRs are on track — keep up the momentum')
  }

  return { overallScore, onTrack, atRisk, offTrack, recommendations, recentChanges }
}
