import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getReadableProject } from '@/lib/projects/access'
import { renderPerformanceReportPdfHtml } from '@/lib/projects/performance-reports'
import { renderHtmlToPdf } from '@/lib/letter-pdf-puppeteer'
import { apiError, apiForbidden, apiNotFound, withAuth } from '@/lib/api'

export const runtime = 'nodejs'

export const GET = withAuth<{ id: string; reportId: string }>(async (_req, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()
  const report = await prisma.projectReport.findFirst({ where: { id: params.reportId, projectId: params.id, type: { in: ['INDIVIDUAL', 'TEAM'] } } })
  if (!report) return apiNotFound('Performance report not found')
  try {
    const pdf = await renderHtmlToPdf({ html: renderPerformanceReportPdfHtml(report), landscape: true })
    const filename = `${report.type.toLowerCase()}-performance-${report.periodEnd.toISOString().slice(0, 10)}.pdf`
    return new NextResponse(new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, no-store',
      },
    })
  } catch (err) {
    return apiError('Performance report PDF generation failed', {
      status: 500,
      code: 'PDF_FAILED',
      details: err instanceof Error ? err.message : String(err),
    })
  }
})
