/**
 * Static `public/` paths that must never be served directly.
 *
 * Edge-safe (no fs / path imports) because middleware.ts uses it.
 *
 * Card attachments used to be written to `public/uploads/todos/`, and project
 * activity attachments to `public/uploads/project-activities/`, both served by
 * Next from the app's own origin with no session check. The UI reads them only
 * through their authenticated routes (GET /api/todos/[id]/attachments/[aid]
 * and GET /api/projects/[id]/activities/[activityId]/attachments/[aid]), so
 * the static paths are closed outright: middleware answers 404 for them,
 * whether or not the legacy files have been migrated yet.
 *
 * Next's public-file handler percent-decodes the path and resolves `.`/`..`
 * segments, but the middleware matcher is tested against the RAW path — so
 * `/uploads/%74odos/x.html`, `/api/../uploads/todos/x.html` and (on a
 * case-insensitive disk) `/Uploads/todos/x.html` were all served while a
 * plain `/uploads/todos/:path*` matcher let them through (verified against
 * `next dev` 14.0.4). This compares the path the way the file handler will
 * see it, and middleware's matcher is kept broad enough to reach it.
 *
 * Spec: docs/attachment_viewer_REQUIREMENTS.md NRG-1, NRG-AC-1;
 *       docs/comment_attachments_REQUIREMENTS.md UPL-7.
 */

/** Every public/ upload root closed to static serving. Lower-case, no trailing slash. */
export const BLOCKED_STATIC_UPLOAD_PREFIXES: readonly string[] = [
  '/uploads/todos',
  '/uploads/project-activities',
]

/** The card root — kept as its own export for existing callers. */
export const BLOCKED_STATIC_UPLOAD_PREFIX = BLOCKED_STATIC_UPLOAD_PREFIXES[0]

/**
 * Decode (repeatedly, so double-encoding cannot hide a segment), turn `\` into
 * `/`, collapse repeated slashes, resolve `.`/`..` and lower-case. Over-
 * normalising only risks a 404 on a path under a blocked root, which is the
 * point; it never makes another path look blocked that would not resolve there.
 */
export function normalizeRequestPath(pathname: string): string {
  let p = pathname
  for (let i = 0; i < 3; i++) {
    let next: string
    try {
      next = decodeURIComponent(p)
    } catch {
      break   // malformed escape — keep what we have
    }
    if (next === p) break
    p = next
  }
  p = p.replace(/\\/g, '/')
  const out: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') { out.pop(); continue }
    out.push(seg)
  }
  return ('/' + out.join('/')).toLowerCase()
}

/** True for any blocked root and anything under it, however the path is spelled. */
export function isBlockedStaticUploadPath(pathname: string): boolean {
  const p = normalizeRequestPath(pathname)
  return BLOCKED_STATIC_UPLOAD_PREFIXES.some((root) => p === root || p.startsWith(root + '/'))
}
