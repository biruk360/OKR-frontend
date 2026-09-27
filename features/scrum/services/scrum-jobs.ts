import { prisma } from '@/lib/prisma'
import { SUBMITTED_SCRUM_UPDATE_WHERE } from './drafts'
import { emitNow } from '@/lib/notifications'
import { absoluteUrl } from '@/lib/notifications/deep-link'
import { getScrumSettings } from './settings'
import { dateFromDateKey, isScrumWorkingDay, scrumWorkingDaysInRange, toScrumDateKey } from './working-days'
import { shouldSendTeamMoodAlert, trailingRedMoodStreak, type MoodReport } from './mood-alert'
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
      prisma.scrumUpdate.findMany({ where: { userId: { in: reportIds }, scrumDate: date, ...SUBMITTED_SCRUM_UPDATE_WHERE } }),
      prisma.scrumAbsence.findMany({ where: { userId: { in: reportIds }, date } }),
    ])
    await emitNow('SCRUM_MANAGER_DIGEST', {
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
      ...SUBMITTED_SCRUM_UPDATE_WHERE,
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
      where: { userId: { in: recipients }, scrumDate: { lte: dateFromDateKey(dateKey) }, ...SUBMITTED_SCRUM_UPDATE_WHERE },
      orderBy: { scrumDate: 'desc' },
      take: 200,
    })
    await emitNow('SCRUM_WEEKLY_DIGEST', {
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
    await emitNow('SCRUM_OBJECTIVE_NEGLECTED', {
      entityType: 'OBJECTIVE',
      entityId: objective.id,
      entityTitle: objective.title,
      explicitRecipients: [objective.ownerId, ceoId?.companyCeoUserId].filter(Boolean) as string[],
      data: { objectiveId: objective.id, thresholdDays: settings.objectiveNeglectDays },
    })
  }
  const moodAlerts = settings.moodEnabled ? await runTeamMoodAlerts(now, settings, ceoId?.companyCeoUserId ?? null) : 0
  return { checkedAt: now.toISOString(), neglectedObjectives: staleObjectives.length, moodAlerts }
}

/**
 * SCRUM_TEAM_MOOD_ALERT (spec S8 SC5 / §12): a department whose aggregated mood
 * has been red for `moodAlertDays` consecutive completed working days alerts
 * the CEO (fallback: active EXECUTIVEs). Only team aggregates leave this
 * function — never an individual's mood. Idempotent per department per day.
 */
async function runTeamMoodAlerts(now: Date, settings: Awaited<ReturnType<typeof getScrumSettings>>, ceoUserId: string | null) {
  const threshold = Math.max(1, settings.moodAlertDays)
  const todayKey = toScrumDateKey(now, settings)
  // Completed working days only (the job runs before the day's standup).
  const windowStart = new Date(dateFromDateKey(todayKey).getTime() - (threshold * 3 + 14) * 24 * 60 * 60 * 1000)
  const dayKeys = scrumWorkingDaysInRange(windowStart, dateFromDateKey(todayKey), settings)
    .map((date) => toScrumDateKey(date, settings))
    .filter((key) => key < todayKey)
  if (dayKeys.length < threshold) return 0
  const recipients = ceoUserId
    ? [ceoUserId]
    : (await prisma.user.findMany({ where: { role: 'EXECUTIVE', isActive: true }, select: { id: true } })).map((u) => u.id)
  if (recipients.length === 0) return 0

  const departments = await prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true } })
  const runDate = dateFromDateKey(todayKey)
  let sent = 0
  for (const dept of departments) {
    const members = await prisma.departmentMembership.findMany({ where: { departmentId: dept.id, endedAt: null }, select: { userId: true } })
    const memberIds = [...new Set(members.map((m) => m.userId))]
    if (memberIds.length === 0) continue
    const updates = await prisma.scrumUpdate.findMany({
      where: { userId: { in: memberIds }, scrumDate: { gte: dateFromDateKey(dayKeys[0]), lte: dateFromDateKey(dayKeys[dayKeys.length - 1]) }, mood: { not: null }, ...SUBMITTED_SCRUM_UPDATE_WHERE },
      select: { userId: true, scrumDate: true, mood: true },
    })
    const reportsByDay = new Map<string, MoodReport[]>()
    for (const update of updates) {
      const key = toScrumDateKey(update.scrumDate, settings)
      const list = reportsByDay.get(key) ?? []
      list.push({ userId: update.userId, mood: update.mood })
      reportsByDay.set(key, list)
    }
    const streak = trailingRedMoodStreak(dayKeys, reportsByDay)
    if (!shouldSendTeamMoodAlert(streak, threshold)) continue
    const jobKey = `scrum-mood-alert:${dept.id}`
    const already = await prisma.scrumJobRun.findUnique({
      where: { jobKey_userId_runDate: { jobKey, userId: dept.id, runDate } },
      select: { id: true },
    })
    if (already) continue
    await emitNow('SCRUM_TEAM_MOOD_ALERT', {
      entityType: 'SCRUM_UPDATE',
      explicitRecipients: recipients,
      data: { teamId: dept.id, teamName: dept.name, streakDays: streak, thresholdDays: threshold, deepLink: '/dashboard/scrum?view=analytics' },
    })
    await prisma.scrumJobRun.create({ data: { jobKey, userId: dept.id, runDate, metadata: { streakDays: streak } } })
    sent++
  }
  return sent
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
      // A saved draft is not a submission — the reminder/nudge still goes out.
      prisma.scrumUpdate.findFirst({ where: { userId: user.id, scrumDate: date, ...SUBMITTED_SCRUM_UPDATE_WHERE }, select: { id: true } }),
      prisma.scrumAbsence.findUnique({ where: { userId_date: { userId: user.id, date } }, select: { id: true } }),
      prisma.scrumJobRun.findUnique({ where: { jobKey_userId_runDate: { jobKey, userId: user.id, runDate: date } }, select: { id: true } }),
    ])
    if (update || absence || jobRun) continue
    const prefill = await getScrumPrefill(user.id, now)
    await emitNow(eventKey, {
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
