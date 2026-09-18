/**
 * Where to land after a successful sign-in.
 *
 * Only same-origin `/dashboard` paths are honoured — anything else (a protocol,
 * a host, a protocol-relative `//evil.com`) is discarded, so the callbackUrl
 * cannot be used as an open redirect.
 */
export function safeCallbackUrl(raw: string | null): string {
  if (!raw) return '/dashboard'
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return '/dashboard'
  }
  if (!decoded.startsWith('/dashboard')) return '/dashboard'
  if (decoded.startsWith('//')) return '/dashboard'
  return decoded
}
