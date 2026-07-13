import { prisma } from '@/lib/prisma'
import { emit } from '@/lib/notifications'
import { absoluteUrl } from '@/lib/notifications/deep-link'
import { getScrumSettings } from './settings'
import { dateFromDateKey, isScrumWorkingDay, toScrumDateKey } from './working-days'
import { getScrumPrefill } from './prefill'
import { escalateScrumBlocker } from './blocker-actions'

export async function runScrumReminder(now = new Date()) {
  return notifyMissing('SCRUM_REMINDER', now, 'scrum-reminder')
}

export async function runScrumNudge(now = new Date()) {
  return notifyMissing('SCRUM_MISSED', now, 'scrum-nudge')
}

export async function runScrumFinalize(now = new Date()) {
  const settings = await getScrumSettings()
  if (!isScrumWorkingDay(now, settings)) return { skipped: true, reason: 'non-working-day' }
  const dateKey = toScrumDateKey(now, settings)
  const date = dateFromDateKey(dateKey)
  const managers = await prisma.managerRelationship.findMany({
    where: { endedAt: null },
    select: { managerId: true, directReportId: true },
  })
  const byManager = new Map<string, string[]>()
  for (const row of managers) {
    const list = byManager.get(row.managerId) ?? []
    list.push(row.directReportId)
    byManager.set(row.managerId, list)
  }
  let digests = 0
  for (const [managerId, reportIds] of byManager) {
    const [updates, absences] = await Promise.all([
      prisma.scrumUpdate.findMany({ where: { userId: { in: reportIds }, scrumDate: date } }),
      prisma.scrumAbsence.findMany({ where: { userId: { in: reportIds }, date } }),
    ])
    await emit('SCRUM_MANAGER_DIGEST', {
      entityType: 'SCRUM_UPDATE',
      explicitRecipients: [managerId],
      data: {
        submittedCount: updates.length,
        missingCount: Math.max(0, reportIds.length - updates.length - absences.length),
        blockerCount: updates.filter((update) => update.hasBlocker).length,
        deepLink: `/dashboard/scrum?view=day&date=${dateKey}`,
      },
    })
    digests++
  }

  const recurring = await prisma.scrumUpdate.findMany({
    where: {
      scrumDate: date,
      hasBlocker: true,
      blockerStatus: { in: ['RECURRING', 'ESCALATED'] },
      blockerDaysOpen: { gte: settings.escalationThresholdDays },
      escalatedAt: null,
    },
    select: { id: true, submittedById: true },
  })
  for (const update of recurring) {
    await escalateScrumBlocker({ user: { id: update.submittedById, role: 'ADMIN' } } as any, update.id)
  }
  return { skipped: false, digests, escalated: recurring.length }
}

export async function runScrumWeekly(now = new Date()) {
  const settings = await getScrumSettings()
  if (!isScrumWorkingDay(now, settings)) return { skipped: true, reason: 'non-working-day' }
  const dateKey = toScrumDateKey(now, settings)
  const departments = await prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true } })
  let sent = 0
  for (const dept of departments) {
    const members = await prisma.departmentMembership.findMany({ where: { departmentId: dept.id, endedAt: null }, select: { userId: true } })
    const recipients = members.map((m) => m.userId)
    if (recipients.length === 0) continue
    const updates = await prisma.scrumUpdate.findMany({
      where: { userId: { in: recipients }, scrumDate: { lte: dateFromDateKey(dateKey) } },
      orderBy: { scrumDate: 'desc' },
      take: 200,
    })
    await emit('SCRUM_WEEKLY_DIGEST', {
      entityType: 'SCRUM_UPDATE',
      explicitRecipients: recipients,
      data: {
        teamName: dept.name,
        winCount: updates.filter((u) => u.hasWin).length,
        openBlockerCount: updates.filter((u) => u.hasBlocker && u.blockerStatus !== 'RESOLVED').length,
        deepLink: '/dashboard/scrum/wins',
      },
    })
    sent++
  }
  return { skipped: false, sent }
}

export async function runScrumHealth(now = new Date()) {
  const settings = await getScrumSettings()
  const ceoId = await prisma.organizationSettings.findUnique({ where: { id: 'singleton' }, select: { companyCeoUserId: true } })
  const staleObjectives = await prisma.objective.findMany({
    where: { status: 'ACTIVE', scrumLinks: { none: {} } },
    select: { id: true, title: true, ownerId: true },
    take: 50,
  })
  for (const objective of staleObjectives) {
    await emit('SCRUM_OBJECTIVE_NEGLECTED', {
      entityType: 'OBJECTIVE',
      entityId: objective.id,
      entityTitle: objective.title,
      explicitRecipients: [objective.ownerId, ceoId?.companyCeoUserId].filter(Boolean) as string[],
      data: { objectiveId: objective.id, thresholdDays: settings.objectiveNeglectDays },
    })
  }
  return { checkedAt: now.toISOString(), neglectedObjectives: staleObjectives.length }
}

async function notifyMissing(eventKey: 'SCRUM_REMINDER' | 'SCRUM_MISSED', now: Date, jobKey: string) {
  const settings = await getScrumSettings()
  if (!isScrumWorkingDay(now, settings)) return { skipped: true, reason: 'non-working-day' }
  const dateKey = toScrumDateKey(now, settings)
  const date = dateFromDateKey(dateKey)
  const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true } })
  let sent = 0
  for (const user of users) {
    const [update, absence, jobRun] = await Promise.all([
      prisma.scrumUpdate.findUnique({ where: { userId_scrumDate: { userId: user.id, scrumDate: date } }, select: { id: true } }),
      prisma.scrumAbsence.findUnique({ where: { userId_date: { userId: user.id, date } }, select: { id: true } }),
      prisma.scrumJobRun.findUnique({ where: { jobKey_userId_runDate: { jobKey, userId: user.id, runDate: date } }, select: { id: true } }),
    ])
    if (update || absence || jobRun) continue
    const prefill = await getScrumPrefill(user.id, now)
    await emit(eventKey, {
      entityType: 'SCRUM_UPDATE',
      explicitRecipients: [user.id],
      data: {
        name: user.name,
        previousPlan: prefill.yesterdayDone,
        deepLink: absoluteUrl(`/dashboard/scrum?date=${dateKey}`),
      },
    })
    await prisma.scrumJobRun.create({ data: { jobKey, userId: user.id, runDate: date } })
    sent++
  }
  return { skipped: false, sent }
}
