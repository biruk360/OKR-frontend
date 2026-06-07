import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { canManageTemplates } from '@/lib/performance'

export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canManageTemplates(actor, 'button.performance.template.archive', 'delete')) return apiForbidden('You do not have permission to archive scorecard templates')
  const { id } = await resolveParams(params)
  const template = await prisma.scorecardTemplate.findUnique({ where: { id } })
  if (!template) return apiNotFound('Scorecard template not found')
  if (template.status !== 'PUBLISHED') return apiBadRequest('Only published templates can be archived')
  const archived = await prisma.scorecardTemplate.update({
    where: { id },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  })
  return apiSuccess(archived)
})
