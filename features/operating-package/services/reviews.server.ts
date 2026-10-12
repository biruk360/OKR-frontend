/**
 * Operating package item review (PKG-2) — server service.
 *
 *   - GET  [id]/reviews                         every review on the package, with item titles
 *                                               (redacted per OKR visibility / KPI-7) and the
 *                                               "n of m reviewed · k disputes open" summary
 *   - PUT  [id]/reviews                         the employee's Agree / Dispute on one item
 *                                               (self only, package IN_REVIEW; Dispute needs a
 *                                               comment; emits PACKAGE_ITEM_DISPUTED, digest)
 *   - POST [id]/reviews/[reviewId]/resolve      manager chain / HR / Exec / Admin resolve a dispute
 *
 * Access goes through lib/package/access.ts; view = §8 `package` area.
 */
import { prisma } from '@/lib/prisma'
import { emit } from '@/lib/notifications'
import { canViewPackageArea, getPackageAreaAccess, type PackageViewer } from '@/lib/package/access'
import { recordPackageActivity } from '@/lib/package/audit'
import {
  canViewKeyResultInMemory,
  canViewObjectiveInMemory,
  makeViewerContext,
  type ViewerContext,
} from '@/lib/okr/visibility-scope'
import { isPackageReviewEntityType, isReviewVerdict, type PackageReviewEntityType } from '@/types/package'
import type {
  PackageItemReviewDTO,
  PackagePerson,
  PackageReviewsResponse,
  UpsertPackageReviewResult,
} from '../types'
import { PackageError } from './errors'
import { loadPackageItems, type PackageItemRow } from './items.server'
import { isTimeframeReadOnly, loadPackageRow, loadPeople, type PackageRow } from './packages.server'
import {
  canReviewIn,
  normalizePackageStatus,
  PACKAGE_REVIEW_ENTITY_LABELS,
  packageItemKey,
  reviewUpsertEffect,
  summarizeReviews,
} from './rules'
import type { ResolveReviewInput, UpsertReviewInput } from './schemas'

type ReviewRow = Awaited<ReturnType<typeof prisma.packageItemReview.findMany>>[number]

/** OKR redaction context from the package viewer's already-loaded facts (no extra queries). */
function okrContext(viewer: PackageViewer): ViewerContext {
  return makeViewerContext(
    { id: viewer.userId, role: viewer.role },
    { directReportIds: viewer.directReportIds, departmentIds: viewer.departmentIds },
  )
}

/** Is the item's title hidden from this viewer? (private OKRs, sensitive KPIs). */
export function isItemRedacted(item: PackageItemRow, ctx: ViewerContext, canReadSensitiveKpis: boolean): boolean {
  switch (item.entityType) {
    case 'OBJECTIVE':
      return canViewObjectiveInMemory(ctx, { ownerId: item.ownerId ?? '', isPrivate: item.isPrivate }).isRedacted
    case 'KEY_RESULT': {
      const parent = canViewObjectiveInMemory(ctx, item.objective ?? { ownerId: '', isPrivate: false })
      return canViewKeyResultInMemory(ctx, { ownerId: item.ownerId ?? '', isPrivate: item.isPrivate }, parent).isRedacted
    }
    case 'TODO': {
      if (!item.keyResult) return false
      const parent = canViewObjectiveInMemory(ctx, item.objective ?? { ownerId: '', isPrivate: false })
      return canViewKeyResultInMemory(ctx, item.keyResult, parent).isRedacted
    }
    case 'KPI':
      return item.isSensitive && !canReadSensitiveKpis
    default:
      return false
  }
}

