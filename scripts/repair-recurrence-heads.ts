/**
 * One-off repair for recurring card heads (REC-FIX-1r / REC-FIX-2r,
 * docs/recurring_subtasks_REQUIREMENTS.md §4.8).
 *
 * Before REC-FIX-1 the generator advanced a head's dueDate but never its
 * startDate, so a head's span grew by one period every run and every
 * occurrence after the first inherited the inflated span (§1.2). Before
 * REC-FIX-2 the head's own checklist item dates never moved either.
 *
 * For every series head (a card with a recurrenceRule) that has at least one
 * generated occurrence:
 *  - REC-FIX-1r: if the head has a start date, reset it to
 *      head.dueDate − span(first occurrence)
 *    where the first occurrence (earliest created) was generated before any drift.
 *  - REC-FIX-2r: shift the head's dated checklist items by
 *      head.dueDate − previousOccurrence(rule, first.dueDate)
 *    i.e. by how far the head has moved since the series began. If the fixed
 *    generator has already advanced this head (it logs `itemShiftApplied`),
 *    the delta is measured only up to that point, because from then on the
 *    generator moved the items itself.
 *  - Occurrences whose span differs from the first one's are LISTED, not changed
 *    (people may have edited them) — open question Q9 in the spec.
 *  - MONTHLY heads whose history reached a later day-of-month than the head
 *    sits on are REPORTED as possible monthly drift, not changed.
 *
 * Dry-run by default: prints one line per change and writes nothing.
 *
 * Usage:
 *   # Preview (default):
 *   npx tsx --env-file=.env --env-file=.env.local scripts/repair-recurrence-heads.ts
 *   # Apply:
 *   npx tsx --env-file=.env --env-file=.env.local scripts/repair-recurrence-heads.ts --apply
 *
 * Run it right after the REC-FIX generator is deployed and before its next
 * cron run is best, but the `itemShiftApplied` marker keeps it correct later too.
 */

import { differenceInCalendarDays, format } from 'date-fns'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import {
  RECURRENCE_JOB,
  isRecurrenceRule,
  planHeadRepair,
  shiftItemDates,
} from '../lib/todos/recurrence'

const APPLY = process.argv.includes('--apply')

const HEAD_SELECT = {
  id: true,
  cardNumber: true,
  title: true,
  recurrenceRule: true,
  recurrenceParentId: true,
  startDate: true,
  dueDate: true,
  archivedAt: true,
  checklists: { select: { items: { select: { id: true, title: true, startDate: true, dueDate: true } } } },
} as const
type RepairHead = Prisma.TodoGetPayload<{ select: typeof HEAD_SELECT }>
const PAGE_SIZE = 200

const day = (d: Date | null | undefined) => (d ? format(d, 'yyyy-MM-dd') : '—')

/** The head due date at the fixed generator's first advance, if it has run on this head. */
async function itemsAlignedFromDue(headId: string): Promise<Date | null> {
  const logs = await prisma.activityLog.findMany({
    where: { todoId: headId, entityType: 'TODO', action: 'UPDATED' },
    orderBy: { createdAt: 'asc' },
    select: { changes: true, metadata: true },
  })
  for (const log of logs) {
    const meta = log.metadata as { job?: unknown; itemShiftApplied?: unknown } | null
    if (meta?.job !== RECURRENCE_JOB || meta.itemShiftApplied !== true) continue
    const from = (log.changes as { dueDate?: { from?: unknown } } | null)?.dueDate?.from
    if (typeof from === 'string') {
      const d = new Date(from)
      if (!Number.isNaN(d.getTime())) return d
    }
  }
  return null
}

