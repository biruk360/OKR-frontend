/**
 * Role definition (ROL-1…4) — server service. Prisma-touching; import from
 * `app/` (routes, page loaders) by direct path only.
 *
 * Access (spec §8, lib/package/access.ts):
 *   - read:    canViewPackageArea(viewer, subject, 'role')
 *   - write:   canEditPackageArea(viewer, subject, 'role') — manager chain, HR,
 *              EXECUTIVE / ADMIN; never the subject (self only reviews items
 *              through the package review, PKG-2)
 *   - approve: canApproveRoleDefinition (manager chain / EXECUTIVE / ADMIN,
 *              never self) AND feature `button.package.role.approve`
 * Past timeframes are read-only except for ADMIN / EXECUTIVE (PRF-3).
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'
import {
  canApproveRoleDefinition,
  canEditPackageArea,
  canViewPackageArea,
  getPackageAreaAccess,
  type PackageViewer,
} from '@/lib/package/access'
import { diffPackageFields, recordPackageActivity } from '@/lib/package/audit'
import { PACKAGE_FEATURE_KEYS, isRoleDefinitionStatus, isRoleItemSection } from '@/types/package'
import type {
  ApproveRoleDefinitionResult,
  RoleDefinitionDTO,
  RoleDefinitionListResponse,
  RoleDefinitionPerson,
  RoleDefinitionPermissions,
} from '../types'
import type { ApproveRoleDefinitionInput, CreateRoleDefinitionInput, UpdateRoleDefinitionInput } from './schemas'
import {
  checkReportingLine,
  pickCurrentDefinition,
  resolveDirectReportSeats,
  sortVersionsNewestFirst,
  withPositions,
  type DirectReportCandidate,
} from './rules'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type RoleDefinitionErrorStatus = 400 | 403 | 404 | 409 | 423

export class RoleDefinitionError extends Error {
  constructor(
    public readonly status: RoleDefinitionErrorStatus,
    message: string,
    public readonly code: string = 'ROLE_DEFINITION_ERROR',
  ) {
    super(message)
    this.name = 'RoleDefinitionError'
  }
}

export function isRoleDefinitionError(error: unknown): error is RoleDefinitionError {
  return error instanceof RoleDefinitionError
}

// ---------------------------------------------------------------------------
// Loading + mapping
// ---------------------------------------------------------------------------

const DEFINITION_INCLUDE = {
  items: { orderBy: { position: 'asc' } },
  timeframe: { select: { id: true, name: true } },
} satisfies Prisma.RoleDefinitionInclude

type DefinitionRow = Prisma.RoleDefinitionGetPayload<{ include: typeof DEFINITION_INCLUDE }>

const PERSON_SELECT = { id: true, name: true, avatar: true, designation: true } satisfies Prisma.UserSelect

type PersonRow = Prisma.UserGetPayload<{ select: typeof PERSON_SELECT }>

function toPerson(row: PersonRow): RoleDefinitionPerson {
  return { id: row.id, name: row.name, avatar: row.avatar ?? null, designation: row.designation ?? null }
}

async function loadPeople(ids: Iterable<string | null | undefined>): Promise<Map<string, RoleDefinitionPerson>> {
  const unique = [...new Set([...ids].filter((id): id is string => !!id))]
  if (unique.length === 0) return new Map()
  const rows = await prisma.user.findMany({ where: { id: { in: unique } }, select: PERSON_SELECT })
  return new Map(rows.map((row) => [row.id, toPerson(row)]))
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

export function toRoleDefinitionDTO(row: DefinitionRow, people: Map<string, RoleDefinitionPerson>): RoleDefinitionDTO {
  return {
    id: row.id,
    userId: row.userId,
    timeframeId: row.timeframeId,
    timeframeName: row.timeframe?.name ?? null,
    packageId: row.packageId,
    seatTitle: row.seatTitle,
    reportsToId: row.reportsToId,
    reportsTo: row.reportsToId ? people.get(row.reportsToId) ?? null : null,
    reportsToText: row.reportsToText,
    purpose: row.purpose,
    effectiveFrom: iso(row.effectiveFrom),
    status: isRoleDefinitionStatus(row.status) ? row.status : 'DRAFT',
    approvedById: row.approvedById,
    approvedBy: row.approvedById ? people.get(row.approvedById) ?? null : null,
    approvedAt: iso(row.approvedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id,
      section: isRoleItemSection(item.section) ? item.section : 'OTHER',
      label: item.label,
      text: item.text,
      position: item.position,
    })),
  }
}

async function toDTOs(rows: DefinitionRow[]): Promise<RoleDefinitionDTO[]> {
  const people = await loadPeople(rows.flatMap((row) => [row.reportsToId, row.approvedById]))
  return rows.map((row) => toRoleDefinitionDTO(row, people))
}

async function loadDefinition(id: string): Promise<DefinitionRow> {
  const row = await prisma.roleDefinition.findUnique({ where: { id }, include: DEFINITION_INCLUDE })
  if (!row) throw new RoleDefinitionError(404, 'Role definition not found', 'NOT_FOUND')
  return row
}

function startOfTodayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** PRF-3: a timeframe that has ended is read-only (ADMIN / EXECUTIVE excepted). */
function isTimeframeReadOnly(
  timeframe: { endDate: Date } | null,
  viewer: PackageViewer,
  now: Date = new Date(),
): boolean {
  if (!timeframe || viewer.seesAll) return false
  return timeframe.endDate.getTime() < startOfTodayUtc(now).getTime()
}

