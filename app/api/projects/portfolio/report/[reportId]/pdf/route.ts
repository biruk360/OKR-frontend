import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError, apiForbidden, apiNotFound, withAuth } from '@/lib/api'
import { renderHtmlToPdf } from '@/lib/letter-pdf-puppeteer'
import { renderPortfolioReportPdfHtml, PORTFOLIO_REPORT_TYPE } from '@/lib/projects/portfolio-report'

export const runtime = 'nodejs'

export const GET = withAuth<{ reportId: string }>(async (_req, { session, params }) => {
  if (session.user.role !== 'ADMIN' && session.user.role !== 'EXECUTIVE' && session.user.role !== 'DEPARTMENT_LEAD') {
    return apiForbidden('Portfolio reports are restricted to executives and department leads')
  }
  const report = await prisma.projectReport.findFirst({
    where: { id: params.reportId, projectId: null, type: PORTFOLIO_REPORT_TYPE },
  })
  if (!report) return apiNotFound('Portfolio report not found')

  try {
    const pdf = await renderHtmlToPdf({ html: renderPortfolioReportPdfHtml(report), landscape: true })
    const filename = `portfolio-report-${report.periodEnd.toISOString().slice(0, 10)}.pdf`
    return new NextResponse(new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, no-store',
      },
    })
  } catch (err) {
    return apiError('Portfolio report PDF generation failed', {
      status: 500,
      code: 'PDF_FAILED',
      details: err instanceof Error ? err.message : String(err),
    })
  }
})
