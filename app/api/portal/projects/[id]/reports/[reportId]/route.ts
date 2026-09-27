import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError, apiNotFound, apiSuccess } from '@/lib/api'
import { withPortalProject } from '@/lib/api/withPortalAuth'
import { renderHtmlToPdf } from '@/lib/letter-pdf-puppeteer'
import { CLIENT_REPORT_TYPE, renderClientReportPdfHtml } from '@/lib/projects/client-report'
import {
  loadPortalForbiddenNames,
  portalProjectWhere,
  portalReportWhere,
  serializeReportForClient,
} from '@/features/projects/services/portal-serializer'

export const runtime = 'nodejs'

/**
 * GET — one published report (APPROVED/SENT) of a portal-enabled project in scope.
 * `?download=1` returns a PDF for client bi-monthly reports, rendered from the
 * *scrubbed* DTO (summary + content), never from the raw row, so the PDF obeys
 * invariant 4 exactly like the JSON. Other report types download as JSON.
 */
export const GET = withPortalProject<{ id: string; reportId: string }>(async (req: NextRequest, { session, params }) => {
  const [report, forbiddenEmployeeNames] = await Promise.all([
    prisma.projectReport.findFirst({
      where: {
        ...portalReportWhere(params.id),
        id: params.reportId,
        project: { AND: [portalProjectWhere(session.user.projectIds), { id: params.id }] },
      },
    }),
    loadPortalForbiddenNames(prisma),
  ])
  if (!report) return apiNotFound('Report not found')

  const dto = serializeReportForClient(report, { forbiddenEmployeeNames })
  const url = new URL(req.url)
  if (url.searchParams.get('download') !== '1') return apiSuccess(dto)

  const baseName = `${dto.type.toLowerCase()}-${dto.periodEnd.slice(0, 10)}`
  if (dto.type !== CLIENT_REPORT_TYPE) {
    return NextResponse.json(dto, {
      headers: { 'Content-Disposition': `attachment; filename="${baseName}.json"`, 'Cache-Control': 'private, no-store' },
    })
  }

  try {
    const html = renderClientReportPdfHtml({ ...report, aiSummary: dto.aiSummary, contentJson: dto.contentJson as typeof report.contentJson })
    const pdf = await renderHtmlToPdf({ html, landscape: false })
    return new NextResponse(new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${baseName}.pdf"`,
        'cache-control': 'private, no-store',
      },
    })
  } catch (err) {
    console.error('[portal] report PDF failed', err instanceof Error ? err.message : err)
    return apiError('Report PDF could not be generated. Please try again later.', { status: 500, code: 'PDF_FAILED' })
  }
})
