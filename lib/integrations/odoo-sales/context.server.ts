/**
 * Odoo sales sync — load the OKR side (server only): the active timeframe, the
 * KPIs linked to Odoo (`Kpi.externalSource`, set by scripts/link-odoo-sales-kpis.ts),
 * their owners, pace and coverage targets, and the company pace.
 *
 *   ODOO_WON       a salesperson's quota KPI; readings = cumulative credited won value
 *   ODOO_COVERAGE  pipeline ÷ remaining quota of the quota KPI in `coverageOfKpiId`
 *   ODOO_PACE      the company KPI (CEO-K01): company won ÷ pace-expected, in %;
 *                  its linked company KR (target + checkpoints) is the company pace
 */
import { prisma } from '@/lib/prisma'
import { resolveDefaultTimeframe } from '@/lib/okr/active-timeframe'
import { isKpiFrequency, KPI_EXTERNAL_SOURCES, type KpiFrequency } from '@/types/package'
import {
  dateKeyInZone,
  fiscalStartMonthOf,
  KPI_DEFAULT_TIMEZONE,
  kpiPeriodForKey,
  storedDateKey,
  timeframeWindowKeys,
  type KpiPeriod,
} from '@/lib/kpi/periods'
import { parsePace, paceTarget, toEtb, type FiscalWindow, type PacePoint } from './pace'
import { fiscalYearName } from './payload'

const KPI_SELECT = {
  id: true,
  externalRef: true,
  name: true,
  unit: true,
  direction: true,
  targetText: true,
  targetValue: true,
  targetMin: true,
  targetMax: true,
  thresholdAmber: true,
  frequency: true,
  scoredFrom: true,
  ownerId: true,
  timeframeId: true,
  packageId: true,
  keyResultId: true,
  externalSource: true,
  coverageOfKpiId: true,
  owner: { select: { id: true, email: true, isActive: true } },
} as const

export type SyncedKpi = Awaited<ReturnType<typeof loadKpis>>[number]

async function loadKpis(timeframeId: string) {
  return prisma.kpi.findMany({
    where: { timeframeId, status: 'ACTIVE', externalSource: { in: [...KPI_EXTERNAL_SOURCES] } },
    select: KPI_SELECT,
    orderBy: { externalRef: 'asc' },
  })
}

export interface QuotaContext {
  kpi: SyncedKpi
  coverageKpi: SyncedKpi | null
  email: string
  kpiRef: string
  pace: PacePoint[]
  /** Annual target (ETB). */
  target: number
  coverageTarget: number | null
}

export interface CompanyContext {
  kpi: SyncedKpi
  kpiRef: string
  target: number
  pace: PacePoint[]
}

export interface SalesSyncContext {
  timeframe: { id: string; name: string }
  fiscalYear: FiscalWindow & { name: string }
  fiscalStartMonth: number
  todayKey: string
  timeZone: string
  quotas: QuotaContext[]
  company: CompanyContext | null
  errors: string[]
}

export function kpiFrequencyOf(kpi: { frequency: string }): KpiFrequency {
  return isKpiFrequency(kpi.frequency) ? kpi.frequency : 'MONTHLY'
}

/** The KPI's reading period containing `todayKey`, clamped to the fiscal year. */
export function currentPeriodFor(kpi: { frequency: string }, ctx: Pick<SalesSyncContext, 'todayKey' | 'fiscalYear' | 'fiscalStartMonth'>): KpiPeriod {
  let key = ctx.todayKey
  if (key > ctx.fiscalYear.endKey) key = ctx.fiscalYear.endKey
  if (key < ctx.fiscalYear.startKey) key = ctx.fiscalYear.startKey
  return kpiPeriodForKey(kpiFrequencyOf(kpi), key, { fiscalStartMonth: ctx.fiscalStartMonth })
}

async function loadTimeZone(): Promise<string> {
  const settings = await prisma.scrumSettings
    .findUnique({ where: { id: 'default' }, select: { timezone: true } })
    .catch(() => null)
  return settings?.timezone || KPI_DEFAULT_TIMEZONE
}

