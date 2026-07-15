import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getReadableProject } from '@/lib/projects/access'
import { renderClientReportPdfHtml } from '@/lib/projects/client-report'
import { renderHtmlToPdf } from '@/lib/letter-pdf-puppeteer'
import { apiError, apiForbidden, apiNotFound, withAuth } from '@/lib/api'

export const runtime = 'nodejs'

export const GET = withAuth<{ id: string; reportId: string }>(async (_req: NextRequest, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()
  const report = await prisma.projectReport.findFirst({ where: { id: params.reportId, projectId: params.id } })
  if (!report) return apiNotFound('Report not found')

  try {
    const html = renderClientReportPdfHtml(report)
    const pdf = await renderHtmlToPdf({ html, landscape: false })
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
    return apiError('Client report PDF generation failed', {
      status: 500,
      code: 'PDF_FAILED',
      details: err instanceof Error ? err.message : String(err),
    })
  }
})
