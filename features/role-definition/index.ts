/**
 * Role definition feature (ROL-1…4) — client barrel.
 *
 * Server code (Prisma) is NOT exported here; import it by direct path from `app/`:
 *   - features/role-definition/services/role-definitions.server.ts
 *   - features/role-definition/services/profile-summary.server.ts (getRoleDefinitionProfileSummary)
 */
export { RoleDefinitionProfileTab } from './components/RoleDefinitionProfileTab'
export type { RoleDefinitionProfileTabProps } from './components/RoleDefinitionProfileTab'
export { RoleDefinitionSidebarCard, summarizeRoleDefinitions } from './components/RoleDefinitionSidebarCard'
export type { RoleDefinitionSidebarCardProps } from './components/RoleDefinitionSidebarCard'
export { RoleDefinitionEditor } from './components/RoleDefinitionEditor'
export type { RoleDefinitionEditorProps } from './components/RoleDefinitionEditor'
export { ApproveRoleDefinitionDialog } from './components/ApproveRoleDefinitionDialog'
export {
  RoleDefinitionStatusBadge,
  ReportingLineChip,
  DirectReportSeatList,
} from './components/RoleDefinitionBits'

export {
  useRoleDefinitions,
  useCreateRoleDefinition,
  useUpdateRoleDefinition,
  useApproveRoleDefinition,
  useDeleteRoleDefinition,
  roleDefinitionKeys,
} from './hooks/queries'
export { roleDefinitionApi } from './services/api'
export type { RoleDefinitionWriteBody } from './services/api'

export {
  pickCurrentDefinition,
  checkReportingLine,
  resolveDirectReportSeats,
  groupItemsBySection,
  topAccountabilities,
  countVacantSeats,
  splitSeatText,
  seatTitlesMatch,
} from './services/rules'

export type {
  RoleDefinitionDTO,
  RoleDefinitionItemDTO,
  RoleDefinitionPerson,
  RoleDefinitionListResponse,
  RoleDefinitionPermissions,
  RoleDefinitionProfileSummary,
  ReportingLineCheck,
  ReportingLineState,
  DirectReportSeat,
  ApproveRoleDefinitionResult,
} from './types'
