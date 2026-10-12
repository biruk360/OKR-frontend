/**
 * Development plan (DEV-1…6) — server service. Prisma-touching; import from
 * `app/` (routes, page loaders) by direct path only.
 *
 * Access (spec §8, lib/package/access.ts):
 *   - read:  canViewPackageArea(viewer, owner, 'development') — self, manager
 *            chain, department lead (subtree), HR, EXECUTIVE / ADMIN
 *   - write: canEditPackageArea(viewer, owner, 'development') — self (own dev
 *            items), manager chain, department lead, HR, EXECUTIVE / ADMIN
 * Past timeframes are read-only except for ADMIN / EXECUTIVE (PRF-3).
 * Linked key results are redacted per lib/okr/visibility-scope.ts (CON-8).
 *
 * Development items are never DevelopmentActions (DEV-6): this service does not
 * read or write that model.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  canEditPackageArea,
  canViewPackageArea,
  getPackageAreaAccess,
  type PackageViewer,
} from '@/lib/package/access'
import { diffPackageFields, recordPackageActivity } from '@/lib/package/audit'
import { keyResultHref } from '@/lib/package/links'
import {
  REDACTED_KEY_RESULT_TITLE,
  buildKeyResultVisibilityWhere,
  loadViewerContext,
  redactKeyResultForViewer,
  type ViewerContext,
} from '@/lib/okr/visibility-scope'
import { isDevelopmentKind, isDevelopmentStatus } from '@/types/package'
import type {
  AddDevelopmentHoursResult,
  DevelopmentItemDTO,
  DevelopmentLinkedKeyResult,
  DevelopmentListResponse,
  DevelopmentPermissions,
  DevelopmentRuleProgress,
} from '../types'
import {
  applyDevelopmentStatePatch,
  composeEvidenceNote,
  computeDevelopmentRule,
  isDevelopmentDueSoon,
  isDevelopmentOverdue,
  isHttpUrl,
  isOpenStatus,
  kindRequiresEvidence,
  sortDevelopmentItems,
  splitEvidenceNote,
  startOfUtcDay,
  statusAfterLoggingHours,
  type DevelopmentRuleSettings,
} from './rules'
import type { AddDevelopmentHoursInput, CreateDevelopmentItemInput, UpdateDevelopmentItemInput } from './schemas'
import { DEV_MAX_TOTAL_HOURS } from './schemas'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type DevelopmentErrorStatus = 400 | 403 | 404 | 409 | 423

export class DevelopmentError extends Error {
  constructor(
    public readonly status: DevelopmentErrorStatus,
    message: string,
    public readonly code: string = 'DEVELOPMENT_ERROR',
  ) {
    super(message)
    this.name = 'DevelopmentError'
  }
}

export function isDevelopmentError(error: unknown): error is DevelopmentError {
  return error instanceof DevelopmentError
}

// ---------------------------------------------------------------------------
// Loading + mapping
// ---------------------------------------------------------------------------

type ItemRow = Prisma.DevelopmentItemGetPayload<object>

/** Fields diffed into the UPDATED / STATUS_CHANGED activity rows (AUD-1). */
const AUDITED_FIELDS = [
  'title',
  'kind',
  'targetText',
  'targetHours',
  'hoursLogged',
  'dueDate',
  'keyResultId',
  'status',
  'completedAt',
  'evidenceNote',
  'dropReason',
  'isMandatory',
  'externalRef',
] as const

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

const HIDDEN_KEY_RESULT = (id: string): DevelopmentLinkedKeyResult => ({
  id,
  title: REDACTED_KEY_RESULT_TITLE,
  objectiveId: null,
  progress: null,
  isRedacted: true,
  href: null,
})

