/**
 * One-off backfill for `Todo.recurrenceAnchorDay` (MONTHLY/YEARLY series heads).
 *
 * The anchor used to be inferred on every generator run from ActivityLog
 * history, which is pruned after 540 days. New saves now store it; this script
 * fills it in for heads created before the column existed, using the SAME
 * history inference the generator falls back to (`inferAnchorDayFromHistory`
 * in lib/todos/recurrence-generator.ts), so the value written is exactly what
 * the generator would have used today.
 *
 * Only MONTHLY/YEARLY heads with a due date and a NULL anchor are touched
 * (archived heads too: un-archiving resumes the series). A non-null anchor is
 * never overwritten, so re-running is a no-op.
 *
 * Dry-run by default: prints one line per change and writes nothing.
 *
 * Usage:
 *   # Preview (default):
 *   npx tsx --env-file=.env --env-file=.env.local scripts/backfill-recurrence-anchor.ts
 *   # Apply:
 *   npx tsx --env-file=.env --env-file=.env.local scripts/backfill-recurrence-anchor.ts --apply
 *
 * Run it after the deploy whose `prisma db push` added the column.
 */

import { format } from 'date-fns'
import { prisma } from '../lib/prisma'
import { needsAnchorEvidence, storedAnchorDay } from '../lib/todos/recurrence'
import { inferAnchorDayFromHistory } from '../lib/todos/recurrence-generator'

const APPLY = process.argv.includes('--apply')
const PAGE_SIZE = 200
/** Read the whole (unpruned) history for a one-off run, not the generator's 20 rows. */
const LOG_LIMIT = 500

const day = (d: Date) => format(d, 'yyyy-MM-dd')

async function main() {
  console.log(
    `backfill-recurrence-anchor — ${APPLY ? 'APPLY (writing changes)' : 'DRY RUN (no writes; pass --apply to write)'}`,
  )

  let afterId: string | null = null
  let scanned = 0
  let changed = 0
  let fromHistory = 0
  let skipped = 0

  for (;;) {
    const page: Array<{
      id: string
      cardNumber: number
      title: string
      recurrenceRule: string | null
      recurrenceParentId: string | null
      recurrenceAnchorDay: number | null
      dueDate: Date | null
      archivedAt: Date | null
    }> = await prisma.todo.findMany({
      where: {
        recurrenceRule: { in: ['MONTHLY', 'YEARLY'] },
        recurrenceAnchorDay: null,
        dueDate: { not: null },
        ...(afterId && { id: { gt: afterId } }),
      },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      select: {
        id: true,
        cardNumber: true,
        title: true,
        recurrenceRule: true,
        recurrenceParentId: true,
        recurrenceAnchorDay: true,
        dueDate: true,
        archivedAt: true,
      },
    })
    if (page.length === 0) break

    for (const head of page) {
      scanned++
      const due = head.dueDate as Date
      const inferred = await inferAnchorDayFromHistory({ ...head, dueDate: due }, LOG_LIMIT)
      const anchor = storedAnchorDay(head.recurrenceRule, inferred)
      const label = `#${head.cardNumber} ${head.id} "${head.title}" [${head.recurrenceRule}${head.archivedAt ? ', archived' : ''}]`
      if (anchor === null) {
        skipped++
        console.log(`SKIP  ${label}: could not derive an anchor from due ${day(due)}`)
        continue
      }

      const monthEnd = needsAnchorEvidence(head.recurrenceRule, due)
      const source = !monthEnd
        ? 'due day (not a month end, cannot be clamped)'
        : anchor > due.getDate()
          ? `history (head clamped to day ${due.getDate()})`
          : 'month-end due; no history shows a later day'
      if (monthEnd && anchor > due.getDate()) fromHistory++

      changed++
      console.log(`SET   ${label}: recurrenceAnchorDay null -> ${anchor} (due ${day(due)}; from ${source})`)

      if (APPLY) {
        // Guarded on null so a save that stored an anchor meanwhile is never overwritten.
        await prisma.todo.updateMany({
          where: { id: head.id, recurrenceAnchorDay: null },
          data: { recurrenceAnchorDay: anchor },
        })
      }
    }

    if (page.length < PAGE_SIZE) break
    afterId = page[page.length - 1].id
  }

  console.log(
    `Scanned ${scanned} MONTHLY/YEARLY head(s) with no anchor; ${changed} ${APPLY ? 'set' : 'to set'} ` +
      `(${fromHistory} recovered from history above the head's own day); ${skipped} skipped.` +
      (APPLY ? '' : ' Nothing was written.'),
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
