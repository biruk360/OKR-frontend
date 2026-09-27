import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { canScoreEvaluation } from '@/lib/performance'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'

type ScoreInput = { criterionId?: string; score?: number; remark?: string }

export const PUT = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canScoreEvaluation(actor, id)) return apiForbidden('This evaluation is not editable by you')
  const body = await request.json().catch(() => ({}))
  const scores = Array.isArray(body.scores) ? body.scores as ScoreInput[] : null
  if (!scores) return apiBadRequest('scores must be an array')

  const evaluation = await prisma.evaluation.findUnique({
    where: { id },
    include: { template: { include: { tiers: { include: { criteria: true } } } } },
  })
  if (!evaluation) return apiNotFound('Evaluation not found')
  const criteria = new Map(evaluation.template.tiers.flatMap((tier) => tier.criteria).map((criterion) => [criterion.id, criterion]))

  for (const input of scores) {
    const criterion = input.criterionId ? criteria.get(input.criterionId) : null
    if (!criterion) return apiBadRequest('One or more criteria do not belong to this evaluation')
    const rule = criterion.scoringRuleJson as Record<string, unknown> | null
    if (criterion.type === 'METRIC' && rule?.type !== 'MANUAL') {
      return apiBadRequest(`${criterion.title} is auto-scored and cannot be edited`)
    }
    const value = Number(input.score)
    if (!Number.isFinite(value) || value < 0 || value > criterion.maxPoints) {
      return apiBadRequest(`${criterion.title} score must be between 0 and ${criterion.maxPoints}`)
    }
  }

  const previous = await prisma.evaluatorScore.findMany({
    where: { evaluationId: id, evaluatorId: session.user.id, criterionId: { in: scores.map((s) => s.criterionId!) } },
    select: { criterionId: true, score: true, remark: true },
  })
  const before = new Map(previous.map((row) => [row.criterionId, row]))
  const changes: ChangeMap = {}
  for (const input of scores) {
    const prior = before.get(input.criterionId!)
    const nextScore = Number(input.score)
    const nextRemark = input.remark?.trim() || null
    if (!prior || prior.score !== nextScore || (prior.remark ?? null) !== nextRemark) {
      changes[input.criterionId!] = {
        from: prior ? { score: prior.score, remark: prior.remark ?? null } : null,
        to: { score: nextScore, remark: nextRemark },
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const input of scores) {
      await tx.evaluatorScore.upsert({
        where: {
          evaluationId_evaluatorId_criterionId: {
            evaluationId: id,
            evaluatorId: session.user.id,
            criterionId: input.criterionId!,
          },
        },
        create: {
          evaluationId: id,
          evaluatorId: session.user.id,
          criterionId: input.criterionId!,
          score: Number(input.score),
          remark: input.remark?.trim() || null,
        },
        update: { score: Number(input.score), remark: input.remark?.trim() || null },
      })
    }
    if (evaluation.status === 'ASSIGNED') {
      await tx.evaluation.update({ where: { id }, data: { status: 'IN_PROGRESS', startedAt: new Date() } })
    }
  })
  if (Object.keys(changes).length > 0 || evaluation.status === 'ASSIGNED') {
    await recordActivity({
      entityType: 'EVALUATION',
      evaluationId: id,
      action: 'UPDATED',
      actorId: session.user.id,
      changes: {
        ...changes,
        ...(evaluation.status === 'ASSIGNED' ? { status: { from: 'ASSIGNED', to: 'IN_PROGRESS' } } : {}),
      },
      metadata: { kind: 'SCORES_SAVED', criteriaCount: scores.length },
    })
  }
  return apiSuccess({ saved: scores.length })
})

