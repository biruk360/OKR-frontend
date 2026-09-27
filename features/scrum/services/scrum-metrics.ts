import { prisma } from '@/lib/prisma'
import { SUBMITTED_SCRUM_UPDATE_WHERE } from './drafts'
import { getScrumSettings } from './settings'
import { dateFromDateKey, scrumBusinessDaysBetween, scrumWorkingDaysInRange, type ScrumWorkingDaySettings } from './working-days'

export interface ScrumMetricActuals {
  submissionRate: number
  punctualityRate: number
  winCount: number
  blockerResolutionDays: number
}

export const SCRUM_METRIC_RESPONSE_KEYS = [
  'submissionRate',
  'punctualityRate',
  'winCount',
  'blockerResolutionDays',
] as const

export interface ScrumMetricUpdateRow {
  isLate: boolean
  hasWin: boolean
  blockerFirstRaisedAt: Date | null
  blockerResolvedAt: Date | null
}

/** Pure metric math shared by the per-user endpoint and the batched analytics query. */
export function computeScrumMetricActuals(input: {
  updates: ScrumMetricUpdateRow[]
  absenceCount: number
  workingDays: number
  settings: ScrumWorkingDaySettings
}): ScrumMetricActuals {
  const { updates, settings } = input
  const denominator = Math.max(0, input.workingDays - input.absenceCount)
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

export async function getScrumMetrics(userId: string, fromKey: string, toKey: string): Promise<ScrumMetricActuals> {
  const settings = await getScrumSettings()
  const from = dateFromDateKey(fromKey)
  const to = dateFromDateKey(toKey)
  const [updates, absences] = await Promise.all([
    prisma.scrumUpdate.findMany({
      where: { userId, scrumDate: { gte: from, lte: to }, ...SUBMITTED_SCRUM_UPDATE_WHERE },
      select: { isLate: true, hasWin: true, blockerFirstRaisedAt: true, blockerResolvedAt: true, blockerStatus: true },
    }),
    prisma.scrumAbsence.findMany({ where: { userId, date: { gte: from, lte: to } }, select: { date: true } }),
  ])
  return computeScrumMetricActuals({
    updates,
    absenceCount: absences.length,
    workingDays: scrumWorkingDaysInRange(from, to, settings).length,
    settings,
  })
}

export function serializeScrumMetricActuals(metrics: ScrumMetricActuals): ScrumMetricActuals {
  return {
    submissionRate: metrics.submissionRate,
    punctualityRate: metrics.punctualityRate,
    winCount: metrics.winCount,
    blockerResolutionDays: metrics.blockerResolutionDays,
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
