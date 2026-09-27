import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  apiConflict,
  apiForbidden,
  withRole,
  withRoleOrFeature,
} from '@/lib/api'
import { filterFieldsByPermLevel } from '@/lib/field-filter'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'
import { deletedAccountData, isDeletedAccountEmail } from '@/lib/users/deleted-account'

/** True when `userId` is the only remaining active ADMIN. */
async function isLastActiveAdmin(userId: string): Promise<boolean> {
  const otherActiveAdmins = await prisma.user.count({
    where: { role: 'ADMIN', isActive: true, id: { not: userId } },
  })
  return otherActiveAdmins === 0
}

export const GET = withRoleOrFeature<RouteIdParams>(['ADMIN'], 'page.settings.users', async (_request, { session, params }) => {
  const { id: userId } = await resolveParams(params)
  if (!userId) return apiBadRequest('Invalid user id')

  const user = await prisma.user.findUnique({
    where: { id: userId },
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
  })

  if (!user) return apiNotFound('User not found')
  const filtered = await filterFieldsByPermLevel(user, 'user', session.user.id)
  return apiSuccess(filtered)
})

export const PATCH = withRoleOrFeature<RouteIdParams>(['ADMIN'], 'page.settings.users', async (request: NextRequest, { session, params }) => {
  const { id: userId } = await resolveParams(params)
  if (!userId) return apiBadRequest('Invalid user id')

  const body = await request.json()
  const { name, email, role, isActive, designation, nameAmharic, designationAmharic } = body

  const existingUser = await prisma.user.findUnique({ where: { id: userId } })
  if (!existingUser) return apiNotFound('User not found')
  if (isDeletedAccountEmail(existingUser.email)) {
    return apiBadRequest('This account has been deleted and can no longer be edited')
  }

  // Only an ADMIN may grant ADMIN or change an ADMIN account's role/status —
  // otherwise a feature-granted editor could promote themselves or others.
  const touchesAdmin =
    (role === 'ADMIN' && existingUser.role !== 'ADMIN') ||
    (existingUser.role === 'ADMIN' && ((role && role !== 'ADMIN') || isActive !== undefined))
  if (touchesAdmin && session.user.role !== 'ADMIN') {
    return apiForbidden('Only an administrator can change administrator access')
  }

  // Never leave the organisation without an active administrator.
  const losesAdmin =
    existingUser.role === 'ADMIN' &&
    existingUser.isActive &&
    ((role && role !== 'ADMIN') || isActive === false)
  if (losesAdmin && (await isLastActiveAdmin(userId))) {
    return apiBadRequest('You cannot demote or deactivate the last active administrator')
  }

  if (email && email !== existingUser.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email) || isDeletedAccountEmail(email)) {
      return apiBadRequest('A valid email address is required')
    }

    const emailTaken = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })
    if (emailTaken && emailTaken.id !== userId) {
      return apiConflict('Email address is already in use')
    }
  }

  if (role) {
    const validRoles = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE']
    if (!validRoles.includes(role)) {
      return apiBadRequest('Invalid role. Must be ADMIN, EXECUTIVE, DEPARTMENT_LEAD, or EMPLOYEE')
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(name && { name }),
      ...(email && { email }),
      ...(role && { role }),
      ...(isActive !== undefined && { isActive }),
      // Deactivating also voids any pending invite/reset link, so an unused
      // invitation cannot be used to reactivate the account afterwards.
      ...(isActive === false && { activationToken: null, activationTokenExpires: null }),
      designation: designation !== undefined ? (designation?.trim() || null) : undefined,
      nameAmharic: nameAmharic !== undefined ? (nameAmharic?.trim() || null) : undefined,
      designationAmharic: designationAmharic !== undefined ? (designationAmharic?.trim() || null) : undefined,
    },
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
  })

  const changes: ChangeMap = {}
  for (const field of ['name', 'email', 'role', 'isActive', 'designation', 'nameAmharic', 'designationAmharic'] as const) {
    const from = existingUser[field] ?? null
    const to = updatedUser[field] ?? null
    if (from !== to) changes[field] = { from, to }
  }
  if (Object.keys(changes).length > 0) {
    await recordActivity({
      entityType: 'USER',
      action: 'isActive' in changes || 'role' in changes ? 'STATUS_CHANGED' : 'UPDATED',
      actorId: session.user.id,
      changes,
      metadata: { userId },
    })
  }

  return apiSuccess(updatedUser, { message: 'User updated successfully' })
})

/**
 * DELETE /api/users/:id — ADMIN only (decision 2026-09-25).
 *
 * Soft delete + anonymise: the row and everything that references it
 * (objectives, key results, check-ins, to-dos, comments, audit rows) is kept;
 * the person's identity and credentials are scrubbed. See ./deleted-account.ts.
 */
export const DELETE = withRole<RouteIdParams>('ADMIN', async (_request, { session, params }) => {
  const { id: userId } = await resolveParams(params)
  if (!userId) return apiBadRequest('Invalid user id')

  if (userId === session.user.id) {
    return apiBadRequest('You cannot delete your own account')
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, designation: true, isActive: true },
  })
  if (!user) return apiNotFound('User not found')
  if (isDeletedAccountEmail(user.email)) {
    return apiConflict('This account has already been deleted')
  }
  if (user.role === 'ADMIN' && user.isActive && (await isLastActiveAdmin(userId))) {
    return apiBadRequest('You cannot delete the last active administrator')
  }

  const data = deletedAccountData(user)
  const deleted = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, email: true, role: true, designation: true, isActive: true },
    })
    // Audit is required: a deletion without its trail must not commit.
    await recordActivity(
      {
        entityType: 'USER',
        action: 'DELETED',
        actorId: session.user.id,
        // The original name/email are deliberately NOT copied into the
        // audit row — that would undo the anonymisation.
        changes: {
          isActive: { from: user.isActive, to: false },
          anonymised: { from: false, to: true },
        },
        metadata: { userId, anonymised: true },
      },
      { client: tx, required: true },
    )
    return updated
  })

  return apiSuccess(deleted, { message: 'User deleted and anonymised' })
})
