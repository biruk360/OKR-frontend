import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// @react-pdf/renderer uses Node-only APIs (Buffer, fs for fonts) — force the
// Node runtime so this route doesn't get bundled for the Edge runtime.
export const runtime = 'nodejs'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import { renderLetterPdf } from '@/lib/letter-pdf'
import {
  apiBadRequest,
  apiError,
  apiNotFound,
  withAuth,
} from '@/lib/api'

// FR-7: PDF Preview. Returns a real PDF (application/pdf) rendered server-side
// via @react-pdf/renderer.
//
// Two HTTP methods on the same route:
//   - POST — keeps the existing Generate-button flow that records an activity
//     log entry for each manual generation.
//   - GET — used by the "Print" flow that opens the PDF in a new browser tab
//     (browsers only do GET for top-level navigation). No activity log entry
//     so we don't spam the log with every print preview.
//
// Both accept `?lang=am|en&download=1` query params:
//   - lang: letterhead company name in Amharic when set
//   - download: forces `attachment` content-disposition for a "Download PDF" link

async function loadLetter(id: string) {
  return prisma.letter.findUnique({
    where: { id },
    include: {
      signatory: { select: { name: true } },
      enclosures: { select: { fileName: true, fileSize: true } },
    },
  })
}

function pickLang(req: NextRequest): 'en' | 'am' {
  const v = new URL(req.url).searchParams.get('lang')
  return v === 'am' ? 'am' : 'en'
}

async function respondWithPdf(req: NextRequest, letterId: string, opts?: { recordActor?: string }) {
  const letter = await loadLetter(letterId)
  if (!letter) return apiNotFound('Letter not found')

  try {
    const lang = pickLang(req)
    const { buffer, missing } = await renderLetterPdf({ letter, lang })

    if (opts?.recordActor) {
      await recordActivity({
        entityType: 'LETTER',
        letterId,
        action: 'LETTER_PDF_GENERATED',
        actorId: opts.recordActor,
        metadata: { missingPlaceholders: missing, lang },
      })
    }

    const filename = `${(letter.referenceNumber || letter.id).replace(/[^A-Za-z0-9._-]+/g, '_')}.pdf`
    const download = new URL(req.url).searchParams.get('download') === '1'
    const disposition = `${download ? 'attachment' : 'inline'}; filename="${filename}"`
    const body = new Blob([new Uint8Array(buffer)], { type: 'application/pdf' })
    return new NextResponse(body, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': disposition,
        'cache-control': 'private, no-store',
        'x-missing-placeholders': missing.join(','),
      },
    })
  } catch (err) {
    if (opts?.recordActor) {
      await recordActivity({
        entityType: 'LETTER',
        letterId,
        action: 'LETTER_PDF_FAILED',
        actorId: opts.recordActor,
        metadata: { error: (err as Error).message },
      })
    }
    return apiError('PDF generation failed', { status: 500, code: 'PDF_FAILED', details: (err as Error).message })
  }
}

export const POST = withAuth<RouteIdParams>(async (req, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')
  return respondWithPdf(req as NextRequest, id, { recordActor: session.user.id })
})

export const GET = withAuth<RouteIdParams>(async (req, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')
  return respondWithPdf(req as NextRequest, id)
})
