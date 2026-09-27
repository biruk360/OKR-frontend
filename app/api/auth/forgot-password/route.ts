import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendPasswordResetEmail } from '@/lib/email'
import { isValidEmail } from '@/lib/utils'
import { apiBadRequest, apiSuccess } from '@/lib/api/apiResponse'
import { handleApiError } from '@/lib/api/handleError'
import { runAfterResponse } from '@/lib/background'
import { generateAuthToken, hashAuthToken } from '@/lib/security/auth-tokens'
import {
  AUTH_RATE_LIMITS,
  clientIp,
  emailKey,
  hitRateLimit,
  rateLimitedResponse,
} from '@/lib/security/rate-limit'

const GENERIC_MESSAGE = 'If an account exists for that email, a reset link has been sent.'

/**
 * POST /api/auth/forgot-password — public.
 *
 * Issues a password reset token and emails it. The response is identical — body
 * AND timing — whether or not the email matches an account: the lookup, token
 * write and email all run after the response via `runAfterResponse`, so the
 * request path does the same work for every input. Inactive accounts are
 * skipped silently for the same reason.
 *
 * Token lives in `User.activationToken` (re-used field, 1-hour expiry) as a
 * SHA-256 hash; only the emailed link carries the raw value.
 * Rate-limited per IP and per email (the latter also stops mail-bombing a victim).
 */
export async function POST(request: NextRequest) {
  try {
    const ipLimit = hitRateLimit(`forgot:ip:${clientIp(request.headers)}`, AUTH_RATE_LIMITS.forgotIp)
    if (!ipLimit.allowed) return rateLimitedResponse(ipLimit)

    const body = await request.json().catch(() => null)
    const email = String(body?.email ?? '').trim().toLowerCase()
    if (!email || email.length > 254 || !isValidEmail(email)) return apiBadRequest('Valid email required')

    const emailLimit = hitRateLimit(`forgot:email:${emailKey(email)}`, AUTH_RATE_LIMITS.forgotEmail)
    if (!emailLimit.allowed) return rateLimitedResponse(emailLimit)

    runAfterResponse('forgot-password', () => issueResetToken(email))

    return apiSuccess(null, { message: GENERIC_MESSAGE })
  } catch (err) {
    return handleApiError(err, 'POST /api/auth/forgot-password')
  }
}

async function issueResetToken(email: string): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, email: true, isActive: true },
  })
  if (!user || !user.isActive) return

  const resetToken = generateAuthToken()
  await prisma.user.update({
    where: { id: user.id },
    data: {
      activationToken: hashAuthToken(resetToken),
      activationTokenExpires: new Date(Date.now() + 60 * 60 * 1000),
    },
  })
  // The reset email below is the only place the raw token goes. This used to
  // also emit ACCOUNT_PASSWORD_RESET_REQUESTED with the full reset URL in its
  // data, which persisted a working reset link in the Notification table (and
  // the digest queue / outbound log) and sent the user a second, duplicate
  // "Reset your password" email. A pre-login user cannot see an in-app
  // notification anyway, so the emit is dropped rather than redacted.
  try {
    await sendPasswordResetEmail(user.email, resetToken)
  } catch (err) {
    console.error('[forgot-password] email send failed', err)
  }
}
