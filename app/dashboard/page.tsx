import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import HeroStats, { type HeroStatsData } from '@/components/dashboard/HeroStats'
import CheckInBanner, { type CheckInBannerData } from '@/components/dashboard/CheckInBanner'
import QuickStats, { type QuickStatsData } from '@/components/dashboard/QuickStats'
import UserOkrTree, { type OkrTreeObjective } from '@/components/dashboard/UserOkrTree'
import NeedsAttention, { type NeedsAttentionItem } from '@/components/dashboard/NeedsAttention'
import TeamActivityFeed, { type ActivityFeedItem } from '@/components/dashboard/TeamActivityFeed'
import MyActivityFeed from '@/components/dashboard/MyActivityFeed'

export default async function DashboardPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const [heroData, checkInData, quickData, userOkrTree, needsAttentionItems, teamActivity, myActivity] =
    await Promise.all([
      getHeroStats(session.user.id, session.user.role),
      getCheckInBanner(session.user.id),
      getQuickStats(session.user.id, session.user.role),
      getUserOkrTree(session.user.id),
      getNeedsAttentionItems(session.user.id, session.user.role),
      getTeamActivity(),
      getMyActivity(session.user.id),
    ])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Welcome back, {session.user.name}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Here&apos;s what&apos;s happening with your OKRs today.</p>
      </div>

      {/* Check-in alert banner */}
      <CheckInBanner data={checkInData} />

      {/* Top row: Performance + Confidence + Momentum (3 equal columns) */}
      <HeroStats data={heroData} />

      {/* Compact stat strip */}
      <QuickStats data={quickData} />

      {/* Row 2: My Active Objectives (50%) + Needs Attention (50%) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UserOkrTree objectives={userOkrTree} />
        <NeedsAttention items={needsAttentionItems} />
      </div>

      {/* Row 3: Team Activity (50%) + My Activity (50%) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TeamActivityFeed items={teamActivity} />
        <MyActivityFeed items={myActivity} />
      </div>
    </div>
  )
}

// ─── Data fetchers ───

async function buildObjectiveWhere(userId: string, userRole: string): Promise<Prisma.ObjectiveWhereInput> {
  const base: Prisma.ObjectiveWhereInput = { status: 'ACTIVE' }
  if (userRole === 'EMPLOYEE') return { ...base, ownerId: userId }
  if (userRole === 'DEPARTMENT_LEAD') {
    const depts = await prisma.departmentMembership.findMany({ where: { userId }, select: { departmentId: true } })
    return { ...base, OR: [{ ownerId: userId }, { departmentId: { in: depts.map(d => d.departmentId) } }] }
  }
  return base
}

async function getHeroStats(userId: string, userRole: string): Promise<HeroStatsData> {
  const objWhere = await buildObjectiveWhere(userId, userRole)

  const krs = await prisma.keyResult.findMany({
    where: { objective: objWhere, status: 'ACTIVE' },
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

  const activeObjCount = await prisma.objective.count({ where: { ownerId: userId, status: 'ACTIVE' } })

  const now = new Date()
  const activeTimeframe = await prisma.timeframe.findFirst({
    where: { isActive: true },
    orderBy: { startDate: 'asc' },
  })

  let expectedProgress = 0
  let timeframeName: string | null = null
  let weekLabel: string | null = null

  if (activeTimeframe) {
    const start = new Date(activeTimeframe.startDate).getTime()
    const end = new Date(activeTimeframe.endDate).getTime()
    const elapsed = now.getTime() - start
    const duration = end - start
    expectedProgress = duration > 0 ? Math.round(Math.max(0, Math.min(100, (elapsed / duration) * 100))) : 0
    timeframeName = activeTimeframe.name
    const weeksElapsed = Math.max(1, Math.ceil(elapsed / (7 * 24 * 60 * 60 * 1000)))
    const totalWeeks = Math.max(1, Math.ceil(duration / (7 * 24 * 60 * 60 * 1000)))
    weekLabel = `Week ${weeksElapsed} of ${totalWeeks}`
  }

  // Momentum: last 7 bi-weekly confidence snapshots for this user's objectives
  const snapshots = await prisma.confidenceSnapshot.findMany({
    where: { entityType: 'OBJECTIVE', entityId: { in: await prisma.objective.findMany({ where: { ownerId: userId, status: 'ACTIVE' }, select: { id: true } }).then(os => os.map(o => o.id)) } },
    orderBy: { periodStart: 'asc' },
    select: { periodStart: true, score: true },
    take: 14,
  })

  // Bucket by period, average score per period → treat score as proxy for progress
  const byPeriod = new Map<string, number[]>()
  for (const s of snapshots) {
    if (!byPeriod.has(s.periodStart)) byPeriod.set(s.periodStart, [])
    byPeriod.get(s.periodStart)!.push(s.score)
  }
  const momentumData = Array.from(byPeriod.entries())
    .slice(-7)
    .map(([date, scores]) => ({ date, progress: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) }))

  return {
    avgProgress, expectedProgress, activeOkrCount: activeObjCount,
    confidenceScore, onTrack, atRisk, offTrack, totalKRs: total,
    timeframeName, weekLabel,
    momentumData: momentumData.length >= 2 ? momentumData : undefined,
  }
}

async function getCheckInBanner(userId: string): Promise<CheckInBannerData> {
  const now = new Date()
  const overdueDate = new Date(now); overdueDate.setDate(overdueDate.getDate() - 7)

  const [overdueKRs, dueKRs, lastCheckIn] = await Promise.all([
    prisma.keyResult.count({
      where: { ownerId: userId, status: 'ACTIVE', updatedAt: { lt: overdueDate } },
    }),
    prisma.keyResult.count({
      where: { ownerId: userId, status: 'ACTIVE', updatedAt: { gte: overdueDate, lt: now } },
    }),
    prisma.keyResultCheckIn.findFirst({
      where: { createdById: userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, keyResult: { select: { title: true } } },
    }),
  ])

  const lastCheckInDaysAgo = lastCheckIn
    ? Math.floor((now.getTime() - lastCheckIn.createdAt.getTime()) / (24 * 60 * 60 * 1000))
    : null

  return {
    overdueCount: overdueKRs,
    dueThisWeekCount: dueKRs,
    lastCheckInDaysAgo,
    lastCheckInKrTitle: lastCheckIn?.keyResult?.title ?? null,
  }
}

async function getQuickStats(userId: string, userRole: string): Promise<QuickStatsData> {
  const objWhere = await buildObjectiveWhere(userId, userRole)
  const now = new Date()
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7)

  const [activeObjectives, totalKeyResults, totalInitiatives, blockedCount, dueThisWeekCount] = await Promise.all([
    prisma.objective.count({ where: objWhere }),
    prisma.keyResult.count({ where: { objective: objWhere, status: 'ACTIVE' } }),
    prisma.todo.count({ where: { OR: [{ assigneeId: userId }, { creatorId: userId }] } }),
    prisma.keyResult.count({ where: { objective: objWhere, status: 'ACTIVE', confidence: 'OFF_TRACK' } }),
    prisma.todo.count({
      where: {
        OR: [{ assigneeId: userId }, { creatorId: userId }],
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        dueDate: { gte: now, lte: weekEnd },
      },
    }),
  ])

  return { activeObjectives, totalKeyResults, totalInitiatives, blockedCount, dueThisWeekCount }
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

async function getNeedsAttentionItems(userId: string, userRole: string): Promise<NeedsAttentionItem[]> {
  const objWhere = await buildObjectiveWhere(userId, userRole)
  const now = new Date()
  const items: NeedsAttentionItem[] = []

  const [offTrackKRs, atRiskKRs, overdueTodos] = await Promise.all([
    prisma.keyResult.findMany({
      where: { objective: objWhere, status: 'ACTIVE', confidence: 'OFF_TRACK' },
      select: { id: true, title: true, progress: true, owner: { select: { name: true } } },
      take: 5,
    }),
    prisma.keyResult.findMany({
      where: { objective: objWhere, status: 'ACTIVE', confidence: 'AT_RISK' },
      select: { id: true, title: true, progress: true, owner: { select: { name: true } } },
      take: 5,
    }),
    prisma.todo.findMany({
      where: { assigneeId: userId, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueDate: { lt: now } },
      select: { id: true, title: true },
      take: 5,
    }),
  ])

  for (const kr of offTrackKRs) items.push({ id: kr.id, title: kr.title, type: 'key_result', reason: 'off_track', progress: kr.progress, ownerName: kr.owner.name, href: `/dashboard/key-results/${kr.id}` })
  for (const kr of atRiskKRs) items.push({ id: kr.id, title: kr.title, type: 'key_result', reason: 'at_risk', progress: kr.progress, ownerName: kr.owner.name, href: `/dashboard/key-results/${kr.id}` })
  for (const t of overdueTodos) items.push({ id: t.id, title: t.title, type: 'todo', reason: 'overdue', progress: 0, href: `/dashboard/todos?open=${t.id}` })

  return items
}

// Build an ActivityFeedItem from an ActivityLog row + its related entity data
function buildFeedItem(
  log: {
    id: string
    action: string
    entityType: string
    createdAt: Date
    actorId: string | null
    actor: { name: string; avatar: string | null } | null
    objective: { id: string; title: string; progress: number } | null
    keyResult: { id: string; title: string; progress: number } | null
  }
): ActivityFeedItem | null {
  const entity = log.keyResult ?? log.objective
  if (!entity) return null
  const entityType = log.keyResult ? 'KEY_RESULT' : 'OBJECTIVE'
  return {
    id: log.id,
    actorName: log.actor?.name ?? null,
    actorAvatar: log.actor?.avatar ?? null,
    entityType: entityType as ActivityFeedItem['entityType'],
    entityTitle: entity.title,
    entityId: entity.id,
    action: log.action,
    progress: entity.progress,
    createdAt: log.createdAt.toISOString(),
  }
}

async function getTeamActivity(): Promise<ActivityFeedItem[]> {
  const logs = await prisma.activityLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 40,
    include: {
      actor: { select: { name: true, avatar: true } },
      objective: { select: { id: true, title: true, progress: true } },
      keyResult: { select: { id: true, title: true, progress: true } },
    },
  })
  return logs.flatMap(log => {
    const item = buildFeedItem(log)
    return item ? [item] : []
  }).slice(0, 20)
}

async function getMyActivity(userId: string): Promise<ActivityFeedItem[]> {
  const logs = await prisma.activityLog.findMany({
    where: { actorId: userId },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: {
      actor: { select: { name: true, avatar: true } },
      objective: { select: { id: true, title: true, progress: true } },
      keyResult: { select: { id: true, title: true, progress: true } },
    },
  })
  return logs.flatMap(log => {
    const item = buildFeedItem(log)
    return item ? [item] : []
  }).slice(0, 20)
}
