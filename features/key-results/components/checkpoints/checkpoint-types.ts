/**
 * KR checkpoints + definition (KRX-3 / KRX-4) — JSON contract of
 * `GET /api/keyresults/[id]/checkpoints` and its mutations. Client-safe.
 */
import type { CheckpointStatus, KrCommitment, KrDirection } from '@/types/package'

/** One `KeyResultCheckpoint` as the API returns it (dates as ISO strings). */
export interface KrCheckpointDTO {
  id: string
  keyResultId: string
  /** "Q2", "Q3", "Q4" … */
  label: string
  dueDate: string
  targetText: string
  targetValue: number | null
  actualValue: number | null
  status: CheckpointStatus
  reviewedAt: string | null
  reviewedBy: { id: string; name: string | null } | null
  createdAt: string
  updatedAt: string
}

/** KRX definition fields (KRX-4) plus the numbers needed to edit `direction`. */
export interface KrDefinitionDTO {
  commitment: KrCommitment | null
  direction: KrDirection
  baselineText: string | null
  targetText: string | null
  measuredBy: string | null
  dueText: string | null
  dueDate: string | null
  startValue: number | null
  targetValue: number | null
  currentValue: number | null
  unit: string | null
}

export interface KrCheckpointPermissions {
  /** Add a checkpoint (KR edit permission and KR not locked). */
  canCreate: boolean
  /** Edit or review (MET / MISSED) a checkpoint. */
  canEdit: boolean
  canDelete: boolean
  /** Edit the definition through PATCH /api/keyresults/[id]. */
  canEditDefinition: boolean
}

export interface KrCheckpointsPayload {
  keyResultId: string
  /** The viewer may see the KR exists but not its content: no checkpoints, no definition. */
  isRedacted: boolean
  /** KR or its objective is closed and locked (period close); mutations answer 423. */
  isLocked: boolean
  /** Sorted by dueDate ascending. */
  checkpoints: KrCheckpointDTO[]
  /** First PENDING checkpoint by due date (may be overdue), or null. */
  nextCheckpointId: string | null
  definition: KrDefinitionDTO | null
  permissions: KrCheckpointPermissions
}

/** Body of POST /api/keyresults/[id]/checkpoints. */
export interface CreateKrCheckpointInput {
  label: string
  /** ISO date or yyyy-mm-dd. */
  dueDate: string
  targetText: string
  targetValue?: number | null
  actualValue?: number | null
  status?: CheckpointStatus
}

/** Body of PATCH /api/keyresults/[id]/checkpoints/[checkpointId] — any subset. */
export type UpdateKrCheckpointInput = Partial<CreateKrCheckpointInput>

/** Body of PATCH /api/keyresults/[id] for the definition (F2 route). */
export interface UpdateKrDefinitionInput {
  commitment?: KrCommitment | null
  direction?: KrDirection
  baselineText?: string | null
  targetText?: string | null
  measuredBy?: string | null
  dueText?: string | null
  dueDate?: string | null
  startValue?: number
  targetValue?: number
}
