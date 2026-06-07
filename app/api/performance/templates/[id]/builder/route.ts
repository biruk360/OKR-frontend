import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { assertTemplateEditable, canManageTemplates, hasPerformancePermission } from '@/lib/performance'

type CriterionInput = {
  type?: string
  code?: string
  title?: string
  maxPoints?: number
  weight?: number
  anchorJson?: unknown
  unit?: string
  periodLabel?: string
  target?: number
  scoringRuleJson?: unknown
  krAggregation?: string
}

type TierInput = {
  name?: string
  maxPoints?: number
  criteria?: CriterionInput[]
}

export const PUT = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  const allowed = await Promise.all([
    canManageTemplates(actor),
    hasPerformancePermission(actor, 'scorecard_tier', 'write'),
    hasPerformancePermission(actor, 'scorecard_tier', 'create'),
    hasPerformancePermission(actor, 'scorecard_tier', 'delete'),
    hasPerformancePermission(actor, 'scorecard_criterion', 'write'),
    hasPerformancePermission(actor, 'scorecard_criterion', 'create'),
    hasPerformancePermission(actor, 'scorecard_criterion', 'delete'),
  ])
  if (!allowed.every(Boolean)) return apiForbidden('You do not have permission to edit scorecard templates')
  const { id } = await resolveParams(params)
  const existing = await prisma.scorecardTemplate.findUnique({ where: { id } })
  if (!existing) return apiNotFound('Scorecard template not found')
  try {
    assertTemplateEditable(existing.status)
  } catch (error) {
    return apiBadRequest(error instanceof Error ? error.message : 'Template is not editable')
  }

  const body = await request.json().catch(() => ({}))
  const tiers = Array.isArray(body.tiers) ? body.tiers as TierInput[] : null
  if (!tiers) return apiBadRequest('tiers must be an array')
  for (const tier of tiers) {
    if (!tier.name?.trim() || !Number.isFinite(tier.maxPoints) || Number(tier.maxPoints) <= 0) {
      return apiBadRequest('Every tier requires a name and positive maxPoints')
    }
    if (!Array.isArray(tier.criteria)) return apiBadRequest(`Criteria are required for ${tier.name}`)
    for (const criterion of tier.criteria) {
      if (!criterion.title?.trim() || !['RUBRIC', 'METRIC'].includes(String(criterion.type))) {
        return apiBadRequest(`Every criterion in ${tier.name} requires a title and supported type`)
      }
      if (criterion.type === 'RUBRIC' && Number(criterion.maxPoints ?? 10) !== 10) {
        return apiBadRequest('Rubric criteria must use maxPoints = 10 in v1')
      }
    }
  }

  const maxTotal = tiers.reduce((sum, tier) => sum + Number(tier.maxPoints), 0)
  const updated = await prisma.$transaction(async (tx) => {
    await tx.scorecardTier.deleteMany({ where: { templateId: id } })
    await tx.scorecardTemplate.update({ where: { id }, data: { maxTotal } })
    for (let tierIndex = 0; tierIndex < tiers.length; tierIndex++) {
      const tier = tiers[tierIndex]
      const createdTier = await tx.scorecardTier.create({
        data: { templateId: id, name: tier.name!.trim(), position: tierIndex, maxPoints: Number(tier.maxPoints) },
      })
      const criteria = tier.criteria ?? []
      for (let criterionIndex = 0; criterionIndex < criteria.length; criterionIndex++) {
        const criterion = criteria[criterionIndex]
        await tx.scorecardCriterion.create({
          data: {
            tierId: createdTier.id,
            type: String(criterion.type),
            code: criterion.code?.trim() || null,
            title: criterion.title!.trim(),
            position: criterionIndex,
            maxPoints: Number(criterion.maxPoints ?? 10),
            weight: Number(criterion.weight ?? 1),
            anchorJson: criterion.anchorJson === undefined ? undefined : criterion.anchorJson as Prisma.InputJsonValue,
            unit: criterion.unit?.trim() || null,
            periodLabel: criterion.periodLabel?.trim() || null,
            target: criterion.target === undefined ? null : Number(criterion.target),
            scoringRuleJson: criterion.scoringRuleJson === undefined ? undefined : criterion.scoringRuleJson as Prisma.InputJsonValue,
            krAggregation: criterion.krAggregation || null,
          },
        })
      }
    }
    return tx.scorecardTemplate.findUnique({
      where: { id },
      include: { family: true, tiers: { orderBy: { position: 'asc' }, include: { criteria: { orderBy: { position: 'asc' } } } } },
    })
  })
  return apiSuccess(updated)
})
