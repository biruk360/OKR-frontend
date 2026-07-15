import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiNotFound, apiSuccess } from '@/lib/api'
import { withPortalProject } from '@/lib/api/withPortalAuth'
import { portalReportWhere, serializeReportForClient } from '@/features/projects/services/portal-serializer'

export const GET = withPortalProject<{ id: string; reportId: string }>(async (req: NextRequest, { params }) => {
  const [report, users] = await Promise.all([
    prisma.projectReport.findFirst({
      where: { ...portalReportWhere(params.id), id: params.reportId },
    }),
    prisma.user.findMany({ where: { isActive: true }, select: { name: true } }),
  ])
  if (!report) return apiNotFound('Report not found')

  const forbiddenEmployeeNames = users.map((u) => u.name).filter(Boolean) as string[]
  const dto = serializeReportForClient(report, { forbiddenEmployeeNames })
  const url = new URL(req.url)
  if (url.searchParams.get('download') === '1') {
    const filename = `${dto.type.toLowerCase()}-${dto.periodEnd.slice(0, 10)}.json`
    return NextResponse.json(dto, {
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  return apiSuccess(dto)
})
