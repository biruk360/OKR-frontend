/**
 * Operating package header (PKG-1, PKG-3, PKG-4, PKG-5) — server service.
 * Prisma-touching; import from `app/` (routes, page loaders) by direct path only.
 *
 * Access (spec §8, lib/package/access.ts — the single access point):
 *   - read:      canViewPackageArea(viewer, subject, 'package'); weightsJson only
 *                with view.weights (sensitive field)
 *   - create / lifecycle (submit, archive, reopen):
 *                canManagePackageLifecycle — manager chain, HR, EXECUTIVE / ADMIN;
 *                never the subject
 *   - edit header fields: canEditPackageArea(…, 'package'); weights: edit.weights
 *   - approve:   canApprovePackage (manager chain / EXECUTIVE / ADMIN, never self)
 *                AND feature `button.package.approve`; blocked while any DISPUTE
 *                is unresolved (PKG-1)
 * Past timeframes are read-only except for ADMIN / EXECUTIVE (PRF-3); archiving
 * stays possible so a closed timeframe's package can be filed away.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { emit } from '@/lib/notifications'
import {
  getPackageAreaAccess,
  canViewPackageArea,
  type PackageAreaAccess,
  type PackageViewer,
} from '@/lib/package/access'
import { recordPackageActivity, recordPackageUpdateIfChanged } from '@/lib/package/audit'
import { PACKAGE_FEATURE_KEYS, type PackageStatus } from '@/types/package'
import type {
  ApprovePackageResult,
  OperatingPackageDTO,
  OperatingPackagePermissions,
  OperatingPackageResponse,
  PackagePerson,
  PackageReviewSummary,
} from '../types'
import { PackageError } from './errors'
import { loadPackageItemKeys } from './items.server'
import {
  canApproveFrom,
  canReviewIn,
  canSubmitFrom,
  canTransitionByPatch,
  EMPTY_REVIEW_SUMMARY,
  nextPackageVersion,
  normalizePackageStatus,
  parsePackageWeights,
  parseSummaryLines,
  summarizeReviews,
} from './rules'
import type { CreatePackageInput, UpdatePackageInput } from './schemas'

// ---------------------------------------------------------------------------
// Loading + mapping
// ---------------------------------------------------------------------------

const PACKAGE_INCLUDE = {
  timeframe: { select: { id: true, name: true, endDate: true } },
} satisfies Prisma.OperatingPackageInclude

export type PackageRow = Prisma.OperatingPackageGetPayload<{ include: typeof PACKAGE_INCLUDE }>

const PERSON_SELECT = { id: true, name: true, avatar: true } satisfies Prisma.UserSelect

/** Fields audited on header edits (weightsJson is logged by key only — it is a sensitive field). */
const AUDITED_FIELDS = ['version', 'seatTitle', 'summaryJson', 'sourceFile', 'status'] as const

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

export async function loadPeople(ids: Iterable<string | null | undefined>): Promise<Map<string, PackagePerson>> {
  const unique = [...new Set([...ids].filter((id): id is string => !!id))]
  if (unique.length === 0) return new Map()
  const rows = await prisma.user.findMany({ where: { id: { in: unique } }, select: PERSON_SELECT })
  return new Map(rows.map((row) => [row.id, { id: row.id, name: row.name, avatar: row.avatar ?? null }]))
}

