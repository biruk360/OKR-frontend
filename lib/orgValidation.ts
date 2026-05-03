/**
 * Server-side validators for org-structure mutations.
 *
 * These helpers are deliberately quiet (return Result tuples instead of
 * throwing) so callers can map to the standard API error envelope.
 *
 * Invariants enforced:
 *   - One active manager per direct report (unless OrganizationSettings.allowMatrixReporting).
 *   - No self-management; no cycles in the manager chain.
 *   - The CEO has no manager (hard rule, no flag in v1).
 *   - The CEO must be ADMIN or EXECUTIVE.
 *   - A user has exactly one active primary department membership.
 *   - At most one HEAD per department (unless OrganizationSettings.allowMultipleDeptHeads).
 *   - Department head must be a member of that department.
 */

import { prisma } from './prisma'

export type ValidationResult = { ok: true } | { ok: false; reason: string }

const OK: ValidationResult = { ok: true }
const fail = (reason: string): ValidationResult => ({ ok: false, reason })

export const MEMBERSHIP_ROLES = ['HEAD', 'MEMBER', 'SECONDARY_MEMBER'] as const
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number]

export function isMembershipRole(value: unknown): value is MembershipRole {
  return typeof value === 'string' && (MEMBERSHIP_ROLES as readonly string[]).includes(value)
}

async function getSettings() {
  const s = await prisma.organizationSettings.findUnique({ where: { id: 'singleton' } })
  return s ?? (await prisma.organizationSettings.create({ data: { id: 'singleton' } }))
}

// ─── CEO ─────────────────────────────────────────────────────────────────────

export async function assertCeoEligible(userId: string): Promise<ValidationResult> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (!u) return fail('User not found')
  if (u.role !== 'ADMIN' && u.role !== 'EXECUTIVE') {
    return fail('CEO must have ADMIN or EXECUTIVE role')
  }
  return OK
}

export async function isCeo(userId: string): Promise<boolean> {
  const s = await prisma.organizationSettings.findUnique({
    where: { id: 'singleton' },
    select: { companyCeoUserId: true },
  })
  return s?.companyCeoUserId === userId
}

// ─── Manager relationship ────────────────────────────────────────────────────

/**
 * Validate setting `managerId` as the manager of `directReportId`.
 * Pass `managerId = null` to clear; that path always returns ok.
 */
export async function assertManagerAssignmentValid(
  directReportId: string,
  managerId: string | null,
): Promise<ValidationResult> {
  if (!managerId) return OK
  if (managerId === directReportId) return fail('A user cannot be their own manager')

  // CEO has no manager.
  if (await isCeo(directReportId)) return fail('CEO cannot have a manager')

  // Manager must exist.
  const mgr = await prisma.user.findUnique({ where: { id: managerId }, select: { id: true } })
  if (!mgr) return fail('Manager user not found')

  // No cycle: walk managerId's chain, fail if we encounter directReportId.
  const visited = new Set<string>()
  let cursor: string | null = managerId
  while (cursor) {
    if (visited.has(cursor)) return fail('Cycle detected in existing manager chain')
    if (cursor === directReportId) return fail('Cycle: proposed manager already reports to this user')
    visited.add(cursor)
    const next: { managerId: string } | null = await prisma.managerRelationship.findFirst({
      where: { directReportId: cursor, endedAt: null },
      orderBy: { startedAt: 'desc' },
      select: { managerId: true },
    })
    cursor = next?.managerId ?? null
  }
  return OK
}

/**
 * Set or clear the active manager for a user.
 * Soft-ends prior active relationship; opens a new active row if managerId is provided.
 * Honors `allowMatrixReporting` setting (when true, multiple active rows are allowed
 * but cycle/self-management rules still apply per call).
 */
export async function setActiveManager(directReportId: string, managerId: string | null): Promise<void> {
  const settings = await getSettings()

  if (!settings.allowMatrixReporting) {
    // End all currently-active manager rows for this report.
    await prisma.managerRelationship.updateMany({
      where: { directReportId, endedAt: null },
      data: { endedAt: new Date() },
    })
  }

  if (managerId) {
    // Avoid violating @@unique([managerId, directReportId]) — reuse if a historical row exists.
    const existing = await prisma.managerRelationship.findUnique({
      where: { managerId_directReportId: { managerId, directReportId } },
    })
    if (existing) {
      await prisma.managerRelationship.update({
        where: { id: existing.id },
        data: { endedAt: null, startedAt: new Date() },
      })
    } else {
      await prisma.managerRelationship.create({ data: { managerId, directReportId } })
    }
  }
}

