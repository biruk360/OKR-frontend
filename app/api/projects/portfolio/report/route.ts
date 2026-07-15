import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generatePortfolioReport, PORTFOLIO_REPORT_TYPE } from '@/lib/projects/portfolio-report'
import { apiForbidden, apiSuccess, withAuth } from '@/lib/api'

function canReadPortfolio(role: string): boolean {
  return role === 'ADMIN' || role === 'EXECUTIVE' || role === 'DEPARTMENT_LEAD'
}

export const GET = withAuth(async (_req: NextRequest, { session }) => {
  if (!canReadPortfolio(session.user.role)) return apiForbidden('Portfolio reports are restricted to executives and department leads')
  const reports = await prisma.projectReport.findMany({
    where: { projectId: null, type: PORTFOLIO_REPORT_TYPE },
    orderBy: { generatedAt: 'desc' },
    take: 12,
  })
  return apiSuccess(reports)
})

export const POST = withAuth(async (_req: NextRequest, { session }) => {
  if (!canReadPortfolio(session.user.role)) return apiForbidden('Portfolio reports are restricted to executives and department leads')
  const result = await generatePortfolioReport({ actorId: session.user.id })
  return apiSuccess(result.report, { status: result.created ? 201 : 200 })
})
