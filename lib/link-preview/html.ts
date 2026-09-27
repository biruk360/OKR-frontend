/**
 * Tiny, dependency-free HTML helpers shared by `parse.ts` (server) and
 * `extract.ts` (client). Pure \u2014 no Node imports.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  hellip: '\u2026', mdash: '\u2014', ndash: '\u2013', minus: '\u2212',
  lsquo: '\u2018', rsquo: '\u2019', sbquo: '\u201a', ldquo: '\u201c', rdquo: '\u201d', bdquo: '\u201e',
  laquo: '\u00ab', raquo: '\u00bb', lsaquo: '\u2039', rsaquo: '\u203a',
  middot: '\u00b7', bull: '\u2022', copy: '\u00a9', reg: '\u00ae', trade: '\u2122',
  euro: '\u20ac', pound: '\u00a3', yen: '\u00a5', cent: '\u00a2', deg: '\u00b0',
  times: '\u00d7', divide: '\u00f7', para: '\u00b6', sect: '\u00a7', dagger: '\u2020',
  iexcl: '\u00a1', iquest: '\u00bf', shy: '\u00ad', zwj: '\u200d', zwnj: '\u200c',
  ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009',
  aacute: '\u00e1', eacute: '\u00e9', iacute: '\u00ed', oacute: '\u00f3', uacute: '\u00fa',
  Aacute: '\u00c1', Eacute: '\u00c9', Iacute: '\u00cd', Oacute: '\u00d3', Uacute: '\u00da',
  agrave: '\u00e0', egrave: '\u00e8', igrave: '\u00ec', ograve: '\u00f2', ugrave: '\u00f9',
  acirc: '\u00e2', ecirc: '\u00ea', icirc: '\u00ee', ocirc: '\u00f4', ucirc: '\u00fb',
  auml: '\u00e4', euml: '\u00eb', iuml: '\u00ef', ouml: '\u00f6', uuml: '\u00fc',
  Auml: '\u00c4', Ouml: '\u00d6', Uuml: '\u00dc', szlig: '\u00df',
  atilde: '\u00e3', otilde: '\u00f5', ntilde: '\u00f1', Ntilde: '\u00d1',
  ccedil: '\u00e7', Ccedil: '\u00c7', aring: '\u00e5', Aring: '\u00c5',
  aelig: '\u00e6', oslash: '\u00f8',
}

function codePointToString(cp: number): string {
  if (!isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '\ufffd'
  return String.fromCodePoint(cp)
}

/** Decode common named entities plus all numeric (`&#39;`, `&#x27;`) references. */
export function decodeEntities(input: string): string {
  if (input.indexOf('&') === -1) return input
  return input.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, body: string) => {
    if (body.charAt(0) === '#') {
      const hex = body.charAt(1) === 'x' || body.charAt(1) === 'X'
      return codePointToString(parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10))
    }
    const named = NAMED_ENTITIES[body]
    if (named !== undefined) return named
    // `&AMP;` / `&LT;` etc. are valid upper-case aliases of the basic five.
    if (/^(amp|lt|gt|quot)$/i.test(body)) return NAMED_ENTITIES[body.toLowerCase()]
    return match
  })
}

/** Attribute-order-independent tag attribute parser. Names are lower-cased; first occurrence wins; values are entity-decoded. */
export function parseAttributes(attrs: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrs)) !== null) {
    const name = m[1].toLowerCase()
    if (Object.prototype.hasOwnProperty.call(out, name)) continue
    const raw = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : ''
    out[name] = decodeEntities(raw)
  }
  return out
}

/** Matches an opening tag's attribute section, tolerating `>` inside quoted values. */
export const ATTRS_PATTERN = `((?:[^>"']|"[^"]*"|'[^']*')*)`

/**
 * Remove `<span class="mention" \u2026>\u2026</span>` (TipTap mention markup) so a
 * mention is never treated as link content. Walks opening tags so a mention
 * nested inside another span is still found.
 */
export function stripMentionSpans(html: string): string {
  if (html.indexOf('mention') === -1) return html
  const open = new RegExp(`<span\\b${ATTRS_PATTERN}>`, 'gi')
  let out = ''
  let cursor = 0
  let m: RegExpExecArray | null
  while ((m = open.exec(html)) !== null) {
    const cls = parseAttributes(m[1])['class'] || ''
    if (!/(^|\s)mention(\s|$)/.test(cls)) continue
    const closeRe = /<\/span\s*>/gi
    closeRe.lastIndex = open.lastIndex
    const close = closeRe.exec(html)
    const end = close ? close.index + close[0].length : html.length
    out += html.slice(cursor, m.index) + ' '
    cursor = end
    open.lastIndex = end
  }
  return out + html.slice(cursor)
}
