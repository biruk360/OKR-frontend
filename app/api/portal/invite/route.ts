import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { apiBadRequest, apiNotFound, apiSuccess, apiValidationError, handleApiError } from '@/lib/api'
import { AUTH_RATE_LIMITS, clientIp, hitRateLimit, rateLimitedResponse } from '@/lib/security/rate-limit'
import {
  acceptPortalInvite,
  acceptPortalInviteSchema,
  peekPortalInvite,
  PortalAccountError,
  type PortalAccountDb,
} from '@/lib/projects/portal-accounts'

/**
 * Public (no session) client-portal invite endpoint used by /portal/accept-invite.
 *
 * GET  ?token=… — is the link valid? Returns only the invitee's own email + name.
 * POST { token, password } — set the password; the invite is single-use because
 *      the stored `invite:<hash>` credential is replaced by the bcrypt hash.
 *
 * Both are rate-limited per client address with the reset-password budget. The
 * response is the same 404 for unknown, used and expired links so tokens
 * cannot be probed. No employee data is read or returned (invariant #4).
 */

const db = () => prisma as unknown as PortalAccountDb

export async function GET(req: NextRequest) {
  try {
    const limit = hitRateLimit(`portal-invite:ip:${clientIp(req.headers)}`, AUTH_RATE_LIMITS.resetIp)
    if (!limit.allowed) return rateLimitedResponse(limit)
    const token = new URL(req.url).searchParams.get('token') ?? ''
    const invite = await peekPortalInvite(db(), token)
    if (!invite) return apiNotFound('This invite link is invalid, used or expired')
    return apiSuccess(invite)
  } catch (error) {
    return handleApiError(error, 'GET /api/portal/invite')
  }
}

export async function POST(req: NextRequest) {
  try {
    const limit = hitRateLimit(`portal-invite:ip:${clientIp(req.headers)}`, AUTH_RATE_LIMITS.resetIp)
    if (!limit.allowed) return rateLimitedResponse(limit)
    const parsed = acceptPortalInviteSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return apiValidationError('Choose a password of at least 10 characters with letters and numbers', parsed.error.flatten())

    let accepted
    try {
      accepted = await acceptPortalInvite(db(), parsed.data)
    } catch (error) {
      if (error instanceof PortalAccountError && error.code === 'EXPIRED_INVITE') return apiBadRequest(error.message)
      if (error instanceof PortalAccountError) return apiNotFound('This invite link is invalid, used or expired')
      throw error
    }

    // Invariant #10. The actor is a ClientPortalUser, not a User, so it goes in metadata.
    for (const projectId of accepted.projectIds.length ? accepted.projectIds : [null]) {
      await recordActivity({
        entityType: 'PROJECT',
        projectId,
        action: 'UPDATED',
        actorId: null,
        metadata: { kind: 'PORTAL_INVITE_ACCEPTED', source: 'CLIENT_PORTAL', clientPortalUserId: accepted.accountId },
      })
    }
    return apiSuccess({ email: accepted.email }, { message: 'Password set. You can now sign in.' })
  } catch (error) {
    return handleApiError(error, 'POST /api/portal/invite')
  }
}
