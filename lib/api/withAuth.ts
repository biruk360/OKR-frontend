import type { NextRequest, NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { getServerSessionSafe } from '@/lib/auth'
import { UserRole } from '@/types'
import { apiForbidden, apiUnauthorized } from './apiResponse'
import { handleApiError } from './handleError'

/**
 * Context passed to handlers wrapped with withAuth / withRole.
 * - `session` is guaranteed non-null by the wrapper.
 * - `params` are the dynamic route params forwarded from Next.js.
 */
export interface AuthContext<P = Record<string, string | string[]>> {
  session: Session
  params: P
}

/**
 * Next.js App Router second-arg shape for dynamic route handlers.
 * Params may be undefined for non-dynamic routes.
 */
type RouteCtx<P> = { params: P } | undefined

type Handler<P, R extends NextResponse = NextResponse> = (
  req: NextRequest,
  ctx: AuthContext<P>
) => Promise<R> | R

/**
 * Wrap a route handler with session auth.
 * - Returns 401 if no session.
 * - Catches thrown errors and returns standard 500 envelope (see handleApiError).
 *
 * @example
 * export const GET = withAuth(async (req, { session }) => {
 *   const users = await prisma.user.findMany(...)
 *   return apiSuccess(users)
 * })
 */
export function withAuth<P = Record<string, string | string[]>>(handler: Handler<P>) {
  return async (req: NextRequest, routeCtx?: RouteCtx<P>) => {
    try {
      const session = await getServerSessionSafe()
      if (!session) return apiUnauthorized()
      const params = (routeCtx?.params ?? ({} as P)) as P
      return await handler(req, { session, params })
    } catch (error) {
      return handleApiError(error, `${req.method} ${new URL(req.url).pathname}`)
    }
  }
}

/**
 * Wrap a route handler with session auth + role check.
 * - Returns 401 if no session.
 * - Returns 403 if the user's role is not in the allowed list.
 *
 * @example
 * export const POST = withRole(['ADMIN', 'EXECUTIVE'], async (req, { session }) => { ... })
 */
export function withRole<P = Record<string, string | string[]>>(
  allowedRoles: UserRole[] | UserRole,
  handler: Handler<P>
) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]
  return withAuth<P>(async (req, ctx) => {
    if (!roles.includes(ctx.session.user.role)) {
      return apiForbidden('Insufficient permissions')
    }
    return handler(req, ctx)
  })
}
