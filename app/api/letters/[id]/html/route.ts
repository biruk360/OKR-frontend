import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiBadRequest,
  apiNotFound,
  withAuth,
} from '@/lib/api'
import { renderLetterHtml } from '@/lib/letter-html'
import { letterReadGuard } from '@/lib/letter-access'

export const runtime = 'nodejs'

// Serve the letter rendered as a self-contained HTML document, suitable for
// loading directly into an <iframe>. The same renderer is used server-side by
// the /pdf route (via Puppeteer) so what you see here is what the PDF will be.
// Defence in depth for when the URL is opened directly: no scripts, no
// plugins, no forms, only inline styles + the allowlisted font hosts, and the
// document is sandboxed (allow-same-origin so the preview iframe can size and
// print it; allow-modals so print() is permitted — scripts stay disabled).
const PREVIEW_CSP = [
  "default-src 'none'",
  "img-src 'self' data:",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  'sandbox allow-same-origin allow-modals',
].join('; ')

export const GET = withAuth<RouteIdParams>(async (req, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')

  const denied = await letterReadGuard(session.user.id, id)
  if (denied) return denied

  const letter = await prisma.letter.findUnique({
    where: { id },
    include: {
      signatory: { select: { name: true, nameAmharic: true, designation: true, designationAmharic: true } },
      enclosures: { select: { fileName: true, fileSize: true } },
      letterTypeDef: { select: { id: true, code: true, name: true } },
    },
  })
  if (!letter) return apiNotFound('Letter not found')

  const url = new URL(req.url)
  const lang = url.searchParams.get('lang') === 'am' ? 'am' : 'en'
  // Untrusted — renderLetterHtml allowlists it against the font catalog.
  // (There is intentionally no `?origin=`: assets are inlined as data: URIs.)
  const font = url.searchParams.get('font') || undefined

  const { html, missing } = renderLetterHtml({ letter: letter as any, lang, font })

  return new NextResponse(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
      'content-security-policy': PREVIEW_CSP,
      'x-content-type-options': 'nosniff',
      'x-missing-placeholders': missing.join(','),
    },
  })
})
