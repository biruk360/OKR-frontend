import { prisma } from '@/lib/prisma'
import { apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { canViewEmployeeReport } from '@/lib/performance'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canViewEmployeeReport(actor, id)) return apiForbidden('The report is sealed or unavailable')
  const report = await prisma.evaluationReport.findFirst({
    where: { evaluationId: id, status: { in: ['SHARED', 'FINAL'] } },
    orderBy: { version: 'desc' },
  })
  if (!report) return apiNotFound('Evaluation report not found')
  return apiSuccess(report)
})

