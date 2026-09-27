/**
 * LPV-5 — SSRF-safe page fetch for link previews. SERVER ONLY.
 *
 * Defences, in order:
 *  1. URL rules (every hop): `http:`/`https:` only, no credentials, default
 *     port only, no `localhost`-style names, IP-literal hosts checked directly.
 *  2. Connect-time DNS check: every request uses a custom `lookup` that
 *     resolves ALL addresses and refuses the connection if ANY is blocked
 *     (`isBlockedAddress`). The socket connects to the address that was
 *     validated, so a DNS-rebinding answer cannot slip in between check and use.
 *  3. Manual redirects (max 3), each re-validated by 1 and 2.
 *  4. One 5 s deadline across all hops; 512 KB decoded-body cap; stop at `</head>`;
 *     only `text/html` / `application/xhtml+xml`; no cookies sent or stored.
 */
import http from 'node:http'
import https from 'node:https'
import dns from 'node:dns'
import net from 'node:net'
import zlib from 'node:zlib'
import type { IncomingMessage } from 'node:http'
import type { Readable } from 'node:stream'
import { isBlockedAddress } from './ip'
import { parsePreviewMeta, hostnameToDomain } from './parse'
import {
  TtlLruCache,
  LINK_PREVIEW_CACHE_MAX,
  LINK_PREVIEW_FAILURE_TTL_MS,
  LINK_PREVIEW_SUCCESS_TTL_MS,
} from './cache'
import type { LinkPreviewData } from './types'

export const LINK_PREVIEW_TIMEOUT_MS = 5000
export const LINK_PREVIEW_MAX_BYTES = 512 * 1024
export const LINK_PREVIEW_MAX_REDIRECTS = 3
export const LINK_PREVIEW_MAX_URL_LENGTH = 2048
export const LINK_PREVIEW_USER_AGENT = 'Mozilla/5.0 (compatible; OKRLinkPreview/1.0)'

export type LinkPreviewErrorCode =
  | 'INVALID_URL' // unparsable / wrong scheme / credentials / port
  | 'BLOCKED' // resolves to or names a forbidden address
  | 'HTTP_STATUS' // non-2xx
  | 'NOT_HTML'
  | 'TOO_MANY_REDIRECTS'
  | 'TIMEOUT'
  | 'NETWORK'

export class LinkPreviewError extends Error {
  constructor(
    public readonly code: LinkPreviewErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'LinkPreviewError'
    Object.setPrototypeOf(this, LinkPreviewError.prototype)
  }
}

const BLOCKED_HOSTNAME = /(^|\.)(localhost|localdomain|local|internal|home\.arpa)$/i

/**
 * Validate a URL against the static rules (no network). Throws
 * `LinkPreviewError` on violation; returns the parsed URL with the fragment
 * removed. Used for the requested URL and every redirect hop.
 */
export function assertPreviewableUrl(input: string | URL): URL {
  let u: URL
  try {
    u = typeof input === 'string' ? new URL(input.trim()) : new URL(input.href)
  } catch {
    throw new LinkPreviewError('INVALID_URL', 'Not a valid URL')
  }
  if (u.href.length > LINK_PREVIEW_MAX_URL_LENGTH) throw new LinkPreviewError('INVALID_URL', 'URL is too long')
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new LinkPreviewError('INVALID_URL', 'Only http and https URLs can be previewed')
  }
  if (u.username || u.password) throw new LinkPreviewError('INVALID_URL', 'URLs with credentials cannot be previewed')
  // WHATWG URL blanks the port when it equals the scheme default, so any
  // remaining port is non-default.
  if (u.port !== '') throw new LinkPreviewError('INVALID_URL', 'Only default ports can be previewed')
  const host = bareHostname(u)
  if (!host) throw new LinkPreviewError('INVALID_URL', 'URL has no host')
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new LinkPreviewError('BLOCKED', 'That address cannot be previewed')
  } else if (BLOCKED_HOSTNAME.test(host.replace(/\.$/, '')) || host.indexOf('.') === -1) {
    // Single-label names only resolve via local search domains — never public.
    throw new LinkPreviewError('BLOCKED', 'That host cannot be previewed')
  }
  u.hash = ''
  return u
}

/** Hostname without IPv6 brackets. */
function bareHostname(u: URL): string {
  const h = u.hostname
  return h.charAt(0) === '[' && h.charAt(h.length - 1) === ']' ? h.slice(1, -1) : h
}

type Resolver = (
  hostname: string,
  callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void,
) => void

const systemResolver: Resolver = (hostname, callback) => {
  dns.lookup(hostname, { all: true, verbatim: true }, callback)
}

/**
 * A `net` `lookup` replacement that resolves every address for the host and
 * fails with `EBLOCKED` if any of them is forbidden. Honours `options.all`
 * (used by Node's happy-eyeballs `autoSelectFamily`) and `options.family`.
 * `resolver` is injectable for tests.
 */
