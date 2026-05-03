import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  apiSuccess, apiBadRequest, apiForbidden, apiNotFound, withAuth,
} from '@/lib/api'
import { canManageDepartment } from '@/lib/permissions'
import {
  isMembershipRole, reconcilePrimaryDepartment, setDepartmentHead,
} from '@/lib/orgValidation'

/**
 * PATCH  /api/departments/:id/members/:membershipId
 *   body { role?, isPrimary? } — change membership shape.
 * DELETE /api/departments/:id/members/:membershipId
 *   Soft-removes via endedAt; reconciles primary-department invariant.
 */

type Params = Promise<{ id: string; membershipId: string }> | { id: string; membershipId: string }

async function loadMembership(membershipId: string, departmentId: string) {
  const m = await prisma.departmentMembership.findUnique({ where: { id: membershipId } })
  if (!m || m.departmentId !== departmentId) return null
  return m
}

export const PATCH = withAuth<Params>(async (request: NextRequest, { params, session }) => {
  const p = await Promise.resolve(params)
  const { id: departmentId, membershipId } = p
  if (!departmentId || !membershipId) return apiBadRequest('Invalid id')

  if (!(await canManageDepartment(session.user.role as any, session.user.id, departmentId))) {
    return apiForbidden('Insufficient permissions')
  }

  const m = await loadMembership(membershipId, departmentId)
  if (!m) return apiNotFound('Membership not found')

  const body = await request.json().catch(() => ({}))
  const { role, isPrimary } = body ?? {}

  if (role !== undefined && !isMembershipRole(role)) {
    return apiBadRequest('Invalid role; expected HEAD | MEMBER | SECONDARY_MEMBER')
  }

  if (role === 'HEAD') {
    const r = await setDepartmentHead(departmentId, m.userId)
    if (!r.ok) return apiBadRequest(r.reason)
  } else if (role !== undefined) {
    await prisma.departmentMembership.update({ where: { id: m.id }, data: { role } })
  }

  if (isPrimary === true) {
    await reconcilePrimaryDepartment(m.userId, departmentId)
  } else if (isPrimary === false) {
    await prisma.departmentMembership.update({ where: { id: m.id }, data: { isPrimary: false } })
    await reconcilePrimaryDepartment(m.userId)
  }

  const updated = await prisma.departmentMembership.findUnique({ where: { id: m.id } })
  return apiSuccess(updated)
})

export const DELETE = withAuth<Params>(async (_request, { params, session }) => {
  const p = await Promise.resolve(params)
  const { id: departmentId, membershipId } = p
  if (!departmentId || !membershipId) return apiBadRequest('Invalid id')

  if (!(await canManageDepartment(session.user.role as any, session.user.id, departmentId))) {
    return apiForbidden('Insufficient permissions')
  }

  const m = await loadMembership(membershipId, departmentId)
  if (!m) return apiNotFound('Membership not found')

  await prisma.departmentMembership.update({
    where: { id: m.id },
    data: { endedAt: new Date(), isPrimary: false, role: m.role === 'HEAD' ? 'MEMBER' : m.role },
  })

  await reconcilePrimaryDepartment(m.userId)

  return apiSuccess({ ok: true })
})
