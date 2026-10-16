/**
 * Odoo sales sync — the target payload for the read-only integration endpoint
 * (`GET /api/integrations/odoo/sales-targets`). Server only.
 *
 * Built from the OKR database alone: targets and pace from the linked KPIs,
 * won / coverage / RAG from the latest synced (`source = 'ODOO'`) readings of
 * the current period, and OKR action items. It never calls Odoo, so it is cheap
 * and works when Odoo is down. Always served without `secret`.
 */
import { prisma } from '@/lib/prisma'
import { absoluteUrl } from '@/lib/notifications/deep-link'
import { isKpiRag } from '@/types/package'
import { periodStartDate } from '@/lib/kpi/periods'
import { currentPeriodFor, loadSalesSyncContext, type SalesSyncContext, type SyncedKpi } from './context.server'
import { loadOkrActionItems } from './okr-items.server'
import { expectedBy, toEtb } from './pace'
import { buildSalesTargetsPayload, type SalesTargetEntry, type SalesTargetsPayload } from './payload'
import { syncedReadingRag } from './standing'

export type SalesTargetsResponse = SalesTargetsPayload & { generatedAt: string }

async function currentReadings(kpis: readonly SyncedKpi[], ctx: SalesSyncContext) {
  const keys = kpis.map((k) => ({ kpiId: k.id, periodStart: periodStartDate(currentPeriodFor(k, ctx).startKey) }))
  if (keys.length === 0) return new Map<string, { value: number | null; rag: string | null; ragOverridden: boolean }>()
  const rows = await prisma.kpiReading.findMany({
    where: { source: 'ODOO', OR: keys },
    select: { kpiId: true, value: true, rag: true, ragOverridden: true },
  })
  return new Map(rows.map((r) => [r.kpiId, { value: r.value, rag: r.rag, ragOverridden: r.ragOverridden }]))
}

export async function getSalesTargetsPayload(now: Date = new Date()): Promise<SalesTargetsResponse | null> {
  const ctx = await loadSalesSyncContext(now)
  if (!ctx) return null
  const kpis = ctx.quotas.flatMap((q) => (q.coverageKpi ? [q.kpi, q.coverageKpi] : [q.kpi]))
  const [readings, items] = await Promise.all([
    currentReadings(kpis, ctx),
    loadOkrActionItems(ctx.quotas.map((q) => q.kpi.ownerId), ctx.todayKey, ctx.timeZone, ctx.fiscalYear.startKey),
  ])

  const targets: SalesTargetEntry[] = ctx.quotas.map((q) => {
    const won = readings.get(q.kpi.id)
    const coverage = q.coverageKpi ? readings.get(q.coverageKpi.id) : undefined
    return {
      email: q.email,
      kpiRef: q.kpiRef,
      kpiName: q.kpi.name,
      target: q.target,
      unit: 'ETB',
      pace: q.pace,
      coverageTarget: q.coverageTarget,
      coverageKpiRef: q.coverageKpi?.externalRef ?? null,
      okr: {
        won: won?.value != null ? toEtb(won.value, q.kpi.unit) : null,
        expected: expectedBy(q.pace, ctx.fiscalYear.startKey, ctx.todayKey),
        // Same RAG the daily push sends: a manager's override, else won against the pace today
        // (the stored RAG is null while the KPI is "measured, not scored" — KPI-2).
        rag: won?.ragOverridden && isKpiRag(won.rag) ? won.rag : won ? syncedReadingRag(q.kpi, won.value, ctx.fiscalYear, ctx.todayKey) : null,
        coverage: coverage?.value ?? null,
        items: items.get(q.kpi.ownerId) ?? [],
      },
      okrUrl: absoluteUrl('/dashboard'),
    }
  })

  const payload = buildSalesTargetsPayload({ sentAt: now, fiscalYear: ctx.fiscalYear, company: ctx.company, targets })
  return { ...payload, generatedAt: now.toISOString() }
}