export function createSafeLookup(resolver: Resolver = systemResolver): net.LookupFunction {
  return (hostname, options, callback) => {
    resolver(hostname, (err, addresses) => {
      if (err) return callback(err, '', 0)
      const list = Array.isArray(addresses) ? addresses : []
      if (list.length === 0) {
        const e: NodeJS.ErrnoException = new Error(`No addresses for ${hostname}`)
        e.code = 'ENOTFOUND'
        return callback(e, '', 0)
      }
      if (list.some((a) => isBlockedAddress(a.address))) {
        // Plain Error + `EBLOCKED`; `toPreviewError` maps it to a `BLOCKED` LinkPreviewError.
        const e: NodeJS.ErrnoException = new Error(`${hostname} resolves to a blocked address`)
        e.code = 'EBLOCKED'
        return callback(e, '', 0)
      }
      const family = options && typeof options.family === 'number' ? options.family : 0
      const usable = family === 4 || family === 6 ? list.filter((a) => a.family === family) : list
      if (usable.length === 0) {
        const e: NodeJS.ErrnoException = new Error(`No IPv${family} address for ${hostname}`)
        e.code = 'ENOTFOUND'
        return callback(e, '', 0)
      }
      if (options && options.all) return callback(null, usable)
      return callback(null, usable[0].address, usable[0].family)
    })
  }
}

const safeLookup = createSafeLookup()

const REQUEST_HEADERS: http.OutgoingHttpHeaders = {
  'User-Agent': LINK_PREVIEW_USER_AGENT,
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Encoding': 'gzip, deflate, br',
  'Accept-Language': 'en;q=0.9, *;q=0.5',
}

function requestOnce(u: URL, signal: AbortSignal, lookup: net.LookupFunction): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http
    const req = mod.request(
      u,
      {
        method: 'GET',
        headers: REQUEST_HEADERS,
        lookup,
        agent: false, // no pooled sockets: every hop connects through `lookup`
        signal,
      },
      resolve,
    )
    req.on('error', reject)
    req.end()
  })
}

function decoderFor(res: IncomingMessage): Readable {
  const encoding = String(res.headers['content-encoding'] || '').trim().toLowerCase()
  if (encoding === 'gzip' || encoding === 'x-gzip') return res.pipe(zlib.createGunzip())
  if (encoding === 'deflate') return res.pipe(zlib.createInflate())
  if (encoding === 'br') return res.pipe(zlib.createBrotliDecompress())
  return res
}

/** Read up to `LINK_PREVIEW_MAX_BYTES` decoded bytes, stopping early once `</head` is seen. */
function readHead(res: IncomingMessage, signal: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const stream = decoderFor(res)
    const chunks: Buffer[] = []
    let total = 0
    let tail = ''
    let settled = false
    const finish = (err?: unknown) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      res.destroy()
      if (stream !== res) stream.destroy()
      if (err && total === 0) reject(err)
      else resolve(Buffer.concat(chunks, total))
    }
    const onAbort = () => finish(new LinkPreviewError('TIMEOUT', 'Timed out'))
    signal.addEventListener('abort', onAbort)
    stream.on('data', (chunk: Buffer) => {
      if (settled) return
      const room = LINK_PREVIEW_MAX_BYTES - total
      const piece = chunk.length > room ? chunk.subarray(0, room) : chunk
      chunks.push(piece)
      total += piece.length
      const window = (tail + piece.toString('latin1')).toLowerCase()
      if (window.indexOf('</head') !== -1 || total >= LINK_PREVIEW_MAX_BYTES) return finish()
      tail = window.slice(-6)
    })
    stream.on('end', () => finish())
    // A decode error after some data (e.g. truncated gzip) still yields what we have.
    stream.on('error', (err) => finish(err))
    res.on('error', (err) => finish(err))
  })
}

function contentTypeInfo(header: string | undefined): { mime: string; charset: string | null } {
  const value = String(header || '').toLowerCase()
  const mime = value.split(';')[0].trim()
  const m = /charset\s*=\s*"?([^";\s]+)/.exec(value)
  return { mime, charset: m ? m[1] : null }
}

/** Decode with the declared charset (header, else `<meta charset>`), defaulting to UTF-8. */
export function decodeHtml(body: Buffer, headerCharset: string | null): string {
  let label = headerCharset
  if (!label) {
    const sniff = body.subarray(0, 4096).toString('latin1')
    const m = /<meta\s+[^>]*charset\s*=\s*["']?\s*([a-z0-9_:.-]+)/i.exec(sniff)
    label = m ? m[1] : null
  }
  const normalised = (label || 'utf-8').trim().toLowerCase()
  // Latin-1 labels decode as windows-1252 (the WHATWG Encoding Standard does
  // the same). Decoded by hand: Node's TextDecoder treats these labels as
  // strict ISO-8859-1 and leaves 0x80-0x9F as C1 controls.
  if (['iso-8859-1', 'latin1', 'l1', 'us-ascii', 'ascii', 'windows-1252', 'cp1252'].indexOf(normalised) !== -1) {
    return decodeWindows1252(body)
  }
  try {
    return new TextDecoder(normalised).decode(body)
  } catch {
    return new TextDecoder('utf-8').decode(body)
  }
}

/** windows-1252 code points for bytes 0x80-0x9F (0 = undefined → keep the byte value). */
const CP1252_HIGH = [
  0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0,
  0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178,
]

function decodeWindows1252(body: Buffer): string {
  let out = ''
  const CHUNK = 8192
  for (let start = 0; start < body.length; start += CHUNK) {
    const codes: number[] = []
    const end = Math.min(body.length, start + CHUNK)
    for (let i = start; i < end; i++) {
      const b = body[i]
      codes.push(b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] || b : b)
    }
    out += String.fromCharCode.apply(null, codes)
  }
  return out
}

