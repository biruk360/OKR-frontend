/**
 * Throwaway C4 verification: commit a baseline, then exercise the exact in-txn path
 * the activity PATCH route runs for a gated date move (update + recordSlipDelayEvent +
 * recalcProjectRollup) and assert the DelayEvent + recomputed slipDays. Also covers
 * a second move (daysLost = incremental slip) and the free edit on a NON-baselined
 * project (no event). Cleans up afterwards.
 * Run: tsx scripts/verify-c4.ts
 */
import { prisma } from '../lib/prisma'
import { createProjectWithTemplate } from '../lib/projects/service'
import { commitBaseline } from '../lib/projects/baseline'
import { recordSlipDelayEvent } from '../lib/projects/delay-ledger'
import { recalcProjectRollup, computeSlipDays } from '../lib/projects/rollup'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
  console.log('  ok:', msg)
}

/** Mirrors the gated branch of PATCH /api/projects/[id]/activities/[activityId]. */
async function gatedDateMove(projectId: string, activityId: string, newEnd: Date, slip: { reason: string; owner: string; detail?: string }) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.activity.findUniqueOrThrow({ where: { id: activityId } })
    await tx.activity.update({ where: { id: activityId }, data: { currentEnd: newEnd, slipReason: slip.reason, slipOwner: slip.owner } })
    await recordSlipDelayEvent(tx, {
      projectId,
      activityId,
      slipOwner: slip.owner,
      slipReason: slip.reason,
      slipDetail: slip.detail,
      oldSlipDays: existing.slipDays,
      newSlipDays: computeSlipDays(existing.baselineEnd, newEnd),
      baselineEnd: existing.baselineEnd,
      newEnd,
      recordedById: null,
    })
    await recalcProjectRollup(tx, projectId)
  })
}

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true } })
  if (!user) throw new Error('No users in DB')
  const tpl = await prisma.projectTemplate.findFirst({ where: { name: 'Standard Software Delivery' }, select: { id: true } })
  if (!tpl) throw new Error('Standard template missing — run db:seed:project-templates')

  const { id, code } = await createProjectWithTemplate(prisma, {
    name: 'C4 Verify Project',
    clientName: 'Acme Test Client',
    projectManagerId: user.id,
    plannedStart: new Date('2026-08-01'),
    plannedEnd: new Date('2026-12-31'),
    templateId: tpl.id,
    createdById: user.id,
  })
  console.log('Created project', code, id)

  try {
    const act = await prisma.activity.findFirstOrThrow({
      where: { milestone: { phase: { projectId: id } } },
      include: { milestone: { include: { phase: true } } },
    })
    await prisma.activity.update({
      where: { id: act.id },
      data: { currentStart: new Date('2026-08-03'), currentEnd: new Date('2026-08-14') },
    })

    // Non-baselined: free edit, NO DelayEvent (route only records when baselined).
    await prisma.$transaction(async (tx) => {
      await tx.activity.update({ where: { id: act.id }, data: { currentEnd: new Date('2026-08-17') } })
      await recalcProjectRollup(tx, id)
    })
    let events = await prisma.delayEvent.count({ where: { projectId: id } })
    assert(events === 0, 'non-baselined date edit records no DelayEvent')

    // Commit baseline, then a gated +10d move.
    await prisma.$transaction((tx) => commitBaseline(tx, id, { actorId: user.id }))
    await gatedDateMove(id, act.id, new Date('2026-08-27'), {
      reason: 'CLIENT_DEPENDENCY_NOT_PROVIDED', owner: 'CLIENT', detail: 'Staging access arrived 10 days late',
    })

    const after = await prisma.activity.findUniqueOrThrow({ where: { id: act.id } })
    assert(after.slipDays === 10, `slipDays recomputed to 10 (got ${after.slipDays})`)
    assert(after.slipReason === 'CLIENT_DEPENDENCY_NOT_PROVIDED' && after.slipOwner === 'CLIENT', 'slip reason/owner stamped on the activity')

    const ev1 = await prisma.delayEvent.findFirst({ where: { projectId: id, activityId: act.id }, orderBy: { createdAt: 'desc' } })
    assert(!!ev1, 'DelayEvent created for the gated move')
    assert(ev1!.eventType === 'BASELINE_SLIP', 'eventType = BASELINE_SLIP')
    assert(ev1!.owner === 'CLIENT' && ev1!.reason === 'CLIENT_DEPENDENCY_NOT_PROVIDED', 'owner + reason recorded')
    assert(ev1!.reasonDetail === 'Staging access arrived 10 days late', 'reasonDetail recorded')
    assert(ev1!.daysLost === 10, `daysLost = 10 (got ${ev1!.daysLost})`)
    assert(ev1!.isAutoDetected === false, 'isAutoDetected = false (PM-tagged)')
    assert(ev1!.phaseAtTime === act.milestone.phase.name, `phaseAtTime = "${act.milestone.phase.name}" (got "${ev1!.phaseAtTime}")`)
    assert(ev1!.startedAt?.toISOString() === '2026-08-17T00:00:00.000Z', 'startedAt = baseline end')

    // Second move (+5d more): daysLost is the INCREMENT (15 - 10 = 5).
    await gatedDateMove(id, act.id, new Date('2026-09-01'), { reason: 'INTERNAL_CAPACITY', owner: '360GROUND' })
    const ev2 = await prisma.delayEvent.findFirst({ where: { projectId: id, activityId: act.id }, orderBy: { createdAt: 'desc' } })
    assert(ev2!.daysLost === 5, `second move daysLost = incremental 5 (got ${ev2!.daysLost})`)

    // Moving EARLIER records an event with daysLost = 0 (never a credit).
    await gatedDateMove(id, act.id, new Date('2026-08-20'), { reason: 'REQUIREMENT_CHANGE', owner: 'CLIENT' })
    const ev3 = await prisma.delayEvent.findFirst({ where: { projectId: id, activityId: act.id }, orderBy: { createdAt: 'desc' } })
    assert(ev3!.daysLost === 0, `earlier move daysLost = 0 (got ${ev3!.daysLost})`)

    events = await prisma.delayEvent.count({ where: { projectId: id } })
    assert(events === 3, `3 DelayEvents total (got ${events})`)

    console.log('\nC4 verify PASSED')
  } finally {
    await prisma.project.delete({ where: { id } })
    console.log('cleaned up project', code)
  }
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
