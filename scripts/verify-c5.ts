/**
 * Throwaway C5 verification: produce real DelayEvents (one auto APPROVAL_WAIT with an
 * SLA breach via the approval clock, one PM-tagged BASELINE_SLIP), then exercise
 * listDelayLedger — unfiltered + owner-filtered totals, SLA breach flag, facets,
 * and CSV of the filtered rows. Cleans up afterwards.
 * Run: tsx scripts/verify-c5.ts
 */
import { prisma } from '../lib/prisma'
import { createProjectWithTemplate } from '../lib/projects/service'
import { commitBaseline } from '../lib/projects/baseline'
import { applyApprovalClock, recordSlipDelayEvent, listDelayLedger, delaysToCsv } from '../lib/projects/delay-ledger'
import { recalcProjectRollup, computeSlipDays } from '../lib/projects/rollup'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
  console.log('  ok:', msg)
}

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true } })
  if (!user) throw new Error('No users in DB')
  const tpl = await prisma.projectTemplate.findFirst({ where: { name: 'Standard Software Delivery' }, select: { id: true } })
  if (!tpl) throw new Error('Standard template missing — run db:seed:project-templates')

  const { id, code } = await createProjectWithTemplate(prisma, {
    name: 'C5 Verify Project',
    clientName: 'Acme Test Client',
    projectManagerId: user.id,
    plannedStart: new Date('2026-08-01'),
    plannedEnd: new Date('2026-12-31'),
    templateId: tpl.id,
    createdById: user.id,
  })
  console.log('Created project', code, id)

  try {
    const acts = await prisma.activity.findMany({ where: { milestone: { phase: { projectId: id } } }, take: 2 })
    const [a, b] = acts
    await prisma.activity.update({ where: { id: a.id }, data: { currentStart: new Date('2026-08-03'), currentEnd: new Date('2026-08-14') } })
    await prisma.activity.update({ where: { id: b.id }, data: { currentStart: new Date('2026-08-03'), currentEnd: new Date('2026-08-14') } })
    await prisma.$transaction((tx) => commitBaseline(tx, id, { actorId: user.id }))

    // Client obligation with a 3-business-day approval SLA.
    await prisma.clientObligation.create({
      data: { projectId: id, obligation: 'Approve deliverables', type: 'APPROVAL', responsiblePerson: 'Client PM', slaBusinessDays: 3 },
    })

    // Activity A: approval requested Mon 2026-08-03, approved Mon 2026-08-17 → 10 business days waited (breach: 10-3=7).
    await prisma.activity.update({ where: { id: a.id }, data: { status: 'APPROVAL_REQUESTED', waitingSince: new Date('2026-08-03T09:00:00Z') } })
    const clock = await prisma.$transaction((tx) =>
      applyApprovalClock(tx, { id: a.id, status: 'APPROVAL_REQUESTED', waitingSince: new Date('2026-08-03T09:00:00Z') }, 'APPROVED', { now: new Date('2026-08-17T09:00:00Z') })
    )
    assert(clock.decision.kind === 'RESOLVED' && clock.decision.daysWaited === 10, 'approval clock recorded 10 business days')
    assert(clock.notifications.some((n) => n.eventKey === 'CLIENT_APPROVAL_SLA_BREACH'), 'SLA breach notification intent returned (not fired in-txn)')

    // Activity B: gated slip move (+10d), owner 360GROUND.
    await prisma.$transaction(async (tx) => {
      const existing = await tx.activity.findUniqueOrThrow({ where: { id: b.id } })
      const newEnd = new Date('2026-08-24')
      await tx.activity.update({ where: { id: b.id }, data: { currentEnd: newEnd, slipReason: 'TECHNICAL_BLOCKER', slipOwner: '360GROUND' } })
      await recordSlipDelayEvent(tx, {
        projectId: id, activityId: b.id, slipOwner: '360GROUND', slipReason: 'TECHNICAL_BLOCKER',
        oldSlipDays: existing.slipDays, newSlipDays: computeSlipDays(existing.baselineEnd, newEnd),
        baselineEnd: existing.baselineEnd, newEnd,
      })
      await recalcProjectRollup(tx, id)
    })

    // Unfiltered ledger.
    const all = await listDelayLedger(prisma, id)
    assert(all.rows.length === 2, `2 ledger rows (got ${all.rows.length})`)
    assert(all.totals.total === 20, `total = 10 + 10 = 20 (got ${all.totals.total})`)
    assert(all.totals.byOwner.CLIENT === 10 && all.totals.byOwner['360GROUND'] === 10, 'owner split 10/10')

    const rowA = all.rows.find((r) => r.activityId === a.id)!
    assert(rowA.eventType === 'APPROVAL_WAIT' && rowA.isAutoDetected, 'row A = auto APPROVAL_WAIT')
    assert(rowA.slaBreachDays === 7, `row A SLA breach = 7 days over (got ${rowA.slaBreachDays})`)
    assert(rowA.baselineDate === '2026-08-14T00:00:00.000Z' && rowA.currentDate === '2026-08-14T00:00:00.000Z', 'row A baseline/current dates')
    assert(!!rowA.phase, `row A phase populated (${rowA.phase})`)

    const rowB = all.rows.find((r) => r.activityId === b.id)!
    assert(rowB.eventType === 'BASELINE_SLIP' && !rowB.isAutoDetected && rowB.slaBreachDays === null, 'row B = PM BASELINE_SLIP, no breach')
    assert(rowB.slipDays === 10, 'row B slipDays = 10')

    assert(all.facets.owners.includes('CLIENT') && all.facets.owners.includes('360GROUND'), 'facets: owners')
    assert(all.facets.reasons.includes('CLIENT_APPROVAL_DELAY') && all.facets.reasons.includes('TECHNICAL_BLOCKER'), 'facets: reasons')
    assert(all.facets.phases.length >= 1, 'facets: phases')

    // Filtered: owner=CLIENT → totals update to the filtered set.
    const clientOnly = await listDelayLedger(prisma, id, { owner: 'CLIENT' })
    assert(clientOnly.rows.length === 1, 'filter owner=CLIENT → 1 row')
    assert(clientOnly.totals.total === 10 && clientOnly.totals.byOwner.CLIENT === 10, 'filtered totals = 10/CLIENT')
    assert(clientOnly.facets.owners.length === 2, 'facets stay unfiltered (2 owners)')

    // Filtered by reason → only the slip row.
    const slipOnly = await listDelayLedger(prisma, id, { reason: 'TECHNICAL_BLOCKER' })
    assert(slipOnly.rows.length === 1 && slipOnly.rows[0].activityId === b.id, 'filter reason → slip row only')

    // CSV of the filtered rows contains only visible rows.
    const csv = delaysToCsv(clientOnly.rows)
    assert(csv.split('\n').length === 2, 'CSV = header + 1 filtered row')
    assert(csv.includes('CLIENT_APPROVAL_DELAY') && !csv.includes('TECHNICAL_BLOCKER'), 'CSV contains only the filtered row')

    console.log('\nC5 verify PASSED')
  } finally {
    await prisma.project.delete({ where: { id } })
    console.log('cleaned up project', code)
  }
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
