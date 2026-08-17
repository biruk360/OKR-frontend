import type {
  NormalizedProjectCreationDraft,
  ProjectCreationJsonValue,
} from './creation-normalize'

export type CleanupChange = NormalizedProjectCreationDraft['changes'][number]
export type CleanupDecision = 'ACCEPT' | 'REJECT'

const SAFE_GROUP_KINDS = new Set<NonNullable<CleanupChange['kind']>>([
  'CAPITALIZATION',
  'WHITESPACE',
])
const BLOCKED_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor'])
const SAFE_TEXT_FIELDS = new Set([
  'name',
  'title',
  'description',
  'blockerDetails',
  'objective',
  'businessOutcome',
  'projectTypeOther',
])

export class ProjectCreationChangeConflictError extends Error {
  constructor(message: string, readonly changeId?: string) {
    super(message)
    this.name = 'ProjectCreationChangeConflictError'
  }
}

function pathSegments(path: string): string[] {
  const segments = path.startsWith('/')
    ? path.slice(1).split('/').map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    : path.split('.')
  if (segments.length < 1 || segments.some((segment) => !segment || BLOCKED_PATH_SEGMENTS.has(segment))) {
    throw new ProjectCreationChangeConflictError('The proposed cleanup has an invalid target path.')
  }
  return segments
}

function arrayIndex(value: unknown[], segment: string): number {
  if (/^\d+$/.test(segment)) return Number(segment)
  return value.findIndex((item) => (
    typeof item === 'object' && item !== null && 'id' in item
      && (item as { id?: unknown }).id === segment
  ))
}

function resolveParent(root: unknown, path: string): { parent: Record<string, unknown> | unknown[]; key: string | number } {
  const segments = pathSegments(path)
  let current: unknown = root
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(current)) {
      const index = arrayIndex(current, segment)
      if (index < 0 || index >= current.length) throw new ProjectCreationChangeConflictError('The proposed cleanup target no longer exists.')
      current = current[index]
    } else if (typeof current === 'object' && current !== null && Object.prototype.hasOwnProperty.call(current, segment)) {
      current = (current as Record<string, unknown>)[segment]
    } else {
      throw new ProjectCreationChangeConflictError('The proposed cleanup target no longer exists.')
    }
  }
  const last = segments.at(-1)!
  if (Array.isArray(current)) {
    const index = arrayIndex(current, last)
    if (index < 0 || index >= current.length) throw new ProjectCreationChangeConflictError('The proposed cleanup target no longer exists.')
    return { parent: current, key: index }
  }
  if (typeof current !== 'object' || current === null || !Object.prototype.hasOwnProperty.call(current, last)) {
    throw new ProjectCreationChangeConflictError('The proposed cleanup target no longer exists.')
  }
  return { parent: current as Record<string, unknown>, key: last }
}

function readTarget(root: unknown, path: string): ProjectCreationJsonValue {
  const { parent, key } = resolveParent(root, path)
  const value = Array.isArray(parent)
    ? parent[key as number]
    : parent[key as string]
  return structuredClone(value as ProjectCreationJsonValue)
}

function equalJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function applyAcceptedChange(draft: NormalizedProjectCreationDraft, change: CleanupChange): void {
  const currentValue = readTarget(draft, change.path)
  if (!equalJson(currentValue, change.originalValue)) {
    throw new ProjectCreationChangeConflictError(
      'This value was edited after the cleanup was proposed. Keep the user edit or undo it before accepting the AI proposal.',
      change.id,
    )
  }
  const { parent, key } = resolveParent(draft, change.path)
  if ((change.operation ?? 'REPLACE') === 'DELETE') {
    if (/^\d+$/.test(pathSegments(change.path).at(-1)!)) {
      throw new ProjectCreationChangeConflictError('Delete proposals must use a stable item ID, not a list position.', change.id)
    }
    if (!Array.isArray(parent) || typeof key !== 'number') {
      throw new ProjectCreationChangeConflictError('Delete proposals must target a complete list item.', change.id)
    }
    parent.splice(key, 1)
  } else {
    if (Array.isArray(parent)) parent[key as number] = structuredClone(change.proposedValue)
    else parent[key as string] = structuredClone(change.proposedValue)
  }
}

export function decideProjectCreationCleanupChanges(
  source: NormalizedProjectCreationDraft,
  changeIds: readonly string[],
  decision: CleanupDecision,
): NormalizedProjectCreationDraft {
  const ids = new Set(changeIds)
  if (ids.size < 1 || ids.size !== changeIds.length) {
    throw new ProjectCreationChangeConflictError('Choose one or more unique cleanup proposals.')
  }
  const draft = structuredClone(source)
  const selected = draft.changes.filter((change) => ids.has(change.id))
  if (selected.length !== ids.size) throw new ProjectCreationChangeConflictError('A selected cleanup proposal no longer exists.')
  if (selected.some((change) => change.status !== 'PROPOSED')) {
    throw new ProjectCreationChangeConflictError('Only undecided cleanup proposals can be changed.')
  }

  if (decision === 'ACCEPT') {
    for (const change of selected) applyAcceptedChange(draft, change)
  }
  for (const change of selected) change.status = decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED'
  return draft
}

