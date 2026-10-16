import type { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/apiResponse'
import { handleApiError } from '@/lib/api/handleError'
import { safeEqual } from '@/lib/cron-auth'

/**
 * Authentication for machine-to-machine integration routes
 * (`app/api/integrations/**`), modelled on lib/cron-auth.ts:
 *
 *  - **Fail closed.** No INTEGRATION_API_KEY, or one shorter than
 *    MIN_INTEGRATION_KEY_LENGTH, refuses every call with 503.
 *  - **Header only.** `x-integration-key: <key>`. Never the query string (it
 *    would land in access logs and shell history).
 *  - **Constant time.** `safeEqual` hashes both sides before timingSafeEqual.
 *
 * The key is never logged.
 */

export const MIN_INTEGRATION_KEY_LENGTH = 32

export type IntegrationAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; code: 'UNAUTHORIZED' | 'INTEGRATION_NOT_CONFIGURED'; message: string }

interface HeaderSource {
  get(name: string): string | null
}

/** Pure decision function — `key` is passed in so tests need not mutate process.env. */
export function checkIntegrationKey(headers: HeaderSource, key: string | undefined): IntegrationAuthResult {
  if (!key || key.length < MIN_INTEGRATION_KEY_LENGTH) {
    return {
      ok: false,
      status: 503,
      code: 'INTEGRATION_NOT_CONFIGURED',
      message: 'Integration endpoints are disabled: INTEGRATION_API_KEY is not configured',
    }
  }
  const presented = headers.get('x-integration-key')?.trim()
  if (!presented || !safeEqual(presented, key)) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' }
  }
  return { ok: true }
}

let loggedMisconfigured = false

export function verifyIntegrationRequest(req: NextRequest | Request): NextResponse | null {
  const result = checkIntegrationKey(req.headers, process.env.INTEGRATION_API_KEY)
  if (result.ok) return null
  if (result.code === 'INTEGRATION_NOT_CONFIGURED' && !loggedMisconfigured) {
    loggedMisconfigured = true
    console.error(
      `[integration-auth] INTEGRATION_API_KEY is unset or shorter than ${MIN_INTEGRATION_KEY_LENGTH} characters; ` +
        'every /api/integrations/* request will be refused with 503 until it is set.',
    )
  }
  return apiError(result.message, { status: result.status, code: result.code })
}

type IntegrationHandler = (req: NextRequest) => Promise<Response> | Response

/**
 * Wrap an integration route handler: authenticate with the integration key,
 * then run the handler, turning an uncaught error into the standard 500 envelope.
 */
export function withIntegrationKey(handler: IntegrationHandler) {
  return async (req: NextRequest): Promise<Response> => {
    const denied = verifyIntegrationRequest(req)
    if (denied) return denied
    try {
      return await handler(req)
    } catch (error) {
      let path = 'integration'
      try {
        path = new URL(req.url).pathname
      } catch {
        /* keep default */
      }
      return handleApiError(error, `${req.method} ${path}`)
    }
  }
}
