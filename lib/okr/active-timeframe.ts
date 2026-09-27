/**
 * The default timeframe for OKR list/aggregate surfaces when the caller did not
 * pick one (OKR hierarchy feed, Gantt). Loading every timeframe's objectives by
 * default was the main cost of those endpoints.
 *
 * Rule: among timeframes flagged `isActive`, the one covering today, else the next
 * upcoming, else the most recently ended (`pickCurrentTimeframe`). Falls back to
 * all timeframes when none is flagged active. Returns null when no timeframe exists
 * (callers then apply no timeframe filter).
 */
import { prisma } from '@/lib/prisma'
import { pickCurrentTimeframe } from '@/lib/timeframe-utils'

export interface DefaultTimeframe {
  id: string
  name: string
  startDate: Date
  endDate: Date
}

export async function resolveDefaultTimeframe(): Promise<DefaultTimeframe | null> {
  const select = { id: true, name: true, startDate: true, endDate: true, isActive: true } as const
  const active = await prisma.timeframe.findMany({
    where: { isActive: true },
    orderBy: { startDate: 'desc' },
    select,
  })
  const pool = active.length > 0
    ? active
    : await prisma.timeframe.findMany({ orderBy: { startDate: 'desc' }, select })
  const picked = pickCurrentTimeframe(pool)
  return picked ? { id: picked.id, name: picked.name, startDate: picked.startDate, endDate: picked.endDate } : null
}

/** Sentinel value for `?period=` / `?timeframeId=` that opts out of the default. */
export const ALL_TIMEFRAMES = 'all'
