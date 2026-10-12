/**
 * Work dependencies feature (DEP-1…5, DEP-7) — client barrel.
 *
 * Server code (Prisma) is NOT exported here; import it by direct path from `app/`:
 *   - features/dependencies/services/dependencies.server.ts (list / person / create / update / status / delivery task)
 *   - features/dependencies/services/profile-summary.server.ts (getDependenciesProfileSummary)
 */
export { DependenciesProfileTab } from './components/DependenciesProfileTab'
export type { DependenciesProfileTabProps } from './components/DependenciesProfileTab'
export { DependencyFormModal } from './components/DependencyFormModal'
export type { DependencyFormModalProps, DependencyFormDefaults } from './components/DependencyFormModal'
export { DependencyStatusBadge } from './components/DependencyStatusBadge'
export type { DependencyStatusBadgeProps } from './components/DependencyStatusBadge'

export {
  useDependencies,
  usePersonDependencies,
  useDependency,
  useCreateDependency,
  useUpdateDependency,
  useSetDependencyStatus,
  useCreateDeliveryTask,
  dependencyKeys,
} from './hooks/queries'
export { dependenciesApi, dependencyFilterQuery, dependencyExportHref } from './services/api'
export type { DependencyApiError, PersonDependencyParams } from './services/api'

export {
  isPackageLinkRef,
  isClosedStatus,
  personRoles,
  splitParties,
  matchesDueWindow,
  statusTransition,
  canSetStatus,
  statusActionsFor,
  splitPersonRows,
  personCounts,
  buildProfileSummary,
  buildDependencyCsv,
  dependencyCsvRow,
  csvCell,
  DEPENDENCY_CSV_HEADERS,
} from './services/rules'

export { DEPENDENCY_DUE_WINDOWS, DEPENDENCY_DUE_WINDOW_LABELS } from './types'
export type {
  DependencyPerson,
  DependencyLinkedItem,
  DependencyRowPermissions,
  DependencyTimingFlags,
  DependencySummaryRow,
  DependencyDetailRow,
  DependencyRow,
  DependencyListPermissions,
  DependencyListResponse,
  PersonDependenciesResponse,
  DependenciesProfileSummary,
  DependencyLinkInput,
  DependencyWriteBody,
  DependencyStatusBody,
  DependencyStatusResult,
  DeliveryTaskResult,
  DependencyListFilters,
  DependencyDueWindow,
} from './types'
