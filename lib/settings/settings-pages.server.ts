// Server-only: imports Prisma. Do not import from client components.
// (The `server-only` package is not installed; this comment is the marker.)
/**
 * Data loaders for the server-rendered Settings pages under
 * app/dashboard/settings/**. Each page keeps its session + role gate and then
 * calls exactly one loader here (CLAUDE.md: routes are thin composition).
 * The queries are moved verbatim from the pages — same selects, same order.
 */

import { prisma } from '@/lib/prisma'
import { isDeletedAccountEmail } from '@/lib/users/deleted-account'

/** /dashboard/settings/audit-logs — latest 200 activity-log rows. */
export async function loadAuditLogsSettings() {
  return prisma.activityLog.findMany({
    take: 200,
    orderBy: { createdAt: 'desc' },
    include: { actor: { select: { id: true, name: true, email: true } } },
  })
}

/** /dashboard/settings/timeframes — every timeframe, newest first. */
export async function loadTimeframesSettings() {
  return prisma.timeframe.findMany({
    orderBy: { startDate: 'desc' },
  })
}

/** /dashboard/settings/teams — all departments with members and counts. */
export async function loadTeamsSettings() {
  return prisma.department.findMany({
    include: {
      memberships: {
        include: {
          user: {
            select: { id: true, name: true, email: true, avatar: true, role: true },
          },
        },
      },
      _count: {
        select: { memberships: true, objectives: true },
      },
    },
    orderBy: { name: 'asc' },
  })
}

/** /dashboard/settings/users — all users, flagged when the account was deleted. */
export async function loadUsersSettings() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      designation: true,
      isActive: true,
      isProjectManager: true,
      createdAt: true,
      lastLoginAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  return users.map((u) => ({ ...u, isDeleted: isDeletedAccountEmail(u.email) }))
}

/**
 * /dashboard/settings/users/:id — one user with current memberships, dates
 * serialised for the client component. `null` when the user does not exist.
 */
export async function loadUserDetailSettings(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      role: true,
      designation: true,
      nameAmharic: true,
      designationAmharic: true,
      isActive: true,
      isProjectManager: true,
      createdAt: true,
      lastLoginAt: true,
      departmentMemberships: {
        where: { endedAt: null },
        select: {
          id: true,
          role: true,
          isPrimary: true,
          department: { select: { id: true, name: true } },
        },
      },
    },
  })
  if (!user) return null
  return {
    ...user,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  }
}

/** /dashboard/settings/profile — the viewer's memberships and manager links. */
export async function loadProfileSettings(userId: string) {
  const [userDepartments, managerRelationships, directReports] = await Promise.all([
    prisma.departmentMembership.findMany({
      where: { userId },
      include: { department: { select: { id: true, name: true } } },
    }),
    prisma.managerRelationship.findMany({
      where: { directReportId: userId },
      include: { manager: { select: { id: true, name: true, email: true } } },
    }),
    prisma.managerRelationship.findMany({
      where: { managerId: userId },
      include: { directReport: { select: { id: true, name: true, email: true } } },
    }),
  ])
  return { userDepartments, managerRelationships, directReports }
}