async function main() {
  console.log(`repair-recurrence-heads — ${APPLY ? 'APPLY (writing changes)' : 'DRY RUN (no writes; pass --apply to write)'}`)

  let afterId: string | null = null
  let heads = 0
  let headsChanged = 0
  let startFixes = 0
  let itemFixes = 0
  let inflatedListed = 0
  let driftReported = 0

  for (;;) {
    const page: RepairHead[] = await prisma.todo.findMany({
      where: { recurrenceRule: { not: null }, dueDate: { not: null }, ...(afterId && { id: { gt: afterId } }) },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      select: HEAD_SELECT,
    })
    if (page.length === 0) break

    for (const head of page) {
      heads++
      if (!isRecurrenceRule(head.recurrenceRule) || !head.dueDate) continue
      const lineageId = head.recurrenceParentId ?? head.id
      const occurrences = await prisma.todo.findMany({
        where: { recurrenceParentId: lineageId },
        orderBy: [{ createdAt: 'asc' }, { dueDate: 'asc' }],
        select: { id: true, cardNumber: true, startDate: true, dueDate: true },
      })
      if (occurrences.length === 0) continue

      const first = occurrences[0]
      const plan = planHeadRepair({
        rule: head.recurrenceRule,
        head: { startDate: head.startDate, dueDate: head.dueDate },
        first: { startDate: first.startDate, dueDate: first.dueDate },
        itemsAlignedFromDue: await itemsAlignedFromDue(head.id),
      })
      const label = `#${head.cardNumber} ${head.id} "${head.title}" [${head.recurrenceRule}${head.archivedAt ? ', archived' : ''}]`

      const datedItems = head.checklists.flatMap((l) => l.items).filter((i) => i.startDate || i.dueDate)
      const itemChanges =
        plan.itemDeltaDays === 0
          ? []
          : datedItems.map((i) => ({ item: i, next: shiftItemDates(i, plan.itemDeltaDays) }))

      if (plan.startDate) {
        startFixes++
        console.log(
          `HEAD  ${label}: startDate ${day(head.startDate)} -> ${day(plan.startDate)} (due ${day(head.dueDate)}, span ${plan.spanDays}d from first occurrence #${first.cardNumber})`,
        )
      }
      for (const { item, next } of itemChanges) {
        itemFixes++
        console.log(
          `ITEM  ${label}: "${item.title}" start ${day(item.startDate)} -> ${day(next.startDate)}, due ${day(item.dueDate)} -> ${day(next.dueDate)} (${plan.itemDeltaDays >= 0 ? '+' : ''}${plan.itemDeltaDays}d since original head due ${day(plan.originalHeadDue)})`,
        )
      }

      // Listed only (Q9): occurrences created with an inflated span.
      if (plan.spanDays !== null) {
        for (const o of occurrences) {
          if (!o.startDate || !o.dueDate) continue
          const s = differenceInCalendarDays(o.dueDate, o.startDate)
          if (s !== plan.spanDays) {
            inflatedListed++
            console.log(
              `LIST  ${label}: occurrence #${o.cardNumber} ${o.id} spans ${day(o.startDate)}..${day(o.dueDate)} (${s}d, expected ${plan.spanDays}d) — not changed`,
            )
          }
        }
      }

      // Reported only: a MONTHLY series whose history reached a later day than
      // the head now sits on has probably drifted (e.g. 31st → 28th).
      if (head.recurrenceRule === 'MONTHLY') {
        const maxDay = Math.max(...occurrences.filter((o) => o.dueDate).map((o) => (o.dueDate as Date).getDate()))
        const lastOfMonth = new Date(head.dueDate.getFullYear(), head.dueDate.getMonth() + 1, 0).getDate()
        if (maxDay > head.dueDate.getDate() && head.dueDate.getDate() < lastOfMonth) {
          driftReported++
          console.log(
            `DRIFT ${label}: head due on day ${head.dueDate.getDate()} but earlier occurrences reached day ${maxDay} — not changed; edit the head's due date to re-anchor`,
          )
        }
      }

      if (!plan.startDate && itemChanges.length === 0) continue
      headsChanged++

      if (APPLY) {
        await prisma.$transaction(async (tx) => {
          if (plan.startDate) {
            await tx.todo.update({ where: { id: head.id }, data: { startDate: plan.startDate } })
          }
          for (const { item, next } of itemChanges) {
            await tx.todoChecklistItem.update({ where: { id: item.id }, data: next })
          }
        })
      }
    }

    if (page.length < PAGE_SIZE) break
    afterId = page[page.length - 1].id
  }

  console.log(
    `Scanned ${heads} head(s); ${headsChanged} to ${APPLY ? 'changed' : 'change'} ` +
      `(${startFixes} start date(s), ${itemFixes} checklist item(s)); ` +
      `${inflatedListed} inflated occurrence(s) listed; ${driftReported} monthly drift report(s).` +
      (APPLY ? '' : ' Nothing was written.'),
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
