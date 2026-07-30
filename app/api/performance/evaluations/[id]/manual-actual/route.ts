import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { canTriggerConsolidation, parseMetricRule } from '@/lib/performance'
import { recordActivity } from '@/lib/activity-log'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

const NOTE_MAX_LENGTH = 500

/**
 * Verify the criterion is an automatic metric criterion of this evaluation's
 * template. Returns the criterion title, or null when it does not belong.
 */
async function findAutoMetricCriterion(evaluationId: string, criterionId: string) {
  const criterion = await prisma.scorecardCriterion.findUnique({
    where: { id: criterionId },
    select: {
      id: true,
      type: true,
      title: true,
      scoringRuleJson: true,
      tier: { select: { template: { select: { evaluations: { where: { id: evaluationId }, select: { id: true } } } } } },
    },
  })
  if (!criterion || criterion.tier.template.evaluations.length === 0) return null
  if (criterion.type !== 'METRIC') return null
  const rule = parseMetricRule(criterion.scoringRuleJson)
  if (!rule || rule.type === 'MANUAL') return null
  return criterion
}

/**
 * Manual metric-actual fallback: when automatic resolution fails (archived or
 * missing source), a lead/admin records the actual so consolidation can
 * proceed. The resolver prefers automatic sources and uses this row only as
 * the fallback. Lead or admin only (same gate as consolidation retry).
 */
export const PUT = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canTriggerConsolidation(actor, id)) return apiForbidden('You cannot enter a manual actual for this evaluation')

  const body = await request.json().catch(() => ({})) as { criterionId?: unknown; actual?: unknown; note?: unknown }
  if (typeof body.criterionId !== 'string' || !body.criterionId.trim()) return apiBadRequest('criterionId is required')
  if (typeof body.actual !== 'number' || !Number.isFinite(body.actual)) return apiBadRequest('actual must be a finite number')
  let note: string | null = null
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string') return apiBadRequest('note must be a string')
    note = body.note.trim().slice(0, NOTE_MAX_LENGTH) || null
  }

  const evaluation = await prisma.evaluation.findUnique({ where: { id }, select: { id: true } })
  if (!evaluation) return apiNotFound('Evaluation not found')
  const criterion = await findAutoMetricCriterion(id, body.criterionId)
  if (!criterion) return apiBadRequest('Criterion is not an automatic metric criterion of this evaluation')

  const row = await prisma.evaluationMetricManualActual.upsert({
    where: { evaluationId_criterionId: { evaluationId: id, criterionId: criterion.id } },
    create: { evaluationId: id, criterionId: criterion.id, actual: body.actual, note, enteredById: session.user.id },
    update: { actual: body.actual, note, enteredById: session.user.id, enteredAt: new Date() },
  })
  await recordActivity({
    entityType: 'EVALUATION',
    evaluationId: id,
    action: 'MANUAL_ACTUAL_ENTERED',
    actorId: session.user.id,
    metadata: { criterionId: criterion.id, criterionTitle: criterion.title, actual: body.actual, note },
  })
  return apiSuccess(row)
})

/** Remove a manual actual so automatic resolution (or its issue) applies again. Idempotent. */
export const DELETE = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canTriggerConsolidation(actor, id)) return apiForbidden('You cannot remove a manual actual for this evaluation')

  const body = await request.json().catch(() => ({})) as { criterionId?: unknown }
  if (typeof body.criterionId !== 'string' || !body.criterionId.trim()) return apiBadRequest('criterionId is required')

  const evaluation = await prisma.evaluation.findUnique({ where: { id }, select: { id: true } })
  if (!evaluation) return apiNotFound('Evaluation not found')
  const criterion = await findAutoMetricCriterion(id, body.criterionId)
  if (!criterion) return apiBadRequest('Criterion is not an automatic metric criterion of this evaluation')

  await prisma.evaluationMetricManualActual.deleteMany({
    where: { evaluationId: id, criterionId: criterion.id },
  })
  await recordActivity({
    entityType: 'EVALUATION',
    evaluationId: id,
    action: 'MANUAL_ACTUAL_REMOVED',
    actorId: session.user.id,
    metadata: { criterionId: criterion.id, criterionTitle: criterion.title },
  })
  return apiSuccess({ removed: true })
})
