import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { inviteToSprint } from '@/lib/sprints/participants'
import {
  RECURRENCE_JOB,
  anchorEvidenceFromLogs,
  inferAnchorDay,
  isRecurrenceRule,
  needsAnchorEvidence,
  planSeriesAdvance,
  shiftItemDates,
  storedAnchorDay,
} from './recurrence'

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
 *
 * The date maths (span, checklist offsets, head advance, anchor day) lives in
 * `planSeriesAdvance` in ./recurrence.ts so it is unit-tested without a DB;
 * this file only reads and writes rows.
 */

export interface RecurrenceSummary {
  scanned: number
  generated: number
  seriesAdvanced: number
  /** Series whose transaction threw; logged and retried on the next run. */
  failed: number
}

/** How far ahead a card appears before it is due. */
const HORIZON_DAYS = 1
/** Per-series cap, so a long-dormant daily card cannot flood the board. */
const MAX_PER_SERIES_PER_RUN = 5
/** Heads read per page; every page is processed, so there is no series cap. */
const PAGE_SIZE = 200

const HEAD_INCLUDE = {
  members: { select: { userId: true } },
  labels: { select: { labelDefId: true } },
  checklists: {
    include: { items: { orderBy: { position: 'asc' as const } } },
    orderBy: { position: 'asc' as const },
  },
}

/** Thrown inside the transaction when the head moved under us (another run or a user edit). */
class HeadMovedError extends Error {}

export async function runTodoRecurrence(now = new Date()): Promise<RecurrenceSummary> {
  const summary: RecurrenceSummary = { scanned: 0, generated: 0, seriesAdvanced: 0, failed: 0 }

  // Keyset pagination by id: a page is never re-read, and advancing a head's
  // dueDate inside the loop cannot shift later pages. Replaces a single
  // `take: 500`, beyond which series silently never generated.
  let afterId: string | null = null
  for (;;) {
    const heads: Head[] = await prisma.todo.findMany({
      where: {
        recurrenceRule: { not: null },
        dueDate: { not: null },
        archivedAt: null,
        ...(afterId && { id: { gt: afterId } }),
      },
      include: HEAD_INCLUDE,
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
    })
    if (heads.length === 0) break
    summary.scanned += heads.length

    for (const head of heads) {
      try {
        const generated = await advanceSeries(head, now)
        if (generated > 0) {
          summary.generated += generated
          summary.seriesAdvanced++
        }
      } catch (err) {
        if (err instanceof HeadMovedError) continue
        // One bad series must not stop every other series from generating.
        summary.failed++
        console.error('[todo-recurrence] series failed', { headId: head.id, err })
      }
    }

    if (heads.length < PAGE_SIZE) break
    afterId = heads[heads.length - 1].id
  }

  return summary
}

type Head = Prisma.TodoGetPayload<{ include: typeof HEAD_INCLUDE }>

/** Where this head's occurrences point (a head that is itself a copy keeps its lineage). */
function lineageOf(head: { id: string; recurrenceParentId: string | null }): string {
  return head.recurrenceParentId ?? head.id
}

/**
 * MONTHLY/YEARLY anchor day. The stored `recurrenceAnchorDay` wins whenever it
 * is set (it is written when the user saves the rule or due date, and the
 * generator never changes it). Only a legacy head with a null anchor falls back
 * to history: and only a head sitting on the last day of its month can be a
 * clamped date, so only then is history read (two small queries). See
 * `inferAnchorDay` for the rules and their limits (the logs it reads are
 * pruned after 540 days, which is why the anchor is now stored).
 */
async function resolveAnchorDay(head: Head): Promise<number | null> {
  const stored = storedAnchorDay(head.recurrenceRule, head.recurrenceAnchorDay)
  if (stored !== null) return stored
  return inferAnchorDayFromHistory(head as HistoryHead)
}

type HistoryHead = {
  id: string
  recurrenceRule: string | null
  recurrenceParentId: string | null
  dueDate: Date
}

