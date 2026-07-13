import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getScrumMetrics, resolveScrumMetricValue } from '@/features/scrum/services/scrum-metrics'

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
    sourceType: 'KEY_RESULT' | 'SCRUM'
    keyResultId?: string
    scrumMetricKey?: string
    title: string
    value: number
    asOfDate: string | null
    fallbackToCurrentValue: boolean
  }>
}

export async function resolveMetricActual(
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
  const sources: ResolvedMetricActual['sources'] = []
  for (const source of evaluation.metricSources) {
    if (source.sourceType === 'SCRUM') {
      if (!source.scrumMetricKey) {
        throw new MetricActualUnavailableError('Metric actual unavailable: Scrum metric key is missing')
      }
      const metrics = await getScrumMetrics(
        evaluation.employeeId,
        evaluation.cycle.periodStart.toISOString().slice(0, 10),
        evaluation.cycle.periodEnd.toISOString().slice(0, 10),
      )
      sources.push({
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
    sources.push({
      sourceType: 'KEY_RESULT',
      keyResultId: source.keyResultId,
      title: source.keyResultTitleSnapshot ?? source.keyResult.title,
      value: checkIn?.value ?? source.keyResult.currentValue,
      asOfDate: checkIn?.asOfDate.toISOString() ?? null,
      fallbackToCurrentValue: !checkIn,
    })
  }
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
