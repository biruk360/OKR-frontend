/**
 * Development plan (DEV-1…6) — client barrel.
 *
 * Server code (Prisma) is NOT exported here: import
 * `features/development-plan/services/development.server.ts` and
 * `.../profile-summary.server.ts` (getDevelopmentProfileSummary) by direct path from `app/`.
 */
export { DevelopmentProfileTab } from './components/DevelopmentProfileTab'
export type { DevelopmentProfileTabProps } from './components/DevelopmentProfileTab'
export { DevelopmentItemFormModal } from './components/DevelopmentItemFormModal'
export type { DevelopmentItemFormModalProps } from './components/DevelopmentItemFormModal'
export {
  DropDevelopmentItemDialog,
  LogDevelopmentHoursDialog,
  MarkDevelopmentDoneDialog,
} from './components/DevelopmentItemDialogs'
export {
  developmentKeys,
  useAddDevelopmentHours,
  useCreateDevelopmentItem,
  useDevelopmentItems,
  useUpdateDevelopmentItem,
} from './hooks/queries'
export { developmentApi } from './services/api'
export type { DevelopmentApiError, DevelopmentHoursBody, DevelopmentItemWriteBody } from './services/api'
export {
  DEFAULT_DEV_MIN_HOURS,
  DEFAULT_DEV_MIN_ITEMS,
  DEV_DUE_SOON_DAYS,
  DROP_REASON_MIN,
  applyDevelopmentStatePatch,
  composeEvidenceNote,
  computeDevelopmentRule,
  formatHours,
  hasEvidence,
  isDevelopmentDueSoon,
  isDevelopmentOverdue,
  kindRequiresEvidence,
  sortDevelopmentItems,
  splitEvidenceNote,
} from './services/rules'
export type {
  AddDevelopmentHoursResult,
  DevelopmentEvidence,
  DevelopmentItemDTO,
  DevelopmentLinkedKeyResult,
  DevelopmentListResponse,
  DevelopmentPermissions,
  DevelopmentProfileSummary,
  DevelopmentRuleProgress,
} from './types'
