import type { Prisma } from '@prisma/client'
import { addCalendarDays } from './scheduling'
import { recalcProjectRollup } from './rollup'

export type ChangeRequestStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'IMPLEMENTED'
export type ChangeRequestType = 'SCOPE_ADD' | 'REQUIREMENT_CHANGE' | 'DESCOPE'

export function changeRequestWhere(projectId: string, opts: { reportPending?: boolean } = {}): Prisma.ChangeRequestWhereInput {
  return {
    projectId,
    ...(opts.reportPending ? { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } : {}),
  }
}

export function nextChangeRequestCode(count: number): string {
  return `CR-${String(count + 1).padStart(3, '0')}`
}

export function canTransitionChangeRequest(from: string, to: string): boolean {
  if (from === to) return true
  const allowed: Record<string, string[]> = {
    SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED'],
    UNDER_REVIEW: ['APPROVED', 'REJECTED'],
    APPROVED: ['IMPLEMENTED'],
    REJECTED: [],
    IMPLEMENTED: [],
  }
  return allowed[from]?.includes(to) ?? false
}

export function scopeVolatilityTotal(items: readonly { status: string; scheduleImpactDays: number }[]): number {
  return items
    .filter((item) => item.status === 'APPROVED' || item.status === 'IMPLEMENTED')
    .reduce((sum, item) => sum + Math.max(0, item.scheduleImpactDays), 0)
}

export function shiftActivityEnds<T extends { id: string; currentEnd: Date | null }>(
  activities: readonly T[],
  days: number,
): Array<{ id: string; currentEnd: Date | null }> {
  if (days === 0) return activities.map((a) => ({ id: a.id, currentEnd: a.currentEnd }))
  return activities.map((a) => ({ id: a.id, currentEnd: addCalendarDays(a.currentEnd, days) }))
}

export async function applyApprovedChangeRequest(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string
    changeRequestId: string
    actorId: string
    approvedById?: string | null
    now?: Date
  },
): Promise<{ delayEventId: string | null; shiftedActivityIds: string[] }> {
  const now = input.now ?? new Date()
  const cr = await tx.changeRequest.findFirst({
    where: { id: input.changeRequestId, projectId: input.projectId },
  })
  if (!cr) throw new Error('Change request not found')

  const affected = cr.affectedActivityIds.length
    ? await tx.activity.findMany({
        where: { id: { in: cr.affectedActivityIds }, milestone: { phase: { projectId: input.projectId } } },
        select: { id: true, currentEnd: true },
      })
    : []
  const shifts = shiftActivityEnds(affected, cr.scheduleImpactDays)

  await tx.changeRequest.update({
    where: { id: cr.id },
    data: {
      status: 'APPROVED',
      ccbDecisionDate: now,
      approvedById: input.approvedById ?? input.actorId,
      rejectionReason: null,
    },
  })

  for (const shift of shifts) {
    await tx.activity.update({
      where: { id: shift.id },
      data: { currentEnd: shift.currentEnd },
    })
  }

  let delayEventId: string | null = null
  if (cr.scheduleImpactDays > 0) {
    const delay = await tx.delayEvent.create({
      data: {
        projectId: input.projectId,
        eventType: 'BASELINE_SLIP',
        daysLost: cr.scheduleImpactDays,
        owner: 'CLIENT',
        reason: 'SCOPE_ADDITION',
        reasonDetail: `${cr.crCode}: ${cr.title}`,
        startedAt: cr.requestDate,
        endedAt: now,
        isAutoDetected: false,
        recordedById: input.actorId,
      },
      select: { id: true },
    })
    delayEventId = delay.id
  }

  await recalcProjectRollup(tx, input.projectId)
  return { delayEventId, shiftedActivityIds: shifts.map((s) => s.id) }
}

export function serializeChangeRequest<T extends {
  requestDate: Date
  ccbDecisionDate: Date | null
  clientSignOffAt: Date | null
  createdAt: Date
  [key: string]: unknown
}>(cr: T) {
  return {
    ...cr,
    requestDate: cr.requestDate.toISOString(),
    ccbDecisionDate: cr.ccbDecisionDate?.toISOString() ?? null,
    clientSignOffAt: cr.clientSignOffAt?.toISOString() ?? null,
    createdAt: cr.createdAt.toISOString(),
  }
}
