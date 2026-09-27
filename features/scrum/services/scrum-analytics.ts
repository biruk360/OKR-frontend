import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { SUBMITTED_SCRUM_UPDATE_WHERE } from './drafts'
import { computeScrumMetricActuals } from './scrum-metrics'
import { getScrumSettings } from './settings'
import { dateFromDateKey, scrumWorkingDaysInRange } from './working-days'
import { canViewScrumAnalyticsResolved, isOrgWideScrumRole, listManagedScrumUserIds } from './access'

export interface ScrumAnalyticsParams {
  from: string
  to: string
  teamId?: string | null
}

/**
 * Team health analytics. ADMIN/EXECUTIVE see any team (or everyone); other
 * roles are limited to the people they manage (direct reports, department for
 * DEPARTMENT_LEAD, project members for PMs). Returns `null` when the actor
 * manages nobody — the route turns that into 403.
 */
export async function getScrumAnalyticsForViewer(session: Session, params: ScrumAnalyticsParams) {
  if (isOrgWideScrumRole(session.user.role)) return getScrumAnalytics(params)
  const managedIds = await listManagedScrumUserIds(session)
  if (!canViewScrumAnalyticsResolved({ role: session.user.role, managedUserCount: managedIds.length })) return null
  return getScrumAnalytics({ ...params, userIds: [session.user.id, ...managedIds] })
}

export async function getScrumAnalytics(params: ScrumAnalyticsParams & { userIds?: string[] }) {
  const settings = await getScrumSettings()
  const from = dateFromDateKey(params.from)
  const to = dateFromDateKey(params.to)
  const userWhere: any = { isActive: true }
  if (params.teamId) userWhere.departmentMemberships = { some: { departmentId: params.teamId, endedAt: null } }
  if (params.userIds) userWhere.id = { in: params.userIds }
  const users = await prisma.user.findMany({ where: userWhere, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 100 })
  const userIds = users.map((u) => u.id)
  const [updates, absences] = await Promise.all([
    prisma.scrumUpdate.findMany({ where: { scrumDate: { gte: from, lte: to }, userId: { in: userIds }, ...SUBMITTED_SCRUM_UPDATE_WHERE } }),
    prisma.scrumAbsence.findMany({ where: { date: { gte: from, lte: to }, userId: { in: userIds } }, select: { userId: true } }),
  ])
  const blockerDays = new Map<string, number>()
  for (const update of updates) {
    if (!update.blockerCategory || !update.blockerDaysOpen) continue
    blockerDays.set(update.blockerCategory, (blockerDays.get(update.blockerCategory) ?? 0) + update.blockerDaysOpen)
  }

  // Per-user metrics computed from the two batched queries above (no per-user round trips).
  const workingDays = scrumWorkingDaysInRange(from, to, settings).length
  const updatesByUser = groupBy(updates, (update) => update.userId)
  const absenceCountByUser = new Map<string, number>()
  for (const absence of absences) absenceCountByUser.set(absence.userId, (absenceCountByUser.get(absence.userId) ?? 0) + 1)
  const metrics = users.map((user) => ({
    user,
    metrics: computeScrumMetricActuals({
      updates: updatesByUser.get(user.id) ?? [],
      absenceCount: absenceCountByUser.get(user.id) ?? 0,
      workingDays,
      settings,
    }),
  }))

  const proxyCount = updates.filter((update) => update.isProxyEntry).length
  // Team-aggregated only (spec §11 hard rule 1) — never per-person mood.
  const moodCounts = updates.reduce<Record<string, number>>((acc, update) => {
    if (update.mood) acc[update.mood] = (acc[update.mood] ?? 0) + 1
    return acc
  }, {})
  return {
    range: { from: params.from, to: params.to },
    totals: {
      users: users.length,
      updates: updates.length,
      absences: absences.length,
      blockers: updates.filter((update) => update.hasBlocker).length,
      wins: updates.filter((update) => update.hasWin).length,
      proxyRatio: updates.length === 0 ? 0 : Math.round((proxyCount / updates.length) * 100),
    },
    perUser: metrics,
    blockerPareto: [...blockerDays.entries()].map(([category, daysLost]) => ({ category, daysLost })).sort((a, b) => b.daysLost - a.daysLost),
    moodTrend: moodCounts,
    carryForwardRate: computeCarryForwardRate(updates),
  }
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row)
    const bucket = out.get(k)
    if (bucket) bucket.push(row)
    else out.set(k, [row])
  }
  return out
}

function computeCarryForwardRate(updates: any[]): number {
  const total = updates.length
  if (total === 0) return 0
  const carried = updates.filter((update) => {
    const value = update.yesterdayStatusJson
    return value && JSON.stringify(value).includes('CARRIED')
  }).length
  return Math.round((carried / total) * 100)
}
