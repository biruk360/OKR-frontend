import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendUserInvitationEmail } from '@/lib/email'
import { generateAuthToken, hashAuthToken } from '@/lib/security/auth-tokens'
import { apiSuccess, apiBadRequest, apiConflict, withRole, withRoleOrFeature } from '@/lib/api'
import { emit } from '@/lib/notifications'
import { filterArrayByPermLevel } from '@/lib/field-filter'
import { recordActivity } from '@/lib/activity-log'
import { isDeletedAccountEmail } from '@/lib/users/deleted-account'

export const GET = withRoleOrFeature(['ADMIN'], 'page.settings.users', async (_request, { session }) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      designation: true,
      nameAmharic: true,
      designationAmharic: true,
      isActive: true,
      isProjectManager: true,
      createdAt: true,
      lastLoginAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  const filtered = await filterArrayByPermLevel(
    users as unknown as Record<string, unknown>[],
    'user',
    session.user.id,
  )
  return apiSuccess(filtered)
})

// Creating accounts is ADMIN-only (decision 2026-09-25) — the users-page
// feature grant does not extend to adding people.
export const POST = withRole('ADMIN', async (request: NextRequest, { session }) => {
  const body = await request.json()
  const { name, email, role = 'EMPLOYEE' } = body

  if (!name || !email) {
    return apiBadRequest('Name and email are required')
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email) || isDeletedAccountEmail(email)) {
    return apiBadRequest('A valid email address is required')
  }
  if (!['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE'].includes(role)) {
    return apiBadRequest('Invalid role. Must be ADMIN, EXECUTIVE, DEPARTMENT_LEAD, or EMPLOYEE')
  }

  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    return apiConflict('User with this email already exists')
  }

  // CSPRNG token; only its hash is stored (the raw value goes in the invite link).
  const activationToken = generateAuthToken()

  const user = await prisma.user.create({
    data: {
      name,
      email,
      role,
      isActive: false,
      password: null,
      activationToken: hashAuthToken(activationToken),
      activationTokenExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      designation: true,
      isActive: true,
      isProjectManager: true,
      createdAt: true,
    },
  })

  await recordActivity({
    entityType: 'USER',
    action: 'CREATED',
    actorId: session.user.id,
    changes: { role: { from: null, to: user.role }, isActive: { from: null, to: false } },
    metadata: { userId: user.id, invited: true },
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