export interface FetchPreviewHtmlResult {
  html: string
  finalUrl: string
}

export interface FetchPreviewOptions {
  /** Test seam — defaults to the system DNS resolver. */
  lookup?: net.LookupFunction
  timeoutMs?: number
}

/**
 * Fetch the head of an HTML page with every LPV-5 guard applied. Throws
 * `LinkPreviewError` on any refusal or failure.
 */
export async function fetchPreviewHtml(url: string, opts: FetchPreviewOptions = {}): Promise<FetchPreviewHtmlResult> {
  let current = assertPreviewableUrl(url)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? LINK_PREVIEW_TIMEOUT_MS)
  const lookup = opts.lookup ?? safeLookup
  try {
    for (let hop = 0; ; hop++) {
      let res: IncomingMessage
      try {
        res = await requestOnce(current, controller.signal, lookup)
      } catch (err) {
        throw toPreviewError(err, controller.signal)
      }
      const status = res.statusCode || 0

      if (status >= 300 && status < 400 && res.headers.location) {
        res.destroy()
        if (hop >= LINK_PREVIEW_MAX_REDIRECTS) {
          throw new LinkPreviewError('TOO_MANY_REDIRECTS', 'Too many redirects')
        }
        let next: URL
        try {
          next = new URL(res.headers.location, current)
        } catch {
          throw new LinkPreviewError('INVALID_URL', 'Invalid redirect location')
        }
        current = assertPreviewableUrl(next)
        continue
      }
      if (status < 200 || status >= 300) {
        res.destroy()
        throw new LinkPreviewError('HTTP_STATUS', `Upstream responded ${status}`)
      }
      const { mime, charset } = contentTypeInfo(res.headers['content-type'])
      if (mime !== 'text/html' && mime !== 'application/xhtml+xml') {
        res.destroy()
        throw new LinkPreviewError('NOT_HTML', `Not an HTML page (${mime || 'unknown type'})`)
      }
      let body: Buffer
      try {
        body = await readHead(res, controller.signal)
      } catch (err) {
        throw toPreviewError(err, controller.signal)
      }
      return { html: decodeHtml(body, charset), finalUrl: current.href }
    }
  } finally {
    clearTimeout(timer)
    if (!controller.signal.aborted) controller.abort() // tear down anything still open
  }
}

function toPreviewError(err: unknown, signal: AbortSignal): LinkPreviewError {
  if (err instanceof LinkPreviewError) return err
  const e = err as NodeJS.ErrnoException | undefined
  if (e && e.code === 'EBLOCKED') return new LinkPreviewError('BLOCKED', e.message)
  if (signal.aborted || (e && (e.name === 'AbortError' || e.code === 'ABORT_ERR'))) {
    return new LinkPreviewError('TIMEOUT', 'Timed out')
  }
  return new LinkPreviewError('NETWORK', e && e.message ? e.message : 'Network error')
}

// ── Preview assembly + cache ─────────────────────────────────────────────

const cache = new TtlLruCache<LinkPreviewData>(LINK_PREVIEW_CACHE_MAX)

/** Test helper. */
export function clearLinkPreviewCache(): void {
  cache.clear()
}

function fallbackPreview(url: URL): LinkPreviewData {
  const domain = hostnameToDomain(url.hostname)
  return {
    url: url.href,
    finalUrl: url.href,
    domain,
    siteName: domain,
    title: null,
    description: null,
    image: null,
    favicon: null,
    ok: false,
  }
}

async function loadPreview(target: URL): Promise<LinkPreviewData> {
  try {
    const { html, finalUrl } = await fetchPreviewHtml(target.href)
    const meta = parsePreviewMeta(html, finalUrl)
    return {
      url: target.href,
      finalUrl,
      ...meta,
      ok: Boolean(meta.title || meta.description),
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      const code = err instanceof LinkPreviewError ? err.code : 'UNKNOWN'
      console.warn(`[link-preview] ${code} ${target.href}`)
    }
    return fallbackPreview(target)
  }
}

/**
 * Preview for `url` (LPV-4). Throws `LinkPreviewError` (`INVALID_URL` /
 * `BLOCKED`) only for URLs that fail the static rules; every fetch/parse
 * failure resolves to a fallback with `ok: false` (cached for 10 min).
 */
export function getLinkPreview(url: string): Promise<LinkPreviewData> {
  const target = assertPreviewableUrl(url)
  return cache.getOrLoad(
    target.href,
    () => loadPreview(target),
    (value) => (value.ok ? LINK_PREVIEW_SUCCESS_TTL_MS : LINK_PREVIEW_FAILURE_TTL_MS),
  )
}
