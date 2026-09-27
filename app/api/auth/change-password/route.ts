import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api/withAuth'
import { reissueSessionCookie } from '@/lib/auth'
import { apiSuccess, apiBadRequest, apiUnauthorized, handleApiError } from '@/lib/api'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/features/auth/services/signup-schema'

/**
 * POST /api/auth/change-password — signed-in user changes their own password.
 *
 * Stamps `User.passwordChangedAt`, which revokes every session/bearer token
 * issued before now (lib/auth.ts). The caller's own cookie session is re-minted
 * with the new auth time so this device stays signed in; the desktop app (bearer)
 * signs in again.
 */
export const POST = withAuth(async (req: NextRequest, { session }) => {
  try {
    const body = await req.json().catch(() => null)
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : ''
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : ''

    if (!currentPassword || !newPassword) {
      return apiBadRequest('currentPassword and newPassword are required')
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      return apiBadRequest(`New password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    }
    if (newPassword.length > PASSWORD_MAX_LENGTH) {
      return apiBadRequest(`New password must be ${PASSWORD_MAX_LENGTH} characters or fewer`)
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, password: true },
    })

    if (!user) {
      return apiUnauthorized()
    }

    // Every account that can hold a session has a password (passwordless login
    // is refused in lib/auth.ts), so the current password is always verified.
    if (!user.password) {
      return apiBadRequest('No password is set for this account — use "Forgot password" to set one')
    }
    const isValid = await bcrypt.compare(currentPassword, user.password)
    if (!isValid) {
      return apiBadRequest('Current password is incorrect')
    }

    const isSame = await bcrypt.compare(newPassword, user.password)
    if (isSame) {
      return apiBadRequest('New password must be different from current password')
    }

    const hashed = await bcrypt.hash(newPassword, 12)
    const changedAt = new Date()
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, passwordChangedAt: changedAt },
    })

    const res = apiSuccess(null, { message: 'Password changed successfully' })
    await reissueSessionCookie(req, res, changedAt.getTime())
    return res
  } catch (error) {
    return handleApiError(error, 'POST /api/auth/change-password')
  }
})
