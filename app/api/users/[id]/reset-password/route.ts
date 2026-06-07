import { prisma } from '@/lib/prisma'
import { sendPasswordResetEmail } from '@/lib/email'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  withRole,
  withRoleOrFeature,
} from '@/lib/api'

export const POST = withRoleOrFeature<RouteIdParams>(['ADMIN'], 'page.settings.users', async (_request, { params }) => {
  const { id: userId } = await resolveParams(params)
  if (!userId) return apiBadRequest('Invalid user id')

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, isActive: true },
  })

  if (!user) return apiNotFound('User not found')
  if (!user.isActive) return apiBadRequest('Cannot reset password for inactive user')

  const resetToken =
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)

  await prisma.user.update({
    where: { id: userId },
    data: {
      activationToken: resetToken,
      activationTokenExpires: new Date(Date.now() + 60 * 60 * 1000),
    },
  })

  try {
    await sendPasswordResetEmail(user.email!, resetToken)
  } catch (emailError) {
    console.error('Error sending password reset email:', emailError)
  }

  console.log(`Password reset triggered for user ${user.email}. Active sessions should be invalidated.`)

  return apiSuccess(null, { message: 'Password reset email has been sent' })
})
