import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { emit } from '@/lib/notifications'
import { apiConflict, apiForbidden } from '@/lib/api'
import {
  canEditScrumUpdateResolved,
  canProxyFor,
  canViewScrumUser,
  listDepartmentLeadIds,
  resolveScrumSubjectContext,
} from './access'
import { sanitizeScrumRichTextOrNull } from './html'
import { getScrumSettings } from './settings'
import { dateFromDateKey, isLateSubmission, toScrumDateKey } from './working-days'
import { dedupeScrumLinks, deriveItemLinks, replaceUpdateLinks, validateLinkOwnership, type ScrumLinkInput } from './scrum-links'
import { attendanceSafeUpdateData, decideProxyOverwrite } from './attendance'
import { serializeScrumUpdate, serializeScrumUpdates } from './scrum-serializer'
import { carryBlockerEscalation, decideBlockerLifecycle, shouldNotifyRecurringBlocker } from './blocker-lifecycle'
import {
  SCRUM_DRAFT_STATUS,
  SUBMITTED_SCRUM_UPDATE_WHERE,
  decideScrumDraftSave,
  excludeScrumDrafts,
  isScrumDraft,
  scrumSubmitBaseline,
} from './drafts'
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
  sameBlockerConfirmed?: boolean | null
  /**
   * Save as a server-side draft (status DRAFT): content only — no To-do sync,
   * no OKR links, no notifications, not counted as attendance. See ./drafts.
   */
  asDraft?: boolean | null
}

/** Proxy attribution columns — never cleared once a record is a proxy entry (spec §11 hard rule 4). */
const PROXY_ATTRIBUTION_FIELDS = ['isProxyEntry', 'proxyReason', 'proxyReasonDetail', 'submittedById'] as const

