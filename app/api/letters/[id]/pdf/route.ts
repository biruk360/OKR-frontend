import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import { renderLetterToPdf } from '@/lib/letter-pdf-puppeteer'
import {
  apiBadRequest,
  apiError,
  apiNotFound,
  withAuth,
} from '@/lib/api'

// Puppeteer needs Node (fs/spawn for Chromium); not Edge-runtime-safe.
export const runtime = 'nodejs'

/**
 * Render the letter to PDF via headless Chromium printing the SAME HTML that
 * /api/letters/[id]/html returns. Screen preview, browser print, and PDF
 * download therefore all share one rendering pipeline — they're identical.
 *
 * GET and POST are both supported:
 *   POST — the "Generate" action records an activity-log entry
 *   GET  — used by the in-tab "Download PDF" link and by Puppeteer-less
 *          fallbacks; no activity-log noise
 *
 * Query params:
 *   ?lang=en|am    pass through to the renderer
 *   ?download=1    set Content-Disposition: attachment
 */

async function loadLetter(id: string) {
  return prisma.letter.findUnique({
    where: { id },
    include: {
      signatory: { select: { name: true } },
      enclosures: { select: { fileName: true, fileSize: true } },
      letterTypeDef: { select: { id: true, code: true, name: true } },
    },
  })
}

function pickLang(req: NextRequest): 'en' | 'am' {
  return new URL(req.url).searchParams.get('lang') === 'am' ? 'am' : 'en'
}

async function respond(req: NextRequest, letterId: string, opts?: { recordActor?: string }) {
  const letter = await loadLetter(letterId)
  if (!letter) return apiNotFound('Letter not found')

  try {
    const lang = pickLang(req)
    // Puppeteer needs an absolute origin so asset URLs (fonts, logos)
    // resolve. In dev this is http://localhost:3000; in prod it's whatever
    // NEXTAUTH_URL is set to.
    const origin = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3000}`
    const { pdf, missing } = await renderLetterToPdf({ letter: letter as any, lang, origin })

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
    const body = new Blob([new Uint8Array(pdf)], { type: 'application/pdf' })
    return new NextResponse(body, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
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
  return respond(req as NextRequest, id, { recordActor: session.user.id })
})

export const GET = withAuth<RouteIdParams>(async (req, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')
  return respond(req as NextRequest, id)
})
