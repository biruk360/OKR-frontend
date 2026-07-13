import { prisma } from '@/lib/prisma'
import { getScrumSettings } from './settings'
import { dateFromDateKey, scrumBusinessDaysBetween, scrumWorkingDaysInRange } from './working-days'

export interface ScrumMetricActuals {
  submissionRate: number
  punctualityRate: number
  winCount: number
  blockerResolutionDays: number
}

export async function getScrumMetrics(userId: string, fromKey: string, toKey: string): Promise<ScrumMetricActuals> {
  const settings = await getScrumSettings()
  const from = dateFromDateKey(fromKey)
  const to = dateFromDateKey(toKey)
  const [updates, absences] = await Promise.all([
    prisma.scrumUpdate.findMany({
      where: { userId, scrumDate: { gte: from, lte: to } },
      select: { isLate: true, hasWin: true, blockerFirstRaisedAt: true, blockerResolvedAt: true, blockerStatus: true },
    }),
    prisma.scrumAbsence.findMany({ where: { userId, date: { gte: from, lte: to } }, select: { date: true } }),
  ])
  const workingDays = scrumWorkingDaysInRange(from, to, settings).length
  const denominator = Math.max(0, workingDays - absences.length)
  const submissionRate = denominator === 0 ? 100 : Math.round((updates.length / denominator) * 100)
  const onTime = updates.filter((update) => !update.isLate).length
  const punctualityRate = updates.length === 0 ? 0 : Math.round((onTime / updates.length) * 100)
  const resolved = updates.filter((update) => update.blockerFirstRaisedAt && update.blockerResolvedAt)
  const blockerResolutionDays = resolved.length === 0
    ? 0
    : Number((resolved.reduce((sum, update) => sum + scrumBusinessDaysBetween(update.blockerFirstRaisedAt!, update.blockerResolvedAt!, settings), 0) / resolved.length).toFixed(1))
  return {
    submissionRate,
    punctualityRate,
    winCount: updates.filter((update) => update.hasWin).length,
    blockerResolutionDays,
  }
}

export function resolveScrumMetricValue(metrics: ScrumMetricActuals, key: string): number {
  switch (key) {
    case 'SCRUM_SUBMISSION_RATE': return metrics.submissionRate
    case 'SCRUM_PUNCTUALITY_RATE': return metrics.punctualityRate
    case 'SCRUM_WIN_COUNT': return metrics.winCount
    case 'SCRUM_BLOCKER_RESOLUTION_DAYS': return metrics.blockerResolutionDays
    default: throw new Error(`Unsupported scrum metric key: ${key}`)
  }
}
