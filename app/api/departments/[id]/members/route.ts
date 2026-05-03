import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess, apiBadRequest, apiForbidden, apiNotFound, apiConflict, withAuth,
} from '@/lib/api'
import { canManageDepartment } from '@/lib/permissions'
import {
  isMembershipRole, reconcilePrimaryDepartment, setDepartmentHead,
} from '@/lib/orgValidation'

/**
 * POST /api/departments/:id/members
 * body { userId, role?, isPrimary? }
 * Adds (or reactivates) a membership. ADMIN/EXEC or active HEAD of the department.
 */
export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { params, session }) => {
  const { id: departmentId } = await resolveParams(params)
  if (!departmentId) return apiBadRequest('Invalid department id')

  if (!(await canManageDepartment(session.user.role as any, session.user.id, departmentId))) {
    return apiForbidden('Insufficient permissions')
  }

  const body = await request.json().catch(() => ({}))
  const { userId, role = 'MEMBER', isPrimary = false } = body ?? {}
  if (!userId) return apiBadRequest('userId is required')
  if (!isMembershipRole(role)) return apiBadRequest('Invalid role; expected HEAD | MEMBER | SECONDARY_MEMBER')

  const [user, dept] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } }),
  ])
  if (!user) return apiNotFound('User not found')
  if (!dept) return apiNotFound('Department not found')

  const existing = await prisma.departmentMembership.findUnique({
    where: { userId_departmentId: { userId, departmentId } },
  })

  let membership
  if (existing) {
    if (!existing.endedAt) return apiConflict('User is already an active member')
    membership = await prisma.departmentMembership.update({
      where: { id: existing.id },
      data: { endedAt: null, role, isPrimary, joinedAt: new Date() },
    })
  } else {
    membership = await prisma.departmentMembership.create({
      data: { userId, departmentId, role, isPrimary },
    })
  }

  if (role === 'HEAD') {
    const r = await setDepartmentHead(departmentId, userId)
    if (!r.ok) return apiBadRequest(r.reason)
  }

  if (isPrimary) {
    await reconcilePrimaryDepartment(userId, departmentId)
  } else {
    // Ensure the user still has exactly one primary somewhere.
    await reconcilePrimaryDepartment(userId)
  }

  return apiSuccess(membership, { status: 201 })
})
