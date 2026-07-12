import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveNextAnchor } from './scoring'
import type { RecommendationRules, RubricAnchors } from './types'

/**
 * Default recommendation rules used when PerformanceSettings.recommendationRulesJson is null:
 * {
 *   "readyPromotionRequiresImprovingTrend": true,
 *   "readySalaryAdjustment": true,
 *   "readyTopTierBonus": true,
 *   "onTrackBonus": true,
 *   "criterionTrainingThreshold": 4
 * }
 */
export const DEFAULT_RECOMMENDATION_RULES: RecommendationRules = {
  readyPromotionRequiresImprovingTrend: true,
  readySalaryAdjustment: true,
  readyTopTierBonus: true,
  onTrackBonus: true,
  criterionTrainingThreshold: 4,
}

/** Merge stored recommendationRulesJson over the defaults, ignoring malformed values. */
export function resolveRecommendationRules(json: Prisma.JsonValue | null | undefined): RecommendationRules {
  const rules = { ...DEFAULT_RECOMMENDATION_RULES }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return rules
  const source = json as Record<string, unknown>
  for (const key of ['readyPromotionRequiresImprovingTrend', 'readySalaryAdjustment', 'readyTopTierBonus', 'onTrackBonus'] as const) {
    if (typeof source[key] === 'boolean') rules[key] = source[key] as boolean
  }
  const threshold = source.criterionTrainingThreshold
  if (typeof threshold === 'number' && Number.isFinite(threshold) && threshold >= 0) {
    rules.criterionTrainingThreshold = threshold
  }
  return rules
}

export async function finalizeEvaluation(evaluationId: string, actorId: string, overrideReason?: string) {
  return prisma.$transaction(async (tx) => {
    const evaluation = await tx.evaluation.findUnique({
      where: { id: evaluationId },
      include: {
        acknowledgements: { orderBy: { createdAt: 'desc' }, take: 1 },
        reports: { orderBy: { version: 'desc' }, take: 1 },
        results: {
          include: { criterion: true },
          orderBy: { consolidated: 'asc' },
        },
        employee: { select: { id: true } },
      },
    })
    if (!evaluation) throw new Error('Evaluation not found')
    if (evaluation.status !== 'DRAFT_SHARED') throw new Error('Only a shared draft can be finalized')
    const acknowledgement = evaluation.acknowledgements[0]
    if (acknowledgement?.status !== 'ACKNOWLEDGED' && !overrideReason?.trim()) {
      throw new Error('Employee acknowledgement or an administrator override reason is required')
    }

    const settings = await tx.performanceSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    })
    const lowest = evaluation.results.slice(0, Math.max(1, settings.improvementFocusLimit))
    for (const result of lowest) {
      const criterion = result.criterion
      let targetText: string
      if (criterion.type === 'RUBRIC') {
        targetText = resolveNextAnchor(result.consolidated, (criterion.anchorJson ?? {}) as RubricAnchors)
          ?? 'Sustain performance at the highest rubric anchor.'
      } else {
        targetText = criterion.target == null
          ? `Improve ${criterion.title} in the next cycle.`
          : `Reach the target of ${criterion.target}${criterion.unit ? ` ${criterion.unit}` : ''}.`
      }
      await tx.improvementFocus.upsert({
        where: { evaluationId_criterionId: { evaluationId, criterionId: criterion.id } },
        create: {
          evaluationId,
          employeeId: evaluation.employeeId,
          criterionId: criterion.id,
          currentLevel: result.consolidated,
          targetText,
        },
        update: { currentLevel: result.consolidated, targetText, status: 'ACTIVE' },
      })
    }

    async function recommend(type: string, detail: Record<string, unknown>) {
      const existing = await tx.developmentAction.findFirst({
        where: { evaluationId, type, recommendedBy: 'system', detailJson: { equals: detail as Prisma.InputJsonValue } },
        select: { id: true },
      })
      if (!existing) {
        await tx.developmentAction.create({
          data: { evaluationId, type, recommendedBy: 'system', detailJson: detail as Prisma.InputJsonValue },
        })
      }
    }

    // Recommendations only — never auto-executed. Rules are configurable via
    // PerformanceSettings.recommendationRulesJson (see DEFAULT_RECOMMENDATION_RULES).
    const rules = resolveRecommendationRules(settings.recommendationRulesJson)
    if (evaluation.gatekeeperPass && evaluation.decisionBand === 'Ready') {
      if (rules.readySalaryAdjustment) await recommend('SALARY_ADJUSTMENT', { reason: 'Ready decision band' })
      if (rules.readyTopTierBonus) await recommend('BONUS', { tier: 'top' })
      let promotionEligible = true
      if (rules.readyPromotionRequiresImprovingTrend) {
        const prior = await tx.evaluation.findFirst({
          where: { employeeId: evaluation.employeeId, status: 'FINALIZED', finalizedAt: { not: null } },
          orderBy: { finalizedAt: 'desc' },
          select: { normalized: true },
        })
        promotionEligible = prior?.normalized != null
          && evaluation.normalized != null
          && evaluation.normalized > prior.normalized
      }
      if (promotionEligible) {
        await recommend('PROMOTION', {
          reason: rules.readyPromotionRequiresImprovingTrend
            ? 'Ready decision band with improving trend'
            : 'Ready decision band',
        })
      }
    } else if (evaluation.decisionBand === 'On Track' && rules.onTrackBonus) {
      await recommend('BONUS', { reason: 'On Track decision band' })
    }
    for (const result of evaluation.results.filter((item) => item.consolidated < rules.criterionTrainingThreshold)) {
      await recommend('TRAINING', { criterionId: result.criterionId, criterionTitle: result.criterion.title })
    }

    if (evaluation.reports[0]) {
      await tx.evaluationReport.update({
        where: { id: evaluation.reports[0].id },
        data: { status: 'FINAL', finalizedAt: new Date() },
      })
    }
    return tx.evaluation.update({
      where: { id: evaluationId },
      data: { status: 'FINALIZED', finalizedAt: new Date() },
    })
  })
}
