import type { NextRequest, NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { getServerSessionSafe, getBearerSession } from '@/lib/auth'
import { UserRole } from '@/types'
import { apiForbidden, apiUnauthorized } from './apiResponse'
import { handleApiError } from './handleError'
import { resolveFeaturePermission } from '../permission-resolver'

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
      // Bearer token first (desktop companion app), then cookie session.
      const session = (await getBearerSession(req)) ?? (await getServerSessionSafe())
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

/**
 * A feature-permission lookup that throws is treated as a denial (fail closed).
 * Previously both wrappers below ran the handler when the lookup threw, so a
 * missing table or a DB blip silently granted every feature-gated route.
 */
function logPermissionLookupFailure(wrapper: string, featureKey: string, userId: string, error: unknown) {
  console.error(`[withAuth:${wrapper}] feature permission lookup failed; denying`, {
    featureKey,
    userId,
    error: error instanceof Error ? error.message : String(error),
  })
}

export function withFeature<P = Record<string, string | string[]>>(
  featureKey: string,
  handler: Handler<P>
) {
  return withAuth<P>(async (req, ctx) => {
    if (ctx.session.user.role === 'ADMIN') {
      return handler(req, ctx)
    }
    let allowed = false
    try {
      allowed = await resolveFeaturePermission(ctx.session.user.id, featureKey)
    } catch (error) {
      // Fail closed: a permission lookup we could not complete is not a grant.
      logPermissionLookupFailure('withFeature', featureKey, ctx.session.user.id, error)
      return apiForbidden('Unable to verify permissions')
    }
    if (!allowed) {
      return apiForbidden('Feature not available')
    }
    return handler(req, ctx)
  })
}

export function withRoleOrFeature<P = Record<string, string | string[]>>(
  allowedRoles: UserRole[],
  featureKey: string,
  handler: Handler<P>
) {
  return withAuth<P>(async (req, ctx) => {
    const roleAllowed = allowedRoles.includes(ctx.session.user.role)
    if (roleAllowed) {
      return handler(req, ctx)
    }
    let featureAllowed = false
    try {
      featureAllowed = await resolveFeaturePermission(ctx.session.user.id, featureKey)
    } catch (error) {
      // Fail closed. Role-based access above is unaffected; only the feature
      // grant path is denied when the permission tables cannot be read.
      logPermissionLookupFailure('withRoleOrFeature', featureKey, ctx.session.user.id, error)
      return apiForbidden('Unable to verify permissions')
    }
    if (featureAllowed) {
      return handler(req, ctx)
    }
    return apiForbidden('Insufficient permissions')
  })
}
