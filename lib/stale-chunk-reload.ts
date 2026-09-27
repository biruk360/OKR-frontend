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

/**
 * Messages webpack / the browser produce when a chunk 404s or is stale. One
 * list, shared by the React-side detector below and the pre-hydration boot
 * script (STALE_CHUNK_BOOT_SCRIPT), so the two can never disagree.
 */
export const STALE_CHUNK_MESSAGE_PATTERNS: readonly RegExp[] = [
  /Loading chunk [\w/.-]+ failed/i,
  /Loading CSS chunk [\w/.-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
]

/** Promise rejections from webpack / dynamic import when a chunk 404s or is stale. */
export function isStaleChunkRejection(reason: unknown): boolean {
  if (reason instanceof Error && reason.name === 'ChunkLoadError') return true
  const m = chunkFailureMessage(reason)
  return STALE_CHUNK_MESSAGE_PATTERNS.some((re) => re.test(m))
}

/** Script tags injected for async chunks fire `error` on failed load (often missed by ChunkLoadError-only handlers). */
export function isNextChunkScriptError(event: ErrorEvent): boolean {
  const t = event.target
  if (!(t instanceof HTMLScriptElement) || typeof t.src !== 'string') return false
  return t.src.includes('/_next/static/') || t.src.includes('_next%2Fstatic')
}

/** Injectable for tests; the browser defaults are sessionStorage + location.reload(). */
export interface StaleChunkReloadDeps {
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  reload?: () => void
}

/**
 * Hard-reload at most once per tab until clearStaleChunkReloadGuard() re-arms
 * it (Providers does, 3s after a healthy render). Returns whether a reload was
 * triggered. If sessionStorage is unavailable the guard cannot be recorded, so
 * it does NOT reload — a reload loop is worse than a stuck error screen.
 */
export function reloadOnceForStaleChunks(deps: StaleChunkReloadDeps = {}): boolean {
  if (!deps.storage && typeof window === 'undefined') return false
  try {
    const storage = deps.storage ?? window.sessionStorage
    if (storage.getItem(STORAGE_KEY)) return false
    storage.setItem(STORAGE_KEY, '1')
  } catch {
    /* sessionStorage unavailable */
    return false
  }
  try {
    if (deps.reload) deps.reload()
    else window.location.reload()
  } catch {
    /* ignore */
  }
  return true
}

/**
 * Inline <script> for the root layout (runs before any Next chunk executes).
 *
 * The React-side listeners in app/providers.tsx are installed in a useEffect,
 * i.e. only AFTER hydration. If the page's own chunks 404 — an HTML response
 * rendered by the old build during a deploy swap, or a tab restored from
 * cache — hydration never happens, those listeners never exist, and the user
 * is left on server-rendered HTML whose forms do nothing. This script listens
 * from the first byte and applies the same one-shot sessionStorage guard.
 */
export const STALE_CHUNK_BOOT_SCRIPT = `(function(){try{var K=${JSON.stringify(STORAGE_KEY)};var P=[${STALE_CHUNK_MESSAGE_PATTERNS.map(
  (re) => `new RegExp(${JSON.stringify(re.source)},${JSON.stringify(re.flags)})`
).join(',')}];function r(){try{if(sessionStorage.getItem(K))return;sessionStorage.setItem(K,'1');location.reload()}catch(e){}}function m(x){try{if(x&&x.name==='ChunkLoadError')return true;var s=x&&x.message?String(x.name)+': '+x.message:String(x);for(var i=0;i<P.length;i++){if(P[i].test(s))return true}}catch(e){}return false}window.addEventListener('error',function(e){var t=e&&e.target;if(t&&t.tagName==='SCRIPT'&&typeof t.src==='string'&&(t.src.indexOf('/_next/static/')!==-1||t.src.indexOf('_next%2Fstatic')!==-1)){r();return}if(e&&e.error&&m(e.error))r()},true);window.addEventListener('unhandledrejection',function(e){if(e&&m(e.reason))r()})}catch(e){}})();`

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
