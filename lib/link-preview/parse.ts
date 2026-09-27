/**
 * LPV-6 / LPV-7 — extract preview metadata from a page's HTML.
 *
 * Pure and dependency-free (regex over the document head — no DOM, no
 * cheerio). Output is plain text / absolute `https:` URLs only; nothing here
 * is ever rendered as HTML (LPV-9).
 */
import { ATTRS_PATTERN, decodeEntities, parseAttributes } from './html'
import type { ParsedPreviewMeta } from './types'

export const MAX_TITLE_LENGTH = 200
export const MAX_DESCRIPTION_LENGTH = 300

/** Collapse whitespace, trim, and cap at `max` characters (ellipsis included). */
export function cleanText(value: string | null | undefined, max: number): string | null {
  if (value == null) return null
  const text = decodeEntities(value).replace(/[\s\u00a0\u200b]+/g, ' ').trim()
  if (!text) return null
  if (text.length <= max) return text
  let cut = text.slice(0, max - 1)
  // Don't split a surrogate pair.
  const last = cut.charCodeAt(cut.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1)
  return cut.replace(/\s+$/, '') + '…'
}

/** Resolve `value` against `base`; return it only when it is an absolute `https:` URL (LPV-7). */
export function resolveHttpsUrl(value: string | null | undefined, base: string): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const u = new URL(trimmed, base)
    return u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

export function hostnameToDomain(hostname: string): string {
  return hostname.replace(/^www\./i, '').replace(/\.$/, '')
}

/** Largest dimension declared in a `sizes` attribute; `any` (SVG) counts as very large; missing → 0. */
function iconSize(sizes: string | undefined): number {
  if (!sizes) return 0
  let best = 0
  for (const token of sizes.toLowerCase().split(/\s+/)) {
    if (token === 'any') return 10000
    const m = /^(\d+)x(\d+)$/.exec(token)
    if (m) best = Math.max(best, Number(m[1]), Number(m[2]))
  }
  return best
}

/** Restrict parsing to the head when one is present; drop comments, scripts, styles and templates. */
function headSection(html: string): string {
  let doc = html.replace(/<!--[\s\S]*?-->/g, ' ')
  const end = doc.search(/<\/head\s*>/i)
  if (end !== -1) doc = doc.slice(0, end)
  return doc.replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
}

export function parsePreviewMeta(html: string, finalUrl: string): ParsedPreviewMeta {
  let base: URL
  try {
    base = new URL(finalUrl)
  } catch {
    throw new Error('parsePreviewMeta: finalUrl must be an absolute URL')
  }
  const domain = hostnameToDomain(base.hostname)
  const head = headSection(html || '')

  // First value wins per key (og:image before a later og:image, etc.).
  const meta: Record<string, string> = {}
  let baseHref: string = base.href
  const plainIcons: { href: string; size: number }[] = []
  const appleIcons: { href: string; size: number }[] = []

  const tagRe = new RegExp(`<(meta|link|base)\\b${ATTRS_PATTERN}>`, 'gi')
  const pending: { rel: string[]; href: string; sizes?: string }[] = []
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(head)) !== null) {
    const tag = m[1].toLowerCase()
    const attrs = parseAttributes(m[2])
    if (tag === 'meta') {
      const key = (attrs['property'] || attrs['name'] || attrs['itemprop'] || '').trim().toLowerCase()
      const content = attrs['content']
      if (key && content !== undefined && !Object.prototype.hasOwnProperty.call(meta, key)) meta[key] = content
    } else if (tag === 'base') {
      if (attrs['href'] && baseHref === base.href) {
        try {
          baseHref = new URL(attrs['href'], base.href).href
        } catch {
          /* ignore a malformed <base> */
        }
      }
    } else if (attrs['href']) {
      const rel = (attrs['rel'] || '').toLowerCase().split(/\s+/).filter(Boolean)
      pending.push({ rel, href: attrs['href'], sizes: attrs['sizes'] })
    }
  }

  // Icons resolve against <base href> like every other relative URL in the document.
  for (const link of pending) {
    const href = resolveHttpsUrl(link.href, baseHref)
    if (!href) continue
    if (link.rel.indexOf('icon') !== -1) plainIcons.push({ href, size: iconSize(link.sizes) })
    else if (link.rel.some((r) => r === 'apple-touch-icon' || r === 'apple-touch-icon-precomposed')) {
      appleIcons.push({ href, size: iconSize(link.sizes) })
    }
  }

  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(head)
  const title =
    cleanText(meta['og:title'], MAX_TITLE_LENGTH) ??
    cleanText(meta['twitter:title'], MAX_TITLE_LENGTH) ??
    cleanText(titleMatch ? titleMatch[1] : null, MAX_TITLE_LENGTH)

  const description =
    cleanText(meta['og:description'], MAX_DESCRIPTION_LENGTH) ??
    cleanText(meta['twitter:description'], MAX_DESCRIPTION_LENGTH) ??
    cleanText(meta['description'], MAX_DESCRIPTION_LENGTH)

  let image: string | null = null
  for (const key of ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']) {
    image = resolveHttpsUrl(meta[key], baseHref)
    if (image) break
  }

  const pick = (list: { href: string; size: number }[]) =>
    list.reduce<{ href: string; size: number } | null>((best, cur) => (!best || cur.size > best.size ? cur : best), null)
  const icon = pick(plainIcons) ?? pick(appleIcons)
  const favicon = icon ? icon.href : base.protocol === 'https:' ? `${base.origin}/favicon.ico` : null

  const siteName = cleanText(meta['og:site_name'], MAX_TITLE_LENGTH) ?? domain

  return { domain, siteName, title, description, image, favicon }
}