export async function saveScrumUpdate(session: Session, input: SaveScrumUpdateInput, existingId?: string) {
  const settings = await getScrumSettings()
  const actorId = session.user.id

  // PATCH /updates/[id]: the record's owner is the only editor, and the record
  // can never be re-assigned to another user or moved to another date.
  let target: { id: string; userId: string; scrumDate: Date; status: string } | null = null
  if (existingId) {
    target = await prisma.scrumUpdate.findUnique({ where: { id: existingId }, select: { id: true, userId: true, scrumDate: true, status: true } })
    if (!target) return { notFound: true as const }
    if (!canEditScrumUpdateResolved({ actorId, ownerId: target.userId })) {
      return { forbidden: apiForbidden('Only the owner can edit this scrum update') }
    }
    if (input.userId && input.userId !== target.userId) {
      return { forbidden: apiForbidden('A scrum update cannot be re-assigned to another user') }
    }
  }

  const subjectUserId = target?.userId ?? input.userId ?? actorId
  const isProxy = actorId !== subjectUserId
  if (input.asDraft && isProxy) return { error: 'Drafts can only be saved for your own update' }
  if (isProxy) {
    if (!settings.proxyEntryEnabled) return { forbidden: apiForbidden('Proxy entry is disabled') }
    if (!await canProxyFor(session, subjectUserId)) return { forbidden: apiForbidden('You cannot submit on behalf of this user') }
    if (!input.proxyReason) return { error: 'Proxy reason is required' }
  }

  const scrumDateKey = target
    ? toScrumDateKey(target.scrumDate, settings)
    : input.scrumDate ?? toScrumDateKey(new Date(), settings)
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

  // Fetch the existing row for the same date so we can diff and sync Todos
  // (or, for a draft, refuse to overwrite a real submission).
  const existing = await prisma.scrumUpdate.findUnique({
    where: { userId_scrumDate: { userId: subjectUserId, scrumDate } },
    select: {
      id: true,
      contentJson: true,
      isProxyEntry: true,
      blockerStatus: true,
      status: true,
      blockerFirstRaisedAt: true,
      escalatedAt: true,
      escalatedToUserId: true,
      raidItemId: true,
    },
  })

  // A proxy never replaces (or converts) a report the subject submitted themselves.
  const proxyOverwrite = decideProxyOverwrite({ isProxy, existing: existing ? { status: existing.status, isProxyEntry: existing.isProxyEntry } : null })
  if (!proxyOverwrite.ok) return { conflict: apiConflict(proxyOverwrite.message) }

  if (input.asDraft) {
    const decision = decideScrumDraftSave({ isProxy, existingStatus: existing?.status })
    if (!decision.ok) return { error: decision.message }
    return saveScrumDraft(session, {
      existingId: existing?.id ?? null,
      data: {
        userId: subjectUserId,
        submittedById: actorId,
        managerId: subject.managerId,
        teamId: subject.teamId,
        projectId: input.projectId ?? null,
        projectActivityId: input.projectActivityId ?? null,
        scrumDate,
        status: SCRUM_DRAFT_STATUS,
        yesterdayDone: buildYesterdayDoneHtml(content.yesterdayItems),
        yesterdayStatusJson: buildYesterdayStatusJson(content.yesterdayItems),
        todayPlan: serializeItemsToHtml(content.todayItems),
        blockers: serializeItemsToHtml(content.blockerItems) || null,
        blockerCategory: input.blockerCategory ?? null,
        // A draft carries no lifecycle/attendance facts; submit recomputes them.
        blockerStatus: null,
        blockerDaysOpen: 0,
        blockerFirstRaisedAt: null,
        wins: serializeItemsToHtml(content.winItems) || null,
        mood: settings.moodEnabled ? input.mood ?? null : null,
        hasBlocker: false,
        hasWin: false,
        isLate: false,
        submittedAt: new Date(),
        isProxyEntry: false,
        proxyReason: null,
        proxyReasonDetail: null,
        contentJson: content,
        remarks: sanitizeScrumRichTextOrNull(input.remarks?.trim()),
      },
    })
  }

  // A stored draft never synced To-dos/links: submitting it is a first submit.
  const baseline = scrumSubmitBaseline(existing?.status)

  const previousDayUpdate = await prisma.scrumUpdate.findFirst({
    where: { userId: subjectUserId, scrumDate: { lt: scrumDate }, ...SUBMITTED_SCRUM_UPDATE_WHERE },
    orderBy: { scrumDate: 'desc' },
    select: {
      blockers: true,
      blockerCategory: true,
      blockerStatus: true,
      blockerFirstRaisedAt: true,
      escalatedAt: true,
      escalatedToUserId: true,
      raidItemId: true,
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
    sameBlockerConfirmed: input.sameBlockerConfirmed ?? undefined,
  })

  const previousContent = baseline.fromDraft ? emptyContentJson() : normalizeContentJson(existing?.contentJson)
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
      // Rich text from the editor: reduce to an inert allow-list before storing.
      remarks: sanitizeScrumRichTextOrNull(input.remarks?.trim()),
    }

    // Escalation belongs to the blocker's lifecycle chain: carry it so the
    // finalize cron escalates a persisting blocker once, not every day.
    const existingSubmitted = existing && !baseline.fromDraft ? existing : null
    const escalation = carryBlockerEscalation({
      hasBlocker,
      continuesPrevious: blockerDecision.continuesPrevious,
      previous: previousDayUpdate,
      existingSameDay: existingSubmitted
        ? {
            escalatedAt: existingSubmitted.escalatedAt,
            escalatedToUserId: existingSubmitted.escalatedToUserId,
            raidItemId: existingSubmitted.raidItemId,
            chainStartedBeforeToday: !!existingSubmitted.blockerFirstRaisedAt
              && toScrumDateKey(existingSubmitted.blockerFirstRaisedAt, settings) < scrumDateKey,
          }
        : null,
    })
    if (escalation) {
      Object.assign(data, escalation)
      if (escalation.escalatedAt) data.blockerStatus = 'ESCALATED'
    }

    // Editing a proxy entry (owner amend, or self-submit over a proxy row) must
    // not erase who physically entered it.
    const updateData: any = { ...data }
    if (existing?.isProxyEntry && !isProxy) {
      for (const field of PROXY_ATTRIBUTION_FIELDS) delete updateData[field]
    }

    // Attendance stamp (submittedAt/isLate/status) is set on the first submit
    // only; an amendment records amendedAt + AMENDED instead (invariant #3).
    const amendData = attendanceSafeUpdateData(updateData, baseline.isAmend)
    const update = existingId
      ? await tx.scrumUpdate.update({ where: { id: existingId }, data: amendData })
      : await tx.scrumUpdate.upsert({
          where: { userId_scrumDate: { userId: subjectUserId, scrumDate } },
          create: data,
          update: amendData,
        })
    // Spec S11: OKR picks in every section (yesterday/today/blocker/win) are link rows.
    await replaceUpdateLinks(update.id, actorId, dedupeScrumLinks([...(input.links ?? []), ...deriveItemLinks(syncedContent)]), tx)
    return tx.scrumUpdate.findUnique({
      where: { id: update.id },
      include: { links: true, comments: true, celebrations: true },
    })
  })

  await recordActivity({
    entityType: 'SCRUM_UPDATE',
    action: isProxy ? 'PROXY_SUBMITTED' : baseline.isAmend ? 'AMENDED' : 'CREATED',
    actorId,
    metadata: { updateId: result?.id, subjectUserId, scrumDate: scrumDateKey, isProxy, ...(baseline.fromDraft ? { fromDraft: true } : {}) },
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
  // Spec S5.1: the same blocker persisting past `recurringThresholdDays` → notify the department lead(s).
  if (hasBlockerForNotification && shouldNotifyRecurringBlocker({
    status: blockerDecision.status,
    previousDayStatus: previousDayUpdate?.blockerStatus,
    existingSameDayStatus: baseline.fromDraft ? null : existing?.blockerStatus,
  })) {
    const leadIds = await listDepartmentLeadIds(subject.teamId, subjectUserId)
    const recipients = [...new Set(leadIds.length ? leadIds : [subject.managerId].filter(Boolean) as string[])]
      .filter((id) => id !== actorId)
    if (recipients.length) {
      await emit('SCRUM_BLOCKER_RECURRING', {
        actorId,
        entityType: 'SCRUM_UPDATE',
        entityId: result?.id,
        explicitRecipients: recipients,
        data: {
          subjectUserId,
          blockerCategory: input.blockerCategory,
          daysOpen: blockerDecision.daysOpen,
          blockerSummary: `A ${String(input.blockerCategory ?? 'scrum').toLowerCase().replace(/_/g, ' ')} blocker has been open for ${blockerDecision.daysOpen} working days.`,
          deepLink: `/dashboard/scrum?update=${result?.id}`,
        },
      })
    }
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
  // A draft is private working state: only its owner can open it.
  if (isScrumDraft(update.status) && update.userId !== session.user.id) return null
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
    where: excludeScrumDrafts(where),
    include: { links: true, comments: true, celebrations: true },
    orderBy: [{ scrumDate: 'desc' }, { submittedAt: 'asc' }],
    take: Math.min(200, Number(query.get('limit') ?? 100)),
  })
  return serializeScrumUpdates(updates as any[], { id: session.user.id, role: session.user.role })
}

