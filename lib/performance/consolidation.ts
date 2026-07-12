import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  mean,
  normalizeScore,
  rangeVariance,
  resolveDecisionBand,
  resolveGatekeeper,
  roundPerformanceValue,
  scoreMetric,
} from './scoring'
import { parseBands, parseGatekeeper, parseMetricRule } from './template-validation'
import { MetricActualUnavailableError, resolveMetricActual } from './metric-resolver'

type UnavailableMetric = { criterionId: string; criterionTitle: string; reason: string }

/**
 * Pre-flight every automatic metric criterion. Failures become
 * ACTUAL_UNAVAILABLE review-cycle issues (deduplicated against open ones) and
 * consolidation is blocked with a typed error so callers can route the
 * evaluation to manual resolution instead of surfacing a 500.
 */
async function assertMetricActualsAvailable(evaluationId: string): Promise<void> {
  const evaluation = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    select: {
      cycleId: true,
      employeeId: true,
      template: { select: { tiers: { select: { criteria: true } } } },
    },
  })
  if (!evaluation) throw new Error('Evaluation not found')

  const unavailable: UnavailableMetric[] = []
  for (const tier of evaluation.template.tiers) {
    for (const criterion of tier.criteria) {
      if (criterion.type !== 'METRIC') continue
      const rule = parseMetricRule(criterion.scoringRuleJson)
      if (!rule || rule.type === 'MANUAL') continue
      try {
        await resolveMetricActual(prisma, evaluationId, criterion.id, criterion.krAggregation)
      } catch (error) {
        if (!(error instanceof MetricActualUnavailableError)) throw error
        unavailable.push({ criterionId: criterion.id, criterionTitle: criterion.title, reason: error.message })
      }
    }
  }
  if (unavailable.length === 0) return

  const openIssues = await prisma.reviewCycleIssue.findMany({
    where: { evaluationId, type: 'ACTUAL_UNAVAILABLE', status: 'OPEN' },
    select: { detailJson: true },
  })
  const flaggedCriterionIds = new Set(
    openIssues.map((issue) => (issue.detailJson as { criterionId?: string } | null)?.criterionId).filter(Boolean),
  )
  const fresh = unavailable.filter((item) => !flaggedCriterionIds.has(item.criterionId))
  if (fresh.length > 0) {
    await prisma.reviewCycleIssue.createMany({
      data: fresh.map((item) => ({
        cycleId: evaluation.cycleId,
        employeeId: evaluation.employeeId,
        evaluationId,
        type: 'ACTUAL_UNAVAILABLE',
        detailJson: item as unknown as Prisma.InputJsonValue,
      })),
    })
  }
  throw new MetricActualUnavailableError(
    `Consolidation is blocked — metric actuals unavailable for: ${unavailable.map((item) => item.criterionTitle).join(', ')}. Re-map the Key Result sources and retry consolidation.`,
  )
}

export async function consolidateEvaluation(evaluationId: string) {
  await assertMetricActualsAvailable(evaluationId)
  const consolidated = await runConsolidation(evaluationId)
  // Every actual resolved — any lingering unavailable-actual flags are stale.
  await prisma.reviewCycleIssue.updateMany({
    where: { evaluationId, type: 'ACTUAL_UNAVAILABLE', status: 'OPEN' },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  })
  return consolidated
}

function runConsolidation(evaluationId: string) {
  return prisma.$transaction(async (tx) => {
    const evaluation = await tx.evaluation.findUnique({
      where: { id: evaluationId },
      include: {
        assignments: true,
        scores: true,
        template: {
          include: {
            tiers: {
              orderBy: { position: 'asc' },
              include: { criteria: { orderBy: { position: 'asc' } } },
            },
          },
        },
      },
    })
    if (!evaluation) throw new Error('Evaluation not found')
    if (evaluation.assignments.length === 0 || evaluation.assignments.some((assignment) => assignment.status !== 'SUBMITTED')) {
      throw new Error('Every evaluator must submit before consolidation')
    }

    const settings = await tx.performanceSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    })

    const resultRows: Array<{
      criterionId: string
      tierId: string
      consolidated: number
      variance: number
      flagged: boolean
      actualValue?: number
      actualSourceJson?: Prisma.InputJsonValue
    }> = []

    for (const tier of evaluation.template.tiers) {
      for (const criterion of tier.criteria) {
        let consolidated: number
        let variance = 0
        let actualValue: number | undefined
        let actualSourceJson: Prisma.InputJsonValue | undefined
        const rule = criterion.type === 'METRIC' ? parseMetricRule(criterion.scoringRuleJson) : null

        if (criterion.type === 'METRIC' && rule && rule.type !== 'MANUAL') {
          const resolved = await resolveMetricActual(tx, evaluation.id, criterion.id, criterion.krAggregation)
          actualValue = resolved.actual
          actualSourceJson = resolved.sources as unknown as Prisma.InputJsonValue
          consolidated = scoreMetric(resolved.actual, criterion.target, rule)
        } else {
          const criterionScores = evaluation.scores
            .filter((score) => score.criterionId === criterion.id)
            .map((score) => score.score)
          if (criterionScores.length !== evaluation.assignments.length) {
            throw new Error(`Missing submitted score for criterion: ${criterion.title}`)
          }
          consolidated = mean(criterionScores)
          variance = rangeVariance(criterionScores)
        }

        resultRows.push({
          criterionId: criterion.id,
          tierId: tier.id,
          consolidated,
          variance,
          flagged: variance > settings.varianceThreshold,
          actualValue,
          actualSourceJson,
        })
      }
    }

    for (const result of resultRows) {
      await tx.criterionResult.upsert({
        where: { evaluationId_criterionId: { evaluationId, criterionId: result.criterionId } },
        create: {
          evaluationId,
          criterionId: result.criterionId,
          consolidated: result.consolidated,
          variance: result.variance,
          flagged: result.flagged,
          actualValue: result.actualValue,
          actualSourceJson: result.actualSourceJson,
        },
        update: {
          consolidated: result.consolidated,
          variance: result.variance,
          flagged: result.flagged,
          actualValue: result.actualValue,
          actualSourceJson: result.actualSourceJson,
          calibrationNote: null,
          resolvedAt: null,
          resolvedById: null,
        },
      })
    }

    const rawTotal = resultRows.reduce((sum, result) => sum + result.consolidated, 0)
    const normalized = normalizeScore(rawTotal, evaluation.maxTotal)
    const tierSubtotals = evaluation.template.tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      subtotal: resultRows.filter((result) => result.tierId === tier.id).reduce((sum, result) => sum + result.consolidated, 0),
    }))
    const gatekeeper = parseGatekeeper(evaluation.template.gatekeeperJson)
    const gatekeeperPass = resolveGatekeeper(tierSubtotals, gatekeeper)
    const decisionBand = resolveDecisionBand(
      normalized,
      gatekeeperPass,
      parseBands(evaluation.template.bandsJson),
      gatekeeper.failureBand,
    )
    const status = resultRows.some((result) => result.flagged) ? 'CALIBRATION' : 'CONSOLIDATED'

    return tx.evaluation.update({
      where: { id: evaluationId },
      data: {
        status,
        rawTotal: roundPerformanceValue(rawTotal),
        normalized: roundPerformanceValue(normalized),
        gatekeeperPass,
        decisionBand,
        consolidatedAt: new Date(),
      },
    })
  })
}

