// Server-only: imports Prisma. (The `server-only` package is not installed;
// this comment is the marker.)
/**
 * Loader for the home dashboard (app/dashboard/page.tsx). Moved verbatim from
 * the page (CLAUDE.md: routes are thin composition). Every section is scoped
 * to the viewer: objective reads via buildObjectiveWhere, the team feed via
 * department/direct-report membership + OKR redaction + sprintVisibilityWhere,
 * and the Daily Scrum summary never counts a DRAFT as submitted.
 */

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import type {
  AppleDashboardProps,
  DashboardKpis,
  InitiativesInFlight,
} from '@/components/dashboard/AppleDashboard'
import type { HeroStatsData } from '@/components/dashboard/HeroStats'
import type { CheckInBannerData } from '@/components/dashboard/CheckInBanner'
import type { QuickStatsData } from '@/components/dashboard/QuickStats'
import type { OkrTreeObjective } from '@/components/dashboard/UserOkrTree'
import type { ActivityFeedItem } from '@/components/dashboard/TeamActivityFeed'
import { getScrumSettings } from '@/features/scrum/services/settings'
import { dateFromDateKey, toScrumDateKey } from '@/features/scrum/services/working-days'
import { pickCurrentTimeframe } from '@/lib/timeframe-utils'
import { redactKeyResult, redactObjective, sprintVisibilityWhere, type SprintViewer } from '@/lib/permissions'
import {
  heroFromConfidenceGroups,
  isKeyResultRedactedFor,
  isObjectiveRedactedFor,
  momentumFromPeriodAverages,
  summarizeCheckInsDue,
} from '@/lib/okr/dashboard-home'

const MOMENTUM_PERIODS = 7

