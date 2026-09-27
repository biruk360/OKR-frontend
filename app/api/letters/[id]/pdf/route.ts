import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import { renderLetterToPdf } from '@/lib/letter-pdf-puppeteer'
import { letterReadGuard } from '@/lib/letter-access'
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
      signatory: { select: { name: true, nameAmharic: true, designation: true, designationAmharic: true } },
      enclosures: { select: { fileName: true, fileSize: true } },
      letterTypeDef: { select: { id: true, code: true, name: true } },
    },
  })
}

function pickLang(req: NextRequest): 'en' | 'am' {
  return new URL(req.url).searchParams.get('lang') === 'am' ? 'am' : 'en'
}

function pickFont(req: NextRequest): string | undefined {
  return new URL(req.url).searchParams.get('font') || undefined
}

async function respond(req: NextRequest, letterId: string, opts?: { recordActor?: string }) {
  const letter = await loadLetter(letterId)
  if (!letter) return apiNotFound('Letter not found')

  try {
    const lang = pickLang(req)
    const font = pickFont(req)
    // Fonts/logos are inlined by the renderer; Puppeteer runs with JS off and
    // no network access beyond Google Fonts, so no app origin is needed.
    const { pdf, missing } = await renderLetterToPdf({ letter: letter as any, lang, font })

    if (opts?.recordActor) {
      await recordActivity({
        entityType: 'LETTER',
        letterId,
        action: 'LETTER_PDF_GENERATED',
        actorId: opts.recordActor,
        metadata: { missingPlaceholders: missing, lang, font },
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
  const denied = await letterReadGuard(session.user.id, id)
  if (denied) return denied
  return respond(req as NextRequest, id, { recordActor: session.user.id })
})

export const GET = withAuth<RouteIdParams>(async (req, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')
  const denied = await letterReadGuard(session.user.id, id)
  if (denied) return denied
  return respond(req as NextRequest, id)
})
