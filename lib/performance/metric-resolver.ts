import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getScrumMetrics, resolveScrumMetricValue } from '@/features/scrum/services/scrum-metrics'
import { compareDateKeys, isPeriodScored, storedDateKey } from '@/lib/kpi'
import { KPI_DIRECTION_LABELS, isKpiDirection } from '@/types/package'

type DbClient = Prisma.TransactionClient | typeof prisma

/**
 * Raised when a metric criterion's actual cannot be resolved (archived KR,
 * missing mapping). Consolidation converts this into an ACTUAL_UNAVAILABLE
 * review-cycle issue instead of scoring 0 silently.
 */
export class MetricActualUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MetricActualUnavailableError'
  }
}

export type ResolvedMetricActual = {
  actual: number
  sources: Array<{
    sourceType: 'KEY_RESULT' | 'SCRUM' | 'KPI' | 'MANUAL'
    keyResultId?: string
    scrumMetricKey?: string
    /** KPI-9: the package KPI whose period average is the value. */
    kpiId?: string
    /** KPI-9: INCREASE | DECREASE | RANGE — how the KPI reads (see kpiSourceRuleIssue). */
    direction?: string
    /** KPI-9: numeric readings averaged into `value`. */
    readingCount?: number
    title: string
    value: number
    asOfDate: string | null
    fallbackToCurrentValue: boolean
    note?: string | null
    enteredById?: string
  }>
}

// ---------------------------------------------------------------------------
// KPI-9: package KPIs as a metric source (pure helpers, unit-tested)
// ---------------------------------------------------------------------------

export const KPI_METRIC_SOURCE = 'KPI'

/**
 * Direction check between a KPI and the criterion's scoring rule (KPI-9).
 *
 * The criterion actual is the raw period average, so the rule must read it the
 * way the KPI does:
 *   - LINEAR_CAPPED scores actual / target — higher is better, so only
 *     INCREASE KPIs fit.
 *   - INVERSE_BANDS maps the actual to a step score, which can express
 *     lower-is-better (DECREASE), higher-is-better and in-range (RANGE) alike.
 *   - MANUAL (or no rule) does not auto-score, so any KPI may be linked for
 *     reference.
 * Returns a user-facing reason when the pair is incompatible, otherwise null.
 */
export function kpiSourceRuleIssue(direction: string | null | undefined, ruleType: string | null | undefined): string | null {
  const dir = isKpiDirection(direction) ? direction : 'INCREASE'
  if (ruleType !== 'LINEAR_CAPPED') return null
  if (dir === 'INCREASE') return null
  return `${KPI_DIRECTION_LABELS[dir]} KPIs need a banded scoring rule; a linear rule assumes higher is better`
}

/**
 * KPI sources of one criterion must read the same way: averaging or summing a
 * lower-is-better KPI with a higher-is-better one is meaningless.
 */
export function kpiDirectionMixIssue(directions: ReadonlyArray<string | null | undefined>): string | null {
  const distinct = new Set(directions.map((d) => (isKpiDirection(d) ? d : 'INCREASE')))
  if (distinct.size <= 1) return null
  return 'All KPIs linked to one metric criterion must share a direction'
}

export interface KpiReadingForAverage {
  periodStart: Date | string
  periodEnd: Date | string
  value: number | null
}

export interface KpiPeriodAverage {
  average: number
  count: number
  /** Latest included reading's periodEnd. */
  asOf: Date | string
}

/**
 * KPI-9: the evaluation period's average of a KPI's numeric readings.
 *
 * - Text-only readings (value null, compound KPIs — KPI-6) are skipped.
 * - Readings for periods before the KPI's `scoredFrom` are "Measured (not
 *   scored)" (KPI-2) and do not count.
 * - A reading belongs to the period when its own period starts inside it
 *   (monthly/weekly readings in a quarterly cycle). When none does — e.g. a
 *   QUARTERLY KPI on a fiscal quarter offset from the cycle — readings whose
 *   period overlaps the evaluation period are used instead.
 * Returns null when no reading qualifies.
 */
export function averageKpiReadingsForPeriod(
  readings: readonly KpiReadingForAverage[],
  period: { periodStart: Date | string; periodEnd: Date | string },
  scoredFrom?: Date | string | null,
): KpiPeriodAverage | null {
  const fromKey = storedDateKey(period.periodStart)
  const toKey = storedDateKey(period.periodEnd)
  const scored = readings.filter(
    (r) => typeof r.value === 'number' && Number.isFinite(r.value) && isPeriodScored(scoredFrom, r.periodEnd),
  )
  const startsInside = scored.filter((r) => {
    const key = storedDateKey(r.periodStart)
    return compareDateKeys(key, fromKey) >= 0 && compareDateKeys(key, toKey) <= 0
  })
  const picked = startsInside.length > 0
    ? startsInside
    : scored.filter((r) => compareDateKeys(storedDateKey(r.periodStart), toKey) <= 0
      && compareDateKeys(storedDateKey(r.periodEnd), fromKey) >= 0)
  if (picked.length === 0) return null
  let sum = 0
  let asOf = picked[0].periodEnd
  for (const r of picked) {
    sum += r.value as number
    if (compareDateKeys(storedDateKey(r.periodEnd), storedDateKey(asOf)) > 0) asOf = r.periodEnd
  }
  return { average: sum / picked.length, count: picked.length, asOf }
}

