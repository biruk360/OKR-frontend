/**
 * Operating package feature (PKG-1…5) — client barrel.
 *
 * Server code (Prisma) is NOT exported here; import it by direct path from `app/`:
 *   - features/operating-package/services/packages.server.ts (header lifecycle)
 *   - features/operating-package/services/reviews.server.ts (Agree / Dispute, resolve)
 *   - features/operating-package/services/profile-summary.server.ts (getPackageProfileSummary)
 *   - features/operating-package/services/approval-state.server.ts (markPackageEditIfApproved, PKG-3)
 */
export { PackageHeaderCard } from './components/PackageHeaderCard'
export type { PackageHeaderCardProps } from './components/PackageHeaderCard'
export { PackageReviewControls } from './components/PackageReviewControls'
export type { PackageReviewControlsProps } from './components/PackageReviewControls'
export { PackageEditModal } from './components/PackageEditModal'
export type { PackageEditModalProps } from './components/PackageEditModal'
export { PackageDisputesList } from './components/PackageDisputesList'
export { ResolveDisputePopover } from './components/ResolveDisputePopover'
export { PackageStatusBadge, ReviewVerdictBadge, WeightsMix, formatReviewSummary } from './components/PackageBits'

export {
  useOperatingPackage,
  usePackageReviews,
  useCreatePackage,
  useUpdatePackage,
  useSubmitPackage,
  useApprovePackage,
  useReviewPackageItem,
  useResolvePackageDispute,
  operatingPackageKeys,
} from './hooks/queries'
export { operatingPackageApi } from './services/api'
export type { PackageCreateBody, PackageUpdateBody, PackageReviewBody, PackageApiError } from './services/api'

export {
  summarizeReviews,
  weightSegments,
  weightsTotal,
  parsePackageWeights,
  parseSummaryLines,
  nextPackageVersion,
  packageItemKey,
  canTransitionByPatch,
  canSubmitFrom,
  canApproveFrom,
  canReviewIn,
  PACKAGE_REVIEW_ENTITY_LABELS,
  WEIGHT_LABELS,
} from './services/rules'

export type {
  OperatingPackageDTO,
  OperatingPackageResponse,
  OperatingPackagePermissions,
  PackageItemReviewDTO,
  PackageReviewsResponse,
  PackageReviewPermissions,
  PackageReviewSummary,
  PackageProfileSummary,
  PackagePerson,
  ApprovePackageResult,
  UpsertPackageReviewResult,
} from './types'
