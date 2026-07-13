import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'

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
  if (session.user.id === subjectUserId) return true
  if (session.user.role === 'ADMIN') return true
  if (await isDirectManager(session.user.id, subjectUserId)) return true
  if (session.user.role === 'DEPARTMENT_LEAD' && await sharesActiveDepartment(session.user.id, subjectUserId)) return true
  return isProjectManagerForSubject(session.user.id, subjectUserId)
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
