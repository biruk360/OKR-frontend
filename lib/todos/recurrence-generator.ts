import { prisma } from '@/lib/prisma'
import { occurrencesUpTo, isRecurrenceRule } from './recurrence'

/**
 * Materialises the next occurrence(s) of every recurring card.
 *
 * Copies the parts of a card that describe the *work* — title, description,
 * priority, type, OKR link, board placement, members, labels, checklist
 * structure and the reminder setting — and deliberately not the parts that
 * describe one particular run of it: completion, archive state, comments,
 * attachments, or `dueReminderSentAt` (leaving that null is what arms the new
 * card's reminder, with no extra logic).
 *
 * Members and labels matter more than they look: the reminder cron derives its
 * recipients from TodoMember + Watcher + assignee, so an occurrence generated
 * without members would silently have nobody to notify.
 */

export interface RecurrenceSummary {
  scanned: number
  generated: number
  seriesAdvanced: number
}

/** How far ahead a card appears before it is due. */
const HORIZON_DAYS = 1
/** Per-series cap, so a long-dormant daily card cannot flood the board. */
const MAX_PER_SERIES_PER_RUN = 5

export async function runTodoRecurrence(now = new Date()): Promise<RecurrenceSummary> {
  const heads = await prisma.todo.findMany({
    where: {
      recurrenceRule: { not: null },
      dueDate: { not: null },
      archivedAt: null,
    },
    include: {
      members: { select: { userId: true } },
      labels: { select: { labelDefId: true } },
      checklists: {
        include: { items: { orderBy: { position: 'asc' } } },
        orderBy: { position: 'asc' },
      },
    },
    take: 500,
  })

  const summary: RecurrenceSummary = { scanned: heads.length, generated: 0, seriesAdvanced: 0 }

  for (const head of heads) {
    if (!isRecurrenceRule(head.recurrenceRule)) continue

    const dates = occurrencesUpTo(
      {
        recurrenceRule: head.recurrenceRule,
        dueDate: head.dueDate,
        recurrenceEndsAt: head.recurrenceEndsAt,
        archivedAt: head.archivedAt,
      },
      now,
      HORIZON_DAYS,
      MAX_PER_SERIES_PER_RUN,
    )
    if (dates.length === 0) continue

    // The head's own dueDate is the series cursor, so it must advance in the
    // same transaction that creates the occurrences. If it did not, a crash
    // between the two would regenerate the same dates on the next tick.
    const lastDate = dates[dates.length - 1]

    await prisma.$transaction(async (tx) => {
      for (const due of dates) {
        // Preserve the offset between start and due so a multi-day card stays
        // multi-day rather than collapsing onto its due date.
        const span = head.startDate && head.dueDate
          ? head.dueDate.getTime() - head.startDate.getTime()
          : null
        const startDate = span !== null ? new Date(due.getTime() - span) : null

        const created = await tx.todo.create({
          data: {
            title: head.title,
            description: head.description,
            status: 'PENDING',
            priority: head.priority,
            coverColor: head.coverColor,
            coverSize: head.coverSize,
            startDate,
            dueDate: due,
            startTime: head.startTime,
            endTime: head.endTime,
            // Copied, but `dueReminderSentAt` is left null so the new card's
            // reminder arms itself on the next todo-reminders sweep.
            dueReminder: head.dueReminder,
            assigneeId: head.assigneeId,
            creatorId: head.creatorId,
            keyResultId: head.keyResultId,
            objectiveId: head.objectiveId,
            sprintId: head.sprintId,
            columnId: head.columnId,
            taskType: head.taskType,
            progressValue: head.progressValue,
            recurrenceParentId: head.recurrenceParentId ?? head.id,
            ...(head.members.length > 0 && {
              members: { create: head.members.map((m) => ({ userId: m.userId })) },
            }),
            ...(head.labels.length > 0 && {
              labels: { create: head.labels.map((l) => ({ labelDefId: l.labelDefId })) },
            }),
          },
          select: { id: true },
        })

        // Checklists come across unchecked — the structure is the template, the
        // ticks belong to the occurrence that was completed.
        for (const list of head.checklists) {
          await tx.todoChecklist.create({
            data: {
              todoId: created.id,
              title: list.title,
              position: list.position,
              items: {
                create: list.items.map((item) => ({
                  title: item.title,
                  position: item.position,
                  assigneeId: item.assigneeId,
                  // Structure copies across; the ticks and the completion
                  // timestamp belong to the occurrence that was worked on.
                  completed: false,
                  completedAt: null,
                })),
              },
            },
          })
        }

        summary.generated++
      }

      await tx.todo.update({
        where: { id: head.id },
        data: { dueDate: lastDate },
      })
    })

    summary.seriesAdvanced++
  }

  return summary
}
