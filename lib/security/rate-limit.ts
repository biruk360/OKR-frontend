import { apiError } from '@/lib/api/apiResponse'

/**
 * In-memory sliding-window rate limiter for the public auth endpoints
 * (NextAuth credentials sign-in, /api/auth/login, register, forgot-password,
 * reset-password).
 *
 * Why in-memory is acceptable: production runs a single long-lived PM2 Node
 * process (see lib/background.ts), so one Map sees every request. If the app is
 * ever scaled to several instances or a serverless host, each instance gets its
 * own window and the effective limit multiplies by the instance count — move
 * the store to Redis/Postgres at that point. Counters are also lost on restart,
 * which only ever makes the limiter more lenient, never locks anyone out.
 *
 * Algorithm: sliding log. Each key keeps the timestamps of its hits inside the
 * window; a request is allowed while fewer than `limit` remain. Memory is
 * bounded by pruning on every access plus a periodic sweep of idle keys.
 */

export interface RateLimitRule {
  /** Maximum hits allowed inside `windowMs`. */
  limit: number
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  /** Milliseconds until the oldest hit leaves the window (0 when allowed). */
  retryAfterMs: number
}

const MIN = 60 * 1000

/** Central table so every limit is reviewable in one place. */
export const AUTH_RATE_LIMITS = {
  /** All sign-in attempts from one address (cookie + desktop login). */
  loginIp: { limit: 20, windowMs: 15 * MIN },
  /** Failed sign-in attempts against one account, from anywhere. */
  loginEmailFailures: { limit: 10, windowMs: 15 * MIN },
  registerIp: { limit: 5, windowMs: 60 * MIN },
  forgotIp: { limit: 5, windowMs: 15 * MIN },
  forgotEmail: { limit: 3, windowMs: 60 * MIN },
  resetIp: { limit: 10, windowMs: 15 * MIN },
} as const satisfies Record<string, RateLimitRule>

const store = new Map<string, number[]>()
let lastSweep = 0
const SWEEP_EVERY_MS = 5 * MIN
/** Longest window in use; anything older than this is garbage for every rule. */
const MAX_WINDOW_MS = Math.max(...Object.values(AUTH_RATE_LIMITS).map((r) => r.windowMs))

function sweep(now: number) {
  if (now - lastSweep < SWEEP_EVERY_MS) return
  lastSweep = now
  for (const [key, hits] of store) {
    const last = hits[hits.length - 1]
    if (last === undefined || now - last > MAX_WINDOW_MS) store.delete(key)
  }
}

function live(key: string, rule: RateLimitRule, now: number): number[] {
  const hits = store.get(key)
  if (!hits) return []
  const cutoff = now - rule.windowMs
  let i = 0
  while (i < hits.length && hits[i] <= cutoff) i++
  if (i > 0) hits.splice(0, i)
  if (hits.length === 0) store.delete(key)
  return hits
}

function result(hits: number[], rule: RateLimitRule, now: number, allowed: boolean): RateLimitResult {
  return {
    allowed,
    remaining: Math.max(0, rule.limit - hits.length),
    retryAfterMs: allowed || hits.length === 0 ? 0 : Math.max(0, hits[0] + rule.windowMs - now),
  }
}

/** Record one hit for `key` and report whether it is within the limit. */
export function hitRateLimit(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
  sweep(now)
  const hits = live(key, rule, now)
  if (hits.length >= rule.limit) return result(hits, rule, now, false)
  hits.push(now)
  store.set(key, hits)
  return result(hits, rule, now, true)
}

/** Check `key` without recording a hit (e.g. "is this account locked?"). */
export function peekRateLimit(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
  const hits = live(key, rule, now)
  return result(hits, rule, now, hits.length < rule.limit)
}

/** Test helper — forget every counter. */
export function resetRateLimits(): void {
  store.clear()
  lastSweep = 0
}

type HeaderSource = Headers | Record<string, string | string[] | undefined> | undefined | null

function header(source: HeaderSource, name: string): string | undefined {
  if (!source) return undefined
  if (typeof (source as Headers).get === 'function') return (source as Headers).get(name) ?? undefined
  const rec = source as Record<string, string | string[] | undefined>
  const v = rec[name] ?? rec[name.toLowerCase()]
  return Array.isArray(v) ? v[0] : v
}

/**
 * Best-effort client address: first hop of `x-forwarded-for`, else
 * `x-real-ip`, else "unknown" (all unknown callers share one bucket).
 *
 * Caveat: these headers are only trustworthy when the reverse proxy (nginx on
 * the VPS) overwrites them. If nginx appends to a client-supplied
 * X-Forwarded-For, the first hop is attacker-controlled and the per-IP limit
 * can be sidestepped — the per-email limits are the backstop for that case.
 */
export function clientIp(headers: HeaderSource): string {
  const xff = header(headers, 'x-forwarded-for')
  const first = xff?.split(',')[0]?.trim()
  if (first) return first.slice(0, 64)
  const real = header(headers, 'x-real-ip')?.trim()
  if (real) return real.slice(0, 64)
  return 'unknown'
}

/** Normalise an email for use as a limiter key. */
export function emailKey(email: string): string {
  return email.trim().toLowerCase().slice(0, 320)
}

/** 429 in the standard envelope, with a Retry-After header. */
export function rateLimitedResponse(r: Pick<RateLimitResult, 'retryAfterMs'>) {
  const res = apiError('Too many attempts. Please wait a few minutes and try again.', {
    status: 429,
    code: 'RATE_LIMITED',
  })
  res.headers.set('Retry-After', String(Math.max(1, Math.ceil(r.retryAfterMs / 1000))))
  return res
}