export async function confirmProxyUpdate(session: Session, id: string, amend?: Partial<SaveScrumUpdateInput>) {
  const update = await prisma.scrumUpdate.findUnique({ where: { id } })
  if (!update || isScrumDraft(update.status)) return null
  if (update.userId !== session.user.id) return { forbidden: true }
  const data: any = { proxyConfirmedByUser: true, proxyConfirmedAt: new Date(), status: 'CONFIRMED' }
  // Amend payloads are raw HTML from the client — sanitize before storing.
  if (amend?.yesterdayDone) data.yesterdayDone = sanitizeScrumRichTextOrNull(amend.yesterdayDone) ?? ''
  if (amend?.todayPlan) data.todayPlan = sanitizeScrumRichTextOrNull(amend.todayPlan) ?? ''
  if (amend?.blockers !== undefined) {
    data.blockers = sanitizeScrumRichTextOrNull(amend.blockers)
    data.hasBlocker = !!data.blockers
    data.blockerCategory = data.hasBlocker ? amend.blockerCategory ?? null : null
  }
  if (amend?.wins !== undefined) {
    data.wins = sanitizeScrumRichTextOrNull(amend.wins)
    data.hasWin = !!data.wins
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

/**
 * Persist a draft row. Only content is written — no To-do sync, OKR links,
 * activity, or notifications. Never overwrites a submitted row: the update is
 * conditional on the stored status still being DRAFT.
 */
async function saveScrumDraft(session: Session, input: { existingId: string | null; data: Record<string, unknown> }) {
  const viewer = { id: session.user.id, role: session.user.role }
  const include = { links: true, comments: true, celebrations: true } as const
  if (input.existingId) {
    const { count } = await prisma.scrumUpdate.updateMany({
      where: { id: input.existingId, status: SCRUM_DRAFT_STATUS },
      data: input.data as any,
    })
    if (count === 0) return { error: 'This update was already submitted — edit and resubmit it instead of saving a draft' }
    const saved = await prisma.scrumUpdate.findUnique({ where: { id: input.existingId }, include })
    return { update: await serializeScrumUpdate(saved as any, viewer), draft: true as const }
  }
  try {
    const saved = await prisma.scrumUpdate.create({ data: input.data as any, include })
    return { update: await serializeScrumUpdate(saved as any, viewer), draft: true as const }
  } catch (error: any) {
    // A submit for the same user/day landed first — never replace it with a draft.
    if (error?.code === 'P2002') return { error: 'This update was already submitted — edit and resubmit it instead of saving a draft' }
    throw error
  }
}

/** The signed-in user's own draft for a day, if one is stored (restored into the form). */
export async function getOwnScrumDraft(userId: string, scrumDateKey: string) {
  const draft = await prisma.scrumUpdate.findFirst({
    where: { userId, scrumDate: dateFromDateKey(scrumDateKey), status: SCRUM_DRAFT_STATUS },
    select: {
      id: true,
      contentJson: true,
      blockerCategory: true,
      mood: true,
      projectId: true,
      projectActivityId: true,
      remarks: true,
      updatedAt: true,
    },
  })
  if (!draft) return null
  return { ...draft, contentJson: normalizeContentJson(draft.contentJson), updatedAt: draft.updatedAt.toISOString() }
}

/** Owner-only delete of a draft ("Discard draft"). Submitted updates are never deleted here. */
export async function discardScrumDraft(session: Session, id: string) {
  const row = await prisma.scrumUpdate.findUnique({ where: { id }, select: { id: true, userId: true, status: true } })
  if (!row || (isScrumDraft(row.status) && row.userId !== session.user.id)) return { notFound: true as const }
  if (!isScrumDraft(row.status)) return { error: 'Only a draft can be discarded' }
  const { count } = await prisma.scrumUpdate.deleteMany({ where: { id, userId: session.user.id, status: SCRUM_DRAFT_STATUS } })
  // `deleted` is false if the row changed under us (e.g. submitted meanwhile) —
  // the caller must not clean up after a delete that did not happen.
  return { id, deleted: count > 0 }
}
