import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { canViewEvaluation, hasPerformancePermission, parseMetricRule, resolveMetricActual, scoreMetric } from '@/lib/performance'

type CriterionParams = { criterionId: string | string[] }

export const GET = withAuth<CriterionParams>(async (request: NextRequest, { session, params }) => {
  const criterionId = Array.isArray(params.criterionId) ? params.criterionId[0] : params.criterionId
  const evaluationId = new URL(request.url).searchParams.get('evaluationId')
  if (!evaluationId) return apiBadRequest('evaluationId is required')
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canViewEvaluation(actor, evaluationId)) return apiForbidden('You do not have access to this evaluation')
  if (!await hasPerformancePermission(actor, 'evaluation_metric_source', 'read')) {
    return apiForbidden('You do not have access to evaluation metric sources')
  }

  const criterion = await prisma.scorecardCriterion.findUnique({
    where: { id: criterionId },
    select: {
      id: true,
      type: true,
      title: true,
      target: true,
      unit: true,
      krAggregation: true,
      scoringRuleJson: true,
      tier: { select: { template: { select: { evaluations: { where: { id: evaluationId }, select: { id: true } } } } } },
    },
  })
  if (!criterion || criterion.tier.template.evaluations.length === 0) return apiNotFound('Metric criterion not found for this evaluation')
  if (criterion.type !== 'METRIC') return apiBadRequest('Criterion is not a metric')
  const rule = parseMetricRule(criterion.scoringRuleJson)
  if (!rule || rule.type === 'MANUAL') return apiBadRequest('Criterion does not use automatic metric scoring')

  try {
    const resolved = await resolveMetricActual(prisma, evaluationId, criterionId, criterion.krAggregation)
    return apiSuccess({
      criterionId,
      title: criterion.title,
      actual: resolved.actual,
      target: criterion.target,
      unit: criterion.unit,
      score: scoreMetric(resolved.actual, criterion.target, rule),
      sources: resolved.sources,
      unavailable: false,
    })
  } catch (error) {
    return apiSuccess({
      criterionId,
      title: criterion.title,
      actual: null,
      target: criterion.target,
      unit: criterion.unit,
      score: null,
      sources: [],
      unavailable: true,
      reason: error instanceof Error ? error.message : 'Metric actual unavailable',
    })
  }
})
