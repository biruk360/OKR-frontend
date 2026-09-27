import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiBadRequest } from '@/lib/api'
import { getLinkPreview, LinkPreviewError } from '@/lib/link-preview'
import type { LinkPreviewData } from '@/lib/link-preview/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/link-preview?url= — LPV-4.
 *
 * 400 only when `url` is missing or not a URL at all. A URL refused by the
 * SSRF rules (scheme, credentials, port, blocked IP literal / local host name)
 * and any fetch failure both return 200 with `ok: false` and null metadata, so
 * the UI renders the fallback row (LPV-3). A refused URL used to be a 400; the
 * client then threw, which reported every pasted internal link to
 * /api/client-errors and left nothing cached, so it was re-requested.
 */
export const GET = withAuth(async (req: NextRequest) => {
  const raw = req.nextUrl.searchParams.get('url')
  if (!raw || !raw.trim()) return apiBadRequest('url is required')

  let data
  try {
    data = await getLinkPreview(raw)
  } catch (err) {
    if (!(err instanceof LinkPreviewError)) throw err
    const fallback = refusedPreview(raw.trim())
    if (!fallback) return apiBadRequest(err.message)
    data = fallback
  }

  const res = apiSuccess(data)
  res.headers.set('Cache-Control', 'private, max-age=3600')
  return res
})

/** Fallback-row data for a URL the SSRF rules refused; null when it isn't a URL. */
function refusedPreview(raw: string): LinkPreviewData | null {
  let parsed: URL
  try { parsed = new URL(raw) } catch { return null }
  // Never hand back a non-web URL as something the UI will render as a link.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  const domain = parsed.hostname.replace(/^www\./, '')
  return {
    url: raw, finalUrl: raw, domain, siteName: domain,
    title: null, description: null, image: null, favicon: null, ok: false,
  }
}
