import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/apiResponse'
import { handleApiError } from '@/lib/api/handleError'

/**
 * Shared authentication for every `app/api/cron/**` route.
 *
 * The routes are called by the host's crontab (scripts/install-crontab.sh) with
 * `Authorization: Bearer $CRON_SECRET`. Before this helper each route carried
 * its own copy of the check, and half of them skipped it entirely when
 * CRON_SECRET was unset, accepted the secret in a `?key=` query parameter
 * (which lands in nginx access logs and shell history), or compared
 * `'Bearer ' + undefined`. The rules are now in one place:
 *
 *  - **Fail closed.** No CRON_SECRET, or one shorter than MIN_SECRET_LENGTH,
 *    means every cron call is refused with 503 — never "open because unset".
 *  - **Headers only.** `Authorization: Bearer <secret>` or `x-cron-secret:
 *    <secret>`. A `?key=` query parameter is ignored (and warned about once).
 *  - **Constant time.** Both sides are SHA-256 hashed before
 *    `crypto.timingSafeEqual`, so neither the content nor the length of the
 *    secret leaks through response timing.
 */

export const MIN_SECRET_LENGTH = 16

export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; code: 'UNAUTHORIZED' | 'CRON_NOT_CONFIGURED'; message: string }

interface HeaderSource {
  get(name: string): string | null
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

/** Constant-time string equality (length-independent). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b))
}

/** Pull the presented token out of the request headers. Never reads the URL. */
export function presentedCronToken(headers: HeaderSource): string | null {
  const auth = headers.get('authorization')
  if (auth) {
    const match = auth.match(/^Bearer\s+(.+)$/i)
    if (match) {
      const token = match[1].trim()
      if (token) return token
    }
  }
  const header = headers.get('x-cron-secret')?.trim()
  return header ? header : null
}

/**
 * Pure decision function — the unit under test. `secret` is passed in rather
 * than read from the environment so tests do not need to mutate process.env.
 */
export function checkCronAuth(headers: HeaderSource, secret: string | undefined): CronAuthResult {
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    return {
      ok: false,
      status: 503,
      code: 'CRON_NOT_CONFIGURED',
      message: 'Cron endpoints are disabled: CRON_SECRET is not configured',
    }
  }
  const token = presentedCronToken(headers)
  // A literal "undefined"/"null" can never match a configured secret of 16+
  // characters, but reject it explicitly so the intent survives refactors.
  if (!token || token === 'undefined' || token === 'null' || !safeEqual(token, secret)) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' }
  }
  return { ok: true }
}

let loggedMisconfigured = false
let loggedQueryKey = false

/**
 * Verify a cron request. Returns `null` when the caller is authenticated, or
 * the error response (standard envelope) to return otherwise.
 */
export function verifyCronRequest(req: NextRequest | Request): NextResponse | null {
  const result = checkCronAuth(req.headers, process.env.CRON_SECRET)
  if (result.ok) return null

  if (result.code === 'CRON_NOT_CONFIGURED' && !loggedMisconfigured) {
    loggedMisconfigured = true
    console.error(
      `[cron-auth] CRON_SECRET is unset or shorter than ${MIN_SECRET_LENGTH} characters; ` +
        'every /api/cron/* request will be refused with 503 until it is set.',
    )
  }
  if (result.code === 'UNAUTHORIZED') {
    let hasQueryKey = false
    try {
      hasQueryKey = new URL(req.url).searchParams.has('key')
    } catch {
      /* malformed URL — irrelevant to the decision */
    }
    if (hasQueryKey && !loggedQueryKey) {
      loggedQueryKey = true
      console.warn(
        '[cron-auth] a cron request passed the secret as ?key=, which is no longer accepted. ' +
          'Send `Authorization: Bearer $CRON_SECRET` instead (scripts/install-crontab.sh does).',
      )
    }
  }
  return apiError(result.message, { status: result.status, code: result.code })
}

type CronHandler = (req: NextRequest) => Promise<Response> | Response

/**
 * Wrap a cron route handler: authenticate with {@link verifyCronRequest}, then
 * run the handler, turning an uncaught error into the standard 500 envelope.
 *
 * @example
 * export const POST = withCronAuth(async () => apiSuccess(await runJob()))
 * export const GET = POST
 */
export function withCronAuth(handler: CronHandler) {
  return async (req: NextRequest): Promise<Response> => {
    const denied = verifyCronRequest(req)
    if (denied) return denied
    try {
      return await handler(req)
    } catch (error) {
      let path = 'cron'
      try {
        path = new URL(req.url).pathname
      } catch {
        /* keep default */
      }
      return handleApiError(error, `${req.method} ${path}`)
    }
  }
}
