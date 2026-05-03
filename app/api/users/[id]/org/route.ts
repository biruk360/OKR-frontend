import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess, apiBadRequest, apiForbidden, apiNotFound, withAuth,
} from '@/lib/api'
import {
  assertManagerAssignmentValid, setActiveManager, reconcilePrimaryDepartment, isCeo,
} from '@/lib/orgValidation'
import { canManageOrg } from '@/lib/permissions'

/**
 * GET    /api/users/:id/org   — manager, direct reports, departments, owned/contributed OKR counts.
 * PATCH  /api/users/:id/org   — body { managerId?, primaryDepartmentId?, role? }.
 *
 * GET is open to authenticated users (org tree is meant to be visible).
 * PATCH requires ADMIN/EXECUTIVE.
 */

export const GET = withAuth<RouteIdParams>(async (_request, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid user id')

  const [user, manager, directReports, memberships, ownedCount, contribCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, avatar: true, role: true, isActive: true },
    }),
    prisma.managerRelationship.findFirst({
      where: { directReportId: id, endedAt: null },
      orderBy: { startedAt: 'desc' },
      include: { manager: { select: { id: true, name: true, email: true, avatar: true } } },
    }),
    prisma.managerRelationship.findMany({
      where: { managerId: id, endedAt: null },
      include: { directReport: { select: { id: true, name: true, email: true, avatar: true } } },
    }),
    prisma.departmentMembership.findMany({
      where: { userId: id, endedAt: null },
      include: { department: { select: { id: true, name: true } } },
    }),
    prisma.objective.count({ where: { ownerId: id, status: 'ACTIVE' } }),
    prisma.objectiveContributor.count({ where: { userId: id } }),
  ])

  if (!user) return apiNotFound('User not found')

  return apiSuccess({
    user,
    isCeo: await isCeo(id),
    manager: manager?.manager ?? null,
    directReports: directReports.map((r) => r.directReport),
    departments: memberships.map((m) => ({
      membershipId: m.id, role: m.role, isPrimary: m.isPrimary, department: m.department,
    })),
    ownedObjectiveCount: ownedCount,
    contributedObjectiveCount: contribCount,
  })
})

export const PATCH = withAuth<RouteIdParams>(async (request: NextRequest, { params, session }) => {
  if (!canManageOrg(session.user.role as any)) return apiForbidden('Insufficient permissions')

  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid user id')

  const body = await request.json().catch(() => ({}))
  const { managerId, primaryDepartmentId, role } = body ?? {}

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } })
  if (!user) return apiNotFound('User not found')

  if (managerId !== undefined) {
    const check = await assertManagerAssignmentValid(id, managerId ?? null)
    if (!check.ok) return apiBadRequest(check.reason)
    await setActiveManager(id, managerId ?? null)
  }

  if (primaryDepartmentId !== undefined) {
    if (primaryDepartmentId) {
      // Validate the department exists, then ensure the user has an active
      // membership there (creating or reactivating one if needed) before
      // reconciling primary status.
      const dept = await prisma.department.findUnique({
        where: { id: primaryDepartmentId },
        select: { id: true },
      })
      if (!dept) return apiBadRequest('Department not found')

      const existing = await prisma.departmentMembership.findUnique({
        where: { userId_departmentId: { userId: id, departmentId: primaryDepartmentId } },
      })
      if (!existing) {
        await prisma.departmentMembership.create({
          data: { userId: id, departmentId: primaryDepartmentId, role: 'MEMBER', isPrimary: true },
        })
      } else if (existing.endedAt) {
        await prisma.departmentMembership.update({
          where: { id: existing.id },
          data: { endedAt: null, isPrimary: true, joinedAt: new Date() },
        })
      }
    }
    const reconcile = await reconcilePrimaryDepartment(id, primaryDepartmentId ?? undefined)
    if (!reconcile.ok) return apiBadRequest(reconcile.reason)
  }

  if (role !== undefined) {
    const allowed = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE']
    if (!allowed.includes(role)) return apiBadRequest('Invalid role')
    await prisma.user.update({ where: { id }, data: { role } })
  }

  return apiSuccess({ ok: true })
})
