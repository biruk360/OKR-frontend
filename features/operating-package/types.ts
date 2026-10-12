/**
 * Operating package (PKG-1…5) — client-safe JSON contracts.
 *
 * Value sets and labels (statuses, review entity types, verdicts, weights) live
 * in `types/package.ts`; these are the shapes the API returns and the profile
 * components render.
 */
import type {
  PackageReviewEntityType,
  PackageStatus,
  PackageWeights,
  ReviewVerdict,
} from '@/types/package'

export interface PackagePerson {
  id: string
  name: string
  avatar: string | null
}

/** "The numbers this package commits to" — one line per entry (summaryJson). */
export type PackageSummaryLines = string[]

export interface OperatingPackageDTO {
  id: string
  userId: string
  timeframeId: string
  timeframeName: string | null
  version: string
  status: PackageStatus
  seatTitle: string | null
  summaryLines: PackageSummaryLines
  /** Null when the viewer may not see the performance mix (§8 `weights`) or none is stored. */
  weights: PackageWeights | null
  /** True when weightsJson is hidden from this viewer (not merely empty). */
  weightsHidden: boolean
  sourceFile: string | null
  submittedAt: string | null
  approvedById: string | null
  approvedBy: PackagePerson | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
}

/** PKG-2: "n of m reviewed · k disputes open". */
export interface PackageReviewSummary {
  /** Package items the employee has marked Agree or Dispute. */
  reviewed: number
  /** Package items in scope for review (m). */
  total: number
  agreed: number
  disputed: number
  /** Unresolved DISPUTE verdicts (approval is blocked while > 0). */
  disputesOpen: number
}

export interface OperatingPackagePermissions {
  /** No package yet and the viewer may run the lifecycle (manager chain / HR / Exec / Admin). */
  canCreate: boolean
  /** Edit version, seat title and summary lines. */
  canEdit: boolean
  canViewWeights: boolean
  canEditWeights: boolean
  /** DRAFT → IN_REVIEW. */
  canSubmit: boolean
  /** → APPROVED (manager chain / Exec / Admin with `button.package.approve`; never self). */
  canApprove: boolean
  /** → ARCHIVED. */
  canArchive: boolean
  /** IN_REVIEW / APPROVED / ARCHIVED → DRAFT. */
  canReopen: boolean
  /** The employee marking items Agree / Dispute (self, IN_REVIEW). */
  canReview: boolean
  canResolveDisputes: boolean
}

export interface OperatingPackageResponse {
  userId: string
  timeframeId: string
  timeframeName: string | null
  /** PKG-5: null → "No package for this timeframe". */
  package: OperatingPackageDTO | null
  summary: PackageReviewSummary
  /** Past timeframe: read-only for everyone but ADMIN / EXECUTIVE (PRF-3). */
  readOnly: boolean
  permissions: OperatingPackagePermissions
}

export interface PackageItemReviewDTO {
  id: string
  packageId: string
  entityType: PackageReviewEntityType
  entityId: string
  /** Item title, null when the item no longer exists or is redacted for the viewer. */
  itemTitle: string | null
  itemRedacted: boolean
  /** The item has been deleted or moved out of the package since it was reviewed. */
  itemMissing: boolean
  verdict: ReviewVerdict
  comment: string | null
  reviewerId: string
  reviewer: PackagePerson | null
  resolvedAt: string | null
  resolution: string | null
  createdAt: string
  updatedAt: string
}

export interface PackageReviewPermissions {
  canReview: boolean
  canResolveDisputes: boolean
}

export interface PackageReviewsResponse {
  packageId: string
  userId: string
  status: PackageStatus
  reviews: PackageItemReviewDTO[]
  summary: PackageReviewSummary
  permissions: PackageReviewPermissions
}

export interface UpsertPackageReviewResult {
  review: PackageItemReviewDTO
  summary: PackageReviewSummary
}

export interface ApprovePackageResult {
  package: OperatingPackageDTO
  summary: PackageReviewSummary
}

/** Overview "Package summary" card (profile composition contract). */
export interface PackageProfileSummary {
  packageId: string | null
  /** Null when the person has no package for the timeframe (PKG-5). */
  status: PackageStatus | null
  version: string | null
  reviewed: number
  total: number
  disputesOpen: number
}
