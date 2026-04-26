import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, withAuth } from '@/lib/api'

const LIMIT = 5

export const GET = withAuth(async (request: NextRequest, { session }) => {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()

  if (!q) {
    return apiSuccess({ objectives: [], keyResults: [], todos: [] })
  }

  const role = session.user.role
  const userId = session.user.id

  let departmentIds: string[] = []
  if (role === 'DEPARTMENT_LEAD') {
    const memberships = await prisma.departmentMembership.findMany({
      where: { userId },
      select: { departmentId: true },
    })
    departmentIds = memberships.map((m) => m.departmentId)
  }

  const objectiveWhere: any = {
    status: 'ACTIVE',
    title: { contains: q, mode: 'insensitive' },
  }
  if (role === 'EMPLOYEE') {
    objectiveWhere.OR = [
      { ownerId: userId },
      { level: { in: ['COMPANY', 'DEPARTMENT'] }, isPrivate: false },
      { contributors: { some: { userId } } },
    ]
  } else if (role === 'DEPARTMENT_LEAD') {
    objectiveWhere.OR = [
      { ownerId: userId },
      { departmentId: { in: departmentIds } },
      { level: 'COMPANY', isPrivate: false },
      { contributors: { some: { userId } } },
    ]
  }

  const krWhere: any = {
    status: 'ACTIVE',
    title: { contains: q, mode: 'insensitive' },
  }
  if (role === 'EMPLOYEE') {
    krWhere.OR = [
      { ownerId: userId },
      { objective: { ownerId: userId } },
      { objective: { level: { in: ['COMPANY', 'DEPARTMENT'] }, isPrivate: false } },
    ]
  } else if (role === 'DEPARTMENT_LEAD') {
    krWhere.OR = [
      { ownerId: userId },
      { objective: { ownerId: userId } },
      { objective: { departmentId: { in: departmentIds } } },
      { objective: { level: 'COMPANY', isPrivate: false } },
    ]
  }

  const todoWhere: any = {
    title: { contains: q, mode: 'insensitive' },
  }
  if (role === 'EMPLOYEE' || role === 'DEPARTMENT_LEAD') {
    todoWhere.OR = [
      { assigneeId: userId },
      { creatorId: userId },
      { members: { some: { userId } } },
    ]
  }

  const [objectives, keyResults, todos] = await Promise.all([
    prisma.objective.findMany({
      where: objectiveWhere,
      orderBy: { updatedAt: 'desc' },
      take: LIMIT,
      select: { id: true, title: true, level: true, goalStatus: true, progress: true },
    }),
    prisma.keyResult.findMany({
      where: krWhere,
      orderBy: { updatedAt: 'desc' },
      take: LIMIT,
      select: {
        id: true,
        title: true,
        progress: true,
        confidence: true,
        objective: { select: { id: true, title: true } },
      },
    }),
    prisma.todo.findMany({
      where: todoWhere,
      orderBy: { updatedAt: 'desc' },
      take: LIMIT,
      select: { id: true, title: true, status: true, priority: true },
    }),
  ])

  return apiSuccess({ objectives, keyResults, todos })
})
