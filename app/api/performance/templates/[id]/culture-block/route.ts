import type { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { CULTURE_CRITERIA, CULTURE_LIBRARY_VERSION, canManageTemplates, hasPerformancePermission } from '@/lib/performance'

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  const allowed = await Promise.all([
    canManageTemplates(actor),
    hasPerformancePermission(actor, 'criterion_library_entry', 'create'),
    hasPerformancePermission(actor, 'scorecard_criterion', 'create'),
    hasPerformancePermission(actor, 'scorecard_tier', 'write'),
  ])
  if (!allowed.every(Boolean)) return apiForbidden('You do not have permission to insert the culture block')
  const { id } = await resolveParams(params)
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const tierId = typeof body.tierId === 'string' ? body.tierId : ''
  if (!tierId) return apiBadRequest('tierId is required')

  const template = await prisma.scorecardTemplate.findUnique({
    where: { id },
    include: { tiers: { include: { criteria: true } } },
  })
  if (!template) return apiNotFound('Scorecard template not found')
  if (template.status !== 'DRAFT') return apiBadRequest('Culture blocks can only be inserted into draft templates')
  const tier = template.tiers.find((candidate) => candidate.id === tierId)
  if (!tier) return apiNotFound('Target tier not found in this template')

  const existingCodes = new Set(tier.criteria.map((criterion) => criterion.code).filter(Boolean))
  const missing = CULTURE_CRITERIA.filter((criterion) => !existingCodes.has(criterion.code))
  if (missing.length === 0) return apiSuccess({ inserted: 0, template })

  const updated = await prisma.$transaction(async (tx) => {
    let position = tier.criteria.length
    for (const definition of missing) {
      const libraryEntry = await tx.criterionLibraryEntry.upsert({
        where: { code_version: { code: definition.code, version: CULTURE_LIBRARY_VERSION } },
        create: {
          code: definition.code,
          name: definition.title,
          version: CULTURE_LIBRARY_VERSION,
          type: 'RUBRIC',
          definitionJson: { title: definition.title, anchors: definition.anchors },
        },
        update: { name: definition.title, isActive: true },
      })
      await tx.scorecardCriterion.create({
        data: {
          tierId,
          libraryEntryId: libraryEntry.id,
          type: 'RUBRIC',
          code: definition.code,
          title: definition.title,
          position: position++,
          maxPoints: 10,
          weight: 1,
          anchorJson: definition.anchors as unknown as Prisma.InputJsonValue,
        },
      })
    }
    const tierMaxPoints = tier.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0) + missing.length * 10
    await tx.scorecardTier.update({ where: { id: tierId }, data: { maxPoints: tierMaxPoints } })
    const maxTotal = await tx.scorecardTier.aggregate({ where: { templateId: id }, _sum: { maxPoints: true } })
    await tx.scorecardTemplate.update({ where: { id }, data: { maxTotal: maxTotal._sum.maxPoints ?? 0 } })
    return tx.scorecardTemplate.findUnique({
      where: { id },
      include: {
        family: { include: { templates: { select: { id: true, version: true, status: true, publishedAt: true } } } },
        tiers: { orderBy: { position: 'asc' }, include: { criteria: { orderBy: { position: 'asc' } } } },
      },
    })
  })
  return apiSuccess({ inserted: missing.length, template: updated })
})