/** Linked KRs as the viewer may see them: full, redacted, or hidden (outside their record scope). */
async function loadLinkedKeyResults(
  ctx: ViewerContext,
  ids: Iterable<string | null | undefined>,
): Promise<Map<string, DevelopmentLinkedKeyResult>> {
  const unique = [...new Set([...ids].filter((id): id is string => !!id))]
  const map = new Map<string, DevelopmentLinkedKeyResult>()
  if (unique.length === 0) return map
  const rows = await prisma.keyResult.findMany({
    where: { AND: [{ id: { in: unique } }, buildKeyResultVisibilityWhere(ctx)] },
    select: {
      id: true,
      title: true,
      progress: true,
      ownerId: true,
      isPrivate: true,
      objectiveId: true,
      objective: { select: { ownerId: true, isPrivate: true, level: true, departmentId: true } },
    },
  })
  for (const row of rows) {
    const { objective, ...kr } = row
    const shown = redactKeyResultForViewer(ctx, kr, objective)
    const redacted = !!shown.isRedacted
    map.set(row.id, {
      id: row.id,
      title: shown.title,
      objectiveId: row.objectiveId,
      progress: typeof shown.progress === 'number' ? Math.round(shown.progress) : null,
      isRedacted: redacted,
      href: redacted ? null : keyResultHref(row.id),
    })
  }
  for (const id of unique) if (!map.has(id)) map.set(id, HIDDEN_KEY_RESULT(id))
  return map
}

