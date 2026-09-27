/**
 * Story 2.6 — server-owned provenance, confidence, and assumptions
 * (docs/PROJECT_CREATION_IMPORT_AI_REQUIREMENTS.md §10.3, AC12).
 *
 * Source records (`scheduleJson.sources`) are provenance evidence: type, reference,
 * excerpt, target paths, basis, confidence, and last editor. Only the server writes
 * them. A client draft save may not add, remove, or change any source record; the
 * server instead re-stamps the records whose targets the user edited
 * (lastEditor USER, basis USER_DECISION, confidence HIGH — the user's own value).
 *
 * Values that the server/AI infers without direct source support are recorded as
 * `AI_ASSUMPTION` sources plus a PROPOSED assumption, so they are labelled in review,
 * remain editable, and block commit until the user accepts or rejects them.
 */
import type {
  NormalizedProjectCreationDraft,
  ProjectCreationScheduleJson,
} from './creation-normalize'

type Source = ProjectCreationScheduleJson['sources'][number]
type Assumption = NormalizedProjectCreationDraft['assumptions'][number]

export const PROJECT_CREATION_PROVENANCE_FIELDS = [
  'type',
  'reference',
  'excerpt',
  'targetPaths',
  'basis',
  'confidence',
  'lastEditor',
] as const satisfies ReadonlyArray<keyof Source>

export class ProjectCreationProvenanceError extends Error {
  readonly code = 'PROVENANCE_SERVER_OWNED'

  constructor(message: string, readonly sourceId: string | null) {
    super(message)
    this.name = 'ProjectCreationProvenanceError'
  }
}

const COLLECTIONS = ['phases', 'milestones', 'activities', 'dependencies', 'deliverables', 'assumptions', 'questions'] as const
type Collection = (typeof COLLECTIONS)[number]

function stable(value: unknown): string {
  return JSON.stringify(value ?? null)
}

/**
 * A record of the user's own choice (e.g. the Manual flow's template selection).
 * Clients may add, change, or remove only these; they can never create, alter, or
 * remove imported/AI evidence or claim AI authorship.
 */
export function isUserDecisionSource(source: Source): boolean {
  return (source.type === 'USER_INPUT' || source.type === 'TEMPLATE')
    && source.basis === 'USER_DECISION'
    && source.lastEditor === 'USER'
    && source.confidence === 'HIGH'
}

/**
 * Rejects any client-side change to server-owned provenance: adding, removing, or
 * editing a source record other than a user-decision record. Order is irrelevant.
 */
export function assertClientProvenanceUnchanged(
  current: readonly Source[],
  submitted: readonly Source[],
): void {
  const currentById = new Map(current.map((source) => [source.id, source]))
  const submittedIds = new Set<string>()
  for (const source of submitted) {
    if (submittedIds.has(source.id)) {
      throw new ProjectCreationProvenanceError('Source records are server-owned and cannot be duplicated.', source.id)
    }
    submittedIds.add(source.id)
    const existing = currentById.get(source.id)
    if (!existing) {
      if (isUserDecisionSource(source)) continue
      throw new ProjectCreationProvenanceError('Source records are server-owned and cannot be added by a draft edit.', source.id)
    }
    if (isUserDecisionSource(existing) && isUserDecisionSource(source)) continue
    for (const field of PROJECT_CREATION_PROVENANCE_FIELDS) {
      if (stable(existing[field]) !== stable(source[field])) {
        throw new ProjectCreationProvenanceError(
          `Source ${field} is server-owned provenance and cannot be edited.`,
          source.id,
        )
      }
    }
  }
  for (const [id, source] of currentById) {
    if (!submittedIds.has(id) && !isUserDecisionSource(source)) {
      throw new ProjectCreationProvenanceError('Source records are server-owned and cannot be removed by a draft edit.', id)
    }
  }
}

interface ResolvedTarget {
  found: boolean
  value: unknown
}

/**
 * Resolves `activities.0`, `activities.activity-1`, `activities.activity-1.endDate`,
 * `/activities/activity-1/endDate`, `project.name`, or `project`. Index-based paths are
 * resolved against the previous draft so a reorder does not look like an edit.
 */
