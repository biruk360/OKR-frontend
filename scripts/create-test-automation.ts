/**
 * Create a self-test automation that fires shortly after you run this.
 *
 *   npx tsx scripts/create-test-automation.ts            # fires in 5 minutes
 *   npx tsx scripts/create-test-automation.ts --minutes 2
 *   npx tsx scripts/create-test-automation.ts --remove   # delete it again
 *
 * Why this exists: the unit tests and the smoke harness both stub the AI
 * provider, so until something fires on a real schedule, on the real server,
 * with a real provider call, the scheduling path is unproven. This creates the
 * smallest automation that exercises the whole chain — cron tick -> enqueue ->
 * worker claim -> okr.query -> OpenAI synthesis -> Briefing render — and leaves
 * it in place so it can be re-run by hand from the UI afterwards.
 *
 * It is created in DRY_RUN with no recipients, so nothing can be emailed.
 */

import { prisma } from '../lib/prisma'
import { computeNextRunAt } from '../lib/automations/schedule'
import type { PlanSpec } from '../types/automations'

const args = process.argv.slice(2)
const REMOVE = args.includes('--remove')
const minutesIdx = args.indexOf('--minutes')
const MINUTES = minutesIdx >= 0 ? Number(args[minutesIdx + 1]) : 5

const NAME = 'Self-test — scheduler health check'

async function main(): Promise<void> {
  const existing = await prisma.automation.findFirst({
    where: { name: NAME, deletedAt: null },
    select: { id: true, name: true, nextRunAt: true },
  })

  if (REMOVE) {
    if (!existing) {
      console.log('Nothing to remove.')
      return
    }
    await prisma.automation.delete({ where: { id: existing.id } })
    console.log(`Removed "${existing.name}" (${existing.id}) and its runs/briefings.`)
    return
  }

  const owner = await prisma.user.findFirst({
    where: { isActive: true, role: { in: ['ADMIN', 'EXECUTIVE'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, email: true, role: true },
  })
  if (!owner) {
    console.error('No active ADMIN/EXECUTIVE user to own the automation.')
    process.exit(1)
  }

  // ONCE fires at a single instant, which is exactly what a "in N minutes"
  // health check wants — it will not keep firing after the test.
  const runAt = new Date(Date.now() + MINUTES * 60_000)

  const plan: PlanSpec = {
    version: 1,
    schedule: {
      kind: 'ONCE',
      timezone: 'Africa/Addis_Ababa',
      runAt: runAt.toISOString(),
      // The tick runs every minute; without this the deterministic per-automation
      // jitter could hold the slot back by up to five more minutes.
      jitterSeconds: 0,
      catchUpPolicy: 'RUN_LATE',
      catchUpWindowMinutes: 60,
    },
    steps: [{
      id: 's1',
      tool: 'okr.query',
      label: 'Read a little internal data',
      params: { entities: ['objectives', 'keyResults'], scope: 'ORG', limit: 10 },
    }],
    synthesis: {
      objective:
        'This is an automated health check of the scheduler. Summarise, in two or three sentences, ' +
        'what data you were given, and list up to five items as findings so the diffing and rendering ' +
        'paths are exercised. Do not editorialise.',
      findingSchema: { dedupeKeyFields: ['title'], fields: ['status', 'owner'] },
      maxFindings: 5,
    },
    briefing: { titleTemplate: 'Scheduler self-test — {{date}}', tone: 'plain and factual' },
    // No recipients and onEmpty SEND, so a briefing is produced even when the
    // org has no data — an empty result should still prove the pipeline ran.
    notify: { emailRecipients: [], inApp: false, onEmpty: 'SEND' },
    limits: { maxCostUsd: 0.25, timeoutSeconds: 300 },
  }

  if (existing) {
    const updated = await prisma.automation.update({
      where: { id: existing.id },
      data: {
        planJson: plan as unknown as object,
        planVersion: { increment: 1 },
        scheduleKind: 'ONCE',
        scheduleJson: plan.schedule as unknown as object,
        status: 'ENABLED',
        nextRunAt: runAt,
      },
      select: { id: true, planVersion: true },
    })
    console.log(`Re-armed existing automation ${updated.id} (plan v${updated.planVersion}).`)
    console.log(`  fires at: ${runAt.toISOString()}  (in ${MINUTES} min)`)
    return
  }

  const automation = await prisma.automation.create({
    data: {
      name: NAME,
      description: 'Created by scripts/create-test-automation.ts. Safe to delete.',
      ownerId: owner.id,
      createdById: owner.id,
      instructionText:
        'Every so often, read a few objectives and key results and write a short briefing, ' +
        'purely to prove the scheduler, the worker and the AI synthesis all still work.',
      planJson: plan as unknown as object,
      scheduleKind: 'ONCE',
      scheduleJson: plan.schedule as unknown as object,
      timezone: 'Africa/Addis_Ababa',
      mode: 'DRY_RUN',
      status: 'ENABLED',
      toolGrants: [{ tool: 'okr.query' }] as unknown as object,
      recipientsJson: [] as unknown as object,
      maxCostUsdPerRun: 0.25,
      maxCostUsdMonth: 5,
      timeoutSeconds: 300,
      nextRunAt: runAt,
    },
    select: { id: true },
  })

  // Sanity-check that the schedule engine agrees this will fire.
  const predicted = computeNextRunAt(plan.schedule, new Date())
  console.log(`Created "${NAME}"`)
  console.log(`  id:        ${automation.id}`)
  console.log(`  owner:     ${owner.name} <${owner.email}> (${owner.role})`)
  console.log(`  mode:      DRY_RUN — nothing can be emailed`)
  console.log(`  fires at:  ${runAt.toISOString()}  (in ${MINUTES} min)`)
  console.log(`  engine agrees: ${predicted ? predicted.toISOString() : 'NO — the engine sees no next slot!'}`)
  console.log(`  open:      /dashboard/automations/${automation.id}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