export function toPackageDTO(
  row: PackageRow,
  people: Map<string, PackagePerson>,
  opts: { canViewWeights: boolean },
): OperatingPackageDTO {
  const weights = opts.canViewWeights ? parsePackageWeights(row.weightsJson) : null
  return {
    id: row.id,
    userId: row.userId,
    timeframeId: row.timeframeId,
    timeframeName: row.timeframe?.name ?? null,
    version: row.version,
    status: normalizePackageStatus(row.status),
    seatTitle: row.seatTitle,
    summaryLines: parseSummaryLines(row.summaryJson),
    weights,
    weightsHidden: !opts.canViewWeights && row.weightsJson != null,
    sourceFile: row.sourceFile,
    submittedAt: iso(row.submittedAt),
    approvedById: row.approvedById,
    approvedBy: row.approvedById ? people.get(row.approvedById) ?? null : null,
    approvedAt: iso(row.approvedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function loadPackageRow(id: string): Promise<PackageRow> {
  const row = await prisma.operatingPackage.findUnique({ where: { id }, include: PACKAGE_INCLUDE })
  if (!row) throw new PackageError(404, 'Operating package not found', 'NOT_FOUND')
  return row
}

async function loadTimeframe(timeframeId: string) {
  const timeframe = await prisma.timeframe.findUnique({
    where: { id: timeframeId },
    select: { id: true, name: true, endDate: true },
  })
  if (!timeframe) throw new PackageError(404, 'Timeframe not found', 'TIMEFRAME_NOT_FOUND')
  return timeframe
}

async function assertSubjectExists(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } })
  if (!user) throw new PackageError(404, 'User not found', 'USER_NOT_FOUND')
  return user
}

function startOfTodayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** PRF-3: a timeframe that has ended is read-only (ADMIN / EXECUTIVE excepted). */
export function isTimeframeReadOnly(
  timeframe: { endDate: Date } | null | undefined,
  viewer: Pick<PackageViewer, 'seesAll'>,
  now: Date = new Date(),
): boolean {
  if (!timeframe || viewer.seesAll) return false
  return timeframe.endDate.getTime() < startOfTodayUtc(now).getTime()
}

