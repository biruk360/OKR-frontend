import type { NormalizedProjectCreationDraft } from '@/lib/projects/creation-normalize'

export interface ProjectCreationCommitCounts {
  phases: number
  milestones: number
  activities: number
  deliverables: number
  dependencies: number
}

export interface CommitProjectCreationDraftResult {
  id: string
  code: string
  existing: boolean
  status: 'PLANNING'
  baselineCommittedAt: null
  counts: ProjectCreationCommitCounts
  acknowledgedWarnings: number
}

export function projectCreationCommitCounts(
  draft: NormalizedProjectCreationDraft,
): ProjectCreationCommitCounts {
  return {
    phases: draft.phases.length,
    milestones: draft.milestones.length,
    activities: draft.activities.length,
    deliverables: draft.deliverables.length,
    dependencies: draft.dependencies.length,
  }
}

export function projectCreationAcknowledgedWarningCount(
  draft: NormalizedProjectCreationDraft,
): number {
  const acknowledged = draft.warnings.filter((warning) => warning.acknowledged)
  const represented = new Set(acknowledged.map((warning) => `${warning.code}\u0000${warning.message}`))
  return acknowledged.length + draft.issues.filter((issue) => (
    issue.severity === 'WARNING' && !represented.has(`${issue.code}\u0000${issue.message}`)
  )).length
}

/**
 * Immediate client-side gate for known saved/current findings. The commit service
 * repeats the complete validation and authorization checks inside its transaction.
 */
export function projectCreationClientCommitBlockers(
  draft: NormalizedProjectCreationDraft,
  sourceMethod?: 'MANUAL' | 'FILE_IMPORT' | 'AI_GUIDED' | 'AI_TOR',
): string[] {
  const blockers = draft.issues
    .filter((issue) => issue.severity === 'BLOCKING')
    .map((issue) => issue.message)
  if (draft.warnings.some((warning) => !warning.acknowledged)) {
    blockers.push('Acknowledge every non-blocking warning before creation.')
  }
  if (draft.changes.some((change) => change.status === 'PROPOSED')) {
    blockers.push('Accept or reject every proposed cleanup before creation.')
  }
  if (draft.assumptions.some((assumption) => assumption.status === 'PROPOSED')) {
    blockers.push('Accept or reject every proposed assumption before creation.')
  }
  if (!draft.project.name) blockers.push('Enter a project name before creation.')
  if (!draft.project.clientName) blockers.push('Select or enter a client before creation.')
  if (!draft.project.projectManagerId) blockers.push('Select a project manager before creation.')
  if (!draft.project.plannedStart || !draft.project.plannedEnd) blockers.push('Enter project start and end dates before creation.')
  if (draft.project.plannedStart && draft.project.plannedEnd && draft.project.plannedEnd <= draft.project.plannedStart) blockers.push('Project end must be after project start.')
  if (sourceMethod && sourceMethod !== 'MANUAL' && draft.activities.length === 0) blockers.push('An imported or generated schedule must contain at least one activity.')
  const phaseIds = new Set(draft.phases.map((phase) => phase.id))
  const milestoneIds = new Set(draft.milestones.map((milestone) => milestone.id))
  const activityIds = new Set(draft.activities.map((activity) => activity.id))
  if (draft.milestones.some((milestone) => !phaseIds.has(milestone.phaseId))) blockers.push('Every milestone must belong to an existing phase.')
  if (draft.activities.some((activity) => !milestoneIds.has(activity.milestoneId))) blockers.push('Every activity must belong to an existing milestone.')
  if (draft.activities.some((activity) => activity.parentActivityId && !activityIds.has(activity.parentActivityId))) blockers.push('Every parent activity must exist in this draft.')
  if (draft.activities.some((activity) => activity.startDate && activity.endDate && activity.endDate < activity.startDate)) blockers.push('Activity end dates cannot be before their start dates.')
  if (draft.dependencies.some((dependency) => !activityIds.has(dependency.predecessorActivityId) || !activityIds.has(dependency.successorActivityId))) blockers.push('Every dependency must reference existing activities.')
  if (hasDependencyCycle(draft.dependencies)) blockers.push('Remove circular activity dependencies before creation.')
  return [...new Set(blockers)]
}

function hasDependencyCycle(
  dependencies: NormalizedProjectCreationDraft['dependencies'],
): boolean {
  const next = new Map<string, string[]>()
  for (const dependency of dependencies) {
    const successors = next.get(dependency.predecessorActivityId) ?? []
    successors.push(dependency.successorActivityId)
    next.set(dependency.predecessorActivityId, successors)
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    for (const successor of next.get(id) ?? []) if (visit(successor)) return true
    visiting.delete(id)
    visited.add(id)
    return false
  }
  return [...next.keys()].some(visit)
}
