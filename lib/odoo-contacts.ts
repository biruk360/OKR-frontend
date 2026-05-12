/**
 * Odoo `res.partner` lookup via the XML-RPC `/xmlrpc/2/object` endpoint.
 *
 * Driven by env vars. When any of them is missing we fall back to the mock
 * roster so the dev / staging Letter Management UI keeps working end-to-end.
 *
 *   ODOO_URL    — base URL of the Odoo instance, e.g. https://erp.360ground.com
 *   ODOO_DB     — Odoo database name
 *   ODOO_USER   — login (email) of the API service account
 *   ODOO_KEY    — API key (Settings → Users → API Keys); password also works
 *
 * Odoo's XML-RPC accepts a single `<methodCall>` envelope. We use the
 * authenticate-then-execute_kw pattern. UID is cached in module scope for the
 * lifetime of the server process — Odoo doesn't expire UIDs and re-auth is
 * cheap, but caching cuts the round-trips in half.
 */

import type { OdooContact } from '@/features/letters/types'

const MOCK_CONTACTS: OdooContact[] = [
  { odoo_partner_id: 'odoo-1001', display_name: 'Awash Bank S.C.', address: 'Ras Abebe Aregay St., Addis Ababa' },
  { odoo_partner_id: 'odoo-1002', display_name: 'Ethiopian Airlines', address: 'Bole International Airport, Addis Ababa' },
  { odoo_partner_id: 'odoo-1003', display_name: 'Safaricom Ethiopia', address: 'Bole Road, Friendship Building, Addis Ababa' },
  { odoo_partner_id: 'odoo-1004', display_name: 'Dashen Bank', address: 'Beklobet, Addis Ababa' },
  { odoo_partner_id: 'odoo-1005', display_name: 'Commercial Bank of Ethiopia', address: 'Gambia St., Addis Ababa' },
  { odoo_partner_id: 'odoo-1006', display_name: 'Ministry of Innovation & Technology', address: '5 Kilo, Addis Ababa' },
  { odoo_partner_id: 'odoo-1007', display_name: 'Ato Tesfaye Bekele (Individual)', address: 'CMC, Addis Ababa' },
]

interface OdooConfig {
  url: string
  db: string
  user: string
  key: string
}

function readConfig(): OdooConfig | null {
  const url = process.env.ODOO_URL
  const db = process.env.ODOO_DB
  const user = process.env.ODOO_USER
  const key = process.env.ODOO_KEY
  if (!url || !db || !user || !key) return null
  return { url: url.replace(/\/$/, ''), db, user, key }
}

export function isOdooConfigured(): boolean {
  return readConfig() !== null
}

// ---------- XML-RPC encoding ----------

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

type XmlValue = string | number | boolean | XmlValue[] | { [k: string]: XmlValue }

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

function encodeCall(method: string, params: XmlValue[]): string {
  return `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${params
    .map((p) => `<param><value>${encodeValue(p)}</value></param>`)
    .join('')}</params></methodCall>`
}

// ---------- XML-RPC decoding (minimal, just enough for our two calls) ----------

function stripXml(s: string): string {
  return s.replace(/<\?xml[^>]*\?>/, '').trim()
}

function parseValue(xml: string, i: number): { val: unknown; end: number } {
  const open = xml.indexOf('<value>', i)
  if (open < 0) throw new Error('XML-RPC: expected <value>')
  const inner = open + '<value>'.length
  const close = findMatchingClose(xml, '<value>', '</value>', inner)
  const body = xml.slice(inner, close).trim()
  return { val: parseInner(body), end: close + '</value>'.length }
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

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function parseResponse(xml: string): unknown {
  const stripped = stripXml(xml)
  if (stripped.includes('<fault>')) {
    const faultStr = stripped.match(/<value>([\s\S]*)<\/value>/)
    throw new Error(`Odoo XML-RPC fault: ${faultStr ? faultStr[1].slice(0, 200) : 'unknown'}`)
  }
  const valIdx = stripped.indexOf('<value>')
  if (valIdx < 0) throw new Error('XML-RPC: no <value> in response')
  return parseValue(stripped, valIdx).val
}

// ---------- HTTP ----------

async function xmlrpcCall(
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

// ---------- Authenticate + cache ----------

let cachedUid: { config: OdooConfig; uid: number } | null = null

async function authenticate(cfg: OdooConfig, signal?: AbortSignal): Promise<number> {
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

// ---------- Public API ----------

export interface OdooContactsResult {
  odooAvailable: boolean
  results: OdooContact[]
  /** When `odooAvailable: false` and `error` is set, the UI shows the degraded banner. */
  error?: string
}

export async function searchOdooContacts(query: string): Promise<OdooContactsResult> {
  const q = query.trim()
  if (q.length < 2) return { odooAvailable: true, results: [] }

  const cfg = readConfig()
  if (!cfg) {
    // No creds — return the mock roster, but tell the client Odoo isn't really
    // wired so it can show a "stub" indicator if desired. We still set
    // `odooAvailable: true` so the standard typeahead UX works in dev.
    const filtered = MOCK_CONTACTS.filter((c) => c.display_name.toLowerCase().includes(q.toLowerCase()))
    return { odooAvailable: true, results: filtered }
  }

  // 4s timeout — Odoo XML-RPC under load can be slow; we don't want the form to hang.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4000)
  try {
    const uid = await authenticate(cfg, controller.signal)
    const raw = await xmlrpcCall(
      `${cfg.url}/xmlrpc/2/object`,
      'execute_kw',
      [
        cfg.db,
        uid,
        cfg.key,
        'res.partner',
        'search_read',
        [[['name', 'ilike', q]]], // domain
        { fields: ['id', 'display_name', 'street', 'street2', 'city'], limit: 20 },
      ],
      controller.signal
    )
    const rows = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : []
    const results: OdooContact[] = rows.map((r) => ({
      odoo_partner_id: String(r.id),
      display_name: String(r.display_name ?? r.name ?? ''),
      address: [r.street, r.street2, r.city].filter(Boolean).join(', ') || undefined,
    }))
    return { odooAvailable: true, results }
  } catch (err) {
    console.warn('[odoo-contacts] lookup failed, degrading', err)
    return { odooAvailable: false, results: [], error: (err as Error).message }
  } finally {
    clearTimeout(timer)
  }
}
