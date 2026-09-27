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

/**
 * Prisma `where` for "the live period": the admin-selected timeframe (`isActive`,
 * an exclusive toggle) OR any timeframe whose dates cover `now`. `isActive` alone
 * is not enough — new timeframes are created inactive and production has run with
 * none flagged (2026-09-27), which emptied every surface that filtered on it.
 */
export function liveTimeframeWhere(now: Date = new Date()) {
  return { OR: [{ isActive: true }, { startDate: { lte: now }, endDate: { gte: now } }] }
}

/** Sentinel value for `?period=` / `?timeframeId=` that opts out of the default. */
export const ALL_TIMEFRAMES = 'all'
