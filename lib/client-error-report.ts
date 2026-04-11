export type ClientErrorReportPayload = {
  source: string
  message: string
  stack?: string
  url?: string
  route?: string
  userAgent?: string
  digest?: string
  extra?: Record<string, unknown>
}

const DEDUP_MS = 4000
let lastKey = ''
let lastAt = 0

function reportingEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return process.env.NEXT_PUBLIC_CLIENT_ERROR_REPORTING !== 'false'
}

/**
 * Sends a structured error record to /api/client-errors (fire-and-forget).
 * Safe to call from the browser only; no-ops on the server.
 */
export function reportClientError(payload: ClientErrorReportPayload): void {
  if (!reportingEnabled()) return

  const route = payload.route
  const key = `${payload.source}:${payload.message}:${route ?? ''}`
  const now = Date.now()
  if (key === lastKey && now - lastAt < DEDUP_MS) return
  lastKey = key
  lastAt = now

  const body = {
    ...payload,
    url: payload.url ?? (typeof window !== 'undefined' ? window.location.href : undefined),
    route:
      payload.route ??
      (typeof window !== 'undefined' ? window.location.pathname : undefined),
    userAgent:
      payload.userAgent ??
      (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
  }

  void fetch('/api/client-errors', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {})
}

export function serializeUnknownError(reason: unknown): { message: string; stack?: string } {
  if (reason instanceof Error) {
    return { message: reason.message || reason.name, stack: reason.stack }
  }
  if (typeof reason === 'string') return { message: reason }
  try {
    return { message: JSON.stringify(reason) }
  } catch {
    return { message: String(reason) }
  }
}
