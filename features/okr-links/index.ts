/**
 * OKR links UI (LNK-1…4, CON-5, CON-6). Client components, hooks and pure helpers.
 * Server logic lives in `lib/okr-links/` (F4); the chips / panel live in
 * `components/shared/connections`.
 */
export { LinkManagerModal } from './components/LinkManagerModal'
export type { LinkManagerModalProps } from './components/LinkManagerModal'
export { AlignmentTrail } from './components/AlignmentTrail'
export type { AlignmentTrailProps } from './components/AlignmentTrail'
export { LineagePopover, LineageList } from './components/LineagePopover'
export type { LineagePopoverProps, LineageListProps, LineageDirection } from './components/LineagePopover'
export { OkrConnectionsSection } from './components/OkrConnectionsSection'
export type { OkrConnectionsSectionProps } from './components/OkrConnectionsSection'

export {
  okrLinkKeys,
  useAlignmentChain,
  useCreateOkrLink,
  useDeleteOkrLink,
  useLinkTargetSearch,
  useOkrLinks,
} from './hooks/useOkrLinks'
export { okrLinksApi, OkrLinkApiError } from './services/api'

export {
  buildCreateLinkPayload,
  canSetParent,
  canSetPrimary,
  defaultLinkFormValues,
  defaultTargetType,
  filterLinkTargets,
  groupOkrLinks,
  lineageSummary,
  linkFormSchema,
  linkRelationLabel,
  otherAlignments,
  pickAlignmentParent,
  previousTimeframeId,
  successorSummary,
  walkAlignment,
} from './utils'
export type { AlignmentWalk, LinkFormValues, OkrLinkGroups, OkrRef } from './utils'
export type {
  CreateOkrLinkPayload,
  LinkTargetOption,
  OkrLinkListDto,
  OkrLinkSubject,
  OkrLinkViewDto,
} from './types'
