import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { emit } from '@/lib/notifications'
import { createRaidIssue, createScrumDelayEvent, flagProjectActivityBlocked } from '@/lib/projects/raid'
import { getScrumSettings } from './settings'

export async function resolveScrumBlocker(session: Session, updateId: string, resolutionNote: string) {
  const update = await prisma.scrumUpdate.update({
    where: { id: updateId },
    data: {
      blockerStatus: 'RESOLVED',
      blockerResolvedAt: new Date(),
      blockerResolvedById: session.user.id,
      blockerResolutionNote: resolutionNote,
    },
  })
  await recordActivity({
    entityType: 'SCRUM_UPDATE',
    action: 'RESOLVED',
    actorId: session.user.id,
    metadata: { updateId, resolutionNote },
  })
  await emit('SCRUM_BLOCKER_RESOLVED', {
    actorId: session.user.id,
    entityType: 'SCRUM_UPDATE',
    entityId: updateId,
    explicitRecipients: [update.userId, update.managerId].filter(Boolean) as string[],
    data: { deepLink: `/dashboard/scrum?update=${updateId}` },
  })
  return update
}

export async function escalateScrumBlocker(session: Session, updateId: string, escalatedToUserId?: string | null) {
  const settings = await getScrumSettings()
  const update = await prisma.scrumUpdate.findUnique({ where: { id: updateId } })
  if (!update) return null
  let raidItemId = update.raidItemId
  if (update.projectId && !raidItemId) {
    const issue = await createRaidIssue(prisma, {
      projectId: update.projectId,
      title: `Scrum blocker: ${plain(update.blockers ?? '').slice(0, 100) || 'Unresolved blocker'}`,
      description: update.blockers,
      category: update.blockerCategory,
      ownerId: update.managerId,
      actorId: session.user.id,
    })
    raidItemId = issue.id
  }
  const saved = await prisma.scrumUpdate.update({
    where: { id: updateId },
    data: {
      blockerStatus: 'ESCALATED',
      escalatedAt: new Date(),
      escalatedToUserId: escalatedToUserId ?? null,
      raidItemId,
      blockerDaysOpen: Math.max(update.blockerDaysOpen, settings.escalationThresholdDays),
    },
  })
  if (saved.projectId && ['CLIENT_APPROVAL', 'EXTERNAL_DEPENDENCY'].includes(saved.blockerCategory ?? '')) {
    await createScrumDelayEvent(prisma, {
      projectId: saved.projectId,
      activityId: saved.projectActivityId,
      owner: saved.blockerCategory === 'CLIENT_APPROVAL' || saved.blockerCategory === 'EXTERNAL_DEPENDENCY' ? 'CLIENT' : '360GROUND',
      reason: saved.blockerCategory ?? 'OTHER',
      reasonDetail: saved.blockers,
      daysLost: Math.max(1, saved.blockerDaysOpen),
      startedAt: saved.blockerFirstRaisedAt ?? saved.submittedAt,
      recordedById: session.user.id,
    })
  }
  await flagProjectActivityBlocked(prisma, saved.projectActivityId)
  await recordActivity({
    entityType: 'SCRUM_UPDATE',
    action: 'ESCALATED',
    actorId: session.user.id,
    metadata: { updateId, raidItemId },
  })
  await emit('SCRUM_BLOCKER_ESCALATED', {
    actorId: session.user.id,
    entityType: 'SCRUM_UPDATE',
    entityId: updateId,
    explicitRecipients: [escalatedToUserId, saved.managerId].filter(Boolean) as string[],
    data: { raidItemId, deepLink: `/dashboard/scrum?update=${updateId}` },
  })
  return saved
}

function plain(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}
