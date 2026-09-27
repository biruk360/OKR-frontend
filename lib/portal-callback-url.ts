/**
 * Where a client-portal user lands after signing in.
 *
 * The portal counterpart of `safeCallbackUrl` (features/auth/services/
 * callback-url.ts), which only admits `/dashboard` paths and so cannot be
 * reused as-is: a portal session must never be sent into the dashboard. Only a
 * same-origin path under `/portal` is honoured; anything else — an absolute or
 * protocol-relative URL, `javascript:`, a backslash or control character that a
 * browser may normalise into `//host`, or `/portalevil` — falls back to
 * `/portal`. The page hands the result to `router.push`, which in Next 14.0.x
 * executes a `javascript:` URL, so this check is the XSS guard as well as the
 * open-redirect guard.
 *
 * Pure and dependency-free so the client sign-in page can import it.
 */
export const PORTAL_HOME = '/portal'

export function safePortalCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return PORTAL_HOME
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return PORTAL_HOME
  }
  // Backslashes and control/whitespace characters are rewritten by browsers
  // (`/\evil.com` → `//evil.com`); a legitimate portal path never has them.
  if (/[\\\u0000-\u001f\u007f\s]/.test(decoded)) return PORTAL_HOME
  if (decoded.startsWith('//')) return PORTAL_HOME
  // `/portal` itself, or `/portal` followed by a path, query or fragment —
  // never a longer first segment such as `/portalevil`.
  if (!/^\/portal(?:[/?#]|$)/.test(decoded)) return PORTAL_HOME
  // Resolve `..` segments the way the browser will before trusting the prefix.
  try {
    const resolved = new URL(decoded, 'http://portal.invalid')
    if (resolved.origin !== 'http://portal.invalid') return PORTAL_HOME
    if (!/^\/portal(?:\/|$)/.test(resolved.pathname)) return PORTAL_HOME
    return `${resolved.pathname}${resolved.search}${resolved.hash}`
  } catch {
    return PORTAL_HOME
  }
}
