/**
 * Server-safe HTML helpers for the Daily Scrum module.
 *
 * Scrum update fields (`yesterdayDone`, `todayPlan`, `blockers`, `wins`) are
 * generated from plain-text items and MUST be escaped when serialized.
 * `remarks` (and legacy proxy-amend HTML) is authored in the rich-text editor
 * and is reduced to a small tag allow-list with every attribute stripped
 * (except a vetted `href` on links) before it is stored.
 *
 * The client additionally renders every stored HTML field through
 * `components/shared/RichTextContent` (DOMPurify) — this is defence in depth,
 * not a replacement for it. No DOM is required, so this runs in route
 * handlers, cron jobs, and `tsx --test`.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeScrumHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch])
}

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre',
  'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'span',
])
const VOID_TAGS = new Set(['br'])
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|noscript|template|textarea|title|xmp)\b[\s\S]*?<\/\1\s*>/gi
const TAG_PATTERN = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g
const SAFE_HREF = /^(https?:|mailto:|\/(?!\/)|#)/i

/**
 * Reduce user-authored rich text to an inert allow-list. Anything that is not
 * an allow-listed tag is escaped (so it renders as literal text), all
 * attributes are removed, and `<a>` keeps only an http(s)/mailto/relative href.
 */
export function sanitizeScrumRichText(input: string | null | undefined): string {
  if (!input) return ''
  const withoutDangerousBlocks = input.replace(DROP_WITH_CONTENT, '')
  let out = ''
  let lastIndex = 0
  TAG_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TAG_PATTERN.exec(withoutDangerousBlocks)) !== null) {
    out += escapeTextSegment(withoutDangerousBlocks.slice(lastIndex, match.index))
    out += rebuildTag(match[0], match[1] === '/', match[2].toLowerCase(), match[3])
    lastIndex = match.index + match[0].length
  }
  out += escapeTextSegment(withoutDangerousBlocks.slice(lastIndex))
  return out.trim()
}

/** Nullable convenience wrapper for DB writes. */
export function sanitizeScrumRichTextOrNull(input: string | null | undefined): string | null {
  const safe = sanitizeScrumRichText(input)
  return safe ? safe : null
}

function escapeTextSegment(text: string): string {
  // Keep existing entities (`&amp;`) intact; only neutralise markup characters.
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function rebuildTag(raw: string, closing: boolean, tag: string, attrs: string): string {
  if (!ALLOWED_TAGS.has(tag)) return escapeScrumHtml(raw)
  if (closing) return VOID_TAGS.has(tag) ? '' : `</${tag}>`
  if (tag !== 'a') return VOID_TAGS.has(tag) ? `<${tag} />` : `<${tag}>`
  const href = extractHref(attrs)
  return href
    ? `<a href="${escapeScrumHtml(href)}" target="_blank" rel="noopener noreferrer">`
    : '<a>'
}

function extractHref(attrs: string): string | null {
  const m = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/i.exec(attrs)
  if (!m) return null
  const value = (m[1] ?? m[2] ?? m[3] ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
  // Scheme check runs on a copy with any remaining entities and control/space
  // characters removed so `jav&#x09;ascript:` / `java\nscript:` cannot slip by.
  const probe = value.replace(/&#?[0-9a-z]+;?/gi, '').replace(/[\u0000- \u007f]+/g, '')
  return SAFE_HREF.test(probe) && SAFE_HREF.test(value) ? value : null
}
