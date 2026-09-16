import { NextRequest, NextResponse } from 'next/server'
import { apiBadRequest, apiForbidden, apiNotFound, withAuth } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { canReadBriefing } from '@/lib/automations/access'
import { htmlToDocxBuffer } from '@/lib/html-to-docx'
import { renderHtmlToPdf } from '@/lib/letter-pdf-puppeteer'
import type { UserRole } from '@/types'

interface RouteParams { id: string }

/**
 * Export a Briefing (FR-13). Reuses the Letters PDF/DOCX pipeline rather than
 * adding a dependency.
 *
 * The *email* rendering is the export source, not the in-app one: it is already
 * a self-contained document with inline styles, whereas the in-app HTML relies
 * on Tailwind classes that do not exist outside the app shell.
 */
function safeFilename(title: string): string {
  return title.replace(/[^\w\d\-. ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'briefing'
}

export const GET = withAuth<RouteParams>(async (request: NextRequest, { session, params }) => {
  const format = (new URL(request.url).searchParams.get('format') ?? 'pdf').toLowerCase()
  if (format !== 'pdf' && format !== 'docx') {
    return apiBadRequest('format must be "pdf" or "docx"')
  }

  const briefing = await prisma.automationBriefing.findUnique({
    where: { id: params.id },
    select: { id: true, automationId: true, status: true, title: true, htmlEmail: true },
  })
  if (!briefing) return apiNotFound('Briefing not found')

  const principal = { userId: session.user.id, role: session.user.role as UserRole }
  if (!(await canReadBriefing(principal, briefing))) return apiForbidden('Insufficient permissions')

  const filename = safeFilename(briefing.title)

  if (format === 'docx') {
    const docx = await htmlToDocxBuffer(briefing.htmlEmail)
    return new NextResponse(new Blob([new Uint8Array(docx)], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': `attachment; filename="${filename}.docx"`,
      },
    })
  }

  const pdf = await renderHtmlToPdf({ html: briefing.htmlEmail, format: 'A4' })
  return new NextResponse(new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}.pdf"`,
    },
  })
})
