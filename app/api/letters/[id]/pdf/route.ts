import { NextResponse } from 'next/server'
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
// via @react-pdf/renderer. The `X-Missing-Placeholders` response header carries
// the comma-separated list of unresolved `{{...}}` tokens so the client can
// surface the warning banner without a second request.
export const POST = withAuth<RouteIdParams>(async (_req, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')

  const letter = await prisma.letter.findUnique({
    where: { id },
    include: {
      signatory: { select: { name: true } },
      enclosures: { select: { fileName: true, fileSize: true } },
    },
  })
  if (!letter) return apiNotFound('Letter not found')

  try {
    const { buffer, missing } = await renderLetterPdf({ letter })

    await recordActivity({
      entityType: 'LETTER',
      letterId: id,
      action: 'LETTER_PDF_GENERATED',
      actorId: session.user.id,
      metadata: { missingPlaceholders: missing },
    })

    const filename = `${(letter.referenceNumber || letter.id).replace(/[^A-Za-z0-9._-]+/g, '_')}.pdf`
    // NextResponse's BodyInit typing in this TS lib version doesn't accept
    // Buffer/Uint8Array directly. Wrap as a Blob — same wire format, zero copy.
    const body = new Blob([new Uint8Array(buffer)], { type: 'application/pdf' })
    return new NextResponse(body, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${filename}"`,
        'cache-control': 'private, no-store',
        'x-missing-placeholders': missing.join(','),
      },
    })
  } catch (err) {
    await recordActivity({
      entityType: 'LETTER',
      letterId: id,
      action: 'LETTER_PDF_FAILED',
      actorId: session.user.id,
      metadata: { error: (err as Error).message },
    })
    return apiError('PDF generation failed', { status: 500, code: 'PDF_FAILED', details: (err as Error).message })
  }
})