export function toDevelopmentItemDTO(
  row: ItemRow,
  keyResults: Map<string, DevelopmentLinkedKeyResult>,
  now: Date = new Date(),
): DevelopmentItemDTO {
  const status = isDevelopmentStatus(row.status) ? row.status : 'NOT_STARTED'
  const kind = isDevelopmentKind(row.kind) ? row.kind : 'OTHER'
  return {
    id: row.id,
    externalRef: row.externalRef,
    ownerId: row.ownerId,
    timeframeId: row.timeframeId,
    packageId: row.packageId,
    title: row.title,
    kind,
    targetText: row.targetText,
    targetHours: row.targetHours,
    hoursLogged: row.hoursLogged,
    dueDate: iso(row.dueDate),
    keyResultId: row.keyResultId,
    keyResult: row.keyResultId ? keyResults.get(row.keyResultId) ?? HIDDEN_KEY_RESULT(row.keyResultId) : null,
    status,
    completedAt: iso(row.completedAt),
    evidence: splitEvidenceNote(row.evidenceNote),
    evidenceNote: row.evidenceNote,
    dropReason: row.dropReason,
    isMandatory: row.isMandatory,
    overdue: isDevelopmentOverdue({ status, dueDate: row.dueDate }, now),
    dueSoon: isDevelopmentDueSoon({ status, dueDate: row.dueDate }, now),
    requiresEvidence: kindRequiresEvidence(kind),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function viewerContextFor(viewer: PackageViewer): Promise<ViewerContext> {
  return loadViewerContext({ id: viewer.userId, role: viewer.role })
}

async function toDTOs(viewer: PackageViewer, rows: ItemRow[], now: Date = new Date()): Promise<DevelopmentItemDTO[]> {
  const ids = rows.map((row) => row.keyResultId)
  const keyResults = ids.some(Boolean)
    ? await loadLinkedKeyResults(await viewerContextFor(viewer), ids)
    : new Map<string, DevelopmentLinkedKeyResult>()
  return rows.map((row) => toDevelopmentItemDTO(row, keyResults, now))
}

async function loadItem(id: string): Promise<ItemRow> {
  const row = await prisma.developmentItem.findUnique({ where: { id } })
  if (!row) throw new DevelopmentError(404, 'Development item not found', 'NOT_FOUND')
  return row
}

/** DEV-3 rule values (OrganizationSettings singleton); defaults apply when the row is missing. */
export async function loadDevelopmentRuleSettings(): Promise<DevelopmentRuleSettings | null> {
  try {
    return await prisma.organizationSettings.findUnique({
      where: { id: 'singleton' },
      select: { devMinItems: true, devMinHours: true },
    })
  } catch (error) {
    console.error('[development-plan] organization settings lookup failed; using defaults', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

interface TimeframeRow {
  id: string
  name: string
  endDate: Date
}

/** The given timeframe, or the active one containing today (longest first) when none is given. */
export async function resolveDevelopmentTimeframe(timeframeId: string | null | undefined): Promise<TimeframeRow> {
  if (timeframeId) {
    const timeframe = await prisma.timeframe.findUnique({
      where: { id: timeframeId },
      select: { id: true, name: true, endDate: true },
    })
    if (!timeframe) throw new DevelopmentError(404, 'Timeframe not found', 'TIMEFRAME_NOT_FOUND')
    return timeframe
  }
  const now = new Date()
  const candidates = await prisma.timeframe.findMany({
    where: { isActive: true, startDate: { lte: now }, endDate: { gte: startOfUtcDay(now) } },
    select: { id: true, name: true, startDate: true, endDate: true },
  })
  // Development rules are yearly: prefer the widest active timeframe.
  candidates.sort(
    (a, b) => b.endDate.getTime() - b.startDate.getTime() - (a.endDate.getTime() - a.startDate.getTime()),
  )
  const picked = candidates[0]
  if (!picked) throw new DevelopmentError(404, 'No active timeframe; pick a timeframe', 'TIMEFRAME_NOT_FOUND')
  return { id: picked.id, name: picked.name, endDate: picked.endDate }
}

/** PRF-3: a timeframe that has ended is read-only (ADMIN / EXECUTIVE excepted). */
function isTimeframeReadOnly(timeframe: { endDate: Date } | null, viewer: PackageViewer, now: Date = new Date()): boolean {
  if (!timeframe || viewer.seesAll) return false
  return timeframe.endDate.getTime() < startOfUtcDay(now).getTime()
}

async function packageFor(ownerId: string, timeframeId: string) {
  return prisma.operatingPackage.findUnique({
    where: { userId_timeframeId: { userId: ownerId, timeframeId } },
    select: { id: true, status: true },
  })
}

async function assertCanView(viewer: PackageViewer, ownerId: string): Promise<void> {
  // 404, not 403, for a single item: do not confirm the item exists.
  if (!(await canViewPackageArea(viewer, ownerId, 'development'))) {
    throw new DevelopmentError(404, 'Development item not found', 'NOT_FOUND')
  }
}

async function assertCanEdit(viewer: PackageViewer, ownerId: string): Promise<void> {
  if (!(await canEditPackageArea(viewer, ownerId, 'development'))) {
    throw new DevelopmentError(403, 'You cannot change this person’s development plan', 'FORBIDDEN')
  }
}

/** A linked KR must exist and be one the viewer sees in full (no linking to hidden / redacted KRs). */
async function assertLinkableKeyResult(viewer: PackageViewer, keyResultId: string | null | undefined): Promise<void> {
  if (!keyResultId) return
  const ctx = await viewerContextFor(viewer)
  const found = await prisma.keyResult.findFirst({
    where: { AND: [{ id: keyResultId }, { status: { not: 'DELETED' } }, buildKeyResultVisibilityWhere(ctx, { includeRedacted: false })] },
    select: { id: true },
  })
  if (!found) throw new DevelopmentError(400, 'The selected key result does not exist or is not visible to you', 'INVALID_KEY_RESULT')
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

const DUPLICATE_REF = () =>
  new DevelopmentError(409, 'Another development item in this timeframe already uses that reference', 'DUPLICATE_REF')

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export async function getDevelopmentPermissions(
  viewer: PackageViewer,
  ownerId: string,
  opts: { readOnly?: boolean } = {},
): Promise<DevelopmentPermissions> {
  const access = await getPackageAreaAccess(viewer, ownerId)
  const writable = access.edit.development && !opts.readOnly
  return { canCreate: writable, canEdit: writable, canChangeStatus: writable, canLogHours: writable }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The DEV-3 bars for already-loaded rows. */
export function developmentRuleFor(
  rows: ReadonlyArray<Pick<ItemRow, 'kind' | 'status' | 'hoursLogged'>>,
  settings: DevelopmentRuleSettings | null,
): DevelopmentRuleProgress {
  return computeDevelopmentRule(rows, settings)
}

/** GET list — items, DEV-3 rule bars, counts and the viewer's permissions. 403 when the area is hidden. */
export async function listDevelopmentItems(
  viewer: PackageViewer,
  ownerId: string,
  timeframeId: string | null,
): Promise<DevelopmentListResponse> {
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } })
  if (!owner) throw new DevelopmentError(404, 'User not found', 'USER_NOT_FOUND')
  if (!(await canViewPackageArea(viewer, ownerId, 'development'))) {
    throw new DevelopmentError(403, 'You do not have access to this person’s development plan', 'FORBIDDEN')
  }
  const timeframe = await resolveDevelopmentTimeframe(timeframeId)
  const now = new Date()
  const readOnly = isTimeframeReadOnly(timeframe, viewer, now)

  const [rows, settings, pkg, permissions] = await Promise.all([
    prisma.developmentItem.findMany({
      where: { ownerId, timeframeId: timeframe.id },
      orderBy: [{ createdAt: 'asc' }],
    }),
    loadDevelopmentRuleSettings(),
    packageFor(ownerId, timeframe.id),
    getDevelopmentPermissions(viewer, ownerId, { readOnly }),
  ])
  const items = sortDevelopmentItems(await toDTOs(viewer, rows, now))
  return {
    userId: ownerId,
    timeframeId: timeframe.id,
    timeframeName: timeframe.name,
    readOnly,
    packageId: pkg?.id ?? null,
    packageStatus: pkg?.status ?? null,
    rule: developmentRuleFor(rows, settings),
    counts: {
      total: items.length,
      open: items.filter((item) => isOpenStatus(item.status)).length,
      done: items.filter((item) => item.status === 'DONE').length,
      dropped: items.filter((item) => item.status === 'DROPPED').length,
      overdue: items.filter((item) => item.overdue).length,
    },
    items,
    permissions,
  }
}

export async function getDevelopmentItem(viewer: PackageViewer, id: string): Promise<DevelopmentItemDTO> {
  const row = await loadItem(id)
  await assertCanView(viewer, row.ownerId)
  const [dto] = await toDTOs(viewer, [row])
  return dto
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** POST — a new item (NOT_STARTED / IN_PROGRESS). DONE / DROPPED go through PATCH so their rules apply. */
export async function createDevelopmentItem(
  viewer: PackageViewer,
  input: CreateDevelopmentItemInput,
): Promise<DevelopmentItemDTO> {
  const owner = await prisma.user.findUnique({ where: { id: input.ownerId }, select: { id: true } })
  if (!owner) throw new DevelopmentError(404, 'User not found', 'USER_NOT_FOUND')
  await assertCanEdit(viewer, input.ownerId)
  const timeframe = await resolveDevelopmentTimeframe(input.timeframeId)
  if (isTimeframeReadOnly(timeframe, viewer)) {
    throw new DevelopmentError(423, 'This timeframe has ended; its development plan is read-only', 'TIMEFRAME_CLOSED')
  }
  await assertLinkableKeyResult(viewer, input.keyResultId)
  if (input.evidenceUrl && !isHttpUrl(input.evidenceUrl)) {
    throw new DevelopmentError(400, 'Evidence link must be an http(s) URL', 'INVALID_EVIDENCE_URL')
  }

  const pkg = await packageFor(input.ownerId, timeframe.id)
  const status = input.hoursLogged > 0 ? statusAfterLoggingHours(input.status) : input.status

  let row: ItemRow
  try {
    row = await prisma.$transaction(async (tx) => {
      const created = await tx.developmentItem.create({
        data: {
          ownerId: input.ownerId,
          timeframeId: timeframe.id,
          packageId: pkg?.id ?? null,
          title: input.title,
          kind: input.kind,
          targetText: input.targetText,
          targetHours: input.targetHours,
          hoursLogged: input.hoursLogged,
          dueDate: input.dueDate,
          keyResultId: input.keyResultId,
          status,
          isMandatory: input.isMandatory,
          evidenceNote: composeEvidenceNote({ note: input.evidenceNote, url: input.evidenceUrl }),
          externalRef: input.externalRef,
        },
      })
      await recordPackageActivity(
        {
          entityType: 'DEVELOPMENT_ITEM',
          action: 'CREATED',
          entityId: created.id,
          subjectUserId: created.ownerId,
          timeframeId: created.timeframeId,
          packageId: created.packageId,
          actorId: viewer.userId,
          keyResultId: created.keyResultId,
          editedAfterApproval: pkg?.status === 'APPROVED',
          metadata: {
            title: created.title,
            kind: created.kind,
            isMandatory: created.isMandatory,
            ...(created.externalRef ? { externalRef: created.externalRef } : {}),
          },
        },
        { client: tx },
      )
      return created
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw DUPLICATE_REF()
    throw error
  }
  const [dto] = await toDTOs(viewer, [row])
  return dto
}

/** PATCH — field edits and status transitions (DEV-2 evidence for DONE, DEV-5 drop reason). */
export async function updateDevelopmentItem(
  viewer: PackageViewer,
  id: string,
  input: UpdateDevelopmentItemInput,
  now: Date = new Date(),
): Promise<DevelopmentItemDTO> {
  const before = await loadItem(id)
  await assertCanView(viewer, before.ownerId)
  await assertCanEdit(viewer, before.ownerId)
  const timeframe = await resolveDevelopmentTimeframe(before.timeframeId)
  if (isTimeframeReadOnly(timeframe, viewer, now)) {
    throw new DevelopmentError(423, 'This timeframe has ended; its development plan is read-only', 'TIMEFRAME_CLOSED')
  }
  if (input.keyResultId !== undefined && input.keyResultId !== before.keyResultId) {
    await assertLinkableKeyResult(viewer, input.keyResultId)
  }

  const state = applyDevelopmentStatePatch(
    {
      kind: before.kind,
      status: before.status,
      evidenceNote: before.evidenceNote,
      dropReason: before.dropReason,
      completedAt: before.completedAt,
    },
    {
      kind: input.kind,
      status: input.status,
      evidenceNote: input.evidenceNote,
      evidenceUrl: input.evidenceUrl,
      dropReason: input.dropReason,
      completedAt: input.completedAt,
    },
    now,
  )
  if (!state.ok) throw new DevelopmentError(400, state.message, state.code)
  if (state.next.completedAt && state.next.completedAt.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
    throw new DevelopmentError(400, 'Completion date cannot be in the future', 'INVALID_COMPLETED_AT')
  }

  const data: Prisma.DevelopmentItemUncheckedUpdateInput = {
    kind: state.next.kind,
    status: state.next.status,
    evidenceNote: state.next.evidenceNote,
    dropReason: state.next.dropReason,
    completedAt: state.next.completedAt,
  }
  if (input.title !== undefined) data.title = input.title
  if (input.targetText !== undefined) data.targetText = input.targetText
  if (input.targetHours !== undefined) data.targetHours = input.targetHours
  if (input.hoursLogged !== undefined) data.hoursLogged = input.hoursLogged
  if (input.dueDate !== undefined) data.dueDate = input.dueDate
  if (input.keyResultId !== undefined) data.keyResultId = input.keyResultId
  if (input.isMandatory !== undefined) data.isMandatory = input.isMandatory
  if (input.externalRef !== undefined) data.externalRef = input.externalRef

  const pkg = before.packageId
    ? await prisma.operatingPackage.findUnique({ where: { id: before.packageId }, select: { id: true, status: true } })
    : await packageFor(before.ownerId, before.timeframeId)
  // Link the package when it was created after this item.
  if (!before.packageId && pkg) data.packageId = pkg.id

  let row: ItemRow
  try {
    row = await prisma.$transaction(async (tx) => {
      const updated = await tx.developmentItem.update({ where: { id }, data })
      const changes = diffPackageFields(before, updated, AUDITED_FIELDS)
      if (changes) {
        const action = !state.statusChanged ? 'UPDATED' : state.next.status === 'DONE' ? 'COMPLETED' : 'STATUS_CHANGED'
        await recordPackageActivity(
          {
            entityType: 'DEVELOPMENT_ITEM',
            action,
            entityId: id,
            subjectUserId: updated.ownerId,
            timeframeId: updated.timeframeId,
            packageId: updated.packageId,
            actorId: viewer.userId,
            keyResultId: updated.keyResultId,
            changes,
            editedAfterApproval: pkg?.status === 'APPROVED',
            metadata: {
              title: updated.title,
              ...(state.statusChanged ? { fromStatus: before.status, toStatus: updated.status } : {}),
              // DEV-5: the drop reason is part of the log line, not only the diff.
              ...(state.statusChanged && updated.status === 'DROPPED' ? { dropReason: updated.dropReason } : {}),
            },
          },
          { client: tx },
        )
      }
      return updated
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw DUPLICATE_REF()
    throw error
  }
  const [dto] = await toDTOs(viewer, [row], now)
  return dto
}

/** POST [id]/hours — add training hours (self-reported, open question 6); NOT_STARTED → IN_PROGRESS. */
export async function addDevelopmentHours(
  viewer: PackageViewer,
  id: string,
  input: AddDevelopmentHoursInput,
): Promise<AddDevelopmentHoursResult> {
  const before = await loadItem(id)
  await assertCanView(viewer, before.ownerId)
  await assertCanEdit(viewer, before.ownerId)
  const timeframe = await resolveDevelopmentTimeframe(before.timeframeId)
  if (isTimeframeReadOnly(timeframe, viewer)) {
    throw new DevelopmentError(423, 'This timeframe has ended; its development plan is read-only', 'TIMEFRAME_CLOSED')
  }
  if (before.status === 'DROPPED') {
    throw new DevelopmentError(409, 'This item was dropped. Reopen it before logging hours.', 'ITEM_DROPPED')
  }
  if (before.hoursLogged + input.hours > DEV_MAX_TOTAL_HOURS) {
    throw new DevelopmentError(400, `An item cannot hold more than ${DEV_MAX_TOTAL_HOURS} hours`, 'HOURS_LIMIT')
  }
  const pkg = before.packageId
    ? await prisma.operatingPackage.findUnique({ where: { id: before.packageId }, select: { id: true, status: true } })
    : await packageFor(before.ownerId, before.timeframeId)

  const nextStatus = statusAfterLoggingHours(before.status)
  const row = await prisma.$transaction(async (tx) => {
    // Atomic increment: concurrent entries never overwrite each other.
    const updated = await tx.developmentItem.update({
      where: { id },
      data: {
        hoursLogged: { increment: input.hours },
        ...(nextStatus !== before.status ? { status: nextStatus } : {}),
        ...(!before.packageId && pkg ? { packageId: pkg.id } : {}),
      },
    })
    const changes = diffPackageFields(before, updated, ['hoursLogged', 'status'])
    await recordPackageActivity(
      {
        entityType: 'DEVELOPMENT_ITEM',
        action: 'PROGRESS_UPDATED',
        entityId: id,
        subjectUserId: updated.ownerId,
        timeframeId: updated.timeframeId,
        packageId: updated.packageId,
        actorId: viewer.userId,
        keyResultId: updated.keyResultId,
        changes,
        editedAfterApproval: pkg?.status === 'APPROVED',
        metadata: {
          title: updated.title,
          hoursAdded: input.hours,
          ...(input.note ? { note: input.note } : {}),
          ...(input.date ? { spentOn: input.date.toISOString().slice(0, 10) } : {}),
        },
      },
      { client: tx },
    )
    return updated
  })
  const [item] = await toDTOs(viewer, [row])
  return { item, hoursAdded: input.hours }
}
