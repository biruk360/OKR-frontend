/**
 * Feature barrel for Key Results.
 * Physical files live under `./components/`.
 */

export { default as AddKeyResultButton } from './components/AddKeyResultButton'
export { default as AddKeyResultModal } from './components/AddKeyResultModal'
export { default as ArchiveKeyResultButton } from './components/ArchiveKeyResultButton'
export { default as ArchiveKeyResultModal } from './components/ArchiveKeyResultModal'
export { default as CloneKeyResultButton } from './components/CloneKeyResultButton'
export { default as CloneKeyResultModal } from './components/CloneKeyResultModal'
export { default as CloseKeyResultModal } from './components/CloseKeyResultModal'
export { default as CreateCheckInButton } from './components/CreateCheckInButton'
export { default as CreateCheckInModal } from './components/CreateCheckInModal'
export { default as DeleteKeyResultButton } from './components/DeleteKeyResultButton'
export { default as DeleteKeyResultModal } from './components/DeleteKeyResultModal'
export { default as EditKeyResultButton } from './components/EditKeyResultButton'
export { default as EditKeyResultModal } from './components/EditKeyResultModal'
export { default as KeyResultDetailClient } from './components/KeyResultDetailClient'
export { default as KeyResultsList } from './components/KeyResultsList'
export { default as UnarchiveKeyResultButton } from './components/UnarchiveKeyResultButton'
export { default as KeyResultActionsMenu } from './components/KeyResultActionsMenu'

export type {
  CreateKeyResultForm,
  UpdateKeyResultForm,
  KeyResultFilters,
  KeyResultWithRelations,
  ConfidenceLevel,
} from '@/types'

// ── KR checkpoints + definition (KRX-2/3/4, employee operating package) ──────
export { default as CheckpointStrip } from './components/checkpoints/CheckpointStrip'
export type { CheckpointStripProps } from './components/checkpoints/CheckpointStrip'
export { default as CheckpointEditor } from './components/checkpoints/CheckpointEditor'
export type { CheckpointEditorProps } from './components/checkpoints/CheckpointEditor'
export { default as NextCheckpointChip } from './components/checkpoints/NextCheckpointChip'
export type { NextCheckpointChipProps } from './components/checkpoints/NextCheckpointChip'
export { default as KrDefinitionSection } from './components/definition/KrDefinitionSection'
export type { KrDefinitionSectionProps } from './components/definition/KrDefinitionSection'
export { default as CommitmentBadge, commitmentSuccessHint } from './components/definition/CommitmentBadge'
export type { CommitmentBadgeProps } from './components/definition/CommitmentBadge'
export {
  checkpointState,
  checkpointDayKey,
  daysUntilCheckpoint,
  describeDueIn,
  findNextCheckpoint,
  formatCheckpointDate,
  formatCheckpointValue,
  sortCheckpoints,
  suggestCheckpointStatus,
  suggestNextCheckpointLabel,
  CHECKPOINT_STATE_LABELS,
  CHECKPOINT_STATE_TONE,
} from './components/checkpoints/checkpoint-utils'
export type { CheckpointLike, CheckpointState } from './components/checkpoints/checkpoint-utils'
export type {
  KrCheckpointDTO,
  KrCheckpointPermissions,
  KrCheckpointsPayload,
  KrDefinitionDTO,
  CreateKrCheckpointInput,
  UpdateKrCheckpointInput,
  UpdateKrDefinitionInput,
} from './components/checkpoints/checkpoint-types'
export {
  useKrCheckpoints,
  useCreateKrCheckpoint,
  useUpdateKrCheckpoint,
  useDeleteKrCheckpoint,
} from './hooks/useKrCheckpoints'
export { useKrDefinition, useUpdateKrDefinition } from './hooks/useKrDefinition'
export { krCheckpointKeys } from './hooks/krCheckpointsApi'
