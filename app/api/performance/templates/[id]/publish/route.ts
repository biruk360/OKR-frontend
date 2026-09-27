import { prisma } from '@/lib/prisma'
import { apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { canManageTemplates, validateTemplateForPublish } from '@/lib/performance'
import { recordActivity } from '@/lib/activity-log'

export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canManageTemplates(actor, 'button.performance.template.publish', 'submit')) return apiForbidden('You do not have permission to publish scorecard templates')
  const { id } = await resolveParams(params)
  const template = await prisma.scorecardTemplate.findUnique({
    where: { id },
    include: { tiers: { orderBy: { position: 'asc' }, include: { criteria: { orderBy: { position: 'asc' } } } } },
  })
  if (!template) return apiNotFound('Scorecard template not found')
  if (template.status !== 'DRAFT') return apiValidationError('Only draft templates can be published')
  const issues = validateTemplateForPublish(template)
  if (issues.length > 0) return apiValidationError('Template is not ready to publish', issues)

  const superseded = await prisma.scorecardTemplate.findMany({
    where: { familyId: template.familyId, status: 'PUBLISHED', id: { not: id } },
    select: { id: true, version: true },
  })

  const published = await prisma.$transaction(async (tx) => {
    await tx.scorecardTemplate.updateMany({
      where: { familyId: template.familyId, status: 'PUBLISHED', id: { not: id } },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    })
    return tx.scorecardTemplate.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date(), archivedAt: null },
      include: { family: true, tiers: { include: { criteria: true } } },
    })
  })
  await recordActivity({
    entityType: 'PERFORMANCE_SETTINGS',
    action: 'STATUS_CHANGED',
    actorId: session.user.id,
    changes: { status: { from: 'DRAFT', to: 'PUBLISHED' } },
    metadata: {
      entity: 'SCORECARD_TEMPLATE',
      event: 'PUBLISHED',
      templateId: id,
      familyId: template.familyId,
      version: template.version,
      archivedVersions: superseded.map((row) => ({ templateId: row.id, version: row.version })),
    },
  })
  return apiSuccess(published)
})