/**
 * Legacy fallback (and the backfill's source, scripts/backfill-recurrence-anchor.ts):
 * infer a head's anchor from its due date plus ActivityLog / occurrence history.
 * `logLimit` bounds how many of the head's newest activity rows are read.
 */
export async function inferAnchorDayFromHistory(
  head: HistoryHead,
  logLimit = 20,
): Promise<number | null> {
  const due = head.dueDate
  if (!needsAnchorEvidence(head.recurrenceRule, due)) {
    return inferAnchorDay(head.recurrenceRule, due)
  }
  const logs = await prisma.activityLog.findMany({
    where: { todoId: head.id, entityType: 'TODO' },
    orderBy: { createdAt: 'desc' },
    take: logLimit,
    select: { changes: true, metadata: true, createdAt: true },
  })
  const fromLogs = anchorEvidenceFromLogs(logs)
  const occurrences = await prisma.todo.findMany({
    where: {
      recurrenceParentId: lineageOf(head),
      dueDate: { not: null },
      // Occurrences from before a user re-anchored the head describe the old anchor.
      ...(fromLogs.reanchoredAt && { createdAt: { gt: fromLogs.reanchoredAt } }),
    },
    orderBy: { dueDate: 'desc' },
    take: 13,
    select: { dueDate: true },
  })
  return inferAnchorDay(head.recurrenceRule, due, [
    ...fromLogs.dates,
    ...occurrences.map((o) => o.dueDate),
  ])
}

