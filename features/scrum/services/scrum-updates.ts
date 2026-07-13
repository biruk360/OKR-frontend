import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { emit } from '@/lib/notifications'
import { apiForbidden } from '@/lib/api'
import { canProxyFor, canViewScrumUser, resolveScrumSubjectContext } from './access'
import { getScrumSettings } from './settings'
import { dateFromDateKey, isLateSubmission, toScrumDateKey } from './working-days'
import { replaceUpdateLinks, type ScrumLinkInput } from './scrum-links'
import { serializeScrumUpdate, serializeScrumUpdates } from './scrum-serializer'
import { decideBlockerLifecycle } from './blocker-lifecycle'

export interface SaveScrumUpdateInput {
  userId?: string
  scrumDate?: string
  yesterdayDone?: string
  yesterdayStatusJson?: unknown
  todayPlan?: string
  blockers?: string | null
  blockerCategory?: string | null
  wins?: string | null
  mood?: string | null
  projectId?: string | null
  projectActivityId?: string | null
  proxyReason?: string | null
  proxyReasonDetail?: string | null
  links?: ScrumLinkInput[]
}

export async function saveScrumUpdate(session: Session, input: SaveScrumUpdateInput, existingId?: string) {
  const settings = await getScrumSettings()
  const actorId = session.user.id
  const subjectUserId = input.userId ?? actorId
  const isProxy = actorId !== subjectUserId
  if (isProxy) {
    if (!settings.proxyEntryEnabled) return { forbidden: apiForbidden('Proxy entry is disabled') }
    if (!await canProxyFor(session, subjectUserId)) return { forbidden: apiForbidden('You cannot submit on behalf of this user') }
    if (!input.proxyReason) return { error: 'Proxy reason is required' }
  }

  const scrumDateKey = input.scrumDate ?? toScrumDateKey(new Date(), settings)
  const scrumDate = dateFromDateKey(scrumDateKey)
  const subject = await resolveScrumSubjectContext(subjectUserId)
  const submittedAt = new Date()
  const late = isLateSubmission(submittedAt, scrumDate, settings)
  const hasBlocker = !!input.blockers?.trim()
  const hasWin = !!input.wins?.trim()

  const previous = await prisma.scrumUpdate.findFirst({
    where: { userId: subjectUserId, scrumDate: { lt: scrumDate } },
    orderBy: { scrumDate: 'desc' },
    select: {
      blockers: true,
      blockerCategory: true,
      blockerStatus: true,
      blockerFirstRaisedAt: true,
    },
  })
  const blockerDecision = decideBlockerLifecycle({
    previousText: previous?.blockers,
    previousCategory: previous?.blockerCategory,
    previousStatus: previous?.blockerStatus,
    previousFirstRaisedAt: previous?.blockerFirstRaisedAt,
    text: input.blockers,
    category: input.blockerCategory,
    now: submittedAt,
    settings,
  })

  const data: any = {
    userId: subjectUserId,
    submittedById: actorId,
    managerId: subject.managerId,
    teamId: subject.teamId,
    projectId: input.projectId ?? null,
    projectActivityId: input.projectActivityId ?? null,
    scrumDate,
    status: late ? 'LATE' : 'SUBMITTED',
    yesterdayDone: input.yesterdayDone ?? '',
    yesterdayStatusJson: input.yesterdayStatusJson ?? undefined,
    todayPlan: input.todayPlan ?? '',
    blockers: input.blockers?.trim() || null,
    blockerCategory: hasBlocker ? input.blockerCategory : null,
    blockerStatus: blockerDecision.status,
    blockerDaysOpen: blockerDecision.daysOpen,
    blockerFirstRaisedAt: blockerDecision.firstRaisedAt,
    wins: input.wins?.trim() || null,
    mood: isProxy || !settings.moodEnabled ? null : input.mood ?? null,
    hasBlocker,
    hasWin,
    isLate: late,
    submittedAt,
    isProxyEntry: isProxy,
    proxyReason: isProxy ? input.proxyReason : null,
    proxyReasonDetail: isProxy ? input.proxyReasonDetail ?? null : null,
  }

  const result = await prisma.$transaction(async (tx) => {
    const update = existingId
      ? await tx.scrumUpdate.update({ where: { id: existingId }, data: { ...data, amendedAt: new Date(), status: 'AMENDED' } })
      : await tx.scrumUpdate.upsert({
          where: { userId_scrumDate: { userId: subjectUserId, scrumDate } },
          create: data,
          update: { ...data, amendedAt: new Date() },
        })
    await replaceUpdateLinks(update.id, actorId, input.links ?? [], tx)
    return tx.scrumUpdate.findUnique({
      where: { id: update.id },
      include: { links: true, comments: true, celebrations: true },
    })
  })

  await recordActivity({
    entityType: 'SCRUM_UPDATE',
    action: isProxy ? 'PROXY_SUBMITTED' : existingId ? 'AMENDED' : 'CREATED',
    actorId,
    metadata: { updateId: result?.id, subjectUserId, scrumDate: scrumDateKey, isProxy },
  })

  if (hasBlocker && subject.managerId) {
    await emit('SCRUM_BLOCKER_RAISED', {
      actorId,
      entityType: 'SCRUM_UPDATE',
      entityId: result?.id,
      explicitRecipients: [subject.managerId],
      data: { subjectUserId, blockerCategory: input.blockerCategory, deepLink: `/dashboard/scrum?update=${result?.id}` },
    })
  }
  if (isProxy) {
    await emit('SCRUM_PROXY_SUBMITTED', {
      actorId,
      entityType: 'SCRUM_UPDATE',
      entityId: result?.id,
      explicitRecipients: [subjectUserId],
      data: { proxyReason: input.proxyReason, deepLink: `/dashboard/scrum?update=${result?.id}` },
    })
  }

  return { update: await serializeScrumUpdate(result as any, { id: actorId, role: session.user.role }) }
}

