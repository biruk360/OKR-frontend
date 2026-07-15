import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { emit } from '@/lib/notifications'
import { apiForbidden } from '@/lib/api'
import { canProxyFor, canViewScrumUser, resolveScrumSubjectContext } from './access'
import { getScrumSettings } from './settings'
import { dateFromDateKey, isLateSubmission, toScrumDateKey } from './working-days'
import { replaceUpdateLinks, validateLinkOwnership, type ScrumLinkInput } from './scrum-links'
import { serializeScrumUpdate, serializeScrumUpdates } from './scrum-serializer'
import { decideBlockerLifecycle } from './blocker-lifecycle'
import {
  allItems,
  buildYesterdayDoneHtml,
  buildYesterdayStatusJson,
  collectLinkedIds,
  emptyContentJson,
  normalizeContentJson,
  parseHtmlToItems,
  serializeItemsToHtml,
  syncScrumTodos,
  type ScrumContentJson,
} from './items'

export interface SaveScrumUpdateInput {
  userId?: string
  scrumDate?: string
  yesterdayDone?: string | null
  yesterdayStatusJson?: unknown
  todayPlan?: string | null
  blockers?: string | null
  blockerCategory?: string | null
  wins?: string | null
  mood?: string | null
  projectId?: string | null
  projectActivityId?: string | null
  proxyReason?: string | null
  proxyReasonDetail?: string | null
  links?: ScrumLinkInput[]
  contentJson?: ScrumContentJson | null
  remarks?: string | null
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

  // Resolve structured content, falling back to legacy HTML fields.
  let content = input.contentJson ? normalizeContentJson(input.contentJson) : emptyContentJson()
  if (!input.contentJson) {
    content.yesterdayItems = input.yesterdayDone ? parseHtmlToItems(input.yesterdayDone, 'DONE') : []
    content.todayItems = input.todayPlan ? parseHtmlToItems(input.todayPlan, 'PENDING') : []
    content.blockerItems = input.blockers ? parseHtmlToItems(input.blockers, 'PENDING') : []
    content.winItems = input.wins ? parseHtmlToItems(input.wins, 'PENDING') : []
  }

  // Validate that every linked OKR/KR belongs to the subject user.
  const itemLinks = allItems(content).map((item) => ({ objectiveId: item.objectiveId, keyResultId: item.keyResultId }))
  const legacyLinks = (input.links ?? []).map((link) => ({ objectiveId: link.objectiveId, keyResultId: link.keyResultId }))
  const ownership = await validateLinkOwnership(subjectUserId, [...itemLinks, ...legacyLinks])
  if (!ownership.valid) return { error: ownership.reason }

  const previousDayUpdate = await prisma.scrumUpdate.findFirst({
    where: { userId: subjectUserId, scrumDate: { lt: scrumDate } },
    orderBy: { scrumDate: 'desc' },
    select: {
      blockers: true,
      blockerCategory: true,
      blockerStatus: true,
      blockerFirstRaisedAt: true,
    },
  })
  const blockersHtml = serializeItemsToHtml(content.blockerItems)
  const blockerDecision = decideBlockerLifecycle({
    previousText: previousDayUpdate?.blockers,
    previousCategory: previousDayUpdate?.blockerCategory,
    previousStatus: previousDayUpdate?.blockerStatus,
    previousFirstRaisedAt: previousDayUpdate?.blockerFirstRaisedAt,
    text: blockersHtml,
    category: input.blockerCategory,
    now: submittedAt,
    settings,
  })

  // Fetch the existing update for the same date so we can diff and sync Todos.
  const existing = await prisma.scrumUpdate.findUnique({
    where: { userId_scrumDate: { userId: subjectUserId, scrumDate } },
    select: { id: true, contentJson: true },
  })
  const previousContent = normalizeContentJson(existing?.contentJson)
  let hasBlockerForNotification = false

  const result = await prisma.$transaction(async (tx) => {
    const syncedContent = await syncScrumTodos(previousContent, content, subjectUserId, actorId, scrumDate, tx)

    const hasBlocker = (syncedContent.blockerItems?.length ?? 0) > 0
    const hasWin = (syncedContent.winItems?.length ?? 0) > 0
    hasBlockerForNotification = hasBlocker

    const data: any = {
      userId: subjectUserId,
      submittedById: actorId,
      managerId: subject.managerId,
      teamId: subject.teamId,
      projectId: input.projectId ?? null,
      projectActivityId: input.projectActivityId ?? null,
      scrumDate,
      status: late ? 'LATE' : 'SUBMITTED',
      yesterdayDone: buildYesterdayDoneHtml(syncedContent.yesterdayItems),
      yesterdayStatusJson: buildYesterdayStatusJson(syncedContent.yesterdayItems),
      todayPlan: serializeItemsToHtml(syncedContent.todayItems),
      blockers: hasBlocker ? blockersHtml : null,
      blockerCategory: hasBlocker ? input.blockerCategory : null,
      blockerStatus: blockerDecision.status,
      blockerDaysOpen: blockerDecision.daysOpen,
      blockerFirstRaisedAt: blockerDecision.firstRaisedAt,
      wins: serializeItemsToHtml(syncedContent.winItems) || null,
      mood: isProxy || !settings.moodEnabled ? null : input.mood ?? null,
      hasBlocker,
      hasWin,
      isLate: late,
      submittedAt,
      isProxyEntry: isProxy,
      proxyReason: isProxy ? input.proxyReason : null,
      proxyReasonDetail: isProxy ? input.proxyReasonDetail ?? null : null,
      contentJson: syncedContent,
      remarks: input.remarks?.trim() || null,
    }

    const update = existingId
      ? await tx.scrumUpdate.update({ where: { id: existingId }, data: { ...data, amendedAt: new Date(), status: 'AMENDED' } })
      : await tx.scrumUpdate.upsert({
          where: { userId_scrumDate: { userId: subjectUserId, scrumDate } },
          create: data,
          update: { ...data, amendedAt: new Date() },
        })
    const linksFromWinItems = (syncedContent.winItems ?? [])
      .filter((item) => item.objectiveId || item.keyResultId)
      .map((item) => ({
        context: 'WIN' as const,
        objectiveId: item.objectiveId ?? null,
        keyResultId: item.keyResultId ?? null,
        todoId: null,
        progressNote: null,
      }))
    await replaceUpdateLinks(update.id, actorId, [...(input.links ?? []), ...linksFromWinItems], tx)
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

  if (hasBlockerForNotification && subject.managerId) {
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
