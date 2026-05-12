import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiBadRequest,
  apiNotFound,
  withAuth,
} from '@/lib/api'
import { renderLetterHtml } from '@/lib/letter-html'

export const runtime = 'nodejs'

// Serve the letter rendered as a self-contained HTML document, suitable for
// loading directly into an <iframe>. The same renderer is used server-side by
// the /pdf route (via Puppeteer) so what you see here is what the PDF will be.
export const GET = withAuth<RouteIdParams>(async (req, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')

  const letter = await prisma.letter.findUnique({
    where: { id },
    include: {
      signatory: { select: { name: true } },
      enclosures: { select: { fileName: true, fileSize: true } },
      letterTypeDef: { select: { id: true, code: true, name: true } },
    },
  })
  if (!letter) return apiNotFound('Letter not found')

  const url = new URL(req.url)
  const lang = url.searchParams.get('lang') === 'am' ? 'am' : 'en'
  // For iframe preview, relative URLs are fine because the browser loads the
  // doc from the same origin. The /pdf route passes `origin` explicitly so
  // Puppeteer can resolve assets via http://localhost:3000.
  const origin = url.searchParams.get('origin') || ''

  const { html, missing } = renderLetterHtml({ letter: letter as any, origin, lang })

  return new NextResponse(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-missing-placeholders': missing.join(','),
    },
  })
})
