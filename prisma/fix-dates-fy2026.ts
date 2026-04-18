/**
 * One-time migration: align all Timeframe and Objective date ranges to
 * FY2025/26 (Sep 1, 2025 – Jul 30, 2026).
 *
 * Run: npx tsx prisma/fix-dates-fy2026.ts
 *
 * Safe to re-run (idempotent) — upserts by timeframe name where possible,
 * and only updates objectives whose dates are outside the FY window.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const FY_START = new Date(2025, 8, 1)          // Sep 1, 2025
const FY_END   = new Date(2026, 6, 30, 23, 59, 59, 999) // Jul 30, 2026

async function main() {
  console.log('=== fix-dates-fy2026: aligning OKR dates to FY Sep 2025 – Jul 30 2026 ===')

  // 1. Update all Timeframes to the FY window
  const timeframes = await prisma.timeframe.findMany()
  console.log(`Found ${timeframes.length} timeframe(s)`)

  for (const tf of timeframes) {
    await prisma.timeframe.update({
      where: { id: tf.id },
      data: { startDate: FY_START, endDate: FY_END },
    })
    console.log(`  Updated timeframe "${tf.name}" (${tf.id})`)
  }

  // 2. Update Objectives that have explicit startDate/endDate outside FY window
  const objectives = await prisma.objective.findMany({
    where: {
      OR: [
        { startDate: { not: null } },
        { endDate: { not: null } },
      ],
    },
    select: { id: true, title: true, startDate: true, endDate: true },
  })

  let objUpdated = 0
  for (const obj of objectives) {
    const needsStart = obj.startDate && (obj.startDate < FY_START || obj.startDate > FY_END)
    const needsEnd   = obj.endDate   && (obj.endDate   < FY_START || obj.endDate   > FY_END)

    if (needsStart || needsEnd) {
      await prisma.objective.update({
        where: { id: obj.id },
        data: {
          ...(needsStart ? { startDate: FY_START } : {}),
          ...(needsEnd   ? { endDate:   FY_END   } : {}),
        },
      })
      console.log(`  Updated objective dates: "${obj.title}"`)
      objUpdated++
    }
  }
  console.log(`Updated ${objUpdated} objective(s) with out-of-range dates`)

  // 3. Run confidence recalc so all KRs reflect the new timeframe window
  console.log('\nRe-running confidence calculation against new dates...')
  const { runConfidenceCalculation } = await import('../lib/confidence-calc')
  const result = await runConfidenceCalculation()
  console.log(`Confidence recalc: ${result.krsProcessed} KRs, ${result.objectivesUpdated} objectives, ${result.snapshotsCreated} snapshots, ${result.errors} errors`)

  console.log('\nDone.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
