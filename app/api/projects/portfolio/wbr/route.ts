import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateWbrPack, WBR_REPORT_TYPE } from '@/lib/projects/wbr-report'
import { apiForbidden, apiSuccess, withAuth } from '@/lib/api'

function canReadPortfolio(role: string): boolean {
  return role === 'ADMIN' || role === 'EXECUTIVE' || role === 'DEPARTMENT_LEAD'
}

export const GET = withAuth(async (_req: NextRequest, { session }) => {
  if (!canReadPortfolio(session.user.role)) return apiForbidden('Portfolio reports are restricted to executives and project managers')
  const reports = await prisma.projectReport.findMany({
    where: { projectId: null, type: WBR_REPORT_TYPE },
    orderBy: { generatedAt: 'desc' },
    take: 12,
  })
  return apiSuccess(reports)
})

export const POST = withAuth(async (_req: NextRequest, { session }) => {
  if (!canReadPortfolio(session.user.role)) return apiForbidden('Portfolio reports are restricted to executives and project managers')
  const result = await generateWbrPack({ actorId: session.user.id })
  return apiSuccess(result.report, { status: result.created ? 201 : 200 })
})