// ─── Department head ────────────────────────────────────────────────────────

/**
 * Set the HEAD role for a single membership in a department, demoting any
 * other current HEAD unless multi-head mode is enabled.
 * `userId = null` clears the head designation entirely.
 */
export async function setDepartmentHead(
  departmentId: string,
  userId: string | null,
): Promise<ValidationResult> {
  const settings = await getSettings()

  if (!userId) {
    await prisma.departmentMembership.updateMany({
      where: { departmentId, role: 'HEAD' },
      data: { role: 'MEMBER' },
    })
    return OK
  }

  const membership = await prisma.departmentMembership.findUnique({
    where: { userId_departmentId: { userId, departmentId } },
  })
  if (!membership) return fail('User must be a member of the department before being made HEAD')
  if (membership.endedAt) return fail('Membership is inactive')

  if (!settings.allowMultipleDeptHeads) {
    await prisma.departmentMembership.updateMany({
      where: { departmentId, role: 'HEAD', NOT: { id: membership.id } },
      data: { role: 'MEMBER' },
    })
  }

  await prisma.departmentMembership.update({
    where: { id: membership.id },
    data: { role: 'HEAD' },
  })

  // Heads should carry DEPARTMENT_LEAD role (or higher) — UI/admin warns; we don't auto-elevate.
  return OK
}

// ─── Primary department ──────────────────────────────────────────────────────

/**
 * Ensure exactly one active membership row for `userId` is marked isPrimary.
 * If `preferredDepartmentId` is given and the user has an active membership
 * there, that row becomes primary; otherwise the oldest active row wins.
 */
export async function reconcilePrimaryDepartment(
  userId: string,
  preferredDepartmentId?: string | null,
): Promise<ValidationResult> {
  const memberships = await prisma.departmentMembership.findMany({
    where: { userId, endedAt: null },
    orderBy: { joinedAt: 'asc' },
    select: { id: true, departmentId: true, isPrimary: true },
  })
  if (memberships.length === 0) return OK // nothing to reconcile

  const target =
    (preferredDepartmentId && memberships.find((m) => m.departmentId === preferredDepartmentId)) ||
    memberships[0]

  await prisma.$transaction([
    prisma.departmentMembership.updateMany({
      where: { userId, NOT: { id: target.id } },
      data: { isPrimary: false },
    }),
    prisma.departmentMembership.update({
      where: { id: target.id },
      data: { isPrimary: true },
    }),
  ])
  return OK
}

// ─── Aggregated tree fetch (used by /api/org/tree) ───────────────────────────

/**
 * Compute org diagnostics:
 *   - users with no active department membership
 *   - departments with no HEAD
 *   - DEPARTMENT objectives missing a departmentId
 *   - INDIVIDUAL objectives without an aligned parent
 */
export async function computeOrgDiagnostics() {
  const [
    usersNoDept,
    deptsNoHead,
    deptObjMissingDept,
    individualObjUnaligned,
  ] = await Promise.all([
    prisma.user.count({
      where: { isActive: true, departmentMemberships: { none: { endedAt: null } } },
    }),
    prisma.department.count({
      where: { isActive: true, memberships: { none: { role: 'HEAD', endedAt: null } } },
    }),
    prisma.objective.count({
      where: { level: 'DEPARTMENT', departmentId: null, status: 'ACTIVE' },
    }),
    prisma.objective.count({
      where: { level: 'INDIVIDUAL', parentObjectiveId: null, status: 'ACTIVE' },
    }),
  ])
  return {
    usersWithoutDepartment: usersNoDept,
    departmentsWithoutHead: deptsNoHead,
    departmentObjectivesMissingDepartment: deptObjMissingDept,
    individualObjectivesUnaligned: individualObjUnaligned,
  }
}
