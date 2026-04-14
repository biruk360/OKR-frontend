import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendPasswordResetEmail } from '@/lib/email'
import { isValidEmail } from '@/lib/utils'
import { apiBadRequest, apiSuccess } from '@/lib/api/apiResponse'
import { handleApiError } from '@/lib/api/handleError'
import { emit } from '@/lib/notifications'
import crypto from 'crypto'

/**
 * POST /api/auth/forgot-password — public.
 *
 * Issues a password reset token and emails it. Always returns success regardless
 * of whether the email matches a real account, to avoid leaking which addresses
 * are registered. Inactive accounts are skipped silently for the same reason.
 *
 * Token lives in `User.activationToken` (re-used field, 1-hour expiry).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const email = String(body?.email ?? '').trim().toLowerCase()
    if (!email || !isValidEmail(email)) return apiBadRequest('Valid email required')

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, isActive: true },
    })

    if (user && user.isActive) {
      const resetToken = crypto.randomBytes(32).toString('hex')
      await prisma.user.update({
        where: { id: user.id },
        data: {
          activationToken: resetToken,
          activationTokenExpires: new Date(Date.now() + 60 * 60 * 1000),
        },
      })
      try {
        await sendPasswordResetEmail(user.email!, resetToken)
        await emit('ACCOUNT_PASSWORD_RESET_REQUESTED', {
          entityType: 'USER', entityId: user.id,
          explicitRecipients: [user.id],
          data: { resetUrl: `${process.env.NEXTAUTH_URL || ''}/auth/reset-password?token=${resetToken}` },
        })
      } catch (err) {
        console.error('[forgot-password] email send failed', err)
      }
    }

    return apiSuccess({ ok: true }, { message: 'If an account exists for that email, a reset link has been sent.' })
  } catch (err) {
    return handleApiError(err, 'POST /api/auth/forgot-password')
  }
}
