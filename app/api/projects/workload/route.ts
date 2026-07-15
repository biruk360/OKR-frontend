import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, withAuth } from '@/lib/api'

interface WorkloadCell {
  weekStart: string
  hours: number
  allocationPct: number
  projectCount: number
}

interface WorkloadPerson {
  userId: string | null
  name: string
  avatar: string | null
  totalHours: number
  maxAllocationPct: number
  cells: WorkloadCell[]
}

export const GET = withAuth(async (req: NextRequest, { session }) => {
  const weeks = Math.min(16, Math.max(4, Number(req.nextUrl.searchParams.get('weeks') || 8)))
  const from = startOfWeek(new Date())
  const to = addDays(from, weeks * 7)

  const projectWhere: any = {
    archivedAt: null,
    status: { in: ['PLANNING', 'ACTIVE', 'ON_HOLD'] },
  }
  if (session.user.role !== 'ADMIN' && session.user.role !== 'EXECUTIVE') {
    const memberships = await prisma.departmentMembership.findMany({
      where: { userId: session.user.id },
      select: { departmentId: true },
    })
    const deptIds = memberships.map((m) => m.departmentId)
    projectWhere.AND = [{
      OR: [
        { projectManagerId: session.user.id },
        { departmentId: { in: deptIds } },
        { members: { some: { userId: session.user.id } } },
      ],
    }]
  }

  const activities = await prisma.activity.findMany({
    where: {
      status: { notIn: ['FINISHED', 'APPROVED'] },
      OR: [
        { currentStart: { lt: to }, currentEnd: { gte: from } },
        { currentStart: { gte: from, lt: to } },
        { currentEnd: { gte: from, lt: to } },
      ],
      milestone: { phase: { project: projectWhere } },
    },
    select: {
      id: true,
      assigneeId: true,
      estimatedHours: true,
      currentStart: true,
      currentEnd: true,
      milestone: { select: { phase: { select: { projectId: true } } } },
    },
  })

  const userIds = [...new Set(activities.map((a) => a.assigneeId).filter(Boolean))] as string[]
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, avatar: true } })
    : []
  const userById = new Map(users.map((u) => [u.id, u]))
  const weekKeys = Array.from({ length: weeks }, (_, index) => isoDate(addDays(from, index * 7)))
  const people = new Map<string, WorkloadPerson>()

  for (const activity of activities) {
    const key = activity.assigneeId ?? 'unassigned'
    const user = activity.assigneeId ? userById.get(activity.assigneeId) : null
    if (!people.has(key)) {
      people.set(key, {
        userId: activity.assigneeId,
        name: user?.name ?? 'Unassigned',
        avatar: user?.avatar ?? null,
        totalHours: 0,
        maxAllocationPct: 0,
        cells: weekKeys.map((weekStart) => ({ weekStart, hours: 0, allocationPct: 0, projectCount: 0 })),
      })
    }

    const person = people.get(key)!
    const activityStart = startOfDay(activity.currentStart ?? from)
    const activityEnd = startOfDay(activity.currentEnd ?? activity.currentStart ?? to)
    const overlapWeeks = weekKeys
      .map((weekStart, index) => ({ weekStart, index, start: addDays(from, index * 7), end: addDays(from, index * 7 + 7) }))
      .filter((week) => activityEnd >= week.start && activityStart < week.end)
    const hours = activity.estimatedHours ?? Math.max(8, (daysBetween(activityStart, activityEnd) + 1) * 4)
    const hoursPerWeek = hours / Math.max(1, overlapWeeks.length)

    person.totalHours += hours
    for (const week of overlapWeeks) {
      const cell = person.cells[week.index]
      cell.hours += hoursPerWeek
      cell.projectCount += 1
      cell.allocationPct = Math.round((cell.hours / 40) * 100)
      person.maxAllocationPct = Math.max(person.maxAllocationPct, cell.allocationPct)
    }
  }

  return apiSuccess({
    weeks: weekKeys,
    people: [...people.values()]
      .map((person) => ({
        ...person,
        totalHours: Math.round(person.totalHours * 10) / 10,
        cells: person.cells.map((cell) => ({ ...cell, hours: Math.round(cell.hours * 10) / 10 })),
      }))
      .sort((a, b) => b.maxAllocationPct - a.maxAllocationPct || a.name.localeCompare(b.name)),
  })
})

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function startOfWeek(date: Date): Date {
  const day = date.getDay()
  return addDays(startOfDay(date), -(day === 0 ? 6 : day - 1))
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((+startOfDay(b) - +startOfDay(a)) / 86400000))
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
