/**
 * Letter HTML security primitives — pure, dependency-free, unit-tested in
 * lib/letters-security.test.ts.
 *
 *   - sanitizeLetterBodyHtml  strict allowlist sanitizer for the stored letter
 *                             body (mammoth/Tiptap output). Rebuilds the markup
 *                             from scratch: only allowlisted tags/attributes are
 *                             emitted, text is re-escaped, no event handlers, no
 *                             javascript:/vbscript:/data: URLs (except inline
 *                             raster images), no iframe/object/embed/link/meta/
 *                             base/form/svg/script/style.
 *   - resolveLetterFont       allowlists the `?font=` query value against the
 *                             fixed family catalog so it can never reach the
 *                             <style> block as free text.
 *   - isAllowedPdfRequestUrl  the Puppeteer network allowlist (SSRF guard).
 *
 * Why hand-rolled instead of DOMPurify: DOMPurify needs a DOM, and the only DOM
 * available server-side (jsdom) is a transitive dependency of superdoc, not a
 * direct one. Because this sanitizer re-serializes everything it emits (tag
 * names come from the allowlist, attribute values and text are escaped), a
 * tokenizer/browser parse differential can at worst turn markup into visible
 * text — it cannot produce a tag or attribute we did not choose.
 */

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

const ESC: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}

export function escapeHtml(s: string | null | undefined): string {
  if (!s) return ''
  return String(s).replace(/[&<>"']/g, (c) => ESC[c])
}

/** Text-node escaping that keeps well-formed character references intact. */
function escapeText(s: string): string {
  return s
    .replace(/&(?!(?:#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  colon: ':', tab: '\t', newline: '\n', sol: '/', lpar: '(', rpar: ')',
  period: '.', comma: ',', semi: ';', num: '#', percnt: '%', excl: '!',
}

/**
 * Decode character references in an attribute value the way a browser would
 * before interpreting it (so `jav&#x61;script:` is caught). Unknown named
 * references are left as literal text — the output escaper then turns their
 * `&` into `&amp;`, so they can never decode to anything later.
 */
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (match, ref: string) => {
    if (ref[0] === '#') {
      const cp = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return '�'
      try { return String.fromCodePoint(cp) } catch { return '�' }
    }
    const named = NAMED_ENTITIES[ref.toLowerCase()]
    return named ?? match
  })
}

// ---------------------------------------------------------------------------
// Allowlists
// ---------------------------------------------------------------------------

const ALLOWED_TAGS = new Set([
  'p', 'br', 'span', 'div', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins',
  'sub', 'sup', 'small', 'mark', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'a', 'img', 'hr',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'figure', 'figcaption',
])

const VOID_TAGS = new Set(['br', 'img', 'hr', 'col'])

/**
 * Elements whose whole subtree is discarded. The raw-text ones are scanned to
 * their literal end tag (that is how the browser tokenizes them); the others
 * are depth-tracked.
 */
const RAW_TEXT_DROP = new Set([
  'script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext',
])
const SUBTREE_DROP = new Set([
  'object', 'embed', 'applet', 'svg', 'math', 'template', 'select', 'frameset', 'frame', 'head',
])

const GLOBAL_ATTRS = new Set(['class', 'style', 'dir', 'lang', 'title', 'align', 'id'])
const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'name']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan', 'width', 'valign', 'scope']),
  th: new Set(['colspan', 'rowspan', 'width', 'valign', 'scope']),
  col: new Set(['span', 'width']),
  colgroup: new Set(['span', 'width']),
  ol: new Set(['start', 'type']),
  li: new Set(['value']),
  table: new Set(['border', 'cellpadding', 'cellspacing', 'width']),
}

const NUMERIC_ATTRS = new Set([
  'colspan', 'rowspan', 'span', 'start', 'value', 'border', 'cellpadding', 'cellspacing',
])

// ---------------------------------------------------------------------------
// URL + CSS policies
// ---------------------------------------------------------------------------

const SAFE_LINK_SCHEMES = new Set(['http', 'https', 'mailto', 'tel'])
const SAFE_IMG_SCHEMES = new Set(['http', 'https'])
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=]+$/i

