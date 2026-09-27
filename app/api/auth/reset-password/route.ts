import type { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiSuccess, apiNotFound } from '@/lib/api/apiResponse'
import { handleApiError } from '@/lib/api/handleError'
import { emit } from '@/lib/notifications'
import { authTokenLookupValues } from '@/lib/security/auth-tokens'
import { AUTH_RATE_LIMITS, clientIp, hitRateLimit, rateLimitedResponse } from '@/lib/security/rate-limit'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/features/auth/services/signup-schema'

/**
 * POST /api/auth/reset-password — public.
 *
 * Body: { token: string, password: string }.
 * Serves both flows that email a `/auth/reset-password?token=…` link:
 *   - forgot-password / admin reset (active user, 1-hour token), and
 *   - invitation (user created with password=null, isActive=false, 7-day token).
 * Validates the token (stored hashed in User.activationToken; legacy raw values
 * still accepted until they expire), hashes the new password, clears the token,
 * activates a first-time invitee, and stamps `passwordChangedAt` so every
 * session issued before this moment is revoked.
 *
 * A deactivated account (inactive but already has a password) is NOT
 * reactivated by an old link — only an admin can do that.
 */
export async function POST(request: NextRequest) {
  try {
    const limit = hitRateLimit(`reset:ip:${clientIp(request.headers)}`, AUTH_RATE_LIMITS.resetIp)
    if (!limit.allowed) return rateLimitedResponse(limit)

    const body = await request.json().catch(() => null)
    const token = String(body?.token ?? '').trim()
    const password = String(body?.password ?? '')
    if (!token) return apiBadRequest('Reset token required')
    if (password.length < PASSWORD_MIN_LENGTH) {
      return apiBadRequest(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
      return apiBadRequest(`Password must be ${PASSWORD_MAX_LENGTH} characters or fewer`)
    }

    const candidates = authTokenLookupValues(token)
    const user = candidates.length
      ? await prisma.user.findFirst({
          where: { activationToken: { in: candidates } },
          select: { id: true, isActive: true, password: true, activationTokenExpires: true },
        })
      : null
    if (!user) return apiNotFound('Invalid or already-used reset link')
    if (!user.activationTokenExpires || user.activationTokenExpires < new Date()) {
      return apiBadRequest('Reset link has expired — request a new one')
    }
    if (!user.isActive && user.password) {
      return apiBadRequest('This account has been deactivated. Contact your administrator.')
    }

    const passwordHash = await bcrypt.hash(password, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: passwordHash,
        activationToken: null,
        activationTokenExpires: null,
        isActive: true,
        passwordChangedAt: new Date(),
      },
    })

    await emit('ACCOUNT_PASSWORD_CHANGED', {
      entityType: 'USER', entityId: user.id,
      explicitRecipients: [user.id],
      data: {},
    })

    return apiSuccess(null, { message: 'Password updated. You can now sign in.' })
  } catch (err) {
    return handleApiError(err, 'POST /api/auth/reset-password')
  }
}
