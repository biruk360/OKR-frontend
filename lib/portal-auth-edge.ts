export const PORTAL_SESSION_COOKIE = process.env.NODE_ENV === 'production'
  ? '__Secure-portal-next-auth.session-token'
  : 'portal-next-auth.session-token'

export const INTERNAL_SESSION_COOKIES = [
  process.env.NODE_ENV === 'production' ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
]

export function shouldBlockDashboardForPortalOnly(input: {
  pathname: string
  hasPortalSessionCookie: boolean
  hasInternalSessionCookie: boolean
}): boolean {
  return input.pathname.startsWith('/dashboard') && input.hasPortalSessionCookie && !input.hasInternalSessionCookie
}
