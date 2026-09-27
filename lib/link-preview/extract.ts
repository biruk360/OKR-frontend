/**
 * LPV-1 — find the URLs in a rich-text body that deserve a preview card.
 *
 * Client-safe (no Node imports): `components/shared/LinkPreview` imports this
 * file directly. Keep it that way — never import `./fetch` from here.
 */
import { ATTRS_PATTERN, decodeEntities, parseAttributes, stripMentionSpans } from './html'

export const DEFAULT_MAX_PREVIEWS = 3

export interface ExtractPreviewUrlsOptions {
  /** Same-origin (in-app) links are skipped when given, e.g. `window.location.origin`. */
  origin?: string
  /** Maximum number of URLs returned (default 3). */
  max?: number
}

const TRAILING_PUNCTUATION = '.,;:!?\'"'
const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

function count(haystack: string, ch: string): number {
  let n = 0
  for (let i = 0; i < haystack.length; i++) if (haystack.charAt(i) === ch) n++
  return n
}

/**
 * Trim sentence punctuation from the end of a bare URL. A closing bracket is
 * kept when it balances an opening one inside the URL, so
 * `https://en.wikipedia.org/wiki/Foo_(bar)` survives but `(see https://x.io)` loses the `)`.
 */
export function trimTrailingPunctuation(url: string): string {
  let s = url
  for (;;) {
    const last = s.charAt(s.length - 1)
    if (!last) return s
    if (TRAILING_PUNCTUATION.indexOf(last) !== -1) {
      s = s.slice(0, -1)
      continue
    }
    const opener = CLOSERS[last]
    if (opener && count(s, opener) < count(s, last)) {
      s = s.slice(0, -1)
      continue
    }
    return s
  }
}

function normalise(candidate: string, origin: string | undefined): URL | null {
  const trimmed = candidate.trim()
  if (!/^https?:\/\//i.test(trimmed)) return null
  let u: URL
  try {
    u = new URL(trimmed)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (!u.hostname) return null
  if (origin && u.origin === origin) return null
  return u
}

/**
 * Up to `max` distinct `http(s)` URLs from `<a href>` attributes and bare URLs
 * in text, in document order. Mentions, `mailto:`/other schemes and
 * same-origin links are skipped; URLs differing only by `#fragment` count once.
 */
export function extractPreviewUrls(html: string, opts: ExtractPreviewUrlsOptions = {}): string[] {
  const max = opts.max ?? DEFAULT_MAX_PREVIEWS
  if (!html || max <= 0) return []
  let origin: string | undefined
  if (opts.origin) {
    try {
      origin = new URL(opts.origin).origin
    } catch {
      origin = undefined
    }
  }

  const source = stripMentionSpans(html)
  const seen: Record<string, true> = {}
  const out: string[] = []

  const add = (candidate: string) => {
    if (out.length >= max) return
    const u = normalise(candidate, origin)
    if (!u) return
    const key = u.href.replace(/#.*$/, '')
    if (seen[key]) return
    seen[key] = true
    out.push(u.href)
  }

  // Walk anchors, other tags and text runs in document order.
  const tokenRe = new RegExp(`<a\\b${ATTRS_PATTERN}>|<[^>]*>|([^<]+)`, 'gi')
  const bareUrlRe = /https?:\/\/[^\s<>"'`]+/gi
  let m: RegExpExecArray | null
  while ((m = tokenRe.exec(source)) !== null && out.length < max) {
    if (m[1] !== undefined) {
      const href = parseAttributes(m[1])['href']
      if (href) add(href)
    } else if (m[2] !== undefined) {
      const text = decodeEntities(m[2])
      let u: RegExpExecArray | null
      bareUrlRe.lastIndex = 0
      while ((u = bareUrlRe.exec(text)) !== null && out.length < max) add(trimTrailingPunctuation(u[0]))
    }
  }
  return out
}