function resolveTarget(
  draft: NormalizedProjectCreationDraft,
  path: string,
  indexBase: NormalizedProjectCreationDraft,
): ResolvedTarget {
  const parts = path.replace(/^\//, '').split(/[./]/).filter(Boolean)
  const [head, key, field] = parts
  if (head === 'project') {
    if (!key) return { found: true, value: draft.project }
    return { found: key in draft.project, value: (draft.project as Record<string, unknown>)[key] }
  }
  if (!COLLECTIONS.includes(head as Collection) || !key) return { found: false, value: undefined }
  const collection = draft[head as Collection] as ReadonlyArray<{ id: string }>
  const baseCollection = indexBase[head as Collection] as ReadonlyArray<{ id: string }>
  const id = /^\d+$/.test(key) ? baseCollection[Number(key)]?.id : key
  const item = id ? collection.find((candidate) => candidate.id === id) : undefined
  if (!item) return { found: false, value: undefined }
  if (!field) return { found: true, value: item }
  return { found: field in item, value: (item as unknown as Record<string, unknown>)[field] }
}

function targetChanged(
  previous: NormalizedProjectCreationDraft,
  next: NormalizedProjectCreationDraft,
  path: string,
): boolean {
  const before = resolveTarget(previous, path, previous)
  const after = resolveTarget(next, path, previous)
  if (!before.found) return false
  if (!after.found) return false // deleted: evidence of the original stays as imported
  return stable(before.value) !== stable(after.value)
}

/**
 * Server-side stamping for a user edit: every source whose target changed becomes
 * `lastEditor: USER`, `basis: USER_DECISION`, `confidence: HIGH`. Server-owned
 * records are always taken from the previous (stored) draft, never from the client.
 */
export function applyUserEditProvenance(
  previous: NormalizedProjectCreationDraft,
  next: NormalizedProjectCreationDraft,
): Source[] {
  const previousById = new Map(previous.sources.map((source) => [source.id, source]))
  return next.sources.map((submitted) => {
    const source = previousById.get(submitted.id)
    // User-decision records (validated by assertClientProvenanceUnchanged) pass through.
    if (!source || isUserDecisionSource(source)) return submitted
    const edited = source.targetPaths.some((path) => targetChanged(previous, next, path))
    if (!edited) return source
    if (source.lastEditor === 'USER' && source.basis === 'USER_DECISION' && source.confidence === 'HIGH') return source
    return { ...source, lastEditor: 'USER', basis: 'USER_DECISION', confidence: 'HIGH' }
  })
}

const INFERRED_FIELDS: Array<{ collection: 'deliverables' | 'milestones' | 'activities'; field: string; category: Assumption['category'] }> = [
  { collection: 'deliverables', field: 'dueDate', category: 'DATE' },
  { collection: 'deliverables', field: 'ownerParty', category: 'OWNERSHIP' },
  { collection: 'milestones', field: 'dueDate', category: 'DATE' },
  { collection: 'activities', field: 'startDate', category: 'DATE' },
  { collection: 'activities', field: 'endDate', category: 'DATE' },
]

function labelFor(collection: string, item: Record<string, unknown>): string {
  const name = typeof item.name === 'string' ? item.name : typeof item.title === 'string' ? item.title : String(item.id)
  return `${collection.replace(/s$/, '')} "${name}"`
}

/**
 * AC12 — labels values an AI (or other inference) filled in where the previous draft
 * had none. For every such date/owner value it adds an `AI_ASSUMPTION` source
 * (basis INFERRED_RECOMMENDATION, lastEditor AI, confidence LOW) and a PROPOSED
 * assumption naming the path. The value itself stays an ordinary editable field.
 * Call it on the server after any AI generation/revision, before saving the draft.
 */
export function labelProjectCreationInferredValues(
  previous: NormalizedProjectCreationDraft,
  next: NormalizedProjectCreationDraft,
  options: { reason?: string; confidence?: 'MEDIUM' | 'LOW' } = {},
): NormalizedProjectCreationDraft {
  const labelled: NormalizedProjectCreationDraft = {
    ...next,
    sources: [...next.sources],
    assumptions: [...next.assumptions],
  }
  const existingTargets = new Set(labelled.sources.flatMap((source) => source.targetPaths))
  let sequence = labelled.sources.filter((source) => source.id.startsWith('inferred-')).length
  for (const { collection, field, category } of INFERRED_FIELDS) {
    for (const item of next[collection] as unknown as Array<Record<string, unknown> & { id: string }>) {
      const value = item[field]
      if (value === null || value === undefined || value === '') continue
      const before = (previous[collection] as unknown as Array<Record<string, unknown> & { id: string }>)
        .find((candidate) => candidate.id === item.id)
      const hadValue = before !== undefined && before[field] !== null && before[field] !== undefined && before[field] !== ''
      if (hadValue) continue
      const path = `${collection}.${item.id}.${field}`
      if (existingTargets.has(path)) continue
      sequence += 1
      const sourceId = `inferred-${sequence}`
      const text = `${options.reason ?? 'AI proposed this value because the source did not provide one.'} ${labelFor(collection, item)} ${field} = ${String(value)}.`
      labelled.sources.push({
        id: sourceId,
        type: 'AI_ASSUMPTION',
        reference: `AI assumption for ${labelFor(collection, item)} ${field}`.slice(0, 500),
        excerpt: null,
        targetPaths: [path],
        basis: 'INFERRED_RECOMMENDATION',
        confidence: options.confidence ?? 'LOW',
        lastEditor: 'AI',
      })
      labelled.assumptions.push({
        id: `assumption-${sourceId}`,
        text: text.slice(0, 2_000),
        category,
        affectedPaths: [path],
        sourceIds: [sourceId],
        status: 'PROPOSED',
      })
      existingTargets.add(path)
    }
  }
  return labelled
}

/** True when `path` (or its parent item) is the target of an assumption-type source. */
export function isProjectCreationAssumptionTarget(
  sources: readonly Source[],
  collection: string,
  id: string,
): boolean {
  return sources.some((source) => (source.type === 'AI_ASSUMPTION' || source.basis === 'INFERRED_RECOMMENDATION')
    && source.targetPaths.some((path) => path === `${collection}.${id}` || path.startsWith(`${collection}.${id}.`)))
}
