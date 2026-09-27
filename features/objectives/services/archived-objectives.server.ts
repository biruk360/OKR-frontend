// Server-only: imports Prisma. Do not re-export from the features/objectives
// barrel, which client components import. (The `server-only` package is not
// installed; this comment is the marker.)
/**
 * Loader for /dashboard/archived-objectives. Moved verbatim from the page
 * (CLAUDE.md: routes are thin composition): EMPLOYEE sees their own archived
 * objectives, DEPARTMENT_LEAD their own plus their departments', everyone else
 * all of them; the department filter list is ADMIN/EXECUTIVE only.
 */

import { prisma } from '@/lib/prisma'

export async function loadArchivedObjectivesPage(viewer: { id: string; role: string }) {
  let where: Record<string, unknown> = { status: 'ARCHIVED' }

  if (viewer.role === 'EMPLOYEE') {
    where = { ...where, ownerId: viewer.id }
  } else if (viewer.role === 'DEPARTMENT_LEAD') {
    const userDepartments = await prisma.departmentMembership.findMany({
      where: { userId: viewer.id },
      select: { departmentId: true },
    })
    const departmentIds = userDepartments.map((d) => d.departmentId)

    where = {
      ...where,
      OR: [{ ownerId: viewer.id }, { departmentId: { in: departmentIds } }],
    }
  }

  const objectives = await prisma.objective.findMany({
    where,
    include: {
      owner: {
        select: { id: true, name: true, avatar: true },
      },
      timeframe: true,
      department: {
        select: { id: true, name: true },
      },
      parentObjective: {
        select: { id: true, title: true, level: true },
      },
      childObjectives: {
        where: { status: 'ACTIVE' },
        include: {
          owner: {
            select: { id: true, name: true, avatar: true },
          },
          department: {
            select: { id: true, name: true },
          },
          _count: {
            select: { keyResults: true, childObjectives: true },
          },
        },
        orderBy: { level: 'asc' },
      },
      keyResults: {
        include: {
          owner: {
            select: { id: true, name: true, avatar: true },
          },
        },
      },
      _count: {
        select: { keyResults: true, childObjectives: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const timeframes = await prisma.timeframe.findMany({
    where: { isActive: true },
    orderBy: { startDate: 'desc' },
  })

  const departments =
    viewer.role === 'ADMIN' || viewer.role === 'EXECUTIVE'
      ? await prisma.department.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
        })
      : []

  return { objectives, timeframes, departments }
}
