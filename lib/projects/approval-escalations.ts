/**
 * Approval-clock SLA escalations (Epic C3, cron) — spec §C3 "escalation
 * notifications fire at SLA, SLA+3, SLA+7".
 *
 * Finds every activity sitting in APPROVAL_REQUESTED on a project with an
 * APPROVAL-type ClientObligation, compares business days waited against the
 * obligation SLA, and fires CLIENT_APPROVAL_SLA_BREACH once per crossed
 * threshold (deduped via `Activity.approvalEscalationLevel`, which the approval
 * clock resets to 0 when the wait resolves). No transactions here — each
 * activity update is a single write, so notifications fire directly after it
 * (same pattern as lib/projects/health.ts).
 *
 * Kept out of delay-ledger.ts so that module stays free of runtime server
 * imports (DelayLedgerTable imports its pure CSV helper in the client bundle).
 */

import { prisma } from '@/lib/prisma'
import { emit } from '@/lib/notifications'
import { businessDaysBetween } from './business-days'
import { approvalEscalationLevel, APPROVAL_ESCALATION_OFFSETS, type ApprovalEscalationLevel } from './delay-ledger'

export interface ApprovalEscalation {
  activityId: string
  activityTitle: string
  projectId: string
  level: ApprovalEscalationLevel
  daysWaited: number
  slaBusinessDays: number
}

export interface ApprovalEscalationRun {
  checked: number
  escalated: ApprovalEscalation[]
}

/** Run one escalation sweep. Called by the `approval-clock` cron (daily). */
export async function runApprovalEscalations(now: Date = new Date()): Promise<ApprovalEscalationRun> {
  const waiting = await prisma.activity.findMany({
    where: { status: 'APPROVAL_REQUESTED', waitingSince: { not: null } },
    select: {
      id: true,
      title: true,
      waitingSince: true,
      approvalEscalationLevel: true,
      milestone: { select: { phase: { select: { projectId: true, name: true, project: { select: { name: true } } } } } },
    },
  })
  if (waiting.length === 0) return { checked: 0, escalated: [] }

  const projectIds = [...new Set(waiting.map((a) => a.milestone.phase.projectId))]
  const obligations = await prisma.clientObligation.findMany({
    where: { projectId: { in: projectIds }, type: 'APPROVAL' },
    select: { projectId: true, slaBusinessDays: true },
    orderBy: { slaBusinessDays: 'asc' },
  })
  const slaByProject = new Map<string, number>()
  for (const o of obligations) if (!slaByProject.has(o.projectId)) slaByProject.set(o.projectId, o.slaBusinessDays)

  const escalated: ApprovalEscalation[] = []
  for (const a of waiting) {
    const projectId = a.milestone.phase.projectId
    const sla = slaByProject.get(projectId)
    if (sla == null || !a.waitingSince) continue // no APPROVAL obligation → no SLA to escalate against

    const daysWaited = businessDaysBetween(a.waitingSince, now)
    const level = approvalEscalationLevel(daysWaited, sla)
    if (level <= a.approvalEscalationLevel) continue // nothing newly crossed (dedupe)

    await prisma.activity.update({ where: { id: a.id }, data: { approvalEscalationLevel: level } })
    escalated.push({ activityId: a.id, activityTitle: a.title, projectId, level, daysWaited, slaBusinessDays: sla })

    await emit('CLIENT_APPROVAL_SLA_BREACH', {
      entityType: 'PROJECT',
      entityId: projectId,
      entityTitle: a.milestone.phase.project.name,
      data: {
        activityId: a.id,
        activityTitle: a.title,
        phase: a.milestone.phase.name,
        escalationLevel: level,
        threshold: `SLA${level > 1 ? `+${APPROVAL_ESCALATION_OFFSETS[level - 1]}` : ''}`,
        daysWaited,
        daysOverSla: daysWaited - sla,
        slaBusinessDays: sla,
        deepLink: `/dashboard/projects/${projectId}`,
      },
    })
  }

  return { checked: waiting.length, escalated }
}
