import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import AppleDashboard, {
  type AppleDashboardProps,
  type DashboardKpis,
  type InitiativesInFlight,
} from '@/components/dashboard/AppleDashboard'
import type { HeroStatsData } from '@/components/dashboard/HeroStats'
import type { CheckInBannerData } from '@/components/dashboard/CheckInBanner'
import type { QuickStatsData } from '@/components/dashboard/QuickStats'
import type { OkrTreeObjective } from '@/components/dashboard/UserOkrTree'
import type { ActivityFeedItem } from '@/components/dashboard/TeamActivityFeed'

export default async function DashboardPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const [heroData, checkInData, quickData, userOkrTree, teamActivity, deadlineData, initiativesData] =
    await Promise.all([
      getHeroStats(session.user.id, session.user.role),
      getCheckInBanner(session.user.id),
      getQuickStats(session.user.id, session.user.role),
      getUserOkrTree(session.user.id),
      getTeamActivity(session.user.id),
      getDeadlines(session.user.id, session.user.role),
      getInitiativesInFlight(session.user.id),
    ])

  const kpis: DashboardKpis = {
    activeObjectives: quickData.activeObjectives,
    avgProgress: heroData.avgProgress,
    expectedProgress: heroData.expectedProgress,
    momentumValues: heroData.momentumData?.map(d => d.progress) ?? [],
    atRiskCount: heroData.atRisk,
    offTrackCount: heroData.offTrack,
    upcomingDeadlinesCount: deadlineData.upcomingCount,
    soonestDeadlineLabel: deadlineData.soonestLabel,
  }

  const props: AppleDashboardProps = {
    userName: session.user.name ?? 'there',
    hero: heroData,
    banner: checkInData,
    quick: quickData,
    kpis,
    myOkrs: userOkrTree,
    activity: teamActivity,
    initiatives: initiativesData,
  }

  return <AppleDashboard {...props} />
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

  const snapshots = await prisma.confidenceSnapshot.findMany({
    where: {
      entityType: 'OBJECTIVE',
      entityId: {
        in: await prisma.objective
          .findMany({ where: { ownerId: userId, status: 'ACTIVE' }, select: { id: true } })
          .then(os => os.map(o => o.id)),
      },
    },
    orderBy: { periodStart: 'asc' },
    select: { periodStart: true, score: true },
    take: 14,
  })

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
  // "My OKRs" = key results the user is directly responsible for. Filtering by
  // Objective.ownerId pulls in every KR under each owned objective even when
  // that KR is owned by someone else, which makes the dashboard look like a
  // company-wide list for admins. Filter at the KR level and group by parent.
  const krs = await prisma.keyResult.findMany({
    where: { ownerId: userId, status: 'ACTIVE' },
    select: {
      id: true, title: true, progress: true, confidence: true,
      _count: { select: { todos: true } },
      objective: {
        select: { id: true, title: true, level: true, progress: true, goalStatus: true },
      },
    },
    orderBy: [{ objective: { level: 'asc' } }, { objective: { title: 'asc' } }, { title: 'asc' }],
  })

  const grouped = new Map<string, OkrTreeObjective>()
  for (const kr of krs) {
    if (!kr.objective) continue
    const existing = grouped.get(kr.objective.id)
    if (existing) {
      existing.keyResults.push({
        id: kr.id, title: kr.title, progress: kr.progress, confidence: kr.confidence, initiativeCount: kr._count.todos,
      })
    } else {
      grouped.set(kr.objective.id, {
        id: kr.objective.id,
        title: kr.objective.title,
        level: kr.objective.level,
        progress: kr.objective.progress,
        goalStatus: kr.objective.goalStatus,
        keyResults: [{
          id: kr.id, title: kr.title, progress: kr.progress, confidence: kr.confidence, initiativeCount: kr._count.todos,
        }],
      })
    }
  }
  return Array.from(grouped.values())
}

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
    todo: { id: string; title: string; status: string } | null
  }
): ActivityFeedItem | null {
  // Prefer the most specific entity. Sprint logs are rare and the feed UI
  // doesn't render them yet, so they're filtered out by returning null here.
  if (log.keyResult) {
    return {
      id: log.id,
      actorName: log.actor?.name ?? null,
      actorAvatar: log.actor?.avatar ?? null,
      entityType: 'KEY_RESULT',
      entityTitle: log.keyResult.title,
      entityId: log.keyResult.id,
      action: log.action,
      progress: log.keyResult.progress,
      createdAt: log.createdAt.toISOString(),
    }
  }
  if (log.objective) {
    return {
      id: log.id,
      actorName: log.actor?.name ?? null,
      actorAvatar: log.actor?.avatar ?? null,
      entityType: 'OBJECTIVE',
      entityTitle: log.objective.title,
      entityId: log.objective.id,
      action: log.action,
      progress: log.objective.progress,
      createdAt: log.createdAt.toISOString(),
    }
  }
  if (log.todo) {
    return {
      id: log.id,
      actorName: log.actor?.name ?? null,
      actorAvatar: log.actor?.avatar ?? null,
      entityType: 'TODO',
      entityTitle: log.todo.title,
      entityId: log.todo.id,
      action: log.action,
      progress: log.todo.status === 'COMPLETED' ? 100 : 0,
      createdAt: log.createdAt.toISOString(),
    }
  }
  return null
}

async function getTeamActivity(currentUserId: string): Promise<ActivityFeedItem[]> {
  // Show what other team members are doing — exclude the current user's own
  // actions so the feed reads as "what's happening around me" rather than
  // "my own audit trail".
  const logs = await prisma.activityLog.findMany({
    where: { actorId: { not: currentUserId } },
    orderBy: { createdAt: 'desc' },
    // Pull more rows than we render: many logs (sprint events, raw audit
    // entries) get filtered out in buildFeedItem.
    take: 80,
    include: {
      actor: { select: { name: true, avatar: true } },
      objective: { select: { id: true, title: true, progress: true } },
      keyResult: { select: { id: true, title: true, progress: true } },
      todo: { select: { id: true, title: true, status: true } },
    },
  })
  return logs.flatMap(log => {
    const item = buildFeedItem(log)
    return item ? [item] : []
  }).slice(0, 20)
}

async function getDeadlines(userId: string, userRole: string): Promise<{ upcomingCount: number; soonestLabel: string | null }> {
  const objWhere = await buildObjectiveWhere(userId, userRole)
  const now = new Date()
  const horizon = new Date(now); horizon.setDate(horizon.getDate() + 30)

  const objs = await prisma.objective.findMany({
    where: { ...objWhere, timeframe: { endDate: { gte: now, lte: horizon } } },
    select: { title: true, timeframe: { select: { endDate: true } } },
    orderBy: { timeframe: { endDate: 'asc' } },
    take: 20,
  })

  const soonest = objs[0]
  const soonestLabel = soonest && soonest.timeframe
    ? `${soonest.title.length > 28 ? soonest.title.slice(0, 28) + '…' : soonest.title} · ${new Date(soonest.timeframe.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : null

  return { upcomingCount: objs.length, soonestLabel }
}

async function getInitiativesInFlight(userId: string): Promise<InitiativesInFlight[]> {
  const todos = await prisma.todo.findMany({
    where: {
      OR: [{ assigneeId: userId }, { creatorId: userId }],
      status: { in: ['PENDING', 'IN_PROGRESS', 'COMPLETED'] },
    },
    orderBy: { updatedAt: 'desc' },
    take: 18,
    select: { id: true, title: true, status: true, keyResultId: true },
  })
  return todos.map(t => ({ id: t.id, title: t.title, status: t.status, keyResultId: t.keyResultId }))
}
