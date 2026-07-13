/**
 * Throwaway approval-clock cron verification: an activity waiting past its SLA
 * escalates at SLA / SLA+3 / SLA+7 business days, each level firing exactly once
 * (dedupe), the level resets when the wait resolves, and projects without an
 * APPROVAL obligation never escalate. Cleans up afterwards.
 * Run: tsx scripts/verify-approval-cron.ts
 */
import { prisma } from '../lib/prisma'
import { createProjectWithTemplate } from '../lib/projects/service'
import { applyApprovalClock } from '../lib/projects/delay-ledger'
import { runApprovalEscalations } from '../lib/projects/approval-escalations'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
  console.log('  ok:', msg)
}

// Fixed clock: Mon 2026-08-17. Business days waited from:
//   Mon 2026-08-10 → 5  (Aug 11,12,13,14,17)
//   Wed 2026-08-05 → 8
//   Thu 2026-07-30 → 12
const NOW = new Date('2026-08-17T09:00:00Z')

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true } })
  if (!user) throw new Error('No users in DB')
  const tpl = await prisma.projectTemplate.findFirst({ where: { name: 'Standard Software Delivery' }, select: { id: true } })
  if (!tpl) throw new Error('Standard template missing — run db:seed:project-templates')

  const { id, code } = await createProjectWithTemplate(prisma, {
    name: 'Approval Cron Verify', clientName: 'Acme', projectManagerId: user.id,
    plannedStart: new Date('2026-08-01'), plannedEnd: new Date('2026-12-31'),
    templateId: tpl.id, createdById: user.id,
  })
  // A second project WITHOUT an APPROVAL obligation.
  const { id: noSlaId } = await createProjectWithTemplate(prisma, {
    name: 'No-SLA Project', clientName: 'Acme', projectManagerId: user.id,
    plannedStart: new Date('2026-08-01'), plannedEnd: new Date('2026-12-31'),
    templateId: tpl.id, createdById: user.id,
  })
  console.log('Created projects', code)

  try {
    await prisma.clientObligation.create({
      data: { projectId: id, obligation: 'Approve deliverables', type: 'APPROVAL', responsiblePerson: 'Client PM', slaBusinessDays: 3 },
    })

    const act = await prisma.activity.findFirstOrThrow({ where: { milestone: { phase: { projectId: id } } } })
    const noSlaAct = await prisma.activity.findFirstOrThrow({ where: { milestone: { phase: { projectId: noSlaId } } } })

    const wait = (activityId: string, since: string) =>
      prisma.activity.update({ where: { id: activityId }, data: { status: 'APPROVAL_REQUESTED', waitingSince: new Date(since) } })

    // 5 business days waited, SLA 3 → level 1.
    await wait(act.id, '2026-08-10T09:00:00Z')
    await wait(noSlaAct.id, '2026-08-10T09:00:00Z')
    let run = await runApprovalEscalations(NOW)
    let mine = run.escalated.filter((e) => e.projectId === id)
    assert(mine.length === 1 && mine[0].level === 1 && mine[0].daysWaited === 5, 'level 1 fires at SLA (5d waited, SLA 3)')
    assert(!run.escalated.some((e) => e.projectId === noSlaId), 'project without APPROVAL obligation never escalates')
    let row = await prisma.activity.findUniqueOrThrow({ where: { id: act.id } })
    assert(row.approvalEscalationLevel === 1, 'approvalEscalationLevel stamped = 1')

    // Dedupe: same day, same level → nothing.
    run = await runApprovalEscalations(NOW)
    assert(!run.escalated.some((e) => e.projectId === id), 're-run fires nothing (dedupe per threshold)')

    // 8 business days → level 2 (SLA+3 = 6).
    await wait(act.id, '2026-08-05T09:00:00Z')
    run = await runApprovalEscalations(NOW)
    mine = run.escalated.filter((e) => e.projectId === id)
    assert(mine.length === 1 && mine[0].level === 2, 'level 2 fires at SLA+3')

    // 12 business days → level 3 (SLA+7 = 10).
    await wait(act.id, '2026-07-30T09:00:00Z')
    run = await runApprovalEscalations(NOW)
    mine = run.escalated.filter((e) => e.projectId === id)
    assert(mine.length === 1 && mine[0].level === 3 && mine[0].daysWaited === 12, 'level 3 fires at SLA+7')
    run = await runApprovalEscalations(NOW)
    assert(!run.escalated.some((e) => e.projectId === id), 'nothing left to fire after level 3')

    // Resolution resets the escalation state (and still records the DelayEvent).
    await prisma.$transaction((tx) =>
      applyApprovalClock(tx, { id: act.id, status: 'APPROVAL_REQUESTED', waitingSince: new Date('2026-07-30T09:00:00Z') }, 'APPROVED', { now: NOW })
    )
    row = await prisma.activity.findUniqueOrThrow({ where: { id: act.id } })
    assert(row.approvalEscalationLevel === 0 && row.waitingSince === null, 'resolution resets escalation level + clears waitingSince')
    const ev = await prisma.delayEvent.findFirst({ where: { projectId: id, activityId: act.id, eventType: 'APPROVAL_WAIT' } })
    assert(!!ev && ev.daysLost === 12, 'resolution still records the 12-day APPROVAL_WAIT DelayEvent')

    console.log('\napproval-clock cron verify PASSED')
  } finally {
    await prisma.project.delete({ where: { id } })
    await prisma.project.delete({ where: { id: noSlaId } })
    console.log('cleaned up projects')
  }
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
