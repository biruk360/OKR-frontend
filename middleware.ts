import { NextRequest, NextResponse } from 'next/server'
import { INTERNAL_SESSION_COOKIES, PORTAL_SESSION_COOKIE, shouldBlockDashboardForPortalOnly } from '@/lib/portal-auth-edge'

/**
 * Phase 4 — mark deprecated SprintActivity routes. Sunset date is 2 weeks
 * from the Phase 4 deploy. The actual table drop is gated behind the
 * preflight.sql cleanup block (operator uncomments after soak).
 */
const DEPRECATION_SUNSET = '2026-05-11'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (shouldBlockDashboardForPortalOnly({
    pathname,
    hasPortalSessionCookie: req.cookies.has(PORTAL_SESSION_COOKIE),
    hasInternalSessionCookie: INTERNAL_SESSION_COOKIES.some((name) => req.cookies.has(name)),
  })) {
    return new NextResponse('Client portal users cannot access the internal dashboard', { status: 403 })
  }

  const isDeprecatedSprintActivity =
    /^\/api\/sprints\/[^/]+\/activities(\/|$)/.test(pathname)

  if (isDeprecatedSprintActivity) {
    console.warn(
      '[deprecated] /api/sprints/[id]/activities/* is deprecated; use /api/todos with sprintId. Sunset: ' + DEPRECATION_SUNSET
    )
    const res = NextResponse.next()
    res.headers.set('Deprecation', 'true')
    res.headers.set('Sunset', DEPRECATION_SUNSET)
    return res
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/sprints/:path*', '/dashboard/:path*'],
}