/** Everything the home dashboard renders, for the signed-in viewer. */
export async function loadDashboardHome(
  user: SprintViewer & { name?: string | null },
): Promise<AppleDashboardProps> {
  const [heroData, checkInData, quickData, userOkrTree, teamActivity, deadlineData, initiativesData, dailyScrum] =
    await Promise.all([
      getHeroStats(user.id, user.role),
      getCheckInBanner(user.id),
      getQuickStats(user.id, user.role),
      getUserOkrTree(user.id),
      getTeamActivity(user),
      getDeadlines(user.id, user.role),
      getInitiativesInFlight(user.id),
      getDashboardScrumSummary(user.id),
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

  return {
    userName: user.name ?? 'there',
    hero: heroData,
    banner: checkInData,
    quick: quickData,
    kpis,
    myOkrs: userOkrTree,
    activity: teamActivity,
    initiatives: initiativesData,
    dailyScrum,
  }
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
  const now = new Date()
  const [objWhere, activeTimeframes, ownedObjectives] = await Promise.all([
    buildObjectiveWhere(userId, userRole),
    prisma.timeframe.findMany({
      where: { isActive: true },
      select: { id: true, name: true, startDate: true, endDate: true, isActive: true },
      orderBy: { startDate: 'asc' },
    }),
    prisma.objective.findMany({ where: { ownerId: userId, status: 'ACTIVE' }, select: { id: true } }),
  ])

  // The timeframe that contains today (several can be flagged isActive).
  const activeTimeframe = pickCurrentTimeframe(activeTimeframes, now)
  const groupKrsByConfidence = (timeframeId?: string) =>
    prisma.keyResult.groupBy({
      by: ['confidence'],
      where: { status: 'ACTIVE', objective: timeframeId ? { ...objWhere, timeframeId } : objWhere },
      _count: { _all: true },
      _sum: { progress: true },
    })
  const toGroups = (rows: Awaited<ReturnType<typeof groupKrsByConfidence>>) =>
    rows.map((r) => ({ confidence: r.confidence, count: r._count._all, progressSum: r._sum.progress ?? 0 }))

  const ownedObjectiveIds = ownedObjectives.map((o) => o.id)
  const [scopedGroups, periodAverages] = await Promise.all([
    groupKrsByConfidence(activeTimeframe?.id),
    ownedObjectiveIds.length > 0
      ? prisma.confidenceSnapshot.groupBy({
          by: ['periodStart'],
          where: { entityType: 'OBJECTIVE', entityId: { in: ownedObjectiveIds } },
          _avg: { score: true },
          // Newest periods first so `take` keeps the latest ones; reversed for display.
          orderBy: { periodStart: 'desc' },
          take: MOMENTUM_PERIODS,
        })
      : Promise.resolve([]),
  ])

  let stats = heroFromConfidenceGroups(toGroups(scopedGroups))
  // Users often own live KRs in timeframes other than the current one (see the
  // timeframe data-shape note in docs) — fall back to all active KRs rather than
  // showing an empty strip.
  if (stats.total === 0 && activeTimeframe) {
    stats = heroFromConfidenceGroups(toGroups(await groupKrsByConfidence()))
  }

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

  const momentumData = momentumFromPeriodAverages(
    periodAverages.map((row) => ({ periodStart: row.periodStart, avgScore: row._avg.score })),
    MOMENTUM_PERIODS,
  )

  return {
    avgProgress: stats.avgProgress,
    expectedProgress,
    activeOkrCount: ownedObjectiveIds.length,
    confidenceScore: stats.confidenceScore,
    onTrack: stats.onTrack,
    atRisk: stats.atRisk,
    offTrack: stats.offTrack,
    totalKRs: stats.total,
    timeframeName,
    weekLabel,
    momentumData: momentumData.length >= 2 ? momentumData : undefined,
  }
}

async function getCheckInBanner(userId: string): Promise<CheckInBannerData> {
  const now = new Date()

  const [krs, lastCheckIn] = await Promise.all([
    prisma.keyResult.findMany({
      where: { ownerId: userId, status: 'ACTIVE', objective: { status: 'ACTIVE' } },
      select: { id: true, checkInCadence: true, createdAt: true },
    }),
    prisma.keyResultCheckIn.findFirst({
      where: { createdById: userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, keyResult: { select: { title: true } } },
    }),
  ])

  // Latest check-in per KR (by anyone) — the cadence clock restarts on a check-in,
  // not on any edit to the KR.
  const latest = krs.length > 0
    ? await prisma.keyResultCheckIn.groupBy({
        by: ['keyResultId'],
        where: { keyResultId: { in: krs.map((k) => k.id) } },
        _max: { createdAt: true },
      })
    : []
  const lastByKr = new Map(latest.map((row) => [row.keyResultId, row._max.createdAt ?? null]))

  const due = summarizeCheckInsDue(
    krs.map((kr) => ({
      id: kr.id,
      checkInCadence: kr.checkInCadence,
      createdAt: kr.createdAt,
      lastCheckInAt: lastByKr.get(kr.id) ?? null,
    })),
    now,
  )

  const lastCheckInDaysAgo = lastCheckIn
    ? Math.floor((now.getTime() - lastCheckIn.createdAt.getTime()) / (24 * 60 * 60 * 1000))
    : null

  return {
    overdueCount: due.overdueCount,
    dueThisWeekCount: due.dueThisWeekCount,
    lastCheckInDaysAgo,
    lastCheckInKrTitle: lastCheckIn?.keyResult?.title ?? null,
    dueKrs: due.items,
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

type FeedLog = {
  id: string
  action: string
  createdAt: Date
  actor: { name: string; avatar: string | null } | null
  objective: { id: string; title: string; progress: number } | null
  keyResult: { id: string; title: string; progress: number } | null
  todo: { id: string; title: string; status: string } | null
}

function buildFeedItem(log: FeedLog): ActivityFeedItem | null {
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

const TEAM_FEED_WINDOW_DAYS = 30
const TEAM_FEED_FETCH = 80
const TEAM_FEED_SHOW = 20

async function getTeamActivity(user: SprintViewer): Promise<ActivityFeedItem[]> {
  const currentUserId = user.id
  const userRole = user.role
  // Show what other team members are doing — exclude the current user's own
  // actions so the feed reads as "what's happening around me" rather than
  // "my own audit trail". ADMIN/EXECUTIVE see the whole org; everyone else sees
  // people in their departments and their direct reports, with private OKRs
  // redacted the same way lib/permissions does.
  const orgWide = userRole === 'ADMIN' || userRole === 'EXECUTIVE'
  const since = new Date(Date.now() - TEAM_FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  let actorFilter: Prisma.StringNullableFilter = { not: currentUserId }
  let fullAccessOwners = new Set<string>([currentUserId])
  if (!orgWide) {
    const [memberships, reports] = await Promise.all([
      prisma.departmentMembership.findMany({ where: { userId: currentUserId, endedAt: null }, select: { departmentId: true } }),
      prisma.managerRelationship.findMany({ where: { managerId: currentUserId, endedAt: null }, select: { directReportId: true } }),
    ])
    const departmentIds = memberships.map((m) => m.departmentId)
    const peers = departmentIds.length > 0
      ? await prisma.departmentMembership.findMany({
          where: { departmentId: { in: departmentIds }, endedAt: null },
          select: { userId: true },
        })
      : []
    const reportIds = reports.map((r) => r.directReportId)
    fullAccessOwners = new Set([currentUserId, ...reportIds])
    const actorIds = Array.from(new Set([...peers.map((p) => p.userId), ...reportIds])).filter((id) => id !== currentUserId)
    if (actorIds.length === 0) return []
    actorFilter = { in: actorIds }
  }

  const logs = await prisma.activityLog.findMany({
    where: {
      actorId: actorFilter,
      createdAt: { gte: since },
      AND: [
        // Only rows the feed can render (sprint / letter / raw audit rows are skipped).
        { OR: [{ keyResultId: { not: null } }, { objectiveId: { not: null } }, { todoId: { not: null } }] },
        // Sprint boards are invite-only: hide rows tied to a sprint the viewer can't open.
        { OR: [{ sprintId: null }, { sprint: sprintVisibilityWhere(user) }] },
        { OR: [{ todoId: null }, { todo: { OR: [{ sprintId: null }, { sprint: sprintVisibilityWhere(user) }] } }] },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: TEAM_FEED_FETCH,
    include: {
      actor: { select: { name: true, avatar: true } },
      objective: { select: { id: true, title: true, progress: true, ownerId: true, isPrivate: true } },
      keyResult: {
        select: {
          id: true, title: true, progress: true, ownerId: true, isPrivate: true,
          objective: { select: { ownerId: true, isPrivate: true } },
        },
      },
      todo: { select: { id: true, title: true, status: true, assigneeId: true, creatorId: true } },
    },
  })

  const items: ActivityFeedItem[] = []
  for (const log of logs) {
    let { objective, keyResult, todo } = log
    if (!orgWide) {
      if (keyResult && isKeyResultRedactedFor(fullAccessOwners, keyResult)) {
        keyResult = { ...keyResult, title: redactKeyResult(keyResult).title }
      }
      if (objective && isObjectiveRedactedFor(fullAccessOwners, objective)) {
        objective = { ...objective, title: redactObjective(objective).title }
      }
      // To-dos have their own visibility rules; only surface the viewer's own
      // and their direct reports' to-dos here.
      if (todo && !(fullAccessOwners.has(todo.creatorId) || (todo.assigneeId && fullAccessOwners.has(todo.assigneeId)))) {
        todo = null
      }
    }
    const item = buildFeedItem({ ...log, objective, keyResult, todo })
    if (item) items.push(item)
    if (items.length >= TEAM_FEED_SHOW) break
  }
  return items
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

async function getDashboardScrumSummary(userId: string): Promise<AppleDashboardProps['dailyScrum']> {
  const settings = await getScrumSettings()
  const todayKey = toScrumDateKey(new Date(), settings)
  const today = dateFromDateKey(todayKey)
  const lastMonth = new Date(today.getTime() - 32 * 24 * 60 * 60 * 1000)
  const [todayUpdate, openBlockers, recentUpdates, directReports] = await Promise.all([
    prisma.scrumUpdate.findUnique({
      where: { userId_scrumDate: { userId, scrumDate: today } },
      select: { status: true, hasBlocker: true, hasWin: true },
    }),
    prisma.scrumUpdate.count({
      where: {
        userId,
        hasBlocker: true,
        blockerStatus: { in: ['OPEN', 'RECURRING', 'ESCALATED'] },
      },
    }),
    prisma.scrumUpdate.findMany({
      where: { userId, scrumDate: { gte: lastMonth, lte: today }, status: { in: ['SUBMITTED', 'LATE', 'CONFIRMED', 'AMENDED'] } },
      select: { scrumDate: true },
      orderBy: { scrumDate: 'desc' },
      take: 32,
    }),
    prisma.managerRelationship.findMany({
      where: { managerId: userId, endedAt: null },
      select: { directReportId: true },
    }),
  ])
  const memberIds = Array.from(new Set([userId, ...directReports.map((row: { directReportId: string }) => row.directReportId)]))
  const teamSubmitted = await prisma.scrumUpdate.count({
    where: { userId: { in: memberIds }, scrumDate: today, status: { in: ['SUBMITTED', 'LATE', 'CONFIRMED', 'AMENDED'] } },
  })
  const submittedKeys = new Set(recentUpdates.map((update: { scrumDate: Date }) => toScrumDateKey(update.scrumDate, settings)))
  let streakDays = 0
  let cursor = today
  for (let i = 0; i < 32; i++) {
    const key = toScrumDateKey(cursor, settings)
    if (!submittedKeys.has(key)) break
    streakDays++
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
  }

  return {
    // A saved DRAFT is not a submission (Scrum server drafts).
    todaySubmitted: Boolean(todayUpdate) && todayUpdate?.status !== 'DRAFT',
    todayStatus: todayUpdate?.status ?? null,
    todayHasBlocker: todayUpdate?.hasBlocker ?? false,
    todayHasWin: todayUpdate?.hasWin ?? false,
    openBlockers,
    streakDays,
    teamSubmitted,
    teamExpected: memberIds.length,
  }
}
