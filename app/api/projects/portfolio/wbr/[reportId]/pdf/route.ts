import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError, apiForbidden, apiNotFound, withAuth } from '@/lib/api'
import { renderHtmlToPdf } from '@/lib/letter-pdf-puppeteer'
import { renderWbrPdfHtml, WBR_REPORT_TYPE } from '@/lib/projects/wbr-report'
import { canReadPortfolio } from '@/lib/projects/portfolio-access'

export const runtime = 'nodejs'

export const GET = withAuth<{ reportId: string }>(async (_req, { session, params }) => {
  if (!canReadPortfolio(session.user.role)) {
    return apiForbidden('Portfolio reports are restricted to executives and department leads')
  }
  const report = await prisma.projectReport.findFirst({
    where: { id: params.reportId, projectId: null, type: WBR_REPORT_TYPE },
  })
  if (!report) return apiNotFound('WBR report not found')

  try {
    const pdf = await renderHtmlToPdf({ html: renderWbrPdfHtml(report), landscape: true })
    const filename = `wbr-pack-${report.periodEnd.toISOString().slice(0, 10)}.pdf`
    return new NextResponse(new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, no-store',
      },
    })
  } catch (err) {
    return apiError('WBR PDF generation failed', {
      status: 500,
      code: 'PDF_FAILED',
      details: err instanceof Error ? err.message : String(err),
    })
  }
})
