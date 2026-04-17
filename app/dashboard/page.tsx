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
import NeedsAttention, { type NeedsAttentionItem } from '@/components/dashboard/NeedsAttention'
import TopSummaryBoxes, { type TopSummaryData } from '@/components/dashboard/TopSummaryBoxes'

export default async function DashboardPage() {
  const session = await getServerSessionSafe()

  if (!session) {
    redirect('/auth/signin')
  }

  const [stats, recentObjectives, glanceCounts, userOkrTree, sprintData, topSummary, needsAttentionItems] =
    await Promise.all([
      getDashboardStats(session.user.id, session.user.role),
      getRecentObjectives(session.user.id, session.user.role),
      getGlanceCounts(session.user.id),
      getUserOkrTree(session.user.id),
      getSprintWidgetData(session.user.id),
      getTopSummaryData(session.user.id, session.user.role),
      getNeedsAttentionItems(session.user.id, session.user.role),
    ])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Welcome back, {session.user.name}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Here&apos;s what&apos;s happening with your OKRs today.</p>
      </div>

      {/* Top row: 5 summary boxes */}
      <TopSummaryBoxes data={topSummary} />

      {/* KPI strip */}
      <DashboardStats stats={stats} />

      {/* At a glance confidence buckets */}
      <AtAGlanceRow counts={glanceCounts} />

      {/* Two-column: My Active Objectives + Needs Attention */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <UserOkrTree objectives={userOkrTree} confidenceData={topSummary} />
        </div>
        <div className="lg:col-span-2">
          <NeedsAttention items={needsAttentionItems} />
        </div>
      </div>

      {/* Bottom row: Team Activity + Momentum */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SprintWidget sprint={sprintData.sprint} recommendedActivities={sprintData.recommendations} />
        <ProgressOverview userId={session.user.id} />
      </div>
    </div>
  )
}

async function getDashboardStats(userId: string, userRole: string) {
  const objectiveWhere = await buildObjectiveWhere(userId, userRole)

  const [
    totalObjectives, activeObjectives, completedObjectives,
    totalKeyResults, completedKeyResults, totalTodos, completedTodos,
  ] = await Promise.all([
    prisma.objective.count({ where: objectiveWhere }),
    prisma.objective.count({ where: { ...objectiveWhere, progress: { lt: 100 } } }),
    prisma.objective.count({ where: { ...objectiveWhere, progress: 100 } }),
    prisma.keyResult.count({ where: { objective: objectiveWhere } }),
    prisma.keyResult.count({ where: { objective: objectiveWhere, progress: 100 } }),
    prisma.todo.count({ where: { keyResult: { objective: objectiveWhere } } }),
    prisma.todo.count({ where: { keyResult: { objective: objectiveWhere }, status: 'COMPLETED' } }),
  ])

  const averageProgress = totalObjectives > 0
    ? await prisma.objective.aggregate({ where: objectiveWhere, _avg: { progress: true } }).then(r => r._avg.progress || 0)
    : 0

  return {
    totalObjectives, activeObjectives, completedObjectives,
    totalKeyResults, completedKeyResults, totalTodos, completedTodos,
    averageProgress: Math.round(averageProgress),
  }
}

async function getRecentObjectives(userId: string, userRole: string) {
  const objectiveWhere = await buildObjectiveWhere(userId, userRole)
  return prisma.objective.findMany({
    where: objectiveWhere,
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      timeframe: true,
      department: { select: { id: true, name: true } },
      _count: { select: { keyResults: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  })
}

async function getGlanceCounts(userId: string): Promise<GlanceCounts> {
  const krWhere: Prisma.KeyResultWhereInput = { ownerId: userId, status: 'ACTIVE' }

  const [offTrack, atRisk, onTrack, pending, krAvg, initiativesClosed, initiativesTotal] = await Promise.all([
    prisma.keyResult.count({ where: { ...krWhere, confidence: 'OFF_TRACK' } }),
    prisma.keyResult.count({ where: { ...krWhere, confidence: 'AT_RISK' } }),
    prisma.keyResult.count({ where: { ...krWhere, confidence: 'ON_TRACK', progress: { gt: 0 } } }),
    prisma.keyResult.count({ where: { ...krWhere, progress: 0 } }),
    prisma.keyResult.aggregate({ where: krWhere, _avg: { progress: true } }),
    prisma.todo.count({ where: { OR: [{ assigneeId: userId }, { creatorId: userId }], status: 'COMPLETED' } }),
    prisma.todo.count({ where: { OR: [{ assigneeId: userId }, { creatorId: userId }] } }),
  ])

  return { offTrack, atRisk, onTrack, pending, keyResultsProgress: krAvg._avg.progress ?? 0, initiativesClosed, initiativesTotal }
}

async function getUserOkrTree(userId: string): Promise<OkrTreeObjective[]> {
  const objectives = await prisma.objective.findMany({
    where: { ownerId: userId, status: 'ACTIVE' },
    include: {
      keyResults: {
        where: { status: 'ACTIVE' },
        select: { id: true, title: true, progress: true, confidence: true, _count: { select: { todos: true } } },
      },
    },
    orderBy: [{ level: 'asc' }, { title: 'asc' }],
  })
  return objectives.map((o) => ({
    id: o.id, title: o.title, level: o.level, progress: o.progress, goalStatus: o.goalStatus,
    keyResults: o.keyResults.map((kr) => ({
      id: kr.id, title: kr.title, progress: kr.progress, confidence: kr.confidence, initiativeCount: kr._count.todos,
    })),
  }))
}

async function getSprintWidgetData(userId: string): Promise<{ sprint: SprintWidgetData | null; recommendations: string[] }> {
  const now = new Date()
  const activeSprint = await prisma.sprint.findFirst({
    where: {
      status: 'ACTIVE',
      OR: [{ ownerId: userId }, { activities: { some: { ownerId: userId } } }],
      startDate: { lte: now }, endDate: { gte: now },
    },
    include: { _count: { select: { activities: true } }, activities: { select: { id: true }, where: { column: { name: 'Done' } } } },
    orderBy: { createdAt: 'desc' },
  })

  if (activeSprint) {
    return {
      sprint: {
        id: activeSprint.id, name: activeSprint.name,
        activitiesTotal: activeSprint._count.activities, activitiesDone: activeSprint.activities.length,
        startDate: activeSprint.startDate?.toISOString() ?? null, endDate: activeSprint.endDate?.toISOString() ?? null,
      },
      recommendations: [],
    }
  }

  const [atRiskKrs, overdueTodos] = await Promise.all([
    prisma.keyResult.findMany({ where: { ownerId: userId, status: 'ACTIVE', confidence: { in: ['AT_RISK', 'OFF_TRACK'] } }, select: { title: true, confidence: true }, take: 5 }),
    prisma.todo.findMany({ where: { assigneeId: userId, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { lt: now } }, select: { title: true }, take: 3 }),
  ])

  const recommendations: string[] = []
  for (const kr of atRiskKrs) recommendations.push(`Check in on "${kr.title}" (${kr.confidence.replace('_', ' ').toLowerCase()})`)
  for (const t of overdueTodos) recommendations.push(`Complete overdue: "${t.title}"`)
  if (recommendations.length === 0) recommendations.push('All your KRs are on track — consider planning ahead for next sprint')

  return { sprint: null, recommendations }
}

// ─── New data fetchers ───

async function getTopSummaryData(userId: string, userRole: string): Promise<TopSummaryData> {
  const objectiveWhere = await buildObjectiveWhere(userId, userRole)
  const now = new Date()
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7)

  const krs = await prisma.keyResult.findMany({
    where: { objective: objectiveWhere, status: 'ACTIVE' },
    select: { confidence: true, progress: true },
  })

  const total = krs.length
  const onTrack = krs.filter(kr => kr.confidence === 'ON_TRACK').length
  const atRisk = krs.filter(kr => kr.confidence === 'AT_RISK').length
  const offTrack = krs.filter(kr => kr.confidence === 'OFF_TRACK').length
  const avgProgress = total > 0 ? Math.round(krs.reduce((s, kr) => s + kr.progress, 0) / total) : 0
  const confidenceScore = total > 0
    ? Math.round(krs.reduce((s, kr) => s + (kr.confidence === 'ON_TRACK' ? 100 : kr.confidence === 'AT_RISK' ? 50 : 0), 0) / total)
    : 0

  const [blockedCount, dueThisWeekCount] = await Promise.all([
    prisma.keyResult.count({ where: { objective: objectiveWhere, status: 'ACTIVE', confidence: 'OFF_TRACK' } }),
    prisma.todo.count({
      where: {
        OR: [{ assigneeId: userId }, { creatorId: userId }],
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        dueDate: { gte: now, lte: weekEnd },
      },
    }),
  ])

  const healthPct = total > 0 ? Math.round((onTrack / total) * 100) : 100
  const healthLabel = healthPct >= 70 ? 'Good' : healthPct >= 40 ? 'Needs work' : 'Critical'

  return {
    avgProgress, confidenceScore,
    onTrack, atRisk, offTrack, totalKRs: total,
    overallHealth: healthPct, healthLabel,
    blockedCount, dueThisWeekCount,
  }
}

async function getNeedsAttentionItems(userId: string, userRole: string): Promise<NeedsAttentionItem[]> {
  const objectiveWhere = await buildObjectiveWhere(userId, userRole)
  const now = new Date()
  const items: NeedsAttentionItem[] = []

  const [offTrackKRs, atRiskKRs, overdueTodos] = await Promise.all([
    prisma.keyResult.findMany({
      where: { objective: objectiveWhere, status: 'ACTIVE', confidence: 'OFF_TRACK' },
      select: { id: true, title: true, progress: true, owner: { select: { name: true } } },
      take: 5,
    }),
    prisma.keyResult.findMany({
      where: { objective: objectiveWhere, status: 'ACTIVE', confidence: 'AT_RISK' },
      select: { id: true, title: true, progress: true, owner: { select: { name: true } } },
      take: 5,
    }),
    prisma.todo.findMany({
      where: { assigneeId: userId, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { lt: now } },
      select: { id: true, title: true },
      take: 5,
    }),
  ])

  for (const kr of offTrackKRs) {
    items.push({ id: kr.id, title: kr.title, type: 'key_result', reason: 'off_track', progress: kr.progress, ownerName: kr.owner.name, href: `/dashboard/key-results/${kr.id}` })
  }
  for (const kr of atRiskKRs) {
    items.push({ id: kr.id, title: kr.title, type: 'key_result', reason: 'at_risk', progress: kr.progress, ownerName: kr.owner.name, href: `/dashboard/key-results/${kr.id}` })
  }
  for (const t of overdueTodos) {
    items.push({ id: t.id, title: t.title, type: 'todo', reason: 'overdue', progress: 0, href: `/dashboard/todos?open=${t.id}` })
  }

  return items
}

// ─── Shared helper ───

async function buildObjectiveWhere(userId: string, userRole: string): Promise<Prisma.ObjectiveWhereInput> {
  const baseWhere: Prisma.ObjectiveWhereInput = { status: 'ACTIVE' }
  if (userRole === 'EMPLOYEE') return { ...baseWhere, ownerId: userId }
  if (userRole === 'DEPARTMENT_LEAD') {
    const depts = await prisma.departmentMembership.findMany({ where: { userId }, select: { departmentId: true } })
    return { ...baseWhere, OR: [{ ownerId: userId }, { departmentId: { in: depts.map(d => d.departmentId) } }] }
  }
  return baseWhere
}
