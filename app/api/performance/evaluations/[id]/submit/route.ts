import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { MetricActualUnavailableError, canScoreEvaluation, consolidateEvaluation } from '@/lib/performance'
import { emit } from '@/lib/notifications/dispatcher'
import { recordActivity } from '@/lib/activity-log'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canScoreEvaluation(actor, id, 'submit')) return apiForbidden('This evaluation cannot be submitted by you')
  const evaluation = await prisma.evaluation.findUnique({
    where: { id },
    include: {
      template: { include: { tiers: { include: { criteria: true } } } },
      scores: { where: { evaluatorId: session.user.id } },
      assignments: true,
    },
  })
  if (!evaluation) return apiNotFound('Evaluation not found')
  const scoreIds = new Set(evaluation.scores.map((score) => score.criterionId))
  const required = evaluation.template.tiers
    .flatMap((tier) => tier.criteria)
    .filter((criterion) => {
      const rule = criterion.scoringRuleJson as Record<string, unknown> | null
      return criterion.type === 'RUBRIC' || rule?.type === 'MANUAL'
    })
  const missing = required.filter((criterion) => !scoreIds.has(criterion.id))
  if (missing.length > 0) {
    return apiBadRequest('Every rubric and manual metric criterion must be scored', {
      criteria: missing.map((criterion) => ({ id: criterion.id, title: criterion.title })),
    })
  }

  await prisma.$transaction([
    prisma.evaluatorScore.updateMany({
      where: { evaluationId: id, evaluatorId: session.user.id },
      data: { lockedAt: new Date() },
    }),
    prisma.evaluatorAssignment.update({
      where: { evaluationId_evaluatorId: { evaluationId: id, evaluatorId: session.user.id } },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    }),
  ])
  const pending = await prisma.evaluatorAssignment.count({ where: { evaluationId: id, status: 'PENDING' } })
  if (pending > 0) return apiSuccess({ submitted: true, consolidated: null })
  try {
    const result = await consolidateEvaluation(id)
    await recordActivity({
      entityType: 'EVALUATION',
      evaluationId: id,
      action: 'EVALUATION_CONSOLIDATED',
      actorId: session.user.id,
      metadata: { status: result.status },
    })
    const lead = evaluation.assignments.find((assignment) => assignment.role === 'LEAD')
    if (lead) {
      const detail = await prisma.evaluation.findUnique({
        where: { id },
        select: { employee: { select: { name: true } }, cycle: { select: { name: true } } },
      })
      await emit('PERF_PANEL_COMPLETE', {
        actorId: session.user.id,
        explicitRecipients: [lead.evaluatorId],
        data: { evaluationId: id, employeeName: detail?.employee.name, cycleName: detail?.cycle.name },
      })
    }
    return apiSuccess({ submitted: true, consolidated: result })
  } catch (error) {
    // The submission itself stands; unavailable metric actuals are flagged as
    // ACTUAL_UNAVAILABLE issues for manual resolution and consolidation can be
    // retried once the Key Result sources are re-mapped.
    if (error instanceof MetricActualUnavailableError) {
      return apiSuccess({ submitted: true, consolidated: null, consolidationBlocked: error.message })
    }
    throw error
  }
})
