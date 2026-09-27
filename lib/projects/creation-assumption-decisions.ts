/**
 * Bulk review of AI/inferred assumption proposals (remediation 2026-09-25, C5).
 *
 * Labelling can create ~150 PROPOSED assumptions for a 60-activity plan. The PM may
 * accept or reject them in bulk — per phase, or all remaining — but only as an
 * explicit, confirmed action (invariant #6): nothing here runs automatically.
 *
 * Client-safe (no Prisma). The server recomputes the target set from the stored
 * draft; the client only states the scope and the count it confirmed.
 */
import type { NormalizedProjectCreationDraft, ProjectCreationScheduleJson } from './creation-normalize'

type Draft = NormalizedProjectCreationDraft
type Source = ProjectCreationScheduleJson['sources'][number]
type Assumption = Draft['assumptions'][number]

export type ProjectCreationAssumptionDecision = 'ACCEPT' | 'REJECT'
export type ProjectCreationAssumptionScope =
  | { type: 'PHASE'; phaseId: string }
  | { type: 'ALL' }

/** An AI/inferred source: server-owned evidence that a value was proposed, not stated. */
function isAiOrInferredSource(source: Source): boolean {
  return source.type === 'AI_ASSUMPTION'
    || source.basis === 'INFERRED_RECOMMENDATION'
    || source.lastEditor === 'AI'
}

function aiSourceIds(sources: readonly Source[]): Set<string> {
  return new Set(sources.filter(isAiOrInferredSource).map((source) => source.id))
}

/**
 * A still-pending assumption that server-owned provenance attributes to AI or
 * inference. User-authored assumptions (no AI source) are never bulk-decided.
 */
export function isPendingAiProposal(
  assumption: Assumption,
  sources: readonly Source[],
  ids: ReadonlySet<string> = aiSourceIds(sources),
): boolean {
  return assumption.status === 'PROPOSED' && assumption.sourceIds.some((id) => ids.has(id))
}

function phaseResolver(draft: Draft) {
  const phaseIds = new Set(draft.phases.map((row) => row.id))
  const milestonePhase = new Map(draft.milestones.map((row) => [row.id, row.phaseId]))
  const activityPhase = new Map(draft.activities.map((row) => [row.id, milestonePhase.get(row.milestoneId) ?? null]))
  const deliverablePhase = new Map(draft.deliverables.map((row) => [row.id, milestonePhase.get(row.milestoneId) ?? null]))
  const dependencyPhase = new Map(draft.dependencies.map((row) => {
    const a = activityPhase.get(row.predecessorActivityId) ?? null
    const b = activityPhase.get(row.successorActivityId) ?? null
    return [row.id, a && a === b ? a : null]
  }))
  /**
   * Returns the single phase id when every affected entity path belongs to that
   * phase, otherwise null (project-level, cross-phase, or unresolvable proposals
   * are covered only by "all remaining").
   */
  return (assumption: Assumption): string | null => {
    const phases = new Set<string>()
    for (const path of assumption.affectedPaths) {
      const [head, id = ''] = path.replace(/^\//, '').split(/[./]/).filter(Boolean)
      const phase = head === 'phases' ? (phaseIds.has(id) ? id : null)
        : head === 'milestones' ? milestonePhase.get(id) ?? null
        : head === 'activities' ? activityPhase.get(id) ?? null
        : head === 'deliverables' ? deliverablePhase.get(id) ?? null
        : head === 'dependencies' ? dependencyPhase.get(id) ?? null
        : null
      if (!phase) return null
      phases.add(phase)
    }
    return phases.size === 1 ? [...phases][0] : null
  }
}

export function projectCreationAssumptionPhaseId(assumption: Assumption, draft: Draft): string | null {
  return phaseResolver(draft)(assumption)
}

export function selectProjectCreationAiProposals(
  draft: Draft,
  scope: ProjectCreationAssumptionScope,
): Assumption[] {
  const ids = aiSourceIds(draft.sources)
  const phaseOf = phaseResolver(draft)
  return draft.assumptions.filter((assumption) => isPendingAiProposal(assumption, draft.sources, ids)
    && (scope.type === 'ALL' || phaseOf(assumption) === scope.phaseId))
}

/** Pending AI proposals per phase id (only phases with at least one) and overall. */
export function countProjectCreationAiProposals(draft: Draft): { total: number; byPhase: Map<string, number> } {
  const ids = aiSourceIds(draft.sources)
  const phaseOf = phaseResolver(draft)
  const byPhase = new Map<string, number>()
  let total = 0
  for (const assumption of draft.assumptions) {
    if (!isPendingAiProposal(assumption, draft.sources, ids)) continue
    total += 1
    const phase = phaseOf(assumption)
    if (phase) byPhase.set(phase, (byPhase.get(phase) ?? 0) + 1)
  }
  return { total, byPhase }
}

export class ProjectCreationBulkDecisionError extends Error {
  constructor(
    readonly code: 'BULK_SCOPE_INVALID' | 'BULK_NOTHING_TO_DECIDE' | 'BULK_COUNT_MISMATCH',
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ProjectCreationBulkDecisionError'
  }
}

/**
 * Applies one explicit PM decision to the selected pending AI proposals. Only the
 * assumption `status` changes; values, sources, and provenance are untouched.
 * `expectedCount` is the count shown in the confirmation dialog — a mismatch means
 * the PM confirmed a different set, so the whole operation is refused.
 */
export function decideProjectCreationAiProposals(
  draft: Draft,
  input: {
    scope: ProjectCreationAssumptionScope
    decision: ProjectCreationAssumptionDecision
    expectedCount: number
  },
): { draft: Draft; assumptionIds: string[] } {
  const { scope } = input
  if (scope.type === 'PHASE' && !draft.phases.some((phase) => phase.id === scope.phaseId)) {
    throw new ProjectCreationBulkDecisionError('BULK_SCOPE_INVALID', 'That phase is no longer in this draft. Reload and try again.')
  }
  const selected = selectProjectCreationAiProposals(draft, scope)
  if (selected.length === 0) {
    throw new ProjectCreationBulkDecisionError('BULK_NOTHING_TO_DECIDE', 'There are no pending AI proposals in this scope.')
  }
  if (selected.length !== input.expectedCount) {
    throw new ProjectCreationBulkDecisionError(
      'BULK_COUNT_MISMATCH',
      `This scope now has ${selected.length} pending AI proposals, not ${input.expectedCount}. Review the updated count and confirm again.`,
      { expectedCount: input.expectedCount, currentCount: selected.length },
    )
  }
  const ids = new Set(selected.map((assumption) => assumption.id))
  const status = input.decision === 'ACCEPT' ? 'ACCEPTED' as const : 'REJECTED' as const
  return {
    draft: {
      ...draft,
      assumptions: draft.assumptions.map((assumption) => ids.has(assumption.id) ? { ...assumption, status } : assumption),
    },
    assumptionIds: [...ids],
  }
}