export interface SafeCleanupChangeGroup {
  kind: 'CAPITALIZATION' | 'WHITESPACE'
  label: string
  changeIds: string[]
}

export function safeProjectCreationCleanupGroups(
  changes: readonly CleanupChange[],
): SafeCleanupChangeGroup[] {
  const groups = new Map<SafeCleanupChangeGroup['kind'], string[]>()
  for (const change of changes) {
    const kind = change.kind
    const operation = change.operation ?? 'REPLACE'
    if (change.status !== 'PROPOSED' || !kind || !SAFE_GROUP_KINDS.has(kind)) continue
    if (operation !== 'REPLACE' || typeof change.originalValue !== 'string' || typeof change.proposedValue !== 'string') continue
    if (!SAFE_TEXT_FIELDS.has(pathSegments(change.path).at(-1)!)) continue
    const originalWhitespace = change.originalValue.trim().replace(/\s+/g, ' ')
    const proposedWhitespace = change.proposedValue.trim().replace(/\s+/g, ' ')
    if (kind === 'WHITESPACE' && proposedWhitespace !== change.proposedValue) continue
    if (kind === 'WHITESPACE' && originalWhitespace !== proposedWhitespace) continue
    if (kind === 'CAPITALIZATION' && originalWhitespace.toLocaleLowerCase() !== proposedWhitespace.toLocaleLowerCase()) continue
    const ids = groups.get(kind as SafeCleanupChangeGroup['kind']) ?? []
    ids.push(change.id)
    groups.set(kind as SafeCleanupChangeGroup['kind'], ids)
  }
  return [...groups.entries()]
    .filter(([, changeIds]) => changeIds.length > 1)
    .map(([kind, changeIds]) => ({
      kind,
      label: kind === 'CAPITALIZATION' ? 'capitalization cleanups' : 'whitespace cleanups',
      changeIds,
    }))
}

function immutableProposal(change: CleanupChange): string {
  return JSON.stringify({
    id: change.id,
    path: change.path,
    kind: change.kind ?? 'OTHER',
    operation: change.operation ?? 'REPLACE',
    originalValue: change.originalValue,
    proposedValue: change.proposedValue,
    reason: change.reason,
    confidence: change.confidence,
    sourceIds: change.sourceIds,
  })
}

export function validateProjectCreationCleanupTransitions(
  current: NormalizedProjectCreationDraft,
  next: NormalizedProjectCreationDraft,
  options: { allowNewProposals?: boolean } = {},
): { acceptedIds: string[]; rejectedIds: string[] } {
  const currentById = new Map(current.changes.map((change) => [change.id, change]))
  const nextById = new Map(next.changes.map((change) => [change.id, change]))
  if (nextById.size !== next.changes.length) throw new ProjectCreationChangeConflictError('Cleanup proposal IDs must be unique.')
  if (!options.allowNewProposals && next.changes.some((change) => !currentById.has(change.id))) {
    throw new ProjectCreationChangeConflictError('Cleanup proposals can only be added by server-side processing.')
  }

  const acceptedIds: string[] = []
  const rejectedIds: string[] = []
  for (const currentChange of current.changes) {
    const nextChange = nextById.get(currentChange.id)
    if (!nextChange) throw new ProjectCreationChangeConflictError('Cleanup proposals must be accepted or rejected, not deleted.', currentChange.id)
    if (immutableProposal(currentChange) !== immutableProposal(nextChange)) {
      throw new ProjectCreationChangeConflictError('Cleanup proposal evidence cannot be edited.', currentChange.id)
    }
    if (currentChange.status !== 'PROPOSED' && nextChange.status !== currentChange.status) {
      throw new ProjectCreationChangeConflictError('Accepted or rejected cleanup decisions are final. Use Undo before saving to reconsider.', currentChange.id)
    }
    if (currentChange.status === 'PROPOSED' && nextChange.status === 'ACCEPTED') {
      const currentValue = readTarget(current, currentChange.path)
      if (!equalJson(currentValue, currentChange.originalValue)) {
        throw new ProjectCreationChangeConflictError('The cleanup target changed after it was proposed.', currentChange.id)
      }
      if ((currentChange.operation ?? 'REPLACE') === 'DELETE') {
        try {
          readTarget(next, currentChange.path)
          throw new ProjectCreationChangeConflictError('The accepted duplicate cleanup was not applied.', currentChange.id)
        } catch (error) {
          if (error instanceof ProjectCreationChangeConflictError && error.changeId === currentChange.id) throw error
        }
      } else if (!equalJson(readTarget(next, currentChange.path), currentChange.proposedValue)) {
        throw new ProjectCreationChangeConflictError('The accepted cleanup value was not applied.', currentChange.id)
      }
      acceptedIds.push(currentChange.id)
    } else if (currentChange.status === 'PROPOSED' && nextChange.status === 'REJECTED') {
      rejectedIds.push(currentChange.id)
    }
  }
  return { acceptedIds, rejectedIds }
}
