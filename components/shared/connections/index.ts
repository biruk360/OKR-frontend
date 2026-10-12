/**
 * Connections UI (CON-1 / CON-2 / CON-8) — chips, panel, rows and the shared
 * `GET /api/connections` query. Types come from `@/lib/connections/types`.
 */
export { ConnectionChips } from './ConnectionChips'
export type { ConnectionChipsProps } from './ConnectionChips'
export { ConnectionsPanel } from './ConnectionsPanel'
export type { ConnectionsPanelProps } from './ConnectionsPanel'
export {
  CONNECTION_CHIP_ICONS,
  CONNECTION_ITEM_ICONS,
  CONNECTION_TONE_STYLE,
  ConnectionDecisionRow,
  ConnectionDependencyRow,
  ConnectionGroupRows,
  ConnectionItemRow,
  PrivateConnectionRow,
} from './ConnectionRows'
export type { ConnectionItemRowProps } from './ConnectionRows'
export {
  CONNECTIONS_QUERY_ROOT,
  CONNECTIONS_STALE_TIME,
  ConnectionsFetchError,
  connectionsQueryKey,
  fetchConnections,
  invalidateConnections,
  useConnections,
} from './useConnections'
export type { UseConnectionsOptions } from './useConnections'
export {
  CHIP_GROUP,
  CONNECTION_CHIP_KINDS,
  CONNECTION_ITEM_TYPE_LABELS,
  CONNECTION_ITEM_TYPE_SHORT,
  PRIVATE_ITEM_LABEL,
  buildConnectionChips,
  buildConnectionGroups,
  connectionItemShortLabel,
  connectionItemTitle,
  connectionStatusDisplay,
  connectionViaLabel,
  dependencyStatusLabel,
  dependencyTone,
  formatGrade,
  formatPercent,
  formatShortDate,
  humanizeEnum,
  isConnectionsPayloadEmpty,
  sharedTimeframeName,
} from './connection-display'
export type {
  ConnectionChipKind,
  ConnectionChipModel,
  ConnectionGroup,
  ConnectionGroupKey,
  ConnectionTone,
} from './connection-display'
