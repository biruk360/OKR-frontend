/**
 * Throwaway C1 verification: create a project from the Standard Software Delivery
 * template, commit the baseline via commitBaseline(), assert every baseline* equals
 * current*, a snapshot v1 exists, slipDays recompute works after a date move, then
 * delete everything.
 * Run: tsx scripts/verify-c1.ts
 */
import { prisma } from '../lib/prisma'
import { createProjectWithTemplate } from '../lib/projects/service'
import { commitBaseline } from '../lib/projects/baseline'
import { recalcProjectRollup } from '../lib/projects/rollup'

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
    name: 'C1 Verify Project',
    clientName: 'Acme Test Client',
    projectManagerId: user.id,
    plannedStart: new Date('2026-08-01'),
    plannedEnd: new Date('2026-12-31'),
    templateId: tpl.id,
    createdById: user.id,
  })
  console.log('Created project', code, id)

  try {
    // Pre-commit: no baseline dates anywhere.
    const pre = await prisma.activity.count({ where: { milestone: { phase: { projectId: id } }, baselineStart: { not: null } } })
    assert(pre === 0, 'pre-commit: no activity has baselineStart')

    // Give one activity real dates so baseline copy + slip math is exercised.
    const dated = await prisma.activity.findFirstOrThrow({ where: { milestone: { phase: { projectId: id } } } })
    await prisma.activity.update({
      where: { id: dated.id },
      data: { currentStart: new Date('2026-08-03'), currentEnd: new Date('2026-08-14') },
    })

    const result = await prisma.$transaction((tx) =>
      commitBaseline(tx, id, { actorId: user.id, notes: 'C1 verify notes', now: new Date('2026-07-13T12:00:00Z') })
    )
    console.log('committed:', result)

    const project = await prisma.project.findUniqueOrThrow({ where: { id } })
    assert(project.baselineCommittedAt?.toISOString() === '2026-07-13T12:00:00.000Z', 'project.baselineCommittedAt stamped')
    assert(project.baselineVersion === 1, 'project.baselineVersion = 1')

    // Every activity: baseline == current.
    const activities = await prisma.activity.findMany({ where: { milestone: { phase: { projectId: id } } } })
    assert(activities.length === result.activityCount, `activityCount matches (${activities.length})`)
    const mismatched = activities.filter(
      (a) => +a.baselineStart! !== +(a.currentStart ?? 0) || +a.baselineEnd! !== +(a.currentEnd ?? 0)
    )
    assert(mismatched.length === 0, 'every activity baseline* == current*')

    const phases = await prisma.phase.findMany({ where: { projectId: id } })
    const phaseMismatch = phases.filter((p) => +p.baselineStart! !== +(p.currentStart ?? 0) || +p.baselineEnd! !== +(p.currentEnd ?? 0))
    assert(phaseMismatch.length === 0, 'every phase baseline* == current*')

    const milestones = await prisma.milestone.findMany({ where: { phase: { projectId: id } } })
    const msMismatch = milestones.filter((m) => +m.baselineDate! !== +(m.currentDate ?? 0))
    assert(msMismatch.length === 0, 'every milestone baselineDate == currentDate')

    // Snapshot v1 exists with the full tree + the notes as reason.
    const snapshot = await prisma.baselineSnapshot.findUnique({ where: { projectId_version: { projectId: id, version: 1 } } })
    assert(!!snapshot, 'BaselineSnapshot v1 exists')
    assert(snapshot!.reason === 'C1 verify notes', 'snapshot reason = notes')
    const snap = snapshot!.snapshotJson as any
    assert(snap.phases.length === phases.length, 'snapshot contains all phases')
    const snapActs = snap.phases.flatMap((p: any) => p.milestones.flatMap((m: any) => m.activities))
    assert(snapActs.length === activities.length, 'snapshot contains all activities')

    // slipDays: 0 pre-move; after moving currentEnd +10d on a baselined activity, rollup computes slip.
    const first = activities.find((a) => a.id === dated.id)!
    assert(+first.baselineStart! === +new Date('2026-08-03') && +first.baselineEnd! === +new Date('2026-08-14'), 'dated activity baseline* copied from current*')
    assert(first.slipDays === 0, 'slipDays = 0 at commit')
    if (first.baselineEnd) {
      const moved = new Date(first.baselineEnd.getTime() + 10 * 86400000)
      await prisma.$transaction(async (tx) => {
        await tx.activity.update({ where: { id: first.id }, data: { currentEnd: moved } })
        await recalcProjectRollup(tx, id)
      })
      const after = await prisma.activity.findUniqueOrThrow({ where: { id: first.id } })
      assert(after.slipDays === 10, `slipDays = 10 after +10d move (got ${after.slipDays})`)
    }

    console.log('\nC1 verify PASSED')
  } finally {
    await prisma.project.delete({ where: { id } })
    console.log('cleaned up project', code)
  }
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
