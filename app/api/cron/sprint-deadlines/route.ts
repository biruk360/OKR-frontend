import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { emitNow } from '@/lib/notifications'
import { withCronAuth } from '@/lib/cron-auth'

/**
 * Daily sprint-deadline notifications. Hit once per day from VPS cron with
 * `Authorization: Bearer $CRON_SECRET`.
 */

function dayBounds(offsetDays: number) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() + offsetDays)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

async function handle(request: NextRequest) {
  // Sprints starting tomorrow (PLANNING)
  const tom = dayBounds(1)
  const startingTomorrowSprints = await prisma.sprint.findMany({
    where: { state: 'PLANNING', startDate: { gte: tom.start, lt: tom.end } },
    include: { participants: { select: { userId: true } } },
  })
  let startingTomorrow = 0
  for (const s of startingTomorrowSprints) {
    const recipients = Array.from(new Set([s.ownerId, ...s.participants.map(p => p.userId)]))
    if (recipients.length === 0) continue
    await emitNow('SPRINT_STARTING_TOMORROW', {
      entityType: 'TODO',
      explicitRecipients: recipients,
      data: { sprintName: s.name, startDate: s.startDate?.toISOString().slice(0, 10) ?? '', deepLink: `/dashboard/sprints/${s.id}` },
    })
    startingTomorrow++
  }

  // Sprints ending in 2 days (ACTIVE)
  const in2 = dayBounds(2)
  const endingSoonSprints = await prisma.sprint.findMany({
    where: { state: 'ACTIVE', endDate: { gte: in2.start, lt: in2.end } },
    include: { participants: { select: { userId: true } } },
  })
  let endingSoon = 0
  for (const s of endingSoonSprints) {
    const recipients = Array.from(new Set([s.ownerId, ...s.participants.map(p => p.userId)]))
    if (recipients.length === 0) continue
    await emitNow('SPRINT_ENDING_SOON', {
      entityType: 'TODO',
      explicitRecipients: recipients,
      data: { sprintName: s.name, endDate: s.endDate?.toISOString().slice(0, 10) ?? '', deepLink: `/dashboard/sprints/${s.id}` },
    })
    endingSoon++
  }

  // Todos due tomorrow / today / overdue (ACTIVE sprints only)
  const today = dayBounds(0)
  const tomorrow = dayBounds(1)
  const dueSoonTodos = await prisma.todo.findMany({
    where: {
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
      dueDate: { gte: tomorrow.start, lt: tomorrow.end },
      sprint: { state: 'ACTIVE' },
    },
    select: { id: true, title: true, assigneeId: true, dueDate: true },
  })
  for (const t of dueSoonTodos) {
    if (!t.assigneeId) continue
    await emitNow('TODO_DUE_TOMORROW', {
      entityType: 'TODO', entityId: t.id, entityTitle: t.title,
      data: { dueDate: t.dueDate?.toISOString().slice(0, 10) ?? '', deepLink: `/dashboard/todos?open=${t.id}` },
    })
  }

  const dueTodayTodos = await prisma.todo.findMany({
    where: {
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
      dueDate: { gte: today.start, lt: today.end },
      sprint: { state: 'ACTIVE' },
    },
    select: { id: true, title: true, assigneeId: true, dueDate: true },
  })
  for (const t of dueTodayTodos) {
    if (!t.assigneeId) continue
    await emitNow('TODO_DUE_TODAY', {
      entityType: 'TODO', entityId: t.id, entityTitle: t.title,
      explicitRecipients: [t.assigneeId],
      data: { dueDate: t.dueDate?.toISOString().slice(0, 10) ?? '', deepLink: `/dashboard/todos?open=${t.id}` },
    })
  }

  const overdueTodos = await prisma.todo.findMany({
    where: {
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
      dueDate: { lt: today.start },
      sprint: { state: 'ACTIVE' },
    },
    select: { id: true, title: true, assigneeId: true, dueDate: true },
  })
  for (const t of overdueTodos) {
    if (!t.assigneeId) continue
    await emitNow('TODO_OVERDUE', {
      entityType: 'TODO', entityId: t.id, entityTitle: t.title,
      data: { dueDate: t.dueDate?.toISOString().slice(0, 10) ?? '', deepLink: `/dashboard/todos?open=${t.id}` },
    })
  }

  return NextResponse.json({
    success: true,
    data: {
      startingTomorrow,
      endingSoon,
      dueSoon: dueSoonTodos.length,
      dueToday: dueTodayTodos.length,
      overdue: overdueTodos.length,
    },
  })
}

export const POST = withCronAuth(handle)
export const GET = POST
