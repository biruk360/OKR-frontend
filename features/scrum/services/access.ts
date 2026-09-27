import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { canAccessSettings, type UserRole } from '@/lib/permissions'
import { canDocType } from '@/lib/rbac'

/**
 * Daily Scrum access rules — the single place scrum routes ask "may this
 * actor see / act on this person's scrum data?".
 *
 * Tiers (docs/daily_scrum_module_BUILD_SPEC.md §11):
 *  - view      — read a person's updates/comments: self, ADMIN/EXECUTIVE,
 *                direct manager, same-department colleague (mood is still
 *                stripped by scrum-serializer).
 *  - manage    — act on someone else's records (proxy, absences, blockers):
 *                ADMIN, direct manager, DEPARTMENT_LEAD in the same
 *                department, or the PM of a project the person is on.
 *  - records   — read person-scoped records that peers must not see
 *                (absences, performance metrics): self, ADMIN/EXECUTIVE, or
 *                anyone who can manage the person.
 *  - edit      — change an update's content: the owner only.
 */

export function isOrgWideScrumRole(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'EXECUTIVE'
}

export interface ScrumRelationshipFacts {
  role?: string | null
  directManager: boolean
  sameDepartment: boolean
  projectManager: boolean
}

/** Pure decision: may the actor manage another person's scrum records? */
export function canManageScrumUserResolved(input: ScrumRelationshipFacts): boolean {
  if (input.role === 'ADMIN') return true
  if (input.directManager) return true
  if (input.role === 'DEPARTMENT_LEAD' && input.sameDepartment) return true
  return input.projectManager
}

/** Pure decision: may the actor read person-scoped records (absences, metrics)? */
export function canReadScrumUserRecordsResolved(input: { isSelf: boolean; role?: string | null; canManage: boolean }): boolean {
  return input.isSelf || isOrgWideScrumRole(input.role) || input.canManage
}

/** Pure decision: may the actor act on an update (links, blocker resolve/escalate)? */
export function canActOnScrumUpdateResolved(input: { isOwner: boolean; canManage: boolean }): boolean {
  return input.isOwner || input.canManage
}

/** Pure decision: may the actor edit an existing update's content? Owner only. */
export function canEditScrumUpdateResolved(input: { actorId: string; ownerId: string }): boolean {
  return !!input.actorId && input.actorId === input.ownerId
}

/** Pure decision: may the actor open team analytics? */
export function canViewScrumAnalyticsResolved(input: { role?: string | null; managedUserCount: number }): boolean {
  return isOrgWideScrumRole(input.role) || input.managedUserCount > 0
}

export async function canManageScrumUser(session: Session, subjectUserId: string): Promise<boolean> {
  if (session.user.id === subjectUserId) return false
  if (session.user.role === 'ADMIN') return true
  const [directManager, sameDepartment, projectManager] = await Promise.all([
    isDirectManager(session.user.id, subjectUserId),
    session.user.role === 'DEPARTMENT_LEAD' ? sharesActiveDepartment(session.user.id, subjectUserId) : Promise.resolve(false),
    isProjectManagerForSubject(session.user.id, subjectUserId),
  ])
  return canManageScrumUserResolved({ role: session.user.role, directManager, sameDepartment, projectManager })
}

export async function canReadScrumUserRecords(session: Session, subjectUserId: string): Promise<boolean> {
  const isSelf = session.user.id === subjectUserId
  if (isSelf || isOrgWideScrumRole(session.user.role)) return true
  return canReadScrumUserRecordsResolved({ isSelf, role: session.user.role, canManage: await canManageScrumUser(session, subjectUserId) })
}

export async function canActOnScrumUpdate(session: Session, update: { userId: string }): Promise<boolean> {
  const isOwner = session.user.id === update.userId
  if (isOwner) return true
  return canActOnScrumUpdateResolved({ isOwner, canManage: await canManageScrumUser(session, update.userId) })
}

/** Ids of everyone the actor manages (excludes self). Not meaningful for ADMIN/EXECUTIVE (org-wide). */
export async function listManagedScrumUserIds(session: Session): Promise<string[]> {
  if (session.user.role === 'ADMIN') {
    const users = await prisma.user.findMany({ where: { isActive: true, id: { not: session.user.id } }, select: { id: true } })
    return users.map((u) => u.id)
  }
  const subjects = await listProxySubjects(session)
  return subjects.map((u) => u.id)
}

/** Scrum settings write: ADMIN/EXECUTIVE (lib/permissions) or a `scrum_settings` write grant (lib/rbac). */
export async function canWriteScrumSettings(session: Session): Promise<boolean> {
  if (canAccessSettings(session.user.role as UserRole)) return true
  return canDocType(session.user.id, 'scrum_settings', 'write')
}

/** Scrum settings read (settings page gate). */
export async function canReadScrumSettings(session: Session): Promise<boolean> {
  if (await canWriteScrumSettings(session)) return true
  return canDocType(session.user.id, 'scrum_settings', 'read')
}

export interface ScrumSubjectContext {
  userId: string
  teamId: string | null
  managerId: string | null
}

