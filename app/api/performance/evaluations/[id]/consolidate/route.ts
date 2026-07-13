import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { MetricActualUnavailableError, canTriggerConsolidation, consolidateEvaluation } from '@/lib/performance'
import { recordActivity } from '@/lib/activity-log'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { SCRUM_PERFORMANCE_METRIC_LABELS, type ScrumPerformanceMetric } from '@/types/scrum'

/**
 * Manual consolidation retry — the resolution path when automatic
 * consolidation was blocked by unavailable metric actuals. Refreshes the
 * frozen per-evaluation metric-source snapshots from the current mappings,
 * then re-runs consolidation.
 */
export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canTriggerConsolidation(actor, id)) return apiForbidden('You cannot trigger consolidation for this evaluation')

  const evaluation = await prisma.evaluation.findUnique({
    where: { id },
    include: {
      assignments: { select: { status: true } },
      cycle: { select: { status: true } },
      template: { include: { tiers: { include: { criteria: true } } } },
    },
  })
  if (!evaluation) return apiNotFound('Evaluation not found')
  if (!['ASSIGNED', 'IN_PROGRESS'].includes(evaluation.status)) return apiBadRequest('This evaluation is already consolidated')
  if (!['OPEN', 'CONSOLIDATING'].includes(evaluation.cycle.status)) return apiBadRequest('The review cycle is not open')
  if (evaluation.assignments.length === 0 || evaluation.assignments.some((assignment) => assignment.status !== 'SUBMITTED')) {
    return apiBadRequest('Every evaluator must submit before consolidation')
  }

  const autoMetricCriteria = evaluation.template.tiers
    .flatMap((tier) => tier.criteria)
    .filter((criterion) => {
      const rule = criterion.scoringRuleJson as Record<string, unknown> | null
      return criterion.type === 'METRIC' && rule?.type !== 'MANUAL'
    })
  await prisma.$transaction(async (tx) => {
    for (const criterion of autoMetricCriteria) {
      const mappings = await tx.metricSourceMapping.findMany({
        where: { criterionId: criterion.id, employeeId: evaluation.employeeId },
        include: { keyResult: { select: { title: true } } },
        orderBy: { position: 'asc' },
      })
      if (mappings.length === 0) continue
      await tx.evaluationMetricSource.deleteMany({ where: { evaluationId: id, criterionId: criterion.id } })
      await tx.evaluationMetricSource.createMany({
        data: mappings.map((mapping) => ({
          evaluationId: id,
          criterionId: criterion.id,
          sourceType: mapping.sourceType,
          keyResultId: mapping.keyResultId,
          keyResultTitleSnapshot: mapping.keyResult?.title ?? null,
          scrumMetricKey: mapping.scrumMetricKey,
          scrumMetricLabelSnapshot: mapping.scrumMetricKey
            ? SCRUM_PERFORMANCE_METRIC_LABELS[mapping.scrumMetricKey as ScrumPerformanceMetric]
            : null,
          position: mapping.position,
        })),
      })
    }
  })

  try {
    const result = await consolidateEvaluation(id)
    await recordActivity({
      entityType: 'EVALUATION',
      evaluationId: id,
      action: 'EVALUATION_CONSOLIDATED',
      actorId: session.user.id,
      metadata: { status: result.status, trigger: 'manual-retry' },
    })
    return apiSuccess(result)
  } catch (error) {
    if (error instanceof MetricActualUnavailableError) return apiBadRequest(error.message)
    throw error
  }
})