async function advanceSeries(head: Head, now: Date): Promise<number> {
  if (!isRecurrenceRule(head.recurrenceRule) || !head.dueDate) return 0

  const base = {
    recurrenceRule: head.recurrenceRule,
    dueDate: head.dueDate,
    recurrenceEndsAt: head.recurrenceEndsAt,
    archivedAt: head.archivedAt,
    startDate: head.startDate,
    // A stored anchor makes the gate below exact; null keeps the old behaviour
    // (the head's own day, which never under-generates: it is ≤ the anchor).
    anchorDay: storedAnchorDay(head.recurrenceRule, head.recurrenceAnchorDay),
  }
  // Cheap gate first: skip the anchor lookup for series with nothing due yet.
  if (!planSeriesAdvance(base, now, HORIZON_DAYS, MAX_PER_SERIES_PER_RUN)) return 0

  const anchorDay = await resolveAnchorDay(head)
  const plan = planSeriesAdvance({ ...base, anchorDay }, now, HORIZON_DAYS, MAX_PER_SERIES_PER_RUN)
  if (!plan) return 0

  const headDueAtRead = head.dueDate
  const lineageId = lineageOf(head)
  const headItems = head.checklists.flatMap((l) => l.items)
  const datedHeadItems = headItems.filter((i) => i.startDate || i.dueDate)

  const createdIds = await prisma.$transaction(async (tx) => {
    // The head's dueDate is the series cursor, so it advances in the same
    // transaction that creates the occurrences: a crash between the two would
    // otherwise regenerate the same dates on the next tick. The guard on the
    // values we read makes a concurrent run, or a user editing the head right
    // now, roll this series back instead of duplicating cards or overwriting
    // the user's edit.
    const claimed = await tx.todo.updateMany({
      where: {
        id: head.id,
        dueDate: headDueAtRead,
        startDate: head.startDate,
        recurrenceRule: head.recurrenceRule,
        // The plan was computed with this anchor; a concurrent re-anchor or
        // backfill rolls this run back and it is retried on the next tick.
        recurrenceAnchorDay: head.recurrenceAnchorDay,
        archivedAt: null,
      },
      // NB: `recurrenceAnchorDay` is deliberately NOT in `data` — advancing the
      // cursor (Jan 31 → Feb 28) must never overwrite the series' anchor.
      data: {
        dueDate: plan.head.dueDate,
        // REC-FIX-1: the start moves with the cursor, keeping the span.
        ...(plan.head.startDate && { startDate: plan.head.startDate }),
      },
    })
    if (claimed.count !== 1) throw new HeadMovedError()

    const ids: string[] = []
    for (const occ of plan.occurrences) {
      const created = await tx.todo.create({
        data: {
          title: head.title,
          description: head.description,
          status: 'PENDING',
          priority: head.priority,
          coverColor: head.coverColor,
          coverSize: head.coverSize,
          startDate: occ.startDate,
          dueDate: occ.dueDate,
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
          // NOTE: copying progressValue is flagged as an open question in
          // docs/recurring_subtasks_REQUIREMENTS.md §1.1 (each completed
          // occurrence adds it to the KR again). Left unchanged pending the
          // product owner's decision.
          progressValue: head.progressValue,
          recurrenceParentId: lineageId,
          ...(head.members.length > 0 && {
            members: { create: head.members.map((m) => ({ userId: m.userId })) },
          }),
          ...(head.labels.length > 0 && {
            labels: { create: head.labels.map((l) => ({ labelDefId: l.labelDefId })) },
          }),
        },
        select: { id: true },
      })
      ids.push(created.id)

      // Checklists come across unchecked — the structure is the template, the
      // ticks belong to the occurrence that was completed. Item dates keep
      // their place relative to the card (REC-FIX-2).
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
                ...shiftItemDates(item, occ.itemOffsetDays),
                completed: false,
                completedAt: null,
              })),
            },
          },
        })
      }
    }

    // REC-FIX-2, second half: the head's own dated items move with the head,
    // otherwise the offset above is wrong from the second run on. Ticks are
    // left alone.
    if (plan.headItemShiftDays !== 0) {
      for (const item of datedHeadItems) {
        await tx.todoChecklistItem.update({
          where: { id: item.id },
          data: shiftItemDates(item, plan.headItemShiftDays),
        })
      }
    }

    // ── Sprint access (invite-only boards, 2026-09-25) ──────────────────────
    // The copied assignee/members are put on a sprint card, which is an
    // invitation to its board. Idempotent; never removes anyone.
    if (ids.length > 0) {
      await inviteToSprint(tx, head.sprintId, [head.assigneeId, ...head.members.map((m) => m.userId)])
    }

    return ids
  })

  // Audit, best-effort after commit (as every route does). A system action has
  // no actor: `actorId: null` + `metadata.source: 'cron'`, as in
  // app/api/cron/sprint-tick; the card modal renders it as "System".
  const meta = { source: 'cron', job: RECURRENCE_JOB }
  for (let i = 0; i < createdIds.length; i++) {
    await recordActivity({
      entityType: 'TODO',
      todoId: createdIds[i],
      action: 'INITIATIVE_CREATED',
      actorId: null,
      metadata: {
        ...meta,
        title: head.title,
        assigneeId: head.assigneeId,
        recurrenceParentId: lineageId,
        dueDate: plan.occurrences[i].dueDate.toISOString(),
      },
    })
  }
  // The head advance is logged too. Its `changes.dueDate.from` is also the
  // evidence `resolveAnchorDay` reads to recover a clamped month-end anchor.
  await recordActivity({
    entityType: 'TODO',
    todoId: head.id,
    action: 'UPDATED',
    actorId: null,
    changes: {
      dueDate: { from: headDueAtRead.toISOString(), to: plan.head.dueDate.toISOString() },
      ...(plan.head.startDate &&
        head.startDate && {
          startDate: { from: head.startDate.toISOString(), to: plan.head.startDate.toISOString() },
        }),
    },
    metadata: {
      ...meta,
      generated: createdIds.length,
      anchorDay: plan.anchorDay,
      // Lets scripts/repair-recurrence-heads.ts (REC-FIX-2r) know that from
      // this advance on, the head's items were shifted by the generator.
      itemsShiftedDays: datedHeadItems.length > 0 ? plan.headItemShiftDays : 0,
      itemShiftApplied: true,
    },
  })

  return createdIds.length
}
