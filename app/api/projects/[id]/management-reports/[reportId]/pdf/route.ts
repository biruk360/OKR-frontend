import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getReadableProject } from '@/lib/projects/access'
import { renderHtmlToPdf } from '@/lib/letter-pdf-puppeteer'
import { renderManagementReportPdfHtml, MANAGEMENT_REPORT_TYPES } from '@/lib/projects/management-reports'
import { apiError, apiForbidden, apiNotFound, withAuth } from '@/lib/api'

export const runtime = 'nodejs'

export const GET = withAuth<{ id: string; reportId: string }>(async (_req, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()
  const report = await prisma.projectReport.findFirst({
    where: { id: params.reportId, projectId: params.id, type: { in: [...MANAGEMENT_REPORT_TYPES] } },
  })
  if (!report) return apiNotFound('Management report not found')
  try {
    const pdf = await renderHtmlToPdf({ html: renderManagementReportPdfHtml(report), landscape: true })
    const filename = `${report.type.toLowerCase()}-${report.periodEnd.toISOString().slice(0, 10)}.pdf`
    return new NextResponse(new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, no-store',
      },
    })
  } catch (err) {
    return apiError('Management report PDF generation failed', {
      status: 500,
      code: 'PDF_FAILED',
      details: err instanceof Error ? err.message : String(err),
    })
  }
})
