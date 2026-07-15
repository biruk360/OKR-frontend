import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getReadableProject } from '@/lib/projects/access'
import { listDelayLedger } from '@/lib/projects/delay-ledger'
import { renderDelayLedgerPdfHtml } from '@/lib/projects/delay-ledger-pdf'
import { renderHtmlToPdf } from '@/lib/letter-pdf-puppeteer'
import { apiError, apiForbidden, apiNotFound, withAuth } from '@/lib/api'

export const runtime = 'nodejs'

export const GET = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { code: true, name: true, clientName: true },
  })
  if (!project) return apiNotFound('Project not found')

  const sp = req.nextUrl.searchParams
  const ledger = await listDelayLedger(prisma, params.id, {
    owner: sp.get('owner') || undefined,
    reason: sp.get('reason') || undefined,
    phase: sp.get('phase') || undefined,
  })

  try {
    const html = renderDelayLedgerPdfHtml(project, ledger)
    const pdf = await renderHtmlToPdf({ html, landscape: true })
    const filename = `${project.code.replace(/[^A-Za-z0-9._-]+/g, '_')}-delay-ledger.pdf`
    const body = new Blob([new Uint8Array(pdf)], { type: 'application/pdf' })
    return new NextResponse(body, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, no-store',
      },
    })
  } catch (err) {
    return apiError('Delay ledger PDF generation failed', {
      status: 500,
      code: 'PDF_FAILED',
      details: err instanceof Error ? err.message : String(err),
    })
  }
})
