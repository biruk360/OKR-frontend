/**
 * Backfill SprintCompletionSummary rows for sprints closed BEFORE the
 * completion-summary feature shipped (spec Part 7, BR-05 legacy path).
 *
 * For every COMPLETED/CANCELLED sprint without a summary row, we reconstruct
 * counts from the tasks still attached to the sprint and mark the row
 * `"backfilled": true` — the report UI shows counts but no per-task groups.
 *
 * Idempotent: skips sprints that already have a summary.
 *
 * Run: npx tsx prisma/backfill-sprint-summaries.ts [--dry-run]
 */

import { prisma } from '../lib/prisma'

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const closedWithoutSummary = await prisma.sprint.findMany({
    where: {
      state: { in: ['COMPLETED', 'CANCELLED'] },
      completionSummary: null,
    },
    select: {
      id: true,
      name: true,
      state: true,
      goalLabel: true,
      goalTarget: true,
      goalCurrent: true,
      goalUnit: true,
      reflectionNote: true,
    },
  })

  console.log(`Found ${closedWithoutSummary.length} closed sprint(s) without a completion summary`)
  if (dryRun) {
    for (const s of closedWithoutSummary) console.log(`  - ${s.name} (${s.state})`)
    return
  }

  let created = 0
  for (const s of closedWithoutSummary) {
    const completedCount = await prisma.todo.count({
      where: { sprintId: s.id, status: 'COMPLETED' },
    })
    // Legacy closes left incomplete tasks attached; whatever is still attached
    // and not completed/cancelled is our best reconstruction of "incomplete".
    const incompleteCount = await prisma.todo.count({
      where: { sprintId: s.id, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    })

    await prisma.sprintCompletionSummary.create({
      data: {
        sprintId: s.id,
        completedCount,
        incompleteCount,
        movedToNext: 0,
        movedToBacklog: 0,
        cancelledCount: 0,
        nextSprintId: null,
        dispositions: JSON.stringify({ backfilled: true }),
        goalLabel: s.goalLabel,
        goalTarget: s.goalTarget,
        goalCurrent: s.goalCurrent,
        goalUnit: s.goalUnit,
        reflectionNote: s.reflectionNote,
      },
    })
    created++
    console.log(`  ✓ ${s.name}: ${completedCount} completed / ${incompleteCount} incomplete`)
  }

  console.log(`Backfill complete — ${created} summary row(s) created`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
