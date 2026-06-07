export type EvaluationStatus =
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'CONSOLIDATED'
  | 'CALIBRATION'
  | 'DRAFT_SHARED'
  | 'FINALIZED'
  | 'EXCUSED'

export type ReviewCycleStatus = 'PLANNED' | 'OPEN' | 'CONSOLIDATING' | 'CLOSED'
export type TemplateStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

const EVALUATION_TRANSITIONS: Record<EvaluationStatus, ReadonlySet<EvaluationStatus>> = {
  ASSIGNED: new Set<EvaluationStatus>(['IN_PROGRESS', 'EXCUSED']),
  IN_PROGRESS: new Set<EvaluationStatus>(['CONSOLIDATED', 'CALIBRATION', 'EXCUSED']),
  CONSOLIDATED: new Set<EvaluationStatus>(['CALIBRATION', 'DRAFT_SHARED', 'EXCUSED']),
  CALIBRATION: new Set<EvaluationStatus>(['CONSOLIDATED', 'DRAFT_SHARED', 'EXCUSED']),
  DRAFT_SHARED: new Set<EvaluationStatus>(['CALIBRATION', 'FINALIZED', 'EXCUSED']),
  FINALIZED: new Set<EvaluationStatus>(),
  EXCUSED: new Set<EvaluationStatus>(),
}

const CYCLE_TRANSITIONS: Record<ReviewCycleStatus, ReadonlySet<ReviewCycleStatus>> = {
  PLANNED: new Set<ReviewCycleStatus>(['OPEN']),
  OPEN: new Set<ReviewCycleStatus>(['CONSOLIDATING', 'CLOSED']),
  CONSOLIDATING: new Set<ReviewCycleStatus>(['OPEN', 'CLOSED']),
  CLOSED: new Set<ReviewCycleStatus>(),
}

export function assertEvaluationTransition(from: string, to: EvaluationStatus): void {
  const allowed = EVALUATION_TRANSITIONS[from as EvaluationStatus]
  if (!allowed?.has(to)) throw new Error(`Invalid evaluation transition: ${from} -> ${to}`)
}

export function assertCycleTransition(from: string, to: ReviewCycleStatus): void {
  const allowed = CYCLE_TRANSITIONS[from as ReviewCycleStatus]
  if (!allowed?.has(to)) throw new Error(`Invalid review cycle transition: ${from} -> ${to}`)
}

export function assertTemplateEditable(status: string): void {
  if (status !== 'DRAFT') throw new Error('Published and archived template versions are immutable')
}