async function loadTimeframe(timeframeId: string | null | undefined) {
  if (!timeframeId) return null
  const timeframe = await prisma.timeframe.findUnique({
    where: { id: timeframeId },
    select: { id: true, name: true, endDate: true },
  })
  if (!timeframe) throw new RoleDefinitionError(404, 'Timeframe not found', 'TIMEFRAME_NOT_FOUND')
  return timeframe
}

async function assertSubjectExists(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, designation: true } })
  if (!user) throw new RoleDefinitionError(404, 'User not found', 'USER_NOT_FOUND')
  return user
}

async function assertReportsTo(reportsToId: string | null | undefined, subjectId: string) {
  if (!reportsToId) return
  if (reportsToId === subjectId) throw new RoleDefinitionError(400, 'A person cannot report to themselves', 'INVALID_REPORTS_TO')
  const exists = await prisma.user.findUnique({ where: { id: reportsToId }, select: { id: true } })
  if (!exists) throw new RoleDefinitionError(400, 'The selected manager does not exist', 'INVALID_REPORTS_TO')
}

/** Fail closed: a feature lookup we could not complete is not a grant. ADMIN always passes. */
async function hasRoleApproveFeature(viewer: PackageViewer): Promise<boolean> {
  if (viewer.role === 'ADMIN') return true
  try {
    const { resolveFeaturePermission } = await import('@/lib/permission-resolver')
    return await resolveFeaturePermission(viewer.userId, PACKAGE_FEATURE_KEYS.buttonRoleApprove)
  } catch (error) {
    console.error('[role-definition] feature lookup failed; denying approve', {
      userId: viewer.userId,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

async function packageFor(userId: string, timeframeId: string | null) {
  if (!timeframeId) return null
  return prisma.operatingPackage.findUnique({
    where: { userId_timeframeId: { userId, timeframeId } },
    select: { id: true, status: true },
  })
}

/** PKG-3: edits to an approved role definition, or inside an approved package, are flagged. */
function editedAfterApproval(definitionStatus: string, pkg: { status: string } | null): boolean {
  return definitionStatus === 'APPROVED' || pkg?.status === 'APPROVED'
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export async function getRoleDefinitionPermissions(
  viewer: PackageViewer,
  userId: string,
  opts: { readOnly?: boolean } = {},
): Promise<RoleDefinitionPermissions> {
  const access = await getPackageAreaAccess(viewer, userId)
  const writable = access.edit.role && !opts.readOnly
  const canApprove = access.canApprove && !opts.readOnly ? await hasRoleApproveFeature(viewer) : false
  return { canCreate: writable, canEdit: writable, canApprove, canDelete: writable }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Active org-chart managers of `userId` (ManagerRelationship, endedAt = null). */
async function loadOrgChartManagers(userId: string): Promise<RoleDefinitionPerson[]> {
  const rows = await prisma.managerRelationship.findMany({
    where: { directReportId: userId, endedAt: null },
    select: { manager: { select: PERSON_SELECT } },
    orderBy: { startedAt: 'asc' },
  })
  return rows.map((row) => toPerson(row.manager))
}

/** Active direct reports, each with the seat title of their own current role definition. */
async function loadDirectReportCandidates(userId: string, timeframeId: string | null): Promise<DirectReportCandidate[]> {
  const rows = await prisma.managerRelationship.findMany({
    where: { managerId: userId, endedAt: null, directReport: { isActive: true } },
    select: { directReport: { select: PERSON_SELECT } },
    orderBy: { startedAt: 'asc' },
  })
  const reports = rows.map((row) => toPerson(row.directReport))
  if (reports.length === 0) return []
  const definitions = await prisma.roleDefinition.findMany({
    where: {
      userId: { in: reports.map((r) => r.id) },
      status: 'APPROVED',
      ...(timeframeId ? { OR: [{ timeframeId }, { timeframeId: null }] } : { timeframeId: null }),
    },
    select: { userId: true, seatTitle: true, timeframeId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  const seatByUser = new Map<string, string>()
  // Timeframe-specific first, then evergreen.
  for (const def of definitions.filter((d) => d.timeframeId !== null)) {
    if (!seatByUser.has(def.userId)) seatByUser.set(def.userId, def.seatTitle)
  }
  for (const def of definitions.filter((d) => d.timeframeId === null)) {
    if (!seatByUser.has(def.userId)) seatByUser.set(def.userId, def.seatTitle)
  }
  return reports.map((report) => ({ ...report, seatTitle: seatByUser.get(report.id) ?? null }))
}

/**
 * GET ?userId&timeframeId — the current version for the timeframe, a pending
 * draft, every version (history), the ROL-3 reporting-line check, the ROL-4
 * seats and the viewer's permissions.
 */
export async function listRoleDefinitions(
  viewer: PackageViewer,
  userId: string,
  timeframeId: string | null,
  opts: { now?: Date } = {},
): Promise<RoleDefinitionListResponse> {
  const subject = await assertSubjectExists(userId)
  if (!(await canViewPackageArea(viewer, userId, 'role'))) {
    throw new RoleDefinitionError(403, 'You do not have access to this role definition', 'FORBIDDEN')
  }
  const timeframe = await loadTimeframe(timeframeId)
  const readOnly = isTimeframeReadOnly(timeframe, viewer, opts.now)

  const [rows, orgChartManagers, permissions] = await Promise.all([
    prisma.roleDefinition.findMany({ where: { userId }, include: DEFINITION_INCLUDE, orderBy: { createdAt: 'desc' } }),
    loadOrgChartManagers(userId),
    getRoleDefinitionPermissions(viewer, userId, { readOnly }),
  ])
  const history = sortVersionsNewestFirst(await toDTOs(rows))
  const { current, pendingDraft } = pickCurrentDefinition(history, timeframe?.id ?? null)

  const reports = current ? await loadDirectReportCandidates(userId, timeframe?.id ?? null) : []
  return {
    userId,
    timeframeId: timeframe?.id ?? null,
    subjectDesignation: subject.designation ?? null,
    current,
    pendingDraft,
    history,
    reportingLine: checkReportingLine(current?.reportsToId, orgChartManagers),
    seats: current ? resolveDirectReportSeats(current.items, reports) : [],
    readOnly,
    permissions,
  }
}

/** GET [id] — one version. */
export async function getRoleDefinition(viewer: PackageViewer, id: string): Promise<RoleDefinitionDTO> {
  const row = await loadDefinition(id)
  if (!(await canViewPackageArea(viewer, row.userId, 'role'))) {
    // Do not reveal existence to viewers who may not read it.
    throw new RoleDefinitionError(404, 'Role definition not found', 'NOT_FOUND')
  }
  const [dto] = await toDTOs([row])
  return dto
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function assertCanEdit(viewer: PackageViewer, userId: string) {
  if (!(await canEditPackageArea(viewer, userId, 'role'))) {
    throw new RoleDefinitionError(
      403,
      viewer.userId === userId
        ? 'You cannot edit your own role definition. Use Agree / Dispute in the package review instead.'
        : 'You do not have permission to edit this role definition',
      'FORBIDDEN',
    )
  }
}

function itemsCreateData(items: CreateRoleDefinitionInput['items']) {
  return withPositions(items).map((item) => ({
    section: item.section,
    label: item.label ?? null,
    text: item.text,
    position: item.position,
  }))
}

/**
 * "Items replace" with stable ids: items whose `id` belongs to this definition
 * are updated in place (keeping PKG-2 reviews attached), the rest are created,
 * and existing items missing from the list are deleted. Positions follow list order.
 */
async function replaceItems(
  tx: Prisma.TransactionClient,
  roleDefinitionId: string,
  existingIds: readonly string[],
  items: NonNullable<UpdateRoleDefinitionInput['items']>,
) {
  const existing = new Set(existingIds)
  const kept = new Set<string>()
  const positioned = withPositions(items)
  for (const item of positioned) {
    if (item.id && existing.has(item.id) && !kept.has(item.id)) kept.add(item.id)
  }
  const toDelete = existingIds.filter((itemId) => !kept.has(itemId))
  if (toDelete.length > 0) await tx.roleDefinitionItem.deleteMany({ where: { id: { in: toDelete }, roleDefinitionId } })
  const toCreate: Prisma.RoleDefinitionItemCreateManyInput[] = []
  const updated = new Set<string>()
  for (const item of positioned) {
    const data = { section: item.section, label: item.label ?? null, text: item.text, position: item.position }
    if (item.id && kept.has(item.id) && !updated.has(item.id)) {
      updated.add(item.id)
      await tx.roleDefinitionItem.update({ where: { id: item.id }, data })
    } else {
      toCreate.push({ ...data, roleDefinitionId })
    }
  }
  if (toCreate.length > 0) await tx.roleDefinitionItem.createMany({ data: toCreate })
}

const AUDITED_FIELDS = ['seatTitle', 'reportsToId', 'reportsToText', 'purpose', 'effectiveFrom'] as const

function itemsSignature(items: Array<{ section: string; label: string | null; text: string }>): string[] {
  return items.map((item) => `${item.section}|${item.label ?? ''}|${item.text}`)
}

/** POST — a new DRAFT (first version, or a new version of an approved one). */
export async function createRoleDefinition(viewer: PackageViewer, input: CreateRoleDefinitionInput): Promise<RoleDefinitionDTO> {
  await assertSubjectExists(input.userId)
  await assertCanEdit(viewer, input.userId)
  const timeframe = await loadTimeframe(input.timeframeId)
  if (isTimeframeReadOnly(timeframe, viewer)) {
    throw new RoleDefinitionError(423, 'This timeframe has ended; its role definitions are read-only', 'TIMEFRAME_CLOSED')
  }
  await assertReportsTo(input.reportsToId, input.userId)

  const timeframeId = timeframe?.id ?? null
  const existingDraft = await prisma.roleDefinition.findFirst({
    where: { userId: input.userId, timeframeId, status: 'DRAFT' },
    select: { id: true },
  })
  if (existingDraft) {
    throw new RoleDefinitionError(409, 'A draft role definition already exists for this timeframe. Edit that draft instead.', 'DRAFT_EXISTS')
  }
  const pkg = await packageFor(input.userId, timeframeId)

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.roleDefinition.create({
      data: {
        userId: input.userId,
        timeframeId,
        packageId: pkg?.id ?? null,
        seatTitle: input.seatTitle,
        reportsToId: input.reportsToId ?? null,
        reportsToText: input.reportsToText ?? null,
        purpose: input.purpose,
        effectiveFrom: input.effectiveFrom ?? null,
        status: 'DRAFT',
        items: { create: itemsCreateData(input.items) },
      },
      include: DEFINITION_INCLUDE,
    })
    await recordPackageActivity(
      {
        entityType: 'ROLE_DEFINITION',
        action: 'CREATED',
        entityId: created.id,
        subjectUserId: created.userId,
        timeframeId,
        packageId: pkg?.id ?? null,
        actorId: viewer.userId,
        editedAfterApproval: pkg?.status === 'APPROVED',
        metadata: { seatTitle: created.seatTitle, itemCount: created.items.length },
      },
      { client: tx },
    )
    return created
  })
  const [dto] = await toDTOs([row])
  return dto
}

/** PATCH — scalar fields and/or a full item replacement. SUPERSEDED versions are read-only. */
export async function updateRoleDefinition(
  viewer: PackageViewer,
  id: string,
  input: UpdateRoleDefinitionInput,
): Promise<RoleDefinitionDTO> {
  const before = await loadDefinition(id)
  if (!(await canViewPackageArea(viewer, before.userId, 'role'))) {
    throw new RoleDefinitionError(404, 'Role definition not found', 'NOT_FOUND')
  }
  await assertCanEdit(viewer, before.userId)
  if (before.status === 'SUPERSEDED') {
    throw new RoleDefinitionError(409, 'Superseded versions are read-only. Start a new version instead.', 'SUPERSEDED')
  }
  const timeframe = await loadTimeframe(before.timeframeId)
  if (isTimeframeReadOnly(timeframe, viewer)) {
    throw new RoleDefinitionError(423, 'This timeframe has ended; its role definitions are read-only', 'TIMEFRAME_CLOSED')
  }
  if (input.reportsToId !== undefined) await assertReportsTo(input.reportsToId, before.userId)

  const data: Prisma.RoleDefinitionUpdateInput = {}
  if (input.seatTitle !== undefined) data.seatTitle = input.seatTitle
  if (input.reportsToId !== undefined) data.reportsToId = input.reportsToId
  if (input.reportsToText !== undefined) data.reportsToText = input.reportsToText
  if (input.purpose !== undefined) data.purpose = input.purpose
  if (input.effectiveFrom !== undefined) data.effectiveFrom = input.effectiveFrom

  const pkg = before.packageId
    ? await prisma.operatingPackage.findUnique({ where: { id: before.packageId }, select: { id: true, status: true } })
    : await packageFor(before.userId, before.timeframeId)

  const row = await prisma.$transaction(async (tx) => {
    if (input.items) {
      await replaceItems(tx, id, before.items.map((item) => item.id), input.items)
    }
    // Link the package when it was created after this definition.
    if (!before.packageId && pkg) data.package = { connect: { id: pkg.id } }
    const updated = await tx.roleDefinition.update({ where: { id }, data, include: DEFINITION_INCLUDE })

    const changes: ChangeMap = diffPackageFields(before, updated, AUDITED_FIELDS) ?? {}
    if (input.items) {
      const from = itemsSignature(before.items)
      const to = itemsSignature(updated.items)
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        changes.items = { from: `${before.items.length} items`, to: `${updated.items.length} items` }
      }
    }
    if (Object.keys(changes).length > 0) {
      await recordPackageActivity(
        {
          entityType: 'ROLE_DEFINITION',
          action: 'UPDATED',
          entityId: id,
          subjectUserId: updated.userId,
          timeframeId: updated.timeframeId,
          packageId: updated.packageId,
          actorId: viewer.userId,
          changes,
          editedAfterApproval: editedAfterApproval(before.status, pkg),
        },
        { client: tx },
      )
    }
    return updated
  })
  const [dto] = await toDTOs([row])
  return dto
}

/**
 * POST [id]/approve — ROL-1: the version becomes APPROVED and every other
 * APPROVED version for the same person + timeframe becomes SUPERSEDED (they
 * stay readable). ROL-2: `updateDesignation` copies the seat title onto
 * User.designation; it is never done implicitly.
 */
export async function approveRoleDefinition(
  viewer: PackageViewer,
  id: string,
  input: ApproveRoleDefinitionInput,
): Promise<ApproveRoleDefinitionResult> {
  const target = await loadDefinition(id)
  if (!(await canViewPackageArea(viewer, target.userId, 'role'))) {
    throw new RoleDefinitionError(404, 'Role definition not found', 'NOT_FOUND')
  }
  if (!(await canApproveRoleDefinition(viewer, target.userId)) || !(await hasRoleApproveFeature(viewer))) {
    throw new RoleDefinitionError(
      403,
      viewer.userId === target.userId
        ? 'You cannot approve your own role definition'
        : 'Only the manager chain, Executives or Admins can approve a role definition',
      'FORBIDDEN',
    )
  }
  if (target.status !== 'DRAFT') {
    throw new RoleDefinitionError(
      409,
      target.status === 'APPROVED' ? 'This role definition is already approved' : 'Superseded versions cannot be approved',
      'NOT_DRAFT',
    )
  }
  const timeframe = await loadTimeframe(target.timeframeId)
  if (isTimeframeReadOnly(timeframe, viewer)) {
    throw new RoleDefinitionError(423, 'This timeframe has ended; its role definitions are read-only', 'TIMEFRAME_CLOSED')
  }

  const now = new Date()
  const result = await prisma.$transaction(async (tx) => {
    // Guarded transition: a concurrent approve / edit loses with a 409.
    const moved = await tx.roleDefinition.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'APPROVED', approvedById: viewer.userId, approvedAt: now },
    })
    if (moved.count !== 1) {
      throw new RoleDefinitionError(409, 'This role definition changed while you were approving it. Reload and try again.', 'CONFLICT')
    }
    const previous = await tx.roleDefinition.findMany({
      where: { userId: target.userId, timeframeId: target.timeframeId, status: 'APPROVED', id: { not: id } },
      select: { id: true },
    })
    const supersededIds = previous.map((p) => p.id)
    if (supersededIds.length > 0) {
      await tx.roleDefinition.updateMany({ where: { id: { in: supersededIds } }, data: { status: 'SUPERSEDED' } })
    }

    let designationUpdated = false
    if (input.updateDesignation) {
      const subject = await tx.user.findUnique({ where: { id: target.userId }, select: { designation: true } })
      const from = subject?.designation ?? null
      if (from !== target.seatTitle) {
        await tx.user.update({ where: { id: target.userId }, data: { designation: target.seatTitle } })
        designationUpdated = true
        await recordActivity(
          {
            entityType: 'USER',
            action: 'UPDATED',
            actorId: viewer.userId,
            changes: { designation: { from, to: target.seatTitle } },
            metadata: { userId: target.userId, source: 'role_definition', roleDefinitionId: id },
          },
          { client: tx },
        )
      }
    }

    const base = {
      subjectUserId: target.userId,
      timeframeId: target.timeframeId,
      packageId: target.packageId,
      actorId: viewer.userId,
    }
    await recordPackageActivity(
      {
        ...base,
        entityType: 'ROLE_DEFINITION',
        action: 'APPROVED',
        entityId: id,
        changes: { status: { from: 'DRAFT', to: 'APPROVED' } },
        metadata: { seatTitle: target.seatTitle, supersededIds, designationUpdated },
      },
      { client: tx },
    )
    for (const supersededId of supersededIds) {
      await recordPackageActivity(
        {
          ...base,
          entityType: 'ROLE_DEFINITION',
          action: 'STATUS_CHANGED',
          entityId: supersededId,
          changes: { status: { from: 'APPROVED', to: 'SUPERSEDED' } },
          metadata: { supersededBy: id },
        },
        { client: tx },
      )
    }

    const approved = await tx.roleDefinition.findUniqueOrThrow({ where: { id }, include: DEFINITION_INCLUDE })
    return { approved, supersededIds, designationUpdated }
  })

  const [definition] = await toDTOs([result.approved])
  return { definition, supersededIds: result.supersededIds, designationUpdated: result.designationUpdated }
}

/** DELETE [id] — only a DRAFT can be deleted; approved history is kept. */
export async function deleteRoleDefinition(viewer: PackageViewer, id: string): Promise<{ id: string }> {
  const row = await loadDefinition(id)
  if (!(await canViewPackageArea(viewer, row.userId, 'role'))) {
    throw new RoleDefinitionError(404, 'Role definition not found', 'NOT_FOUND')
  }
  await assertCanEdit(viewer, row.userId)
  if (row.status !== 'DRAFT') {
    throw new RoleDefinitionError(409, 'Only a draft can be deleted. Approved and superseded versions are kept as history.', 'NOT_DRAFT')
  }
  const timeframe = await loadTimeframe(row.timeframeId)
  if (isTimeframeReadOnly(timeframe, viewer)) {
    throw new RoleDefinitionError(423, 'This timeframe has ended; its role definitions are read-only', 'TIMEFRAME_CLOSED')
  }
  await prisma.$transaction(async (tx) => {
    await tx.roleDefinition.delete({ where: { id } })
    await recordPackageActivity(
      {
        entityType: 'ROLE_DEFINITION',
        action: 'DELETED',
        entityId: id,
        subjectUserId: row.userId,
        timeframeId: row.timeframeId,
        packageId: row.packageId,
        actorId: viewer.userId,
        metadata: { seatTitle: row.seatTitle, itemCount: row.items.length },
      },
      { client: tx },
    )
  })
  return { id }
}
