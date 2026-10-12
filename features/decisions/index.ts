/**
 * Decisions feature (DEC-1…4): client barrel.
 *
 * Server code (Prisma) is NOT exported here; import it by direct path from `app/`:
 *   - features/decisions/services/decisions.server.ts (listDecisions, getDecision,
 *     createDecision, updateDecision, decideDecision, getDefaultDeciderId)
 *   - features/decisions/services/profile-summary.server.ts (getDecisionsProfileSummary)
 */
export { DecisionsProfileTab } from './components/DecisionsProfileTab'
export type { DecisionsProfileTabProps } from './components/DecisionsProfileTab'
export { AwaitingMyDecisionList } from './components/AwaitingMyDecisionList'
export type { AwaitingMyDecisionListProps } from './components/AwaitingMyDecisionList'
export { DecisionFormModal } from './components/DecisionFormModal'
export type { DecisionFormModalProps, DecisionFormDefaults } from './components/DecisionFormModal'
export { DecideModal } from './components/DecideModal'
export type { DecideModalProps } from './components/DecideModal'
export { DecisionRow, decisionActionsFor, useDecisionActionDialogs } from './components/DecisionRow'
export type { DecisionRowProps, DecisionAction } from './components/DecisionRow'
export {
  DecisionStatusBadge,
  DecisionOverdueChip,
  DecisionLinkChip,
  DecisionLinkChips,
  DecisionPersonInline,
  DecisionTextBlock,
  formatDecisionDate,
} from './components/DecisionBits'

export {
  useDecisions,
  useAwaitingDecisions,
  useDecisionsAffecting,
  useDecision,
  useCreateDecision,
  useUpdateDecision,
  useDecideDecision,
  decisionKeys,
} from './hooks/queries'
export { decisionApi, decisionListParams } from './services/api'
export type {
  DecisionListFilters,
  DecisionCreateBody,
  DecisionUpdateBody,
  DecisionLinkBody,
  DecideBody,
  DecisionApiError,
} from './services/api'

export {
  isDecisionOverdue,
  compareByNeededBy,
  sortByNeededBy,
  groupDecisionsByBatch,
  planStatusChange,
  canWithdrawDecision,
  summarizeDecisions,
  requesterLabel,
} from './services/rules'
export { NO_BATCH_FILTER } from './services/schemas'

export type {
  DecisionDTO,
  DecisionDetailDTO,
  DecisionLinkView,
  DecisionDependencyView,
  DecisionPerson,
  DecisionRecordAccess,
  DecisionRelation,
  DecisionListPermissions,
  DecisionListResponse,
  DecisionBatchGroup,
  DecideDecisionResult,
  DecisionsProfileSummary,
} from './types'
