/**
 * DTP RBAC. Built on top of the existing global User.role + DTP-specific
 * coordinator / pool / driver assignments stored in DtpDepartmentApproval and
 * DtpSettings.
 */

import { prisma } from '@/lib/prisma'
import type { Session } from 'next-auth'
import { parseCsvIds, getDtpSettings, resolveApprovalRouting } from './settings'

type SessionLike = Pick<Session, 'user'> | null | undefined

export async function isPoolCoordinator(userId: string): Promise<boolean> {
  const s = await getDtpSettings()
  return parseCsvIds(s.poolCoordinatorIds).includes(userId)
}

export async function isOperationsManager(userId: string): Promise<boolean> {
  const s = await getDtpSettings()
  return parseCsvIds(s.operationsManagerIds).includes(userId)
}

export async function isTravelCoordinatorFor(
  userId: string,
  departmentId: string | null,
): Promise<{ primary: boolean; alternate: boolean }> {
  const r = await resolveApprovalRouting(departmentId)
  return {
    primary: r.primaryCoordinatorId === userId,
    alternate: r.alternateCoordinatorId === userId,
  }
}

export async function isAnyTravelCoordinator(userId: string): Promise<boolean> {
  const rows = await prisma.dtpDepartmentApproval.findMany({
    where: {
      OR: [{ primaryCoordinatorId: userId }, { alternateCoordinatorId: userId }],
    },
    select: { id: true },
  })
  return rows.length > 0
}

export async function getDriverProfile(userId: string) {
  return prisma.driver.findUnique({ where: { userId } })
}

/** Coarse "can read all DTP" — admins, executives, ops managers. */
export async function canReadAllDtp(session: SessionLike): Promise<boolean> {
  if (!session?.user) return false
  const role = session.user.role
  if (role === 'ADMIN' || role === 'EXECUTIVE') return true
  return isOperationsManager(session.user.id)
}

/** Visibility check used by GET /api/dtp/plans and individual plan reads. */
export async function canReadPlan(
  session: SessionLike,
  plan: { requesterId: string; departmentId: string | null },
): Promise<boolean> {
  if (!session?.user) return false
  if (plan.requesterId === session.user.id) return true
  if (await canReadAllDtp(session)) return true
  // Travel Coordinator (primary or alternate) for the plan's department.
  const tc = await isTravelCoordinatorFor(session.user.id, plan.departmentId)
  if (tc.primary || tc.alternate) return true
  // Department lead for the plan's department.
  if (plan.departmentId && session.user.role === 'DEPARTMENT_LEAD') {
    const m = await prisma.departmentMembership.findFirst({
      where: { userId: session.user.id, departmentId: plan.departmentId, endedAt: null, role: 'HEAD' },
      select: { id: true },
    })
    if (m) return true
  }
  // Pool Coordinator can read approved plans (for assignment).
  if (await isPoolCoordinator(session.user.id)) return true
  return false
}

export async function canActAsCoordinator(
  session: SessionLike,
  departmentId: string | null,
): Promise<boolean> {
  if (!session?.user) return false
  if (session.user.role === 'ADMIN' || session.user.role === 'EXECUTIVE') return true
  if (await isOperationsManager(session.user.id)) return true
  const tc = await isTravelCoordinatorFor(session.user.id, departmentId)
  return tc.primary || tc.alternate
}
