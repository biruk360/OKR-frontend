import type { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiSuccess, apiNotFound } from '@/lib/api/apiResponse'
import { handleApiError } from '@/lib/api/handleError'
import { emit } from '@/lib/notifications'

/**
 * POST /api/auth/reset-password — public.
 *
 * Body: { token: string, password: string }.
 * Validates the reset token (User.activationToken + activationTokenExpires),
 * hashes the new password, clears the token, and marks the user active.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const token = String(body?.token ?? '').trim()
    const password = String(body?.password ?? '')
    if (!token) return apiBadRequest('Reset token required')
    if (password.length < 8) return apiBadRequest('Password must be at least 8 characters')

    const user = await prisma.user.findFirst({
      where: { activationToken: token },
      select: { id: true, email: true, name: true, activationTokenExpires: true },
    })
    if (!user) return apiNotFound('Invalid or already-used reset link')
    if (!user.activationTokenExpires || user.activationTokenExpires < new Date()) {
      return apiBadRequest('Reset link has expired — request a new one')
    }

    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: passwordHash,
        activationToken: null,
        activationTokenExpires: null,
        isActive: true,
      },
    })

    await emit('ACCOUNT_PASSWORD_CHANGED', {
      entityType: 'USER', entityId: user.id,
      explicitRecipients: [user.id],
      data: {},
    })

    return apiSuccess({ ok: true }, { message: 'Password updated. You can now sign in.' })
  } catch (err) {
    return handleApiError(err, 'POST /api/auth/reset-password')
  }
}
