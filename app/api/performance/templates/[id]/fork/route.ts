import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { canManageTemplates, hasPerformancePermission } from '@/lib/performance'

export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  const allowed = await Promise.all([
    canManageTemplates(actor, 'button.performance.template.fork', 'create'),
    hasPerformancePermission(actor, 'scorecard_tier', 'create'),
    hasPerformancePermission(actor, 'scorecard_criterion', 'create'),
  ])
  if (!allowed.every(Boolean)) return apiForbidden('You do not have permission to fork scorecard templates')
  const { id } = await resolveParams(params)
  const source = await prisma.scorecardTemplate.findUnique({
    where: { id },
    include: { tiers: { orderBy: { position: 'asc' }, include: { criteria: { orderBy: { position: 'asc' } } } } },
  })
  if (!source) return apiNotFound('Scorecard template not found')
  if (source.status === 'DRAFT') return apiBadRequest('Draft templates can be edited directly')

  const created = await prisma.$transaction(async (tx) => {
    const latest = await tx.scorecardTemplate.findFirst({
      where: { familyId: source.familyId },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    return tx.scorecardTemplate.create({
      data: {
        familyId: source.familyId,
        version: (latest?.version ?? source.version) + 1,
        status: 'DRAFT',
        maxTotal: source.maxTotal,
        gatekeeperJson: source.gatekeeperJson as Prisma.InputJsonValue,
        bandsJson: source.bandsJson as Prisma.InputJsonValue,
        forkedFromId: source.id,
        createdById: session.user.id,
        tiers: {
          create: source.tiers.map((tier) => ({
            name: tier.name,
            position: tier.position,
            maxPoints: tier.maxPoints,
            criteria: {
              create: tier.criteria.map((criterion) => ({
                type: criterion.type,
                code: criterion.code,
                title: criterion.title,
                position: criterion.position,
                maxPoints: criterion.maxPoints,
                weight: criterion.weight,
                anchorJson: criterion.anchorJson === null ? undefined : criterion.anchorJson as Prisma.InputJsonValue,
                unit: criterion.unit,
                periodLabel: criterion.periodLabel,
                target: criterion.target,
                scoringRuleJson: criterion.scoringRuleJson === null ? undefined : criterion.scoringRuleJson as Prisma.InputJsonValue,
                krAggregation: criterion.krAggregation,
              })),
            },
          })),
        },
      },
      include: { family: true, tiers: { include: { criteria: true } } },
    })
  })
  return apiSuccess(created, { status: 201 })
})
