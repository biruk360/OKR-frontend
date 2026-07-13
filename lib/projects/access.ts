/**
 * Shared project authorization helpers.
 *
 * Record scoping (build spec §5.1): ADMIN/EXECUTIVE see everything; everyone else is
 * limited to projects they manage, that belong to their department, or where they are a
 * member. Write access additionally requires a management role (not EMPLOYEE) unless the
 * caller manages the project.
 */

import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'

export interface ProjectAccess {
  id: string
  projectManagerId: string
  departmentId: string | null
  baselineCommittedAt: Date | null
  status: string
}

/** Returns the project if the user may READ it, else null. */
export async function getReadableProject(session: Session, projectId: string): Promise<ProjectAccess | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, projectManagerId: true, departmentId: true, baselineCommittedAt: true, status: true },
  })
  if (!project) return null

  const role = session.user.role
  if (role === 'ADMIN' || role === 'EXECUTIVE') return project
  if (project.projectManagerId === session.user.id) return project

  const [membership, deptMatch] = await Promise.all([
    prisma.projectMember.findFirst({ where: { projectId, userId: session.user.id }, select: { id: true } }),
    project.departmentId
      ? prisma.departmentMembership.findFirst({
          where: { userId: session.user.id, departmentId: project.departmentId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ])
  return membership || deptMatch ? project : null
}

/** Returns the project if the user may WRITE (manage) it, else null. */
export async function getWritableProject(session: Session, projectId: string): Promise<ProjectAccess | null> {
  const project = await getReadableProject(session, projectId)
  if (!project) return null
  const role = session.user.role
  if (role === 'ADMIN' || role === 'EXECUTIVE') return project
  if (project.projectManagerId === session.user.id) return project
  // Department leads may manage projects in their department; employees may not write structure.
  if (role === 'DEPARTMENT_LEAD') return project
  return null
}
