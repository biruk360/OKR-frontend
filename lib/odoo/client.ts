/**
 * Shared Odoo XML-RPC client.
 *
 * Extracted from lib/odoo-contacts.ts so the Letter Management contact lookup
 * and the AI Automations `odoo.search` tool speak to Odoo through one
 * implementation instead of two copies of a hand-rolled XML-RPC codec.
 *
 * Driven by env vars. When any is missing, `readOdooConfig()` returns null and
 * callers decide how to degrade (the Letters typeahead falls back to a mock
 * roster; an automation step records a REFUSED trace).
 *
 *   ODOO_URL    — base URL, e.g. https://erp.360ground.com
 *   ODOO_DB     — database name
 *   ODOO_USER   — login (email) of the API service account
 *   ODOO_KEY    — API key (Settings → Users → API Keys); password also works
 *
 * Odoo's XML-RPC accepts a single `<methodCall>` envelope. We use the
 * authenticate-then-execute_kw pattern. UID is cached in module scope for the
 * lifetime of the server process — Odoo doesn't expire UIDs and re-auth is
 * cheap, but caching cuts the round-trips in half.
 *
 * **This client is read-only by construction.** `executeKw` refuses any method
 * outside READ_ONLY_METHODS, so no caller — automation or otherwise — can write
 * back to the ERP through it. Writing to Odoo is a separate decision that needs
 * its own review, not something a plan should be able to reach by accident.
 */

export interface OdooConfig {
  url: string
  db: string
  user: string
  key: string
}

export function readOdooConfig(): OdooConfig | null {
  const url = process.env.ODOO_URL
  const db = process.env.ODOO_DB
  const user = process.env.ODOO_USER
  const key = process.env.ODOO_KEY
  if (!url || !db || !user || !key) return null
  return { url: url.replace(/\/$/, ''), db, user, key }
}

export function isOdooConfigured(): boolean {
  return readOdooConfig() !== null
}

/** Methods this client will issue. Anything else is refused before any I/O. */
export const READ_ONLY_METHODS = [
  'search_read',
  'search',
  'search_count',
  'read',
  'read_group',
  'fields_get',
  'name_search',
  'name_get',
] as const
export type OdooReadMethod = (typeof READ_ONLY_METHODS)[number]

export class OdooWriteRefusedError extends Error {
  readonly code = 'ODOO_WRITE_REFUSED'
  constructor(method: string) {
    super(`Odoo method "${method}" is not permitted — this client is read-only`)
    this.name = 'OdooWriteRefusedError'
  }
}

export class OdooNotConfiguredError extends Error {
  readonly code = 'ODOO_NOT_CONFIGURED'
  constructor() {
    super('Odoo is not configured — set ODOO_URL, ODOO_DB, ODOO_USER and ODOO_KEY')
    this.name = 'OdooNotConfiguredError'
  }
}

export function isReadOnlyMethod(method: string): method is OdooReadMethod {
  return (READ_ONLY_METHODS as readonly string[]).includes(method)
}

// ---------------------------------------------------------------------------
// XML-RPC encoding
// ---------------------------------------------------------------------------

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type XmlValue = string | number | boolean | XmlValue[] | { [k: string]: XmlValue }

function encodeValue(v: XmlValue): string {
  if (typeof v === 'string') return `<string>${xmlEscape(v)}</string>`
  if (typeof v === 'number') {
    return Number.isInteger(v) ? `<int>${v}</int>` : `<double>${v}</double>`
  }
  if (typeof v === 'boolean') return `<boolean>${v ? 1 : 0}</boolean>`
  if (Array.isArray(v)) {
    return `<array><data>${v.map((x) => `<value>${encodeValue(x)}</value>`).join('')}</data></array>`
  }
  if (v && typeof v === 'object') {
    const members = Object.entries(v)
      .map(([k, val]) => `<member><name>${xmlEscape(k)}</name><value>${encodeValue(val)}</value></member>`)
      .join('')
    return `<struct>${members}</struct>`
  }
  throw new Error(`Unsupported XML-RPC value: ${typeof v}`)
}

export function encodeCall(method: string, params: XmlValue[]): string {
  return `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${params
    .map((p) => `<param><value>${encodeValue(p)}</value></param>`)
    .join('')}</params></methodCall>`
}

// ---------------------------------------------------------------------------
// XML-RPC decoding (minimal — just enough for the calls we make)
// ---------------------------------------------------------------------------

function stripXml(s: string): string {
  return s.replace(/<\?xml[^>]*\?>/, '').trim()
}

function findMatchingClose(xml: string, openTag: string, closeTag: string, from: number): number {
  let depth = 1
  let i = from
  while (i < xml.length) {
    const nextOpen = xml.indexOf(openTag, i)
    const nextClose = xml.indexOf(closeTag, i)
    if (nextClose < 0) throw new Error('XML-RPC: unclosed tag')
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth++
      i = nextOpen + openTag.length
    } else {
      depth--
      if (depth === 0) return nextClose
      i = nextClose + closeTag.length
    }
  }
  throw new Error('XML-RPC: unclosed tag')
}

