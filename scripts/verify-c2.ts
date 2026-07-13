/**
 * Throwaway C2 verification: commit a baseline, move dates, preview the diff,
 * re-baseline with a reason, and assert version increments + prior snapshot is
 * preserved (variance vs v1 still computable). Cleans up afterwards.
 * Run: tsx scripts/verify-c2.ts
 */
import { prisma } from '../lib/prisma'
import { createProjectWithTemplate } from '../lib/projects/service'
import { commitBaseline, rebaseline, computeRebaselineDiff } from '../lib/projects/baseline'

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
    name: 'C2 Verify Project',
    clientName: 'Acme Test Client',
    projectManagerId: user.id,
    plannedStart: new Date('2026-08-01'),
    plannedEnd: new Date('2026-12-31'),
    templateId: tpl.id,
    createdById: user.id,
  })
  console.log('Created project', code, id)

  try {
    // Date one activity, commit v1.
    const act = await prisma.activity.findFirstOrThrow({ where: { milestone: { phase: { projectId: id } } } })
    await prisma.activity.update({
      where: { id: act.id },
      data: { currentStart: new Date('2026-08-03'), currentEnd: new Date('2026-08-14') },
    })
    await prisma.$transaction((tx) => commitBaseline(tx, id, { actorId: user.id }))
    let project = await prisma.project.findUniqueOrThrow({ where: { id } })
    assert(project.baselineVersion === 1, 'baseline v1 committed')

    // Move the dates (simulating a PM edit after client delay).
    await prisma.activity.update({
      where: { id: act.id },
      data: { currentStart: new Date('2026-08-10'), currentEnd: new Date('2026-08-28') },
    })

    // Diff preview (same query the GET route runs).
    const rows = await prisma.activity.findMany({
      where: { milestone: { phase: { projectId: id } } },
      select: {
        id: true, title: true, baselineStart: true, baselineEnd: true, currentStart: true, currentEnd: true,
        milestone: { select: { phase: { select: { name: true } } } },
      },
    })
    const diff = computeRebaselineDiff(rows.map((a) => ({ ...a, phaseName: a.milestone.phase.name })))
    assert(diff.length === 1, `diff preview shows exactly the 1 moved activity (got ${diff.length})`)
    assert(diff[0].activityId === act.id && diff[0].oldEnd === '2026-08-14T00:00:00.000Z' && diff[0].newEnd === '2026-08-28T00:00:00.000Z', 'diff old→new correct')

    // Re-baseline (reason ≥20 chars enforced by the route's Zod schema).
    const reason = 'Client dependency arrived two weeks late; re-planning phase 2'
    const result = await prisma.$transaction((tx) =>
      rebaseline(tx, id, { actorId: user.id, approverId: user.id, reason })
    )
    assert(result.version === 2, 'rebaseline returns version 2')
    assert(result.changes.length === 1, 'rebaseline reports the 1 change')

    project = await prisma.project.findUniqueOrThrow({ where: { id } })
    assert(project.baselineVersion === 2, 'project.baselineVersion incremented to 2')

    // Prior snapshot preserved; both versions exist.
    const v1 = await prisma.baselineSnapshot.findUnique({ where: { projectId_version: { projectId: id, version: 1 } } })
    const v2 = await prisma.baselineSnapshot.findUnique({ where: { projectId_version: { projectId: id, version: 2 } } })
    assert(!!v1 && !!v2, 'snapshots v1 AND v2 both retained')
    assert(v2!.reason === reason, 'v2 snapshot stores the reason')

    // Variance vs v1 still computable: v1 snapshot holds the ORIGINAL dates.
    const snap1Acts = (v1!.snapshotJson as any).phases.flatMap((p: any) => p.milestones.flatMap((m: any) => m.activities))
    const snap1Act = snap1Acts.find((a: any) => a.id === act.id)
    assert(snap1Act.baselineEnd === '2026-08-14T00:00:00.000Z', 'v1 snapshot preserves original baseline end (variance vs v1 computable)')

    // Live baseline now equals the moved dates.
    const after = await prisma.activity.findUniqueOrThrow({ where: { id: act.id } })
    assert(after.baselineEnd?.toISOString() === '2026-08-28T00:00:00.000Z', 'live baselineEnd updated to moved date')

    // Guard: re-baseline on a never-committed project must throw.
    const { id: freshId } = await createProjectWithTemplate(prisma, {
      name: 'C2 Fresh Project', clientName: 'Acme', projectManagerId: user.id,
      plannedStart: new Date('2026-08-01'), plannedEnd: new Date('2026-12-31'),
      templateId: tpl.id, createdById: user.id,
    })
    let threw = false
    try {
      await prisma.$transaction((tx) => rebaseline(tx, freshId, { actorId: user.id, approverId: user.id, reason }))
    } catch { threw = true }
    assert(threw, 'rebaseline throws when no baseline committed')
    await prisma.project.delete({ where: { id: freshId } })

    console.log('\nC2 verify PASSED')
  } finally {
    await prisma.project.delete({ where: { id } })
    console.log('cleaned up project', code)
  }
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