/** Fail closed: a feature lookup we could not complete is not a grant. ADMIN always passes. */
async function hasPackageApproveFeature(viewer: PackageViewer): Promise<boolean> {
  if (viewer.role === 'ADMIN') return true
  try {
    const { resolveFeaturePermission } = await import('@/lib/permission-resolver')
    return await resolveFeaturePermission(viewer.userId, PACKAGE_FEATURE_KEYS.buttonPackageApprove)
  } catch (error) {
    console.error('[operating-package] feature lookup failed; denying approve', {
      userId: viewer.userId,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

async function actorName(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
  return user?.name ?? null
}

/** Review summary for a package (or the empty summary with the item count when there is none). */
export async function computePackageSummary(
  pkg: { id: string; userId: string; timeframeId: string } | null,
  userId: string,
  timeframeId: string,
): Promise<PackageReviewSummary> {
  const itemKeys = await loadPackageItemKeys(userId, timeframeId)
  if (!pkg) return { ...EMPTY_REVIEW_SUMMARY, total: itemKeys.size }
  const reviews = await prisma.packageItemReview.findMany({
    where: { packageId: pkg.id },
    select: { entityType: true, entityId: true, verdict: true, reviewerId: true, resolvedAt: true },
  })
  return summarizeReviews(itemKeys, reviews, pkg.userId)
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export function resolvePackagePermissions(
  access: PackageAreaAccess,
  pkg: { status: PackageStatus } | null,
  opts: { readOnly: boolean; hasApproveFeature: boolean },
): OperatingPackagePermissions {
  const writable = !opts.readOnly
  const status = pkg?.status ?? null
  const lifecycle = access.canManageLifecycle
  return {
    canCreate: !pkg && lifecycle && writable,
    canEdit: !!pkg && access.edit.package && writable && status !== 'ARCHIVED',
    canViewWeights: access.view.weights,
    canEditWeights: !!pkg && access.edit.weights && writable && status !== 'ARCHIVED',
    canSubmit: !!status && canSubmitFrom(status) && lifecycle && writable,
    canApprove: !!status && canApproveFrom(status) && access.canApprove && opts.hasApproveFeature && writable,
    canArchive: !!status && status !== 'ARCHIVED' && lifecycle,
    canReopen: !!status && status !== 'DRAFT' && lifecycle && writable,
    canReview: !!status && canReviewIn(status) && access.canReviewItems && writable,
    canResolveDisputes: !!pkg && access.canResolveDisputes && writable,
  }
}

async function permissionsFor(
  viewer: PackageViewer,
  userId: string,
  pkg: { status: PackageStatus } | null,
  readOnly: boolean,
): Promise<{ access: PackageAreaAccess; permissions: OperatingPackagePermissions }> {
  const access = await getPackageAreaAccess(viewer, userId)
  const needsFeature = !!pkg && canApproveFrom(pkg.status) && access.canApprove && !readOnly
  const hasApproveFeature = needsFeature ? await hasPackageApproveFeature(viewer) : false
  return { access, permissions: resolvePackagePermissions(access, pkg, { readOnly, hasApproveFeature }) }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** GET ?userId&timeframeId — the header (or null, PKG-5), review summary and permissions. */
export async function getPackageForUser(
  viewer: PackageViewer,
  userId: string,
  timeframeId: string,
  opts: { now?: Date } = {},
): Promise<OperatingPackageResponse> {
  await assertSubjectExists(userId)
  if (!(await canViewPackageArea(viewer, userId, 'package'))) {
    throw new PackageError(403, 'You do not have access to this operating package', 'FORBIDDEN')
  }
  const timeframe = await loadTimeframe(timeframeId)
  const readOnly = isTimeframeReadOnly(timeframe, viewer, opts.now)
  const row = await prisma.operatingPackage.findUnique({
    where: { userId_timeframeId: { userId, timeframeId } },
    include: PACKAGE_INCLUDE,
  })
  const status = row ? normalizePackageStatus(row.status) : null
  const [{ permissions }, summary, people] = await Promise.all([
    permissionsFor(viewer, userId, status ? { status } : null, readOnly),
    computePackageSummary(row, userId, timeframeId),
    loadPeople([row?.approvedById]),
  ])
  return {
    userId,
    timeframeId,
    timeframeName: timeframe.name,
    package: row ? toPackageDTO(row, people, { canViewWeights: permissions.canViewWeights }) : null,
    summary,
    readOnly,
    permissions,
  }
}

/** GET [id] — same payload as the list route, addressed by package id. */
export async function getPackageById(viewer: PackageViewer, id: string, opts: { now?: Date } = {}): Promise<OperatingPackageResponse> {
  const row = await loadPackageRow(id)
  if (!(await canViewPackageArea(viewer, row.userId, 'package'))) {
    // Do not reveal existence to viewers who may not read it.
    throw new PackageError(404, 'Operating package not found', 'NOT_FOUND')
  }
  return getPackageForUser(viewer, row.userId, row.timeframeId, opts)
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function assertWritableTimeframe(timeframe: { endDate: Date } | null, viewer: PackageViewer) {
  if (isTimeframeReadOnly(timeframe, viewer)) {
    throw new PackageError(423, 'This timeframe has ended; its operating package is read-only', 'TIMEFRAME_CLOSED')
  }
}

function forbidden(viewer: PackageViewer, userId: string, what: string): PackageError {
  return new PackageError(
    403,
    viewer.userId === userId
      ? `You cannot ${what} your own operating package. Use Agree / Dispute on each item instead.`
      : `You do not have permission to ${what} this operating package`,
    'FORBIDDEN',
  )
}

/** POST — create the header for (userId, timeframeId) and attach the person's existing items to it. */
export async function createPackage(viewer: PackageViewer, input: CreatePackageInput): Promise<OperatingPackageResponse> {
  await assertSubjectExists(input.userId)
  const access = await getPackageAreaAccess(viewer, input.userId)
  if (!access.canManageLifecycle) throw forbidden(viewer, input.userId, 'create')
  if (input.weights && !access.edit.weights) {
    throw new PackageError(403, 'You do not have permission to set the performance mix', 'FORBIDDEN')
  }
  const timeframe = await loadTimeframe(input.timeframeId)
  assertWritableTimeframe(timeframe, viewer)

  const existing = await prisma.operatingPackage.findUnique({
    where: { userId_timeframeId: { userId: input.userId, timeframeId: input.timeframeId } },
    select: { id: true },
  })
  if (existing) {
    throw new PackageError(409, 'This person already has an operating package for this timeframe', 'PACKAGE_EXISTS')
  }

  const created = await prisma.$transaction(async (tx) => {
    const pkg = await tx.operatingPackage.create({
      data: {
        userId: input.userId,
        timeframeId: input.timeframeId,
        version: input.version ?? 'v1',
        status: 'DRAFT',
        seatTitle: input.seatTitle ?? null,
        summaryJson: input.summaryLines && input.summaryLines.length > 0 ? input.summaryLines : undefined,
        weightsJson: input.weights ?? undefined,
        sourceFile: input.sourceFile ?? null,
      },
      select: { id: true },
    })
    // D1: items belong to the person + timeframe; attach the unattached ones to the new header.
    const scope = { ownerId: input.userId, timeframeId: input.timeframeId, packageId: null }
    await Promise.all([
      tx.recurringDuty.updateMany({ where: scope, data: { packageId: pkg.id } }),
      tx.kpi.updateMany({ where: scope, data: { packageId: pkg.id } }),
      tx.developmentItem.updateMany({ where: scope, data: { packageId: pkg.id } }),
      tx.roleDefinition.updateMany({
        where: { userId: input.userId, timeframeId: input.timeframeId, packageId: null },
        data: { packageId: pkg.id },
      }),
    ])
    await recordPackageActivity(
      {
        entityType: 'OPERATING_PACKAGE',
        action: 'CREATED',
        entityId: pkg.id,
        packageId: pkg.id,
        subjectUserId: input.userId,
        timeframeId: input.timeframeId,
        actorId: viewer.userId,
        metadata: {
          version: input.version ?? 'v1',
          weightsSet: !!input.weights,
          ...(input.sourceFile ? { sourceFile: input.sourceFile } : {}),
        },
      },
      { client: tx },
    )
    return pkg
  })

  return getPackageById(viewer, created.id)
}

/** PATCH [id] — header fields, weights, and manual lifecycle moves (archive / reopen). */
export async function updatePackage(
  viewer: PackageViewer,
  id: string,
  input: UpdatePackageInput,
): Promise<OperatingPackageResponse> {
  const row = await loadPackageRow(id)
  if (!(await canViewPackageArea(viewer, row.userId, 'package'))) {
    throw new PackageError(404, 'Operating package not found', 'NOT_FOUND')
  }
  const access = await getPackageAreaAccess(viewer, row.userId)
  const status = normalizePackageStatus(row.status)
  const statusChange = input.status !== undefined && input.status !== status ? input.status : undefined
  const fieldEdit =
    input.version !== undefined ||
    input.seatTitle !== undefined ||
    input.summaryLines !== undefined ||
    input.sourceFile !== undefined
  const weightsEdit = input.weights !== undefined

  if (statusChange && !access.canManageLifecycle) throw forbidden(viewer, row.userId, 'change the status of')
  if (fieldEdit && !access.edit.package) throw forbidden(viewer, row.userId, 'edit')
  if (weightsEdit && !access.edit.weights) {
    throw new PackageError(403, 'You do not have permission to change the performance mix', 'FORBIDDEN')
  }
  // Archiving a closed timeframe's package is allowed; everything else needs an open timeframe.
  if (statusChange !== 'ARCHIVED' || fieldEdit || weightsEdit) assertWritableTimeframe(row.timeframe, viewer)
  if (status === 'ARCHIVED' && (fieldEdit || weightsEdit) && statusChange !== 'DRAFT') {
    throw new PackageError(409, 'Reopen the archived package before editing it', 'PACKAGE_ARCHIVED')
  }
  if (statusChange && !canTransitionByPatch(status, statusChange)) {
    throw new PackageError(409, `Cannot move a package from ${status} to ${statusChange}`, 'INVALID_TRANSITION')
  }

  const data: Prisma.OperatingPackageUncheckedUpdateInput = {}
  if (input.version !== undefined) data.version = input.version
  if (input.seatTitle !== undefined) data.seatTitle = input.seatTitle
  if (input.sourceFile !== undefined) data.sourceFile = input.sourceFile
  if (input.summaryLines !== undefined) {
    data.summaryJson = input.summaryLines.length > 0 ? input.summaryLines : Prisma.DbNull
  }
  if (input.weights !== undefined) {
    data.weightsJson = input.weights === null ? Prisma.DbNull : input.weights
  }
  if (statusChange) {
    data.status = statusChange
    if (statusChange === 'DRAFT' && status === 'APPROVED') {
      // A new round: the next version goes back through review and approval.
      data.approvedAt = null
      data.approvedById = null
      if (input.version === undefined) data.version = nextPackageVersion(row.version)
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const after = await tx.operatingPackage.update({ where: { id }, data, include: PACKAGE_INCLUDE })
    const editedAfterApproval = status === 'APPROVED' && !statusChange
    await recordPackageUpdateIfChanged(
      {
        entityType: 'OPERATING_PACKAGE',
        entityId: id,
        packageId: id,
        subjectUserId: row.userId,
        timeframeId: row.timeframeId,
        actorId: viewer.userId,
        editedAfterApproval,
        before: row as unknown as Record<string, unknown>,
        after: after as unknown as Record<string, unknown>,
        fields: AUDITED_FIELDS,
      },
      { client: tx },
    )
    if (weightsEdit && JSON.stringify(row.weightsJson ?? null) !== JSON.stringify(after.weightsJson ?? null)) {
      // Sensitive field: record that the mix changed, not the values.
      await recordPackageActivity(
        {
          entityType: 'OPERATING_PACKAGE',
          action: 'UPDATED',
          entityId: id,
          packageId: id,
          subjectUserId: row.userId,
          timeframeId: row.timeframeId,
          actorId: viewer.userId,
          editedAfterApproval,
          metadata: { field: 'weightsJson', sensitive: true },
        },
        { client: tx },
      )
    }
    return after
  })

  return getPackageById(viewer, updated.id)
}

/** POST [id]/submit — DRAFT → IN_REVIEW; the employee is asked to review (PACKAGE_SENT_FOR_REVIEW). */
export async function submitPackage(viewer: PackageViewer, id: string): Promise<OperatingPackageResponse> {
  const row = await loadPackageRow(id)
  if (!(await canViewPackageArea(viewer, row.userId, 'package'))) {
    throw new PackageError(404, 'Operating package not found', 'NOT_FOUND')
  }
  const access = await getPackageAreaAccess(viewer, row.userId)
  if (!access.canManageLifecycle) throw forbidden(viewer, row.userId, 'send for review')
  assertWritableTimeframe(row.timeframe, viewer)
  const status = normalizePackageStatus(row.status)
  if (!canSubmitFrom(status)) {
    throw new PackageError(409, 'Only a draft package can be sent for review', 'INVALID_TRANSITION')
  }

  const now = new Date()
  // Conditional update: two concurrent submits cannot both succeed.
  await prisma.$transaction(async (tx) => {
    const moved = await tx.operatingPackage.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'IN_REVIEW', submittedAt: now },
    })
    if (moved.count === 0) throw new PackageError(409, 'The package was changed by someone else. Refresh and try again.', 'CONFLICT')
    await recordPackageActivity(
      {
        entityType: 'OPERATING_PACKAGE',
        action: 'SUBMITTED',
        entityId: id,
        packageId: id,
        subjectUserId: row.userId,
        timeframeId: row.timeframeId,
        actorId: viewer.userId,
        changes: { status: { from: status, to: 'IN_REVIEW' } },
        metadata: { version: row.version },
      },
      { client: tx },
    )
  })

  const [summary, name] = await Promise.all([
    computePackageSummary(row, row.userId, row.timeframeId),
    actorName(viewer.userId),
  ])
  await emit('PACKAGE_SENT_FOR_REVIEW', {
    actorId: viewer.userId,
    entityType: 'OPERATING_PACKAGE',
    entityId: id,
    entityTitle: row.timeframe?.name ? `${row.timeframe.name} operating package` : 'Operating package',
    data: {
      ownerId: row.userId,
      timeframeName: row.timeframe?.name ?? null,
      version: row.version,
      actorName: name,
      totalCount: summary.total,
    },
  })

  return getPackageById(viewer, id)
}

/** POST [id]/approve — DRAFT / IN_REVIEW → APPROVED once no DISPUTE is unresolved (PKG-1). */
export async function approvePackage(viewer: PackageViewer, id: string): Promise<ApprovePackageResult> {
  const row = await loadPackageRow(id)
  if (!(await canViewPackageArea(viewer, row.userId, 'package'))) {
    throw new PackageError(404, 'Operating package not found', 'NOT_FOUND')
  }
  const access = await getPackageAreaAccess(viewer, row.userId)
  if (!access.canApprove) {
    throw new PackageError(
      403,
      viewer.userId === row.userId
        ? 'You cannot approve your own operating package'
        : 'Only the manager chain, an Executive or an Admin can approve this package',
      'FORBIDDEN',
    )
  }
  if (!(await hasPackageApproveFeature(viewer))) {
    throw new PackageError(403, 'Approving packages is not enabled for your account', 'FEATURE_DISABLED')
  }
  assertWritableTimeframe(row.timeframe, viewer)
  const status = normalizePackageStatus(row.status)
  if (!canApproveFrom(status)) {
    throw new PackageError(409, status === 'APPROVED' ? 'This package is already approved' : 'An archived package cannot be approved', 'INVALID_TRANSITION')
  }

  const now = new Date()
  await prisma.$transaction(async (tx) => {
    const openDisputes = await tx.packageItemReview.count({
      where: { packageId: id, verdict: 'DISPUTE', resolvedAt: null },
    })
    if (openDisputes > 0) {
      throw new PackageError(
        409,
        `Resolve the ${openDisputes} open dispute${openDisputes === 1 ? '' : 's'} before approving the package`,
        'DISPUTES_OPEN',
      )
    }
    const moved = await tx.operatingPackage.updateMany({
      where: { id, status: { in: ['DRAFT', 'IN_REVIEW'] } },
      data: { status: 'APPROVED', approvedById: viewer.userId, approvedAt: now },
    })
    if (moved.count === 0) throw new PackageError(409, 'The package was changed by someone else. Refresh and try again.', 'CONFLICT')
    await recordPackageActivity(
      {
        entityType: 'OPERATING_PACKAGE',
        action: 'APPROVED',
        entityId: id,
        packageId: id,
        subjectUserId: row.userId,
        timeframeId: row.timeframeId,
        actorId: viewer.userId,
        changes: { status: { from: status, to: 'APPROVED' } },
        metadata: { version: row.version },
      },
      { client: tx },
    )
  })

  await emit('PACKAGE_APPROVED', {
    actorId: viewer.userId,
    entityType: 'OPERATING_PACKAGE',
    entityId: id,
    entityTitle: row.timeframe?.name ? `${row.timeframe.name} operating package` : 'Operating package',
    data: {
      ownerId: row.userId,
      timeframeName: row.timeframe?.name ?? null,
      version: row.version,
      actorName: await actorName(viewer.userId),
    },
  })

  const response = await getPackageById(viewer, id)
  if (!response.package) throw new PackageError(404, 'Operating package not found', 'NOT_FOUND')
  return { package: response.package, summary: response.summary }
}
