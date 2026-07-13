import { prisma } from '@/lib/prisma'
import { getScrumMetrics } from './scrum-metrics'
import { dateFromDateKey } from './working-days'

export async function getScrumAnalytics(params: { from: string; to: string; teamId?: string | null }) {
  const from = dateFromDateKey(params.from)
  const to = dateFromDateKey(params.to)
  const userWhere: any = { isActive: true }
  if (params.teamId) userWhere.departmentMemberships = { some: { departmentId: params.teamId, endedAt: null } }
  const users = await prisma.user.findMany({ where: userWhere, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 100 })
  const [updates, absences] = await Promise.all([
    prisma.scrumUpdate.findMany({ where: { scrumDate: { gte: from, lte: to }, userId: { in: users.map((u) => u.id) } } }),
    prisma.scrumAbsence.findMany({ where: { date: { gte: from, lte: to }, userId: { in: users.map((u) => u.id) } } }),
  ])
  const blockerDays = new Map<string, number>()
  for (const update of updates) {
    if (!update.blockerCategory || !update.blockerDaysOpen) continue
    blockerDays.set(update.blockerCategory, (blockerDays.get(update.blockerCategory) ?? 0) + update.blockerDaysOpen)
  }
  const metrics = await Promise.all(users.map(async (user) => ({ user, metrics: await getScrumMetrics(user.id, params.from, params.to) })))
  const proxyCount = updates.filter((update) => update.isProxyEntry).length
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

function computeCarryForwardRate(updates: any[]): number {
  const total = updates.length
  if (total === 0) return 0
  const carried = updates.filter((update) => {
    const value = update.yesterdayStatusJson
    return value && JSON.stringify(value).includes('CARRIED')
  }).length
  return Math.round((carried / total) * 100)
}