export async function resolveScrumSubjectContext(userId: string): Promise<ScrumSubjectContext> {
  const [membership, manager] = await Promise.all([
    prisma.departmentMembership.findFirst({
      where: { userId, endedAt: null },
      orderBy: [{ isPrimary: 'desc' }, { joinedAt: 'asc' }],
      select: { departmentId: true },
    }),
    prisma.managerRelationship.findFirst({
      where: { directReportId: userId, endedAt: null },
      select: { managerId: true },
    }),
  ])
  return {
    userId,
    teamId: membership?.departmentId ?? null,
    managerId: manager?.managerId ?? null,
  }
}

export async function canViewScrumUser(session: Session, subjectUserId: string): Promise<boolean> {
  if (session.user.id === subjectUserId) return true
  if (session.user.role === 'ADMIN' || session.user.role === 'EXECUTIVE') return true
  if (await isDirectManager(session.user.id, subjectUserId)) return true
  if (session.user.role === 'DEPARTMENT_LEAD') return sharesActiveDepartment(session.user.id, subjectUserId)
  return sharesActiveDepartment(session.user.id, subjectUserId)
}

export async function canProxyFor(session: Session, subjectUserId: string): Promise<boolean> {
  const [directManager, sameDepartment, projectManager] = await Promise.all([
    isDirectManager(session.user.id, subjectUserId),
    sharesActiveDepartment(session.user.id, subjectUserId),
    isProjectManagerForSubject(session.user.id, subjectUserId),
  ])
  return canProxyForResolved({
    isSelf: session.user.id === subjectUserId,
    role: session.user.role,
    directManager,
    sameDepartment,
    projectManager,
  })
}

export function canProxyForResolved(input: {
  isSelf: boolean
  role?: string | null
  directManager: boolean
  sameDepartment: boolean
  projectManager: boolean
}): boolean {
  if (input.isSelf) return true
  return canManageScrumUserResolved(input)
}

export async function listProxySubjects(session: Session) {
  if (session.user.role === 'ADMIN') {
    return prisma.user.findMany({
      where: { isActive: true, id: { not: session.user.id } },
      select: { id: true, name: true, email: true, avatar: true },
      orderBy: { name: 'asc' },
      take: 200,
    })
  }

  const ids = new Set<string>()
  const reports = await prisma.managerRelationship.findMany({
    where: { managerId: session.user.id, endedAt: null },
    select: { directReportId: true },
  })
  reports.forEach((row) => ids.add(row.directReportId))

  if (session.user.role === 'DEPARTMENT_LEAD') {
    const myDepartments = await prisma.departmentMembership.findMany({
      where: { userId: session.user.id, endedAt: null },
      select: { departmentId: true },
    })
    const peers = await prisma.departmentMembership.findMany({
      where: { departmentId: { in: myDepartments.map((d) => d.departmentId) }, endedAt: null },
      select: { userId: true },
    })
    peers.forEach((row) => {
      if (row.userId !== session.user.id) ids.add(row.userId)
    })
  }

  const managedProjects = await prisma.project.findMany({
    where: { projectManagerId: session.user.id, archivedAt: null },
    select: { members: { select: { userId: true } } },
  })
  managedProjects.forEach((project) => project.members.forEach((member) => {
    if (member.userId !== session.user.id) ids.add(member.userId)
  }))

  if (ids.size === 0) return []
  return prisma.user.findMany({
    where: { id: { in: [...ids] }, isActive: true },
    select: { id: true, name: true, email: true, avatar: true },
    orderBy: { name: 'asc' },
  })
}

/** Active DEPARTMENT_LEAD users of a department (recurring-blocker recipients, spec §12). */
export async function listDepartmentLeadIds(departmentId: string | null | undefined, excludeUserId?: string): Promise<string[]> {
  if (!departmentId) return []
  const rows = await prisma.departmentMembership.findMany({
    where: {
      departmentId,
      endedAt: null,
      user: { role: 'DEPARTMENT_LEAD', isActive: true },
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
    },
    select: { userId: true },
  })
  return [...new Set(rows.map((row) => row.userId))]
}

async function isDirectManager(managerId: string, subjectUserId: string): Promise<boolean> {
  const row = await prisma.managerRelationship.findFirst({
    where: { managerId, directReportId: subjectUserId, endedAt: null },
    select: { id: true },
  })
  return !!row
}

async function sharesActiveDepartment(a: string, b: string): Promise<boolean> {
  const rows = await prisma.departmentMembership.findMany({
    where: { userId: { in: [a, b] }, endedAt: null },
    select: { userId: true, departmentId: true },
  })
  const aDepts = new Set(rows.filter((row) => row.userId === a).map((row) => row.departmentId))
  return rows.some((row) => row.userId === b && aDepts.has(row.departmentId))
}

async function isProjectManagerForSubject(managerId: string, subjectUserId: string): Promise<boolean> {
  const row = await prisma.project.findFirst({
    where: {
      projectManagerId: managerId,
      archivedAt: null,
      members: { some: { userId: subjectUserId } },
    },
    select: { id: true },
  })
  return !!row
}
