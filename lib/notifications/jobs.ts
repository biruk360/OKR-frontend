/**
 * Scheduled jobs — each function is idempotent and safe to run on the documented cadence.
 * Exposed via /api/cron/* and kicked in-process by the scheduler (lib/notifications/scheduler.ts).
 */

import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'
import { emit } from './dispatcher'
import { isCheckInOverdue, type CheckInCadence } from '@/lib/check-in-cadence'
import { renderDigest, type DigestItem } from '@/lib/email/templates/digest'

/**
 * Drain EmailDigestQueue rows for a given cadence. Groups pending rows by user
 * and sends one bundled email per user.
 */
export async function runDigestDrain(cadence: 'DAILY' | 'WEEKLY' | 'MONTHLY'): Promise<{ users: number; sent: number; errors: number }> {
  const rows = await prisma.emailDigestQueue.findMany({
    where: { cadence, sentAt: null },
    orderBy: { queuedAt: 'asc' },
    take: 5000,
  })
  if (rows.length === 0) return { users: 0, sent: 0, errors: 0 }

  type QueueRow = typeof rows[number]
  const byUser = new Map<string, QueueRow[]>()
  for (const r of rows) {
    if (!byUser.has(r.userId)) byUser.set(r.userId, [])
    byUser.get(r.userId)!.push(r)
  }

  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(byUser.keys()) }, isActive: true },
    select: { id: true, email: true, name: true },
  })
  const userById = new Map(users.map((u) => [u.id, u]))

  let sent = 0, errors = 0
  // Helper: extract { deepLink, entityType, entityId } from each row's metadata JSON.
  const metaOf = (i: QueueRow): { deepLink: string | null; entityType: string | null; entityId: string | null } => {
    if (!i.metadata) return { deepLink: null, entityType: null, entityId: null }
    try {
      const m = JSON.parse(i.metadata)
      return {
        deepLink: typeof m.deepLink === 'string' ? m.deepLink : null,
        entityType: typeof m.entityType === 'string' ? m.entityType : null,
        entityId: typeof m.entityId === 'string' ? m.entityId : null,
      }
    } catch { return { deepLink: null, entityType: null, entityId: null } }
  }

  for (const [userId, items] of Array.from(byUser.entries())) {
    const user = userById.get(userId)
    if (!user) continue
    try {
      const digestItems: DigestItem[] = items.map((i: QueueRow) => {
        const m = metaOf(i)
        return {
          eventKey: i.eventKey,
          category: i.category,
          subject: i.subject,
          deepLink: m.deepLink,
          entityType: m.entityType,
          entityId: m.entityId,
        }
      })
      const { subject, text, html } = await renderDigest({
        recipientName: user.name,
        cadence,
        items: digestItems,
      })
      await sendMail({ to: user.email, toName: user.name, subject, text, html, template: `digest-${cadence.toLowerCase()}` })
      await prisma.emailDigestQueue.updateMany({
        where: { id: { in: items.map((i: QueueRow) => i.id) } },
        data: { sentAt: new Date() },
      })
      sent++
    } catch (err) {
      console.error('[digest-drain] error for', userId, err)
      errors++
    }
  }
  return { users: byUser.size, sent, errors }
}

/**
 * Scan owned objectives + KRs for overdue check-ins and fire CHECKIN_MISSED_* events.
 * 7d threshold fires CHECKIN_MISSED_7D; 14d threshold fires CHECKIN_MISSED_14D (escalates to admins).
 * Idempotency: activity_log last CHECKIN timestamp is the signal — the dispatcher dedupes in-app
 * rows by user+eventKey within the same day.
 */
export async function runCheckinEscalation(): Promise<{ scanned: number; fired7: number; fired14: number }> {
  const objectives = await prisma.objective.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, title: true, ownerId: true, isPrivate: true, checkInCadence: true, updatedAt: true },
  })
  const krs = await prisma.keyResult.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, title: true, ownerId: true, objectiveId: true, isPrivate: true, checkInCadence: true, updatedAt: true },
  })

  const now = Date.now()
  const days = (d: Date) => Math.floor((now - d.getTime()) / 86400000)
  let fired7 = 0, fired14 = 0

  for (const o of objectives) {
    const overdue = isCheckInOverdue(o.checkInCadence as CheckInCadence, o.updatedAt)
    if (!overdue) continue
    const d = days(o.updatedAt)
    if (d >= 14) {
      await emit('CHECKIN_MISSED_14D', {
        entityType: 'USER', entityId: o.ownerId, entityTitle: o.title,
        isPrivate: o.isPrivate,
        data: { entityKind: 'OBJECTIVE', deepLink: `/dashboard/objectives/${o.id}` },
      })
      fired14++
    } else if (d >= 7) {
      await emit('CHECKIN_MISSED_7D', {
        entityType: 'USER', entityId: o.ownerId, entityTitle: o.title,
        isPrivate: o.isPrivate,
        data: { entityKind: 'OBJECTIVE', deepLink: `/dashboard/objectives/${o.id}` },
      })
      fired7++
    }
  }
  for (const k of krs) {
    const overdue = isCheckInOverdue(k.checkInCadence as CheckInCadence, k.updatedAt)
    if (!overdue) continue
    const d = days(k.updatedAt)
    if (d >= 14) {
      await emit('CHECKIN_MISSED_14D', {
        entityType: 'USER', entityId: k.ownerId, entityTitle: k.title,
        isPrivate: k.isPrivate,
        data: { entityKind: 'KEY_RESULT', deepLink: `/dashboard/objectives/${k.objectiveId}` },
      })
      fired14++
    } else if (d >= 7) {
      await emit('CHECKIN_MISSED_7D', {
        entityType: 'USER', entityId: k.ownerId, entityTitle: k.title,
        isPrivate: k.isPrivate,
        data: { entityKind: 'KEY_RESULT', deepLink: `/dashboard/objectives/${k.objectiveId}` },
      })
      fired7++
    }
  }
  return { scanned: objectives.length + krs.length, fired7, fired14 }
}

