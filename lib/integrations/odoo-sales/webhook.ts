/**
 * Odoo sales sync — POST the payload to Odoo's webhook (server only).
 *
 * One retry on a network error or a 5xx. Error messages carry the HTTP status
 * only: never the URL (an Odoo webhook URL is itself a credential), the
 * payload, or the response body (which may echo the payload).
 */
import type { SalesTargetsPayload } from './payload'

export type PushResult = { ok: true; status: number; attempts: number } | { ok: false; error: string; attempts: number }

export interface PushOptions {
  url: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export async function pushSalesTargets(payload: SalesTargetsPayload, opts: PushOptions): Promise<PushResult> {
  const doFetch = opts.fetchImpl ?? fetch
  const body = JSON.stringify(payload)
  let lastError = 'unknown error'
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000)
    try {
      const res = await doFetch(opts.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
        cache: 'no-store',
      })
      const status = res.status
      // Drain without reading it into anything we might log.
      await res.arrayBuffer().catch(() => undefined)
      if (res.ok) return { ok: true, status, attempts: attempt }
      lastError = `Odoo webhook answered HTTP ${status}`
      // 4xx (bad secret, bad payload) will not fix itself on a retry.
      if (status < 500) return { ok: false, error: lastError, attempts: attempt }
    } catch (error) {
      lastError =
        (error as Error)?.name === 'AbortError'
          ? 'Odoo webhook timed out'
          : `Odoo webhook unreachable (${(error as Error)?.name ?? 'Error'})`
    } finally {
      clearTimeout(timer)
    }
  }
  return { ok: false, error: lastError, attempts: 2 }
}
