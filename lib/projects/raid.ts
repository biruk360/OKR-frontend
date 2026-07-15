import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import type { RaidType } from '@/features/projects/types'

type Db = Prisma.TransactionClient | typeof prisma

export interface RaidListOptions {
  type?: RaidType
  portal?: boolean
}

export function raidItemWhere(projectId: string, opts: RaidListOptions = {}): Prisma.RaidItemWhereInput {
  return {
    projectId,
    ...(opts.type ? { type: opts.type } : {}),
    ...(opts.portal ? { clientVisible: true } : {}),
  }
}

export function raidRefPrefix(type: RaidType): string {
  switch (type) {
    case 'RISK':
      return 'R'
    case 'ASSUMPTION':
      return 'A'
    case 'ISSUE':
      return 'I'
    case 'DEPENDENCY':
      return 'D'
  }
}

export function computeRaidScore(probability?: number | null, impact?: number | null): number | null {
  if (!probability || !impact) return null
  return probability * impact
}

export function computeDaysOpen(createdAt: Date, closedAt: Date | null, now: Date = new Date()): number {
  const end = closedAt ?? now
  return Math.max(0, Math.floor((startOfUtcDay(end).getTime() - startOfUtcDay(createdAt).getTime()) / 86_400_000))
}

export function riskTone(score: number | null | undefined): 'GREEN' | 'AMBER' | 'RED' | 'NONE' {
  if (!score) return 'NONE'
  if (score >= 15) return 'RED'
  if (score >= 8) return 'AMBER'
  return 'GREEN'
}

export function isOverdueClientDependency(input: {
  type: string
  dependsOnParty?: string | null
  neededByDate?: Date | string | null
  status: string
}, now: Date = new Date()): boolean {
  if (input.type !== 'DEPENDENCY') return false
  if (input.dependsOnParty !== 'CLIENT') return false
  if (input.status === 'CLOSED') return false
  if (!input.neededByDate) return false
  return new Date(input.neededByDate).getTime() < startOfUtcDay(now).getTime()
}

export async function nextRaidRefCode(db: Db, projectId: string, type: RaidType): Promise<string> {
  const count = await db.raidItem.count({ where: { projectId, type } })
  return `${raidRefPrefix(type)}-${String(count + 1).padStart(3, '0')}`
}

export function serializeRaidItem<T extends {
  type: string
  status: string
  dependsOnParty: string | null
  createdAt: Date
  closedAt: Date | null
  score: number | null
  neededByDate: Date | null
  [key: string]: unknown
}>(item: T, now: Date = new Date()) {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    closedAt: item.closedAt?.toISOString() ?? null,
    neededByDate: item.neededByDate?.toISOString() ?? null,
    daysOpen: computeDaysOpen(item.createdAt, item.closedAt, now),
    riskTone: riskTone(item.score),
    isOverdueClientDependency: isOverdueClientDependency(item, now),
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export async function createRaidIssue(db: Db, input: {
  projectId: string
  title: string
  description?: string | null
  category?: string | null
  ownerId?: string | null
  severity?: string | null
  actorId?: string | null
}) {
  const refCode = await nextRaidRefCode(db, input.projectId, 'ISSUE')
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
