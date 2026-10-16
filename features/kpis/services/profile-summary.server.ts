/**
 * PRF-2 Overview "KPI health" — server only.
 *
 * Counts the person's ACTIVE KPIs for the timeframe by their latest reading's
 * RAG, plus overdue readings (KPI-5). Sensitive KPIs are counted only when the
 * viewer may see them (KPI-7). Returns null when the viewer may not see the
 * person's KPIs at all.
 */
import { prisma } from '@/lib/prisma'
import { getPackageAccessFacts, loadPackageViewer } from '@/lib/package/access'
import { timeframeWindowKeys, fiscalStartMonthOf, dateKeyInZone } from '@/lib/kpi/periods'
import { countKpiHealth, findOverduePeriods, latestReading, maxDateKey } from '@/lib/kpi/stats'
import { isKpiFrequency } from '@/types/package'
import { canViewKpi } from './kpi-view'
import { loadKpiCalendar } from './kpis.server'
import type { KpisProfileSummary } from '../types'

export async function getKpisProfileSummary(
  viewerId: string,
  userId: string,
  timeframeId: string,
): Promise<KpisProfileSummary | null> {
  const viewer = await loadPackageViewer(viewerId)
  const facts = await getPackageAccessFacts(viewer, userId)
  if (!canViewKpi(facts, { isSensitive: false })) return null
  const seesSensitive = canViewKpi(facts, { isSensitive: true })

  const [timeframe, calendar] = await Promise.all([
    prisma.timeframe.findUnique({ where: { id: timeframeId }, select: { startDate: true, endDate: true } }),
    loadKpiCalendar(),
  ])
  if (!timeframe) return null

  const kpis = await prisma.kpi.findMany({
    where: {
      ownerId: userId,
      timeframeId,
      status: 'ACTIVE',
      ...(seesSensitive ? {} : { isSensitive: false }),
    },
    select: {
      frequency: true,
      createdAt: true,
      externalSource: true,
      readings: { select: { periodStart: true, value: true, rag: true } },
    },
  })

  const { startKey, endKey } = timeframeWindowKeys(timeframe.startDate, timeframe.endDate)
  const fiscalStartMonth = fiscalStartMonthOf(timeframe.startDate)
  let overdueReadings = 0
  const latestRags = kpis.map((kpi) => {
    // KPI-5 does not apply to synced KPIs (the integration owes the reading).
    if (kpi.externalSource) return latestReading(kpi.readings)?.rag ?? null
    overdueReadings += findOverduePeriods({
      frequency: isKpiFrequency(kpi.frequency) ? kpi.frequency : 'MONTHLY',
      fiscalStartMonth,
      windowStartKey: maxDateKey(startKey, dateKeyInZone(kpi.createdAt, calendar.timeZone)),
      windowEndKey: endKey,
      todayKey: calendar.todayKey,
      readingStartKeys: new Set(kpi.readings.map((r) => r.periodStart.toISOString().slice(0, 10))),
      holidays: calendar.holidays,
    }).length
    return latestReading(kpi.readings)?.rag ?? null
  })

  return { ...countKpiHealth(latestRags), overdueReadings, total: kpis.length }
}
