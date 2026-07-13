import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { getScrumSettings } from './settings'
import { dateFromDateKey, isScrumWorkingDay, scrumWorkingDaysInRange, toScrumDateKey } from './working-days'
import { serializeScrumUpdates } from './scrum-serializer'

export interface CalendarQuery {
  from: string
  to: string
  teamId?: string | null
  userId?: string | null
  projectId?: string | null
  hasBlocker?: boolean | null
  hasWin?: boolean | null
  state?: string | null
  search?: string | null
}

export async function getScrumCalendar(session: Session, query: CalendarQuery) {
  const settings = await getScrumSettings()
  const from = dateFromDateKey(query.from)
  const to = dateFromDateKey(query.to)
  const members = await listCalendarMembers(session, query.teamId, query.userId)
  const memberIds = members.map((member) => member.id)
  const updateWhere: any = {
    scrumDate: { gte: from, lte: to },
    userId: { in: memberIds.length ? memberIds : ['___none___'] },
  }
  if (query.projectId) updateWhere.projectId = query.projectId
  if (query.hasBlocker != null) updateWhere.hasBlocker = query.hasBlocker
  if (query.hasWin != null) updateWhere.hasWin = query.hasWin
  if (query.state === 'late') updateWhere.isLate = true
  if (query.state === 'proxy') updateWhere.isProxyEntry = true
  if (query.search) {
    updateWhere.OR = [
      { yesterdayDone: { contains: query.search, mode: 'insensitive' } },
      { todayPlan: { contains: query.search, mode: 'insensitive' } },
      { blockers: { contains: query.search, mode: 'insensitive' } },
      { wins: { contains: query.search, mode: 'insensitive' } },
    ]
  }

  const [updatesRaw, absences] = await Promise.all([
    prisma.scrumUpdate.findMany({
      where: updateWhere,
      include: { links: true, celebrations: true, comments: true },
      orderBy: [{ scrumDate: 'asc' }, { submittedAt: 'asc' }],
    }),
    prisma.scrumAbsence.findMany({
      where: { date: { gte: from, lte: to }, userId: { in: memberIds } },
    }),
  ])
  const updates = await serializeScrumUpdates(updatesRaw as any[], { id: session.user.id, role: session.user.role })
  const updateByUserDate = new Map(updates.map((update: any) => [`${update.userId}:${toScrumDateKey(update.scrumDate, settings)}`, update]))
  const absenceByUserDate = new Map(absences.map((absence) => [`${absence.userId}:${toScrumDateKey(absence.date, settings)}`, absence]))
  const days = scrumWorkingDaysInRange(from, to, settings).map((date) => {
    const key = toScrumDateKey(date, settings)
    const dots = members.map((member, index) => {
      const update = updateByUserDate.get(`${member.id}:${key}`)
      const absence = absenceByUserDate.get(`${member.id}:${key}`)
      const state = update
        ? update.hasBlocker ? 'blocker' : update.hasWin ? 'win' : update.isLate ? 'late' : update.isProxyEntry ? 'proxy' : 'submitted'
        : absence ? 'excused' : 'absent'
      return { userId: member.id, order: index, state, updateId: update?.id ?? null, absenceId: absence?.id ?? null }
    })
    const submittedCount = dots.filter((dot) => ['submitted', 'late', 'blocker', 'win', 'proxy'].includes(dot.state)).length
    const excusedCount = dots.filter((dot) => dot.state === 'excused').length
    const absentCount = dots.filter((dot) => dot.state === 'absent').length
    const blockerCount = updates.filter((u: any) => toScrumDateKey(u.scrumDate, settings) === key && u.hasBlocker).length
    const winCount = updates.filter((u: any) => toScrumDateKey(u.scrumDate, settings) === key && u.hasWin).length
    const denominator = Math.max(1, members.length - excusedCount)
    return {
      date: key,
      isWorkingDay: isScrumWorkingDay(date, settings),
      dots,
      submittedCount,
      absentCount,
      excusedCount,
      blockerCount,
      winCount,
      redTint: absentCount / denominator > 0.3,
      goldTint: submittedCount === denominator && winCount > 0,
    }
  })

  return {
    members,
    days,
    updates,
    counts: {
      updates: updates.length,
      blockers: updates.filter((u: any) => u.hasBlocker).length,
      wins: updates.filter((u: any) => u.hasWin).length,
      absences: absences.length,
    },
  }
}

export async function listCalendarMembers(session: Session, teamId?: string | null, userId?: string | null) {
  if (userId) {
    return prisma.user.findMany({ where: { id: userId, isActive: true }, select: { id: true, name: true, avatar: true, email: true }, orderBy: { name: 'asc' } })
  }
  const where: any = { isActive: true }
  if (teamId) {
    where.departmentMemberships = { some: { departmentId: teamId, endedAt: null } }
  } else if (session.user.role !== 'ADMIN' && session.user.role !== 'EXECUTIVE') {
    const memberships = await prisma.departmentMembership.findMany({
      where: { userId: session.user.id, endedAt: null },
      select: { departmentId: true },
    })
    where.OR = [
      { id: session.user.id },
      { directReports: { some: { managerId: session.user.id, endedAt: null } } },
      { departmentMemberships: { some: { departmentId: { in: memberships.map((m) => m.departmentId) }, endedAt: null } } },
    ]
  }
  return prisma.user.findMany({
    where,
    select: { id: true, name: true, avatar: true, email: true },
    orderBy: { name: 'asc' },
    take: 100,
  })
}
