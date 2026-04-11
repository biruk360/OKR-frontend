/**
 * Webpack dev HMR can leave the browser requesting old chunk hashes → blank/broken UI.
 * Recovery runs only in development (see callers).
 */

const STORAGE_KEY = 'okr_chunk_reload_once'

function chunkFailureMessage(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`
  if (typeof reason === 'string') return reason
  try {
    return String(reason)
  } catch {
    return ''
  }
}

/** Promise rejections from webpack / dynamic import when a chunk 404s or is stale. */
export function isStaleDevChunkRejection(reason: unknown): boolean {
  if (reason instanceof Error && reason.name === 'ChunkLoadError') return true
  const m = chunkFailureMessage(reason)
  return (
    /Loading chunk [\d]+ failed/i.test(m) ||
    /Failed to fetch dynamically imported module/i.test(m) ||
    /Importing a module script failed/i.test(m) ||
    /error loading dynamically imported module/i.test(m)
  )
}

/** Script tags injected for async chunks fire `error` on failed load (often missed by ChunkLoadError-only handlers). */
export function isNextChunkScriptError(event: ErrorEvent): boolean {
  const t = event.target
  if (!(t instanceof HTMLScriptElement) || typeof t.src !== 'string') return false
  return t.src.includes('/_next/static/') || t.src.includes('_next%2Fstatic')
}

export function reloadOnceForStaleDevChunks(): void {
  if (typeof window === 'undefined') return
  try {
    if (sessionStorage.getItem(STORAGE_KEY)) return
    sessionStorage.setItem(STORAGE_KEY, '1')
    window.location.reload()
  } catch {
    /* sessionStorage unavailable */
  }
}

/** After a healthy load, allow another auto-reload on the next stale chunk (same tab / long dev session). */
export function clearStaleChunkReloadGuard(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