/** Returns the normalised URL if allowed, else null. `value` is already entity-decoded. */
export function sanitizeUrl(value: string, kind: 'link' | 'img'): string | null {
  // Browsers strip leading/trailing C0 controls + space and drop tab/newline
  // anywhere in a URL before reading the scheme — do the same, then refuse any
  // other control character outright.
  // eslint-disable-next-line no-control-regex
  const url = value.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '').replace(/[\t\n\r]/g, '')
  if (!url) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(url)) return null

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)
  if (!scheme) {
    // Relative / fragment / protocol-relative. Reject a backslash-led
    // authority (`/\evil`), which some browsers treat as `//evil`.
    if (url.includes('\\')) return null
    return url
  }
  const s = scheme[1].toLowerCase()
  if (kind === 'img') {
    if (s === 'data') return SAFE_DATA_IMAGE.test(url.replace(/\s+/g, '')) ? url.replace(/\s+/g, '') : null
    return SAFE_IMG_SCHEMES.has(s) ? url : null
  }
  return SAFE_LINK_SCHEMES.has(s) ? url : null
}

const CSS_FORBIDDEN = /(?:url\s*\(|expression\s*\(|image-set\s*\(|image\s*\(|element\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding|@import|\\|\/\*|[<>{}])/i

/** Keeps only `property: value` declarations that cannot fetch or execute anything. */
export function sanitizeStyle(value: string): string {
  const decoded = decodeEntities(value)
  const out: string[] = []
  for (const decl of decoded.split(';')) {
    const idx = decl.indexOf(':')
    if (idx <= 0) continue
    const prop = decl.slice(0, idx).trim().toLowerCase()
    const val = decl.slice(idx + 1).trim()
    if (!/^-?[a-z][a-z-]*$/.test(prop)) continue
    if (!val || val.length > 500 || CSS_FORBIDDEN.test(val) || CSS_FORBIDDEN.test(prop)) continue
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f]/.test(val)) continue
    out.push(`${prop}:${val}`)
  }
  return out.join('; ')
}

// ---------------------------------------------------------------------------
// Tokenizer + rebuild
// ---------------------------------------------------------------------------

interface ParsedTag {
  name: string
  attrs: Array<[string, string]>
  end: number // index just after the closing '>'
  selfClosing: boolean
}

// Sticky regexes (built via the constructor — the tsconfig target predates the
// `y` literal flag) so the tokenizer never slices a potentially multi-MB body.
const TAG_NAME_RE = new RegExp('[a-zA-Z][^\\s/>]*', 'y')
const ATTR_NAME_RE = new RegExp('[^\\s/>=]+', 'y')
const UNQUOTED_VALUE_RE = new RegExp('[^\\s>]*', 'y')
const WS = /\s/

function parseTag(html: string, start: number, isEnd: boolean): ParsedTag | null {
  // `start` points at the first char of the tag name.
  TAG_NAME_RE.lastIndex = start
  const nameMatch = TAG_NAME_RE.exec(html)
  if (!nameMatch) return null
  const name = nameMatch[0].toLowerCase()
  let i = start + nameMatch[0].length
  const attrs: Array<[string, string]> = []
  let selfClosing = false
  const n = html.length

  while (i < n) {
    const c = html[i]
    if (c === '>') return { name, attrs, end: i + 1, selfClosing }
    if (c === '/') {
      if (html[i + 1] === '>') selfClosing = true
      i++
      continue
    }
    if (WS.test(c)) { i++; continue }
    ATTR_NAME_RE.lastIndex = i
    const an = ATTR_NAME_RE.exec(html)
    if (!an) { i++; continue }
    const attrName = an[0].toLowerCase()
    i += an[0].length
    while (i < n && WS.test(html[i])) i++
    let attrValue = ''
    if (html[i] === '=') {
      i++
      while (i < n && WS.test(html[i])) i++
      const q = html[i]
      if (q === '"' || q === "'") {
        const close = html.indexOf(q, i + 1)
        if (close === -1) return null // unterminated — drop the rest
        attrValue = html.slice(i + 1, close)
        i = close + 1
      } else {
        UNQUOTED_VALUE_RE.lastIndex = i
        const uq = UNQUOTED_VALUE_RE.exec(html)
        attrValue = uq ? uq[0] : ''
        i += attrValue.length
      }
    }
    if (!isEnd) attrs.push([attrName, attrValue])
  }
  return null // no closing '>' — the browser would swallow the rest too
}

function buildAttrs(tag: string, attrs: Array<[string, string]>): string {
  const allowedForTag = TAG_ATTRS[tag]
  const seen = new Set<string>()
  let out = ''
  for (const [name, rawValue] of attrs) {
    if (seen.has(name)) continue
    if (!GLOBAL_ATTRS.has(name) && !allowedForTag?.has(name)) continue
    seen.add(name)
    let value: string | null = decodeEntities(rawValue)
    if (name === 'href') value = sanitizeUrl(value, 'link')
    else if (name === 'src') value = sanitizeUrl(value, 'img')
    else if (name === 'style') value = sanitizeStyle(rawValue) || null
    else if (NUMERIC_ATTRS.has(name)) value = /^\d{1,4}$/.test(value.trim()) ? value.trim() : null
    else if (name === 'width' || name === 'height') value = /^\d{1,5}(?:\.\d+)?(?:px|%)?$/.test(value.trim()) ? value.trim() : null
    else if (name === 'id' || name === 'name') value = /^[A-Za-z0-9_\-:.]{1,128}$/.test(value) ? value : null
    else if (name === 'dir') value = /^(?:ltr|rtl|auto)$/i.test(value) ? value.toLowerCase() : null
    if (value === null) continue
    out += ` ${name}="${escapeHtml(value)}"`
  }
  return out
}

/**
 * Strict allowlist sanitizer for letter bodies. Output is always well-formed:
 * every emitted open tag is closed, stray closers are dropped.
 */
export function sanitizeLetterBodyHtml(html: string | null | undefined): string {
  if (!html) return ''
  const src = String(html)
  const n = src.length
  const out: string[] = []
  const stack: string[] = []
  let dropDepth = 0 // >0 while inside a SUBTREE_DROP element
  const dropStack: string[] = []
  let i = 0

  const emitText = (text: string) => {
    if (dropDepth === 0 && text) out.push(escapeText(text))
  }

  while (i < n) {
    const lt = src.indexOf('<', i)
    if (lt === -1) { emitText(src.slice(i)); break }
    emitText(src.slice(i, lt))
    i = lt

    // Comments
    if (src.startsWith('<!--', i)) {
      const close = src.indexOf('-->', i + 4)
      i = close === -1 ? n : close + 3
      continue
    }
    // Doctype / CDATA / processing instructions / bogus comments
    if (src[i + 1] === '!' || src[i + 1] === '?') {
      const close = src.indexOf('>', i + 2)
      i = close === -1 ? n : close + 1
      continue
    }

    const isEnd = src[i + 1] === '/'
    const nameStart = i + (isEnd ? 2 : 1)
    if (!/[a-zA-Z]/.test(src[nameStart] ?? '')) {
      if (isEnd) {
        // `</` + non-letter is a bogus comment in the HTML tokenizer.
        const close = src.indexOf('>', nameStart)
        i = close === -1 ? n : close + 1
      } else {
        emitText('<')
        i++
      }
      continue
    }

    const tag = parseTag(src, nameStart, isEnd)
    if (!tag) break // unterminated tag: discard the remainder
    i = tag.end
    const name = tag.name

    if (!isEnd && RAW_TEXT_DROP.has(name)) {
      if (name === 'plaintext') break
      const closeRe = new RegExp(`</${name}[\\s/>]`, 'gi')
      closeRe.lastIndex = i
      const m = closeRe.exec(src)
      if (!m) break
      const after = src.indexOf('>', m.index)
      i = after === -1 ? n : after + 1
      continue
    }

    if (SUBTREE_DROP.has(name)) {
      if (!isEnd && !tag.selfClosing) { dropDepth++; dropStack.push(name) }
      else if (isEnd) {
        const idx = dropStack.lastIndexOf(name)
        if (idx !== -1) { dropStack.length = idx; dropDepth = dropStack.length }
      }
      continue
    }
    if (dropDepth > 0) continue
    if (!ALLOWED_TAGS.has(name)) continue // unwrap: keep children, drop the tag

    if (isEnd) {
      if (VOID_TAGS.has(name)) continue
      const idx = stack.lastIndexOf(name)
      if (idx === -1) continue // stray closer
      while (stack.length > idx) out.push(`</${stack.pop()}>`)
      continue
    }

    out.push(`<${name}${buildAttrs(name, tag.attrs)}>`)
    if (!VOID_TAGS.has(name) && !tag.selfClosing) stack.push(name)
    else if (!VOID_TAGS.has(name)) out.push(`</${name}>`)
  }

  while (stack.length > 0) out.push(`</${stack.pop()}>`)
  return out.join('')
}

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

/**
 * The only font families a letter may be rendered in. Mirrors LETTER_FONTS in
 * features/letters/i18n.ts; each maps to its Google Fonts stylesheet.
 */
export const LETTER_FONT_IMPORTS: Readonly<Record<string, string>> = Object.freeze({
  'Noto Sans Ethiopic':  'https://fonts.googleapis.com/css2?family=Noto+Sans+Ethiopic:wdth,wght@75..125,100..900&display=swap',
  'Noto Serif Ethiopic': 'https://fonts.googleapis.com/css2?family=Noto+Serif+Ethiopic:wdth,wght@75..125,100..900&display=swap',
  'Roboto':              'https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,300;0,400;0,500;0,700;1,300;1,400&display=swap',
  'Roboto Condensed':    'https://fonts.googleapis.com/css2?family=Roboto+Condensed:ital,wght@0,300;0,400;0,700;1,300;1,400&display=swap',
  'Roboto Slab':         'https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@300;400;500;700&display=swap',
  'Inter':               'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'Open Sans':           'https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,600;0,700;1,400&display=swap',
  'Lato':                'https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,300;0,400;0,700;1,300;1,400&display=swap',
  'Merriweather':        'https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;1,300;1,400&display=swap',
  'Playfair Display':    'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap',
})

export const DEFAULT_LETTER_FONT_FAMILY = 'Noto Sans Ethiopic'

/** Any value outside the catalog (including injection attempts) → the default family. */
export function resolveLetterFont(input: unknown): string {
  if (typeof input !== 'string') return DEFAULT_LETTER_FONT_FAMILY
  return Object.prototype.hasOwnProperty.call(LETTER_FONT_IMPORTS, input) ? input : DEFAULT_LETTER_FONT_FAMILY
}

// ---------------------------------------------------------------------------
// Puppeteer network policy
// ---------------------------------------------------------------------------

/** Hosts the letter template may load stylesheets/fonts from during PDF rendering. */
const PDF_ALLOWED_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com'])

/**
 * Every asset the letter needs (fonts, logos) is inlined as a data: URI, so
 * the headless browser must not reach the app, the LAN, or cloud metadata.
 * Only data:/about:/blob: and HTTPS to the Google Fonts hosts are allowed.
 */
export function isAllowedPdfRequestUrl(raw: string): boolean {
  if (raw.startsWith('data:') || raw === 'about:blank' || raw.startsWith('about:') || raw.startsWith('blob:')) {
    return true
  }
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && !u.username && !u.password && (u.port === '' || u.port === '443')
      && PDF_ALLOWED_HOSTS.has(u.hostname.toLowerCase())
  } catch {
    return false
  }
}
