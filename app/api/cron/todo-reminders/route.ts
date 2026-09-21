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
      // A soft-archived card is hidden from the board and the list, so reminding
      // about it points the recipient at something they cannot see.
      archivedAt: null,
    },
    select: {
      id: true, title: true, dueDate: true, endTime: true,
      dueReminder: true, dueReminderSentAt: true, status: true,
      sprintId: true, assigneeId: true,
      members: { select: { userId: true } },
    },
    take: 500,
  })

  // Watcher is polymorphic so it cannot be `include`d — but it can be read once
  // for the whole batch rather than once per card, which is what this used to do.
  const due = candidates.filter((card) => shouldSendReminder(card, now))
  const watcherRows = due.length
    ? await prisma.watcher.findMany({
        where: { entityType: 'TODO', entityId: { in: due.map((c) => c.id) } },
        select: { userId: true, entityId: true },
      })
    : []
  const watchersByCard = new Map<string, string[]>()
  for (const w of watcherRows) {
    const list = watchersByCard.get(w.entityId)
    if (list) list.push(w.userId)
    else watchersByCard.set(w.entityId, [w.userId])
  }

  let sent = 0
  for (const card of due) {
    // Claim the card BEFORE emitting, conditionally on it still being unsent.
    // Two overlapping cron runs (a slow run still going at the next */5 tick)
    // would otherwise both select the row and both notify; `updateMany` with the
    // null guard makes exactly one of them win.
    const claim = await prisma.todo.updateMany({
      where: { id: card.id, dueReminderSentAt: null },
      data: { dueReminderSentAt: now },
    })
    if (claim.count === 0) continue

    // Recipients are the card's members plus its watchers, matching the copy
    // shown in the Dates popover.
    const recipients = Array.from(new Set([
      ...card.members.map((m) => m.userId),
      ...(watchersByCard.get(card.id) ?? []),
      ...(card.assigneeId ? [card.assigneeId] : []),
    ]))
    // Nobody to tell — the row is already stamped, so it stops being rescanned.
    if (recipients.length === 0) continue

    await emit('TODO_DUE_REMINDER', {
      entityType: 'TODO',
      entityId: card.id,
      entityTitle: card.title,
      explicitRecipients: recipients,
      data: {
        todoTitle: card.title,
        dueDate: card.dueDate?.toISOString() ?? '',
        reminder: reminderLabel(card.dueReminder) ?? '',
        // No deepLink here on purpose: the dispatcher derives it via
        // buildDeepLink('TODO') → /dashboard/todos?open=<id>, which the to-dos
        // page actually reads. The hand-rolled /dashboard/sprints/<id>?card=<id>
        // this used to send is not read by anything on the sprint board.
      },
    })
    sent++
  }

  return NextResponse.json({ success: true, data: { scanned: candidates.length, sent } })
}
