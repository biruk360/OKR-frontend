/**
 * Throwaway P1 verification: create a project from the Standard Software Delivery
 * template, assert the tree instantiated correctly (incl. ownerParty=CLIENT on
 * approvals), exercise rollup + confidence, then delete everything.
 * Run: tsx scripts/verify-p1.ts
 */
import { prisma } from '../lib/prisma'
import { createProjectWithTemplate } from '../lib/projects/service'
import { recalcProjectRollup } from '../lib/projects/rollup'
import { computeProjectConfidence, deriveRag } from '../lib/projects/confidence'

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true } })
  if (!user) throw new Error('No users in DB')
  const tpl = await prisma.projectTemplate.findFirst({ where: { name: 'Standard Software Delivery' }, select: { id: true } })
  if (!tpl) throw new Error('Standard template missing — run db:seed:project-templates')

  const { id, code } = await createProjectWithTemplate(prisma, {
    name: 'P1 Verify Project',
    clientName: 'Acme Test Client',
    projectManagerId: user.id,
    plannedStart: new Date('2026-08-01'),
    plannedEnd: new Date('2026-12-31'),
    templateId: tpl.id,
    createdById: user.id,
  })
  console.log('Created project', code, id)

  const phases = await prisma.phase.count({ where: { projectId: id } })
  const milestones = await prisma.milestone.count({ where: { phase: { projectId: id } } })
  const activities = await prisma.activity.findMany({
    where: { milestone: { phase: { projectId: id } } },
    select: { title: true, ownerParty: true, isMilestone: true },
  })
  const approvals = activities.filter((a) => /approval|sign-off/i.test(a.title))
  const badApprovals = approvals.filter((a) => a.ownerParty !== 'CLIENT')
  const member = await prisma.projectMember.findFirst({ where: { projectId: id, userId: user.id, role: 'PM' } })

  console.log('phases=%d (expect 7), milestones=%d, activities=%d, approvals=%d', phases, milestones, activities.length, approvals.length)
  console.log('PM member auto-added:', !!member)
  console.log('approvals all ownerParty=CLIENT:', badApprovals.length === 0, badApprovals.length ? badApprovals : '')

  // Exercise rollup: set first activity to 100% then recalc.
  const first = await prisma.activity.findFirst({ where: { milestone: { phase: { projectId: id } } }, select: { id: true } })
  if (first) {
    await prisma.$transaction(async (tx) => {
      await tx.activity.update({ where: { id: first.id }, data: { percentComplete: 100 } })
      const res = await recalcProjectRollup(tx, id)
      console.log('after rollup: project %% =', res.percentComplete, ' planned% =', res.percentPlanned)
    })
  }

  const conf = computeProjectConfidence({
    percentComplete: 10, percentPlanned: 30, totalSlipDays: 5, openHighRisks: 1,
    blockedActivities: 0, pendingApprovalDays: 0, daysSinceLastUpdate: 0,
  })
  console.log('confidence sample =', conf.confidence, 'RAG =', deriveRag(conf.confidence, 0.9))

  // Cleanup (cascade deletes phases/milestones/activities/members).
  await prisma.project.delete({ where: { id } })
  console.log('Cleaned up. ✅ P1 verify OK:',
    phases === 7 && !!member && badApprovals.length === 0 && approvals.length > 0)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
