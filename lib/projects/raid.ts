import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'

type Db = Prisma.TransactionClient | typeof prisma

export async function createRaidIssue(db: Db, input: {
  projectId: string
  title: string
  description?: string | null
  category?: string | null
  ownerId?: string | null
  severity?: string | null
  actorId?: string | null
}) {
  const count = await db.raidItem.count({ where: { projectId: input.projectId, type: 'ISSUE' } })
  const refCode = `I-${String(count + 1).padStart(3, '0')}`
  const issue = await db.raidItem.create({
    data: {
      projectId: input.projectId,
      type: 'ISSUE',
      refCode,
      title: input.title,
      description: input.description ?? null,
      category: input.category ?? null,
      ownerId: input.ownerId ?? null,
      severity: input.severity ?? 'HIGH',
      status: 'OPEN',
    },
  })
  await recordActivity({
    entityType: 'PROJECT_RAID_ITEM',
    projectId: input.projectId,
    action: 'CREATED',
    actorId: input.actorId,
    metadata: { raidItemId: issue.id, refCode, source: 'daily_scrum' },
  })
  return issue
}

export async function createScrumDelayEvent(db: Db, input: {
  projectId: string
  activityId?: string | null
  owner: 'CLIENT' | '360GROUND' | 'SHARED'
  reason: string
  reasonDetail?: string | null
  daysLost: number
  startedAt: Date
  endedAt?: Date | null
  recordedById?: string | null
}) {
  const delay = await db.delayEvent.create({
    data: {
      projectId: input.projectId,
      activityId: input.activityId ?? null,
      eventType: 'BLOCKED',
      daysLost: input.daysLost,
      owner: input.owner,
      reason: input.reason,
      reasonDetail: input.reasonDetail ?? null,
      startedAt: input.startedAt,
      endedAt: input.endedAt ?? null,
      isAutoDetected: true,
      recordedById: input.recordedById ?? null,
    },
  })
  await recordActivity({
    entityType: 'PROJECT_DELAY_EVENT',
    projectId: input.projectId,
    action: 'CREATED',
    actorId: input.recordedById,
    metadata: { delayEventId: delay.id, source: 'daily_scrum' },
  })
  return delay
}

export async function flagProjectActivityBlocked(db: Db, activityId: string | null | undefined) {
  if (!activityId) return null
  return db.activity.update({
    where: { id: activityId },
    data: { isBlocked: true, blockedSince: new Date() },
  }).catch(() => null)
}
