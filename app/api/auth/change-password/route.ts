import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api/withAuth'
import { apiSuccess, apiBadRequest, apiUnauthorized, handleApiError } from '@/lib/api'

export const POST = withAuth(async (req: NextRequest, { session }) => {
  try {
    const { currentPassword, newPassword } = await req.json()

    if (!currentPassword || !newPassword) {
      return apiBadRequest('currentPassword and newPassword are required')
    }

    if (newPassword.length < 8) {
      return apiBadRequest('New password must be at least 8 characters')
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, password: true },
    })

    if (!user) {
      return apiUnauthorized()
    }

    if (user.password) {
      const isValid = await bcrypt.compare(currentPassword, user.password)
      if (!isValid) {
        return apiBadRequest('Current password is incorrect')
      }

      const isSame = await bcrypt.compare(newPassword, user.password)
      if (isSame) {
        return apiBadRequest('New password must be different from current password')
      }
    }

    const hashed = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    })

    return apiSuccess(null, { message: 'Password changed successfully' })
  } catch (error) {
    return handleApiError(error, 'POST /api/auth/change-password')
  }
})