function parseValue(xml: string, i: number): { val: unknown; end: number } {
  const open = xml.indexOf('<value>', i)
  if (open < 0) throw new Error('XML-RPC: expected <value>')
  const inner = open + '<value>'.length
  const close = findMatchingClose(xml, '<value>', '</value>', inner)
  const body = xml.slice(inner, close).trim()
  return { val: parseInner(body), end: close + '</value>'.length }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function parseInner(body: string): unknown {
  // No type tag => plain string per spec.
  if (!body.startsWith('<')) return decodeEntities(body)
  const m = body.match(/^<(\w+)>([\s\S]*)<\/\1>$/)
  if (!m) {
    // self-closing (e.g. <nil/>) or whitespace-only
    if (/<nil\s*\/>/.test(body)) return null
    return null
  }
  const tag = m[1]
  const inner = m[2]
  switch (tag) {
    case 'string': return decodeEntities(inner)
    case 'int':
    case 'i4': return parseInt(inner, 10)
    case 'double': return parseFloat(inner)
    case 'boolean': return inner.trim() === '1'
    case 'nil': return null
    case 'array': {
      const dataMatch = inner.match(/<data>([\s\S]*)<\/data>/)
      if (!dataMatch) return []
      const arr: unknown[] = []
      let i = 0
      while (i < dataMatch[1].length) {
        const next = dataMatch[1].indexOf('<value>', i)
        if (next < 0) break
        const { val, end } = parseValue(dataMatch[1], next)
        arr.push(val)
        i = end
      }
      return arr
    }
    case 'struct': {
      const out: Record<string, unknown> = {}
      const memberRe = /<member>([\s\S]*?)<\/member>/g
      let mm: RegExpExecArray | null
      while ((mm = memberRe.exec(inner)) !== null) {
        const nameMatch = mm[1].match(/<name>([\s\S]*?)<\/name>/)
        if (!nameMatch) continue
        const { val } = parseValue(mm[1], mm[1].indexOf('<value>'))
        out[nameMatch[1]] = val
      }
      return out
    }
    default:
      return inner
  }
}

export function parseResponse(xml: string): unknown {
  const stripped = stripXml(xml)
  if (stripped.includes('<fault>')) {
    const faultStr = stripped.match(/<value>([\s\S]*)<\/value>/)
    throw new Error(`Odoo XML-RPC fault: ${faultStr ? faultStr[1].slice(0, 200) : 'unknown'}`)
  }
  const valIdx = stripped.indexOf('<value>')
  if (valIdx < 0) throw new Error('XML-RPC: no <value> in response')
  return parseValue(stripped, valIdx).val
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export async function xmlrpcCall(
  endpoint: string,
  method: string,
  params: XmlValue[],
  signal?: AbortSignal
): Promise<unknown> {
  const body = encodeCall(method, params)
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'text/xml' },
    body,
    signal,
  })
  if (!res.ok) throw new Error(`Odoo XML-RPC HTTP ${res.status}`)
  const text = await res.text()
  return parseResponse(text)
}

let cachedUid: { config: OdooConfig; uid: number } | null = null

export async function authenticate(cfg: OdooConfig, signal?: AbortSignal): Promise<number> {
  if (
    cachedUid &&
    cachedUid.config.url === cfg.url &&
    cachedUid.config.db === cfg.db &&
    cachedUid.config.user === cfg.user
  ) {
    return cachedUid.uid
  }
  const uid = await xmlrpcCall(
    `${cfg.url}/xmlrpc/2/common`,
    'authenticate',
    [cfg.db, cfg.user, cfg.key, {}],
    signal
  )
  if (typeof uid !== 'number' || uid <= 0) {
    throw new Error('Odoo authentication failed — check ODOO_USER / ODOO_KEY')
  }
  cachedUid = { config: cfg, uid }
  return uid
}

/** Test seam — clears the module-scoped UID cache. */
export function resetOdooUidCache(): void {
  cachedUid = null
}

export interface ExecuteKwOptions {
  timeoutMs?: number
  signal?: AbortSignal
  config?: OdooConfig
}

/**
 * Issue one `execute_kw` against a model. Refuses any non-read method before
 * doing any I/O, so a write can never leave this process even if a caller asks.
 */
export async function executeKw<T = unknown>(
  model: string,
  method: string,
  args: XmlValue[],
  kwargs: Record<string, XmlValue> = {},
  options: ExecuteKwOptions = {}
): Promise<T> {
  if (!isReadOnlyMethod(method)) throw new OdooWriteRefusedError(method)

  const cfg = options.config ?? readOdooConfig()
  if (!cfg) throw new OdooNotConfiguredError()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000)
  const signal = options.signal ?? controller.signal

  try {
    const uid = await authenticate(cfg, signal)
    const raw = await xmlrpcCall(
      `${cfg.url}/xmlrpc/2/object`,
      'execute_kw',
      [cfg.db, uid, cfg.key, model, method, args, kwargs],
      signal
    )
    return raw as T
  } finally {
    clearTimeout(timer)
  }
}
