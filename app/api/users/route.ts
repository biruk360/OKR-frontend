import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendUserInvitationEmail } from '@/lib/email'
import { apiSuccess, apiBadRequest, apiConflict, withRole } from '@/lib/api'
import { emit } from '@/lib/notifications'

export const GET = withRole('ADMIN', async () => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      designation: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  return apiSuccess(users)
})

export const POST = withRole('ADMIN', async (request: NextRequest) => {
  const body = await request.json()
  const { name, email, role = 'EMPLOYEE' } = body

  if (!name || !email) {
    return apiBadRequest('Name and email are required')
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return apiBadRequest('A valid email address is required')
  }

  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    return apiConflict('User with this email already exists')
  }

  const activationToken =
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)

  const user = await prisma.user.create({
    data: {
      name,
      email,
      role,
      isActive: false,
      password: null,
      activationToken,
      activationTokenExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      designation: true,
      isActive: true,
      createdAt: true,
    },
  })

  try {
    await sendUserInvitationEmail({
      email: user.email!,
      name: user.name ?? '',
      activationToken,
      role: user.role,
    })
  } catch (emailError) {
    console.error('Error sending invitation email:', emailError)
  }

  // In-app + admin notifications for new user. Invite email is sent directly above,
  // so we only emit ADMIN_USER_CREATED (not ACCOUNT_INVITE) here to avoid double send.
  await emit('ADMIN_USER_CREATED', {
    entityType: 'USER', entityId: user.id,
    data: { newUserName: user.name, newUserEmail: user.email, newUserRole: user.role },
  })

  return apiSuccess(user, {
    status: 201,
    message: `Invitation sent successfully to ${user.email}`,
  })
})