function isoOf(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

type MetricSource = ResolvedMetricActual['sources'][number]

/**
 * KPI sources are read from the live MetricSourceMapping rows: the evaluation
 * snapshot (EvaluationMetricSource) has no kpiId column, and KPI-9 says no KPI
 * data is copied into Performance. Consolidation re-snapshots mappings right
 * before scoring, so live mappings and the snapshot agree at that point.
 */
async function resolveKpiSources(
  db: DbClient,
  input: { employeeId: string; criterionId: string; periodStart: Date; periodEnd: Date },
): Promise<Array<{ position: number; source: MetricSource }>> {
  const mappings = await db.metricSourceMapping.findMany({
    where: { criterionId: input.criterionId, employeeId: input.employeeId, sourceType: KPI_METRIC_SOURCE, kpiId: { not: null } },
    orderBy: { position: 'asc' },
    select: {
      position: true,
      kpiId: true,
      kpi: { select: { id: true, name: true, ownerId: true, direction: true, scoredFrom: true, unit: true } },
    },
  })
  if (mappings.length === 0) return []

  const criterion = await db.scorecardCriterion.findUnique({
    where: { id: input.criterionId },
    select: { scoringRuleJson: true },
  })
  const rule = criterion?.scoringRuleJson as Record<string, unknown> | null | undefined
  const ruleType = typeof rule?.type === 'string' ? rule.type : null

  for (const mapping of mappings) {
    if (!mapping.kpi) throw new MetricActualUnavailableError('Metric actual unavailable: KPI source is missing')
    if (mapping.kpi.ownerId !== input.employeeId) {
      throw new MetricActualUnavailableError(`Metric actual unavailable: ${mapping.kpi.name} is not the employee's KPI`)
    }
    const issue = kpiSourceRuleIssue(mapping.kpi.direction, ruleType)
    if (issue) throw new MetricActualUnavailableError(`Metric actual unavailable: ${mapping.kpi.name} — ${issue}`)
  }
  const mixIssue = kpiDirectionMixIssue(mappings.map((m) => m.kpi?.direction))
  if (mixIssue) throw new MetricActualUnavailableError(`Metric actual unavailable: ${mixIssue}`)

  // Widen the query by a day each side; the exact date-key filtering is pure.
  const readings = await db.kpiReading.findMany({
    where: {
      kpiId: { in: mappings.map((m) => m.kpiId as string) },
      periodStart: { lte: new Date(input.periodEnd.getTime() + MS_PER_DAY) },
      periodEnd: { gte: new Date(input.periodStart.getTime() - MS_PER_DAY) },
    },
    select: { kpiId: true, periodStart: true, periodEnd: true, value: true },
  })

  return mappings.map((mapping) => {
    const kpi = mapping.kpi!
    const avg = averageKpiReadingsForPeriod(
      readings.filter((r) => r.kpiId === kpi.id),
      { periodStart: input.periodStart, periodEnd: input.periodEnd },
      kpi.scoredFrom,
    )
    if (!avg) {
      throw new MetricActualUnavailableError(`Metric actual unavailable: ${kpi.name} has no scored reading in the evaluation period`)
    }
    return {
      position: mapping.position,
      source: {
        sourceType: 'KPI' as const,
        kpiId: kpi.id,
        title: kpi.name,
        value: avg.average,
        asOfDate: isoOf(avg.asOf),
        fallbackToCurrentValue: false,
        direction: isKpiDirection(kpi.direction) ? kpi.direction : 'INCREASE',
        readingCount: avg.count,
        note: `Average of ${avg.count} reading${avg.count === 1 ? '' : 's'} in the evaluation period`,
      },
    }
  })
}

/**
 * Resolve a metric criterion's actual. Automatic sources win; when automatic
 * resolution fails (archived/missing source) a manually entered actual —
 * recorded by a lead/admin — is used as the fallback so consolidation can
 * proceed. Only when no manual fallback exists is MetricActualUnavailableError
 * propagated.
 */
export async function resolveMetricActual(
  db: DbClient,
  evaluationId: string,
  criterionId: string,
  aggregation: string | null,
): Promise<ResolvedMetricActual> {
  try {
    return await resolveMetricActualAuto(db, evaluationId, criterionId, aggregation)
  } catch (error) {
    if (!(error instanceof MetricActualUnavailableError)) throw error
    const manual = await db.evaluationMetricManualActual.findUnique({
      where: { evaluationId_criterionId: { evaluationId, criterionId } },
    })
    if (!manual) throw error
    return {
      actual: manual.actual,
      sources: [{
        sourceType: 'MANUAL',
        title: 'Manual entry',
        value: manual.actual,
        asOfDate: manual.enteredAt.toISOString(),
        fallbackToCurrentValue: false,
        note: manual.note,
        enteredById: manual.enteredById,
      }],
    }
  }
}

async function resolveMetricActualAuto(
  db: DbClient,
  evaluationId: string,
  criterionId: string,
  aggregation: string | null,
): Promise<ResolvedMetricActual> {
  const evaluation = await db.evaluation.findUnique({
    where: { id: evaluationId },
    select: {
      employeeId: true,
      cycle: { select: { periodStart: true, periodEnd: true } },
      metricSources: {
        where: { criterionId },
        orderBy: { position: 'asc' },
        include: {
          keyResult: {
            select: {
              id: true,
              title: true,
              status: true,
              currentValue: true,
            },
          },
        },
      },
    },
  })
  if (!evaluation) throw new Error('Evaluation not found')

  // Prisma cannot reference a parent selection inside a nested relation filter,
  // so fetch the period-bounded check-ins explicitly.
  const positioned: Array<{ position: number; source: MetricSource }> = []
  const push = (position: number | null | undefined, source: MetricSource) => {
    positioned.push({ position: typeof position === 'number' ? position : positioned.length, source })
  }
  for (const source of evaluation.metricSources) {
    // KPI rows in the snapshot carry no kpiId; they resolve from live mappings below.
    if (source.sourceType === KPI_METRIC_SOURCE) continue
    if (source.sourceType === 'SCRUM') {
      if (!source.scrumMetricKey) {
        throw new MetricActualUnavailableError('Metric actual unavailable: Scrum metric key is missing')
      }
      const metrics = await getScrumMetrics(
        evaluation.employeeId,
        evaluation.cycle.periodStart.toISOString().slice(0, 10),
        evaluation.cycle.periodEnd.toISOString().slice(0, 10),
      )
      push(source.position, {
        sourceType: 'SCRUM',
        scrumMetricKey: source.scrumMetricKey,
        title: source.scrumMetricLabelSnapshot ?? source.scrumMetricKey,
        value: resolveScrumMetricValue(metrics, source.scrumMetricKey),
        asOfDate: evaluation.cycle.periodEnd.toISOString(),
        fallbackToCurrentValue: false,
      })
      continue
    }
    if (!source.keyResult || !source.keyResultId) {
      throw new MetricActualUnavailableError('Metric actual unavailable: Key Result source is missing')
    }
    if (source.keyResult.status !== 'ACTIVE') {
      throw new MetricActualUnavailableError(`Metric actual unavailable: ${source.keyResultTitleSnapshot ?? source.keyResult.title} is not active`)
    }
    const checkIn = await db.keyResultCheckIn.findFirst({
      where: { keyResultId: source.keyResultId, asOfDate: { lte: evaluation.cycle.periodEnd } },
      orderBy: { asOfDate: 'desc' },
      select: { value: true, asOfDate: true },
    })
    push(source.position, {
      sourceType: 'KEY_RESULT',
      keyResultId: source.keyResultId,
      title: source.keyResultTitleSnapshot ?? source.keyResult.title,
      value: checkIn?.value ?? source.keyResult.currentValue,
      asOfDate: checkIn?.asOfDate.toISOString() ?? null,
      fallbackToCurrentValue: !checkIn,
    })
  }
  positioned.push(...await resolveKpiSources(db, {
    employeeId: evaluation.employeeId,
    criterionId,
    periodStart: evaluation.cycle.periodStart,
    periodEnd: evaluation.cycle.periodEnd,
  }))
  const sources = positioned
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => a.position - b.position || a.index - b.index)
    .map((entry) => entry.source)
  if (sources.length === 0) throw new MetricActualUnavailableError('Metric actual unavailable: no source is mapped')

  const values = sources.map((source) => source.value)
  let actual: number
  if (aggregation === 'SUM') {
    actual = values.reduce((sum, value) => sum + value, 0)
  } else if (aggregation === 'LATEST') {
    const dated = sources.filter((source) => source.asOfDate)
    actual = dated.length > 0
      ? [...dated].sort((a, b) => String(b.asOfDate).localeCompare(String(a.asOfDate)))[0].value
      : sources[sources.length - 1].value
  } else {
    actual = values.reduce((sum, value) => sum + value, 0) / values.length
  }

  return { actual, sources }
}
