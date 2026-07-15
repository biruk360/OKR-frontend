import type { NextRequest, NextResponse } from 'next/server'
import { apiForbidden, apiUnauthorized } from './apiResponse'
import { handleApiError } from './handleError'
import { canPortalUserAccessProject, getPortalSessionSafe, type PortalSession } from '@/lib/portal-auth'

export interface PortalAuthContext<P = Record<string, string | string[]>> {
  session: PortalSession
  params: P
}

type RouteCtx<P> = { params: P } | undefined

type Handler<P, R extends NextResponse = NextResponse> = (
  req: NextRequest,
  ctx: PortalAuthContext<P>
) => Promise<R> | R

export function withPortalAuth<P = Record<string, string | string[]>>(handler: Handler<P>) {
  return async (req: NextRequest, routeCtx?: RouteCtx<P>) => {
    try {
      const session = await getPortalSessionSafe()
      if (!session) return apiUnauthorized('Client portal sign-in required')
      const params = (routeCtx?.params ?? ({} as P)) as P
      return await handler(req, { session, params })
    } catch (error) {
      return handleApiError(error, `${req.method} ${new URL(req.url).pathname}`)
    }
  }
}

export function withPortalProject<P extends { id: string }>(handler: Handler<P>) {
  return withPortalAuth<P>(async (req, ctx) => {
    if (!canPortalUserAccessProject(ctx.session, ctx.params.id)) {
      return apiForbidden('Project is outside this client portal scope')
    }
    return handler(req, ctx)
  })
}
