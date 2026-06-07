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
import { resolveMetricActual } from './metric-resolver'

export async function consolidateEvaluation(evaluationId: string) {
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