export async function getScrumUpdateForViewer(session: Session, id: string) {
  const update = await prisma.scrumUpdate.findUnique({
    where: { id },
    include: { links: true, comments: true, celebrations: true },
  })
  if (!update) return null
  if (!await canViewScrumUser(session, update.userId)) return { forbidden: true }
  return serializeScrumUpdate(update as any, { id: session.user.id, role: session.user.role })
}

export async function listScrumUpdates(session: Session, query: URLSearchParams) {
  const from = query.get('from')
  const to = query.get('to')
  const userId = query.get('userId')
  const hasBlocker = query.get('hasBlocker')
  const hasWin = query.get('hasWin')
  const projectId = query.get('projectId')
  const where: any = {}
  if (from || to) where.scrumDate = {
    ...(from ? { gte: dateFromDateKey(from) } : {}),
    ...(to ? { lte: dateFromDateKey(to) } : {}),
  }
  if (userId) where.userId = userId
  if (hasBlocker != null) where.hasBlocker = hasBlocker === 'true'
  if (hasWin != null) where.hasWin = hasWin === 'true'
  if (projectId) where.projectId = projectId

  if (session.user.role !== 'ADMIN' && session.user.role !== 'EXECUTIVE') {
    const memberships = await prisma.departmentMembership.findMany({
      where: { userId: session.user.id, endedAt: null },
      select: { departmentId: true },
    })
    where.OR = [
      { userId: session.user.id },
      { managerId: session.user.id },
      { teamId: { in: memberships.map((m) => m.departmentId) } },
    ]
  }

  const updates = await prisma.scrumUpdate.findMany({
    where,
    include: { links: true, comments: true, celebrations: true },
    orderBy: [{ scrumDate: 'desc' }, { submittedAt: 'asc' }],
    take: Math.min(200, Number(query.get('limit') ?? 100)),
  })
  return serializeScrumUpdates(updates as any[], { id: session.user.id, role: session.user.role })
}

export async function confirmProxyUpdate(session: Session, id: string, amend?: Partial<SaveScrumUpdateInput>) {
  const update = await prisma.scrumUpdate.findUnique({ where: { id } })
  if (!update) return null
  if (update.userId !== session.user.id) return { forbidden: true }
  const data: any = { proxyConfirmedByUser: true, proxyConfirmedAt: new Date(), status: 'CONFIRMED' }
  if (amend?.yesterdayDone) data.yesterdayDone = amend.yesterdayDone
  if (amend?.todayPlan) data.todayPlan = amend.todayPlan
  if (amend?.blockers !== undefined) {
    data.blockers = amend.blockers || null
    data.hasBlocker = !!amend.blockers
    data.blockerCategory = amend.blockerCategory ?? null
  }
  if (amend?.wins !== undefined) {
    data.wins = amend.wins || null
    data.hasWin = !!amend.wins
  }
  const saved = await prisma.scrumUpdate.update({ where: { id }, data })
  await recordActivity({
    entityType: 'SCRUM_UPDATE',
    action: amend ? 'AMENDED' : 'PROXY_CONFIRMED',
    actorId: session.user.id,
    metadata: { updateId: id },
  })
  await emit('SCRUM_PROXY_CONFIRMED', {
    actorId: session.user.id,
    entityType: 'SCRUM_UPDATE',
    entityId: id,
    explicitRecipients: [saved.submittedById],
    data: { deepLink: `/dashboard/scrum?update=${id}` },
  })
  return serializeScrumUpdate(saved as any, { id: session.user.id, role: session.user.role })
}
