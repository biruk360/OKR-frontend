import { prisma } from '@/lib/prisma'
import { PORTFOLIO_REPORT_TYPE } from '@/lib/projects/portfolio-report'
import { apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { canReadPortfolio } from '@/lib/projects/portfolio-access'

export const GET = withAuth<{ reportId: string }>(async (_req, { session, params }) => {
  if (!canReadPortfolio(session.user.role)) return apiForbidden('Portfolio reports are restricted to executives and department leads')
  const report = await prisma.projectReport.findFirst({
    where: { id: params.reportId, projectId: null, type: PORTFOLIO_REPORT_TYPE },
  })
  if (!report) return apiNotFound('Report not found')
  return apiSuccess(report)
})
