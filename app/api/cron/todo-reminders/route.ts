import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { emit } from '@/lib/notifications'
import { shouldSendReminder, reminderLabel } from '@/lib/todos/due-reminders'

/**
 * Per-card due-date reminders (DTE-4).
 *
 * Run frequently — every 5 minutes — because the shortest lead time the UI
 * offers is "5 minutes before". Hit from VPS cron with
 * `Authorization: Bearer $CRON_SECRET`, matching the other cron routes.
 *
 * Idempotent: `dueReminderSentAt` is stamped after a successful emit, so a
 * re-run in the same window sends nothing. It is cleared whenever `dueDate` or
 * `dueReminder` changes, so a rescheduled card reminds again.
 */
export async function POST(request: NextRequest) { return handle(request) }
export async function GET(request: NextRequest) { return handle(request) }

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ success: false, error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  if ((request.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Bound the scan: only cards with a reminder still pending, due within a
  // window wide enough to cover the longest lead time (2 days) plus grace.
  const horizon = new Date(now.getTime() + 3 * 24 * 60 * 60_000)
  const candidates = await prisma.todo.findMany({
    where: {
      dueReminder: { not: null },
      dueReminderSentAt: null,
      dueDate: { not: null, lte: horizon },
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    },
    select: {
      id: true, title: true, dueDate: true, endTime: true,
      dueReminder: true, dueReminderSentAt: true, status: true,
      sprintId: true, assigneeId: true,
      members: { select: { userId: true } },
    },
    take: 500,
  })

  let sent = 0
  for (const card of candidates) {
    if (!shouldSendReminder(card, now)) continue

    // Recipients are the card's members plus its watchers, matching the copy
    // shown in the Dates popover. Watcher is polymorphic, so it needs its own read.
    const watchers = await prisma.watcher.findMany({
      where: { entityType: 'TODO', entityId: card.id },
      select: { userId: true },
    })
    const recipients = Array.from(new Set([
      ...card.members.map((m) => m.userId),
      ...watchers.map((w) => w.userId),
      ...(card.assigneeId ? [card.assigneeId] : []),
    ]))
    if (recipients.length === 0) {
      // Nobody to tell — still stamp it so the row stops being rescanned.
      await prisma.todo.update({ where: { id: card.id }, data: { dueReminderSentAt: now } })
      continue
    }

    await emit('TODO_DUE_REMINDER', {
      entityType: 'TODO',
      entityId: card.id,
      entityTitle: card.title,
      explicitRecipients: recipients,
      data: {
        todoTitle: card.title,
        dueDate: card.dueDate?.toISOString() ?? '',
        reminder: reminderLabel(card.dueReminder) ?? '',
        deepLink: card.sprintId
          ? `/dashboard/sprints/${card.sprintId}?card=${card.id}`
          : `/dashboard/todos`,
      },
    })
    await prisma.todo.update({ where: { id: card.id }, data: { dueReminderSentAt: now } })
    sent++
  }

  return NextResponse.json({ success: true, data: { scanned: candidates.length, sent } })
}
