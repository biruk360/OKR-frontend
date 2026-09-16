/**
 * A browser can end up requesting chunk hashes that no longer exist, leaving a
 * blank or broken UI. Two causes, one recovery:
 *
 *   - dev: webpack HMR rotates chunk names between edits.
 *   - prod: every deploy rebuilds with new hashes, so a tab opened before the
 *     deploy asks for files that are gone.
 *
 * This used to run in development only (hence its old `dev-` name), so in
 * production the user just saw "Loading chunk N failed" with no way out but a
 * manual hard reload. It now runs in both.
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
export function isStaleChunkRejection(reason: unknown): boolean {
  if (reason instanceof Error && reason.name === 'ChunkLoadError') return true
  const m = chunkFailureMessage(reason)
  return (
    /Loading chunk [\w-]+ failed/i.test(m) ||
    /Loading CSS chunk [\w-]+ failed/i.test(m) ||
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

export function reloadOnceForStaleChunks(): void {
  if (typeof window === 'undefined') return
  try {
    if (sessionStorage.getItem(STORAGE_KEY)) return
    sessionStorage.setItem(STORAGE_KEY, '1')
    window.location.reload()
  } catch {
    /* sessionStorage unavailable */
  }
}

/** After a healthy load, allow another auto-reload on the next stale chunk
 *  (same tab across a later deploy, or a long dev session). */
export function clearStaleChunkReloadGuard(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