/** Pace for a quota KPI: parsed from `targetText`, else a single checkpoint at the FY end. */
function quotaPace(kpi: SyncedKpi, fy: FiscalWindow): PacePoint[] {
  const pace = parsePace(kpi.targetText, kpi.unit, fy)
  if (pace.length) return pace
  return kpi.targetValue != null && kpi.targetValue > 0 ? [{ date: fy.endKey, cumulative: toEtb(kpi.targetValue, kpi.unit) }] : []
}

async function loadCompany(kpi: SyncedKpi, fy: FiscalWindow, errors: string[]): Promise<CompanyContext | null> {
  const ref = kpi.externalRef ?? kpi.name
  if (!kpi.keyResultId) {
    errors.push(`${ref}: ODOO_PACE KPI has no linked company key result (target and pace come from it)`)
    return null
  }
  const kr = await prisma.keyResult.findUnique({
    where: { id: kpi.keyResultId },
    select: { targetValue: true, unit: true, checkpoints: { select: { dueDate: true, targetValue: true }, orderBy: { dueDate: 'asc' } } },
  })
  if (!kr) {
    errors.push(`${ref}: linked key result not found`)
    return null
  }
  let target: number
  try {
    target = toEtb(kr.targetValue, kr.unit)
  } catch (error) {
    errors.push(`${ref}: ${(error as Error).message}`)
    return null
  }
  const pace: PacePoint[] = kr.checkpoints
    .filter((c) => c.targetValue != null)
    .map((c) => ({ date: storedDateKey(c.dueDate), cumulative: toEtb(c.targetValue as number, kr.unit) }))
  const last = pace[pace.length - 1]
  if (!last || last.cumulative !== target) {
    if (last && last.date >= fy.endKey) last.cumulative = target
    else pace.push({ date: fy.endKey, cumulative: target })
  }
  return { kpi, kpiRef: ref, target, pace }
}

export async function loadSalesSyncContext(now: Date = new Date()): Promise<SalesSyncContext | null> {
  const timeframe = await resolveDefaultTimeframe()
  if (!timeframe) return null
  const timeZone = await loadTimeZone()
  const fy = timeframeWindowKeys(timeframe.startDate, timeframe.endDate)
  const errors: string[] = []
  const kpis = await loadKpis(timeframe.id)

  const quotas: QuotaContext[] = []
  for (const kpi of kpis.filter((k) => k.externalSource === 'ODOO_WON')) {
    const ref = kpi.externalRef ?? kpi.name
    if (!kpi.owner.isActive) {
      errors.push(`${ref}: owner is inactive — skipped`)
      continue
    }
    let pace: PacePoint[]
    try {
      pace = quotaPace(kpi, fy)
    } catch (error) {
      errors.push(`${ref}: ${(error as Error).message}`)
      continue
    }
    const target = paceTarget(pace)
    if (!target) {
      errors.push(`${ref}: no target could be read from the KPI (targetText / targetValue)`)
      continue
    }
    const coverageKpi = kpis.find((k) => k.externalSource === 'ODOO_COVERAGE' && k.coverageOfKpiId === kpi.id) ?? null
    quotas.push({
      kpi,
      coverageKpi,
      email: kpi.owner.email.trim().toLowerCase(),
      kpiRef: ref,
      pace,
      target,
      coverageTarget: coverageKpi?.targetValue ?? null,
    })
  }
  for (const k of kpis.filter((k) => k.externalSource === 'ODOO_COVERAGE')) {
    if (!quotas.some((q) => q.coverageKpi?.id === k.id)) {
      errors.push(`${k.externalRef ?? k.name}: ODOO_COVERAGE KPI is not linked to a synced quota KPI — skipped`)
    }
  }

  const companyKpi = kpis.find((k) => k.externalSource === 'ODOO_PACE') ?? null
  const company = companyKpi ? await loadCompany(companyKpi, fy, errors) : null

  return {
    timeframe: { id: timeframe.id, name: timeframe.name },
    fiscalYear: { ...fy, name: fiscalYearName(timeframe.name) },
    fiscalStartMonth: fiscalStartMonthOf(timeframe.startDate),
    todayKey: dateKeyInZone(now, timeZone),
    timeZone,
    quotas,
    company,
    errors,
  }
}