function toReviewDTO(
  row: ReviewRow,
  item: PackageItemRow | undefined,
  redacted: boolean,
  people: Map<string, PackagePerson>,
): PackageItemReviewDTO | null {
  if (!isPackageReviewEntityType(row.entityType) || !isReviewVerdict(row.verdict)) return null
  return {
    id: row.id,
    packageId: row.packageId,
    entityType: row.entityType,
    entityId: row.entityId,
    itemTitle: item && !redacted ? item.title : null,
    itemRedacted: !!item && redacted,
    itemMissing: !item,
    verdict: row.verdict,
    comment: row.comment,
    reviewerId: row.reviewerId,
    reviewer: people.get(row.reviewerId) ?? null,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolution: row.resolution,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function assertCanView(viewer: PackageViewer, pkg: PackageRow) {
  if (!(await canViewPackageArea(viewer, pkg.userId, 'package'))) {
    throw new PackageError(404, 'Operating package not found', 'NOT_FOUND')
  }
}

function itemIndex(items: PackageItemRow[]): Map<string, PackageItemRow> {
  return new Map(items.map((item) => [packageItemKey(item.entityType, item.entityId), item]))
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listPackageReviews(viewer: PackageViewer, packageId: string): Promise<PackageReviewsResponse> {
  const pkg = await loadPackageRow(packageId)
  await assertCanView(viewer, pkg)
  const status = normalizePackageStatus(pkg.status)
  const readOnly = isTimeframeReadOnly(pkg.timeframe, viewer)

  const [access, items, rows] = await Promise.all([
    getPackageAreaAccess(viewer, pkg.userId),
    loadPackageItems(pkg.userId, pkg.timeframeId),
    prisma.packageItemReview.findMany({ where: { packageId }, orderBy: [{ updatedAt: 'desc' }] }),
  ])
  const index = itemIndex(items)
  const ctx = okrContext(viewer)
  const sensitiveOk = access.view.kpis_sensitive
  const people = await loadPeople(rows.map((r) => r.reviewerId))

  const reviews: PackageItemReviewDTO[] = []
  for (const row of rows) {
    const item = index.get(packageItemKey(row.entityType, row.entityId))
    const dto = toReviewDTO(row, item, item ? isItemRedacted(item, ctx, sensitiveOk) : false, people)
    if (dto) reviews.push(dto)
  }

  return {
    packageId,
    userId: pkg.userId,
    status,
    reviews,
    summary: summarizeReviews(new Set(index.keys()), rows, pkg.userId),
    permissions: {
      canReview: canReviewIn(status) && access.canReviewItems && !readOnly,
      canResolveDisputes: access.canResolveDisputes && !readOnly,
    },
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** PUT [id]/reviews — the employee's verdict on one item (upsert per item + reviewer). */
export async function upsertPackageReview(
  viewer: PackageViewer,
  packageId: string,
  input: UpsertReviewInput,
): Promise<UpsertPackageReviewResult> {
  const pkg = await loadPackageRow(packageId)
  await assertCanView(viewer, pkg)
  const access = await getPackageAreaAccess(viewer, pkg.userId)
  if (!access.canReviewItems) {
    throw new PackageError(403, 'Only the employee can mark their package items Agree or Dispute', 'FORBIDDEN')
  }
  if (isTimeframeReadOnly(pkg.timeframe, viewer)) {
    throw new PackageError(423, 'This timeframe has ended; its operating package is read-only', 'TIMEFRAME_CLOSED')
  }
  const status = normalizePackageStatus(pkg.status)
  if (!canReviewIn(status)) {
    throw new PackageError(409, 'Items can be reviewed only while the package is in review', 'NOT_IN_REVIEW')
  }

  const items = await loadPackageItems(pkg.userId, pkg.timeframeId)
  const index = itemIndex(items)
  const item = index.get(packageItemKey(input.entityType, input.entityId))
  if (!item) throw new PackageError(404, 'That item is not part of this operating package', 'ITEM_NOT_IN_PACKAGE')

  const where = {
    packageId_entityType_entityId_reviewerId: {
      packageId,
      entityType: input.entityType,
      entityId: input.entityId,
      reviewerId: viewer.userId,
    },
  }
  const comment = input.comment ?? null

  const { row, effect, previous } = await prisma.$transaction(async (tx) => {
    const previous = await tx.packageItemReview.findUnique({ where })
    const effect = reviewUpsertEffect(previous, input.verdict)
    const resolutionReset = effect.clearResolution ? { resolvedAt: null, resolution: null } : {}
    const row = await tx.packageItemReview.upsert({
      where,
      create: {
        packageId,
        entityType: input.entityType,
        entityId: input.entityId,
        reviewerId: viewer.userId,
        verdict: input.verdict,
        comment,
      },
      update: { verdict: input.verdict, comment, ...resolutionReset },
    })
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    if (!previous || previous.verdict !== row.verdict) changes.verdict = { from: previous?.verdict ?? null, to: row.verdict }
    if ((previous?.comment ?? null) !== row.comment) changes.comment = { from: previous?.comment ?? null, to: row.comment }
    if (Object.keys(changes).length > 0) {
      await recordPackageActivity(
        {
          entityType: 'OPERATING_PACKAGE',
          action: 'REVIEWED',
          entityId: packageId,
          packageId,
          subjectUserId: pkg.userId,
          timeframeId: pkg.timeframeId,
          actorId: viewer.userId,
          changes,
          metadata: { reviewId: row.id, itemType: input.entityType, itemId: input.entityId, verdict: row.verdict },
        },
        { client: tx },
      )
    }
    return { row, effect, previous }
  })

  if (effect.notifyDispute) {
    const employee = await prisma.user.findUnique({ where: { id: pkg.userId }, select: { name: true } })
    await emit('PACKAGE_ITEM_DISPUTED', {
      actorId: viewer.userId,
      entityType: 'OPERATING_PACKAGE',
      entityId: packageId,
      entityTitle: pkg.timeframe?.name ? `${pkg.timeframe.name} operating package` : 'Operating package',
      data: {
        ownerId: pkg.userId,
        timeframeName: pkg.timeframe?.name ?? null,
        version: pkg.version,
        employeeName: employee?.name ?? null,
        actorName: employee?.name ?? null,
        itemTitle: item.title,
        itemType: PACKAGE_REVIEW_ENTITY_LABELS[input.entityType as PackageReviewEntityType],
        disputeComment: row.comment,
        reopened: !!previous,
      },
    })
  }

  const allReviews = await prisma.packageItemReview.findMany({
    where: { packageId },
    select: { entityType: true, entityId: true, verdict: true, reviewerId: true, resolvedAt: true },
  })
  const people = await loadPeople([row.reviewerId])
  const dto = toReviewDTO(row, item, false, people)
  if (!dto) throw new PackageError(400, 'Invalid review', 'INVALID_REVIEW')
  return { review: dto, summary: summarizeReviews(new Set(index.keys()), allReviews, pkg.userId) }
}

/** POST [id]/reviews/[reviewId]/resolve — close a dispute with a resolution note. */
export async function resolvePackageReview(
  viewer: PackageViewer,
  packageId: string,
  reviewId: string,
  input: ResolveReviewInput,
): Promise<UpsertPackageReviewResult> {
  const pkg = await loadPackageRow(packageId)
  await assertCanView(viewer, pkg)
  const access = await getPackageAreaAccess(viewer, pkg.userId)
  if (!access.canResolveDisputes) {
    throw new PackageError(
      403,
      viewer.userId === pkg.userId
        ? 'You cannot resolve disputes on your own package'
        : 'Only the manager chain, HR, an Executive or an Admin can resolve disputes',
      'FORBIDDEN',
    )
  }
  if (isTimeframeReadOnly(pkg.timeframe, viewer)) {
    throw new PackageError(423, 'This timeframe has ended; its operating package is read-only', 'TIMEFRAME_CLOSED')
  }
  const review = await prisma.packageItemReview.findUnique({ where: { id: reviewId } })
  if (!review || review.packageId !== packageId) throw new PackageError(404, 'Review not found', 'NOT_FOUND')
  if (review.verdict !== 'DISPUTE') throw new PackageError(409, 'Only a dispute can be resolved', 'NOT_A_DISPUTE')
  if (review.resolvedAt) throw new PackageError(409, 'This dispute is already resolved', 'ALREADY_RESOLVED')

  const now = new Date()
  const row = await prisma.$transaction(async (tx) => {
    const moved = await tx.packageItemReview.updateMany({
      where: { id: reviewId, verdict: 'DISPUTE', resolvedAt: null },
      data: { resolvedAt: now, resolution: input.resolution },
    })
    if (moved.count === 0) throw new PackageError(409, 'The dispute was changed by someone else. Refresh and try again.', 'CONFLICT')
    await recordPackageActivity(
      {
        entityType: 'OPERATING_PACKAGE',
        action: 'RESOLVED',
        entityId: packageId,
        packageId,
        subjectUserId: pkg.userId,
        timeframeId: pkg.timeframeId,
        actorId: viewer.userId,
        changes: { resolution: { from: null, to: input.resolution } },
        metadata: { reviewId, itemType: review.entityType, itemId: review.entityId },
      },
      { client: tx },
    )
    return tx.packageItemReview.findUniqueOrThrow({ where: { id: reviewId } })
  })

  const [items, allReviews, people] = await Promise.all([
    loadPackageItems(pkg.userId, pkg.timeframeId),
    prisma.packageItemReview.findMany({
      where: { packageId },
      select: { entityType: true, entityId: true, verdict: true, reviewerId: true, resolvedAt: true },
    }),
    loadPeople([row.reviewerId]),
  ])
  const index = itemIndex(items)
  const item = index.get(packageItemKey(row.entityType, row.entityId))
  const redacted = item ? isItemRedacted(item, okrContext(viewer), access.view.kpis_sensitive) : false
  const dto = toReviewDTO(row, item, redacted, people)
  if (!dto) throw new PackageError(400, 'Invalid review', 'INVALID_REVIEW')
  return { review: dto, summary: summarizeReviews(new Set(index.keys()), allReviews, pkg.userId) }
}