/**
 * Fire TODO_DUE_TOMORROW (for assignee) and TODO_OVERDUE (assignee + manager).
 * Skips completed/cancelled todos.
 */
export async function runTodoReminders(): Promise<{ dueTomorrow: number; overdue: number }> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(today.getTime() + 86400000)
  const tomorrowEnd = new Date(tomorrowStart.getTime() + 86400000)

  const openStatuses = ['PENDING', 'IN_PROGRESS']

  const dueTomorrow = await prisma.todo.findMany({
    where: { status: { in: openStatuses }, dueDate: { gte: tomorrowStart, lt: tomorrowEnd } },
    select: { id: true, title: true, dueDate: true, assigneeId: true },
  })
  const overdue = await prisma.todo.findMany({
    where: { status: { in: openStatuses }, dueDate: { lt: today } },
    select: { id: true, title: true, dueDate: true, assigneeId: true },
  })

  for (const t of dueTomorrow) {
    await emit('TODO_DUE_TOMORROW', {
      entityType: 'TODO', entityId: t.id, entityTitle: t.title,
      data: { dueDate: t.dueDate?.toISOString().slice(0, 10) ?? '', deepLink: '/dashboard/todos' },
    })
  }
  for (const t of overdue) {
    await emit('TODO_OVERDUE', {
      entityType: 'TODO', entityId: t.id, entityTitle: t.title,
      data: { dueDate: t.dueDate?.toISOString().slice(0, 10) ?? '', deepLink: '/dashboard/todos' },
    })
  }
  return { dueTomorrow: dueTomorrow.length, overdue: overdue.length }
}

/**
 * Check each active timeframe; fire TIMEFRAME_ENDING_7D / CLOSING_1D / CLOSED as thresholds pass.
 * Uses the timeframe's id as the entity. Idempotent within a day via in-app row dedupe.
 */
export async function runTimeframeWatcher(): Promise<{ ending7: number; closing1: number; closed: number }> {
  const now = new Date()
  const timeframes = await prisma.timeframe.findMany({ where: { isActive: true } })
  let ending7 = 0, closing1 = 0, closed = 0

  for (const tf of timeframes) {
    const end = new Date(tf.endDate)
    const diffDays = Math.ceil((end.getTime() - now.getTime()) / 86400000)
    const data = {
      timeframeName: tf.name,
      endDate: end.toISOString().slice(0, 10),
    }
    if (diffDays === 7) {
      await emit('TIMEFRAME_ENDING_7D', { entityType: 'TIMEFRAME', entityId: tf.id, data })
      ending7++
    } else if (diffDays === 1) {
      await emit('TIMEFRAME_CLOSING_1D', { entityType: 'TIMEFRAME', entityId: tf.id, data })
      closing1++
    } else if (diffDays <= 0) {
      await emit('TIMEFRAME_CLOSED', { entityType: 'TIMEFRAME', entityId: tf.id, data })
      await prisma.timeframe.update({ where: { id: tf.id }, data: { isActive: false } })
      closed++
    }
  }
  return { ending7, closing1, closed }
}

/** Weekly org-health digest for admins. Summary counts only. */
export async function runAdminWeeklyHealth(): Promise<{ sent: boolean }> {
  const [activeObjectives, atRisk, offTrack] = await Promise.all([
    prisma.objective.count({ where: { status: 'ACTIVE' } }),
    prisma.objective.count({ where: { status: 'ACTIVE', goalStatus: 'AT_RISK' } }),
    prisma.objective.count({ where: { status: 'ACTIVE', goalStatus: 'OFF_TRACK' } }),
  ])
  await emit('ADMIN_WEEKLY_HEALTH_DIGEST', {
    data: { activeObjectives, atRisk, offTrack },
  })
  return { sent: true }
}

/** Monthly executive summary. */
export async function runAdminMonthlyExecSummary(): Promise<{ sent: boolean }> {
  const [avgRow, completed] = await Promise.all([
    prisma.objective.aggregate({ where: { status: 'ACTIVE' }, _avg: { progress: true } }),
    prisma.objective.count({ where: { status: 'ACTIVE', goalStatus: 'CLOSED' } }),
  ])
  await emit('ADMIN_MONTHLY_EXEC_SUMMARY', {
    data: { avgProgress: Math.round(avgRow._avg.progress ?? 0), completed },
  })
  return { sent: true }
}

