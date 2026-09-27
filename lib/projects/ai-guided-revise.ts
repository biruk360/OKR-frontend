import { createHmac, timingSafeEqual } from 'crypto'
import type { NormalizedProjectCreationDraft } from './creation-normalize'
import {
  AI_GUIDED_CAPS,
  aiGuidedRevisionOutputSchema,
  type AiGuidedRevisionOperation,
  type AiGuidedRevisionOutput,
} from './ai-guided-schema'
import {
  AI_GUIDED_IDS,
  aiGuidedCanonicalJson,
  aiGuidedFingerprint,
  enforceAiGuidedScheduleRules,
  markAiGuidedRowUserOwned,
  normalizeAiGuidedDraftWeights,
  readAiGuidedRowFingerprint,
  resolveAiGuidedAssignee,
  syncAiGuidedMilestoneAndPhaseDates,
  upsertAiGuidedRowSource,
  type AiGuidedActiveUser,
  type AiGuidedCollection,
  type AiGuidedIdFactory,
} from './ai-guided-schedule'
import type { AiGuidedBrief } from './ai-guided-brief'

/**
 * Story 3.7 — constrained AI revision with affected-count preview, diff,
 * conflict highlighting against direct user edits, and undo (§9.6, AC19).
 *
 * The model returns a small operation list against short refs; the server
 * applies it deterministically, re-runs the §9.5 rules, and diffs the result.
 * Preview never writes. Apply re-derives the exact same result from an
 * HMAC-signed preview token bound to the draft id and version, so what the PM
 * saw is what is applied. The diff is stored as ACCEPTED `changes` entries
 * (original → proposed) and can be undone.
 */

type Draft = NormalizedProjectCreationDraft
type Activity = Draft['activities'][number]

export interface AiGuidedRevisionContext {
  refToId: Map<string, string>
  idToRef: Map<string, string>
  plan: {
    project: { plannedStart: string | null; plannedEnd: string | null }
    phases: Array<{ ref: string; name: string; start: string | null; end: string | null }>
    milestones: Array<{ ref: string; phaseRef: string; name: string; dueDate: string | null; isDeliverable: boolean }>
    activities: Array<{ ref: string; milestoneRef: string; parentRef: string | null; title: string; start: string | null; end: string | null; ownerParty: string; role: string | null; assigned: boolean; isApproval: boolean }>
    links: Array<{ ref: string; predecessorRef: string; successorRef: string; type: string; lagDays: number }>
  }
  constraints: {
    plannedStart: string | null
    plannedEnd: string | null
    workingDays: string[]
    nonWorkingDates: string[]
    allowWorkOnNonWorkingDays: boolean
    maxOperations: number
  }
}

function sortedBy<T>(items: T[], key: (item: T) => number): T[] {
  return [...items].sort((left, right) => key(left) - key(right))
}

/** Short, position-ordered refs so the model never sees internal ids or people. */
export function buildAiGuidedRevisionContext(draft: Draft): AiGuidedRevisionContext {
  const refToId = new Map<string, string>()
  const idToRef = new Map<string, string>()
  const assign = (prefix: string, index: number, id: string) => {
    const ref = `${prefix}${index + 1}`
    refToId.set(ref, id)
    idToRef.set(id, ref)
    return ref
  }
  const phases = sortedBy(draft.phases, (phase) => phase.position)
  phases.forEach((phase, index) => assign('P', index, phase.id))
  const phaseOrder = new Map(phases.map((phase, index) => [phase.id, index]))
  const milestones = [...draft.milestones].sort((left, right) => (
    (phaseOrder.get(left.phaseId) ?? 0) - (phaseOrder.get(right.phaseId) ?? 0) || left.position - right.position
  ))
  milestones.forEach((milestone, index) => assign('M', index, milestone.id))
  const milestoneOrder = new Map(milestones.map((milestone, index) => [milestone.id, index]))
  const topLevel = draft.activities.filter((activity) => !activity.parentActivityId)
    .sort((left, right) => (milestoneOrder.get(left.milestoneId) ?? 0) - (milestoneOrder.get(right.milestoneId) ?? 0) || left.position - right.position)
  const ordered: Activity[] = []
  for (const parent of topLevel) {
    ordered.push(parent)
    ordered.push(...sortedBy(draft.activities.filter((activity) => activity.parentActivityId === parent.id), (activity) => activity.position))
  }
  ordered.push(...draft.activities.filter((activity) => !ordered.includes(activity)))
  ordered.forEach((activity, index) => assign('A', index, activity.id))
  draft.dependencies.forEach((dependency, index) => assign('L', index, dependency.id))
  const deliverableMilestones = new Set(draft.deliverables.map((deliverable) => deliverable.milestoneId))
  return {
    refToId,
    idToRef,
    plan: {
      project: { plannedStart: draft.project.plannedStart, plannedEnd: draft.project.plannedEnd },
      phases: phases.map((phase) => ({ ref: idToRef.get(phase.id)!, name: phase.name, start: phase.plannedStart, end: phase.plannedEnd })),
      milestones: milestones.map((milestone) => ({
        ref: idToRef.get(milestone.id)!,
        phaseRef: idToRef.get(milestone.phaseId) ?? '?',
        name: milestone.name,
        dueDate: milestone.dueDate,
        isDeliverable: deliverableMilestones.has(milestone.id),
      })),
      activities: ordered.map((activity) => ({
        ref: idToRef.get(activity.id)!,
        milestoneRef: idToRef.get(activity.milestoneId) ?? '?',
        parentRef: activity.parentActivityId ? idToRef.get(activity.parentActivityId) ?? null : null,
        title: activity.title,
        start: activity.startDate,
        end: activity.endDate,
        ownerParty: activity.ownerParty,
        role: activity.suggestedRole,
        // Identity never leaves the server: only whether someone is assigned.
        assigned: Boolean(activity.assigneeId),
        isApproval: activity.isApproval,
      })),
      links: draft.dependencies.map((dependency) => ({
        ref: idToRef.get(dependency.id)!,
        predecessorRef: idToRef.get(dependency.predecessorActivityId) ?? '?',
        successorRef: idToRef.get(dependency.successorActivityId) ?? '?',
        type: dependency.type,
        lagDays: dependency.lagDays,
      })),
    },
    constraints: {
      plannedStart: draft.project.plannedStart,
      plannedEnd: draft.project.plannedEnd,
      workingDays: draft.project.workingCalendar.workingDays,
      nonWorkingDates: draft.project.workingCalendar.nonWorkingDates.slice(0, 60),
      allowWorkOnNonWorkingDays: draft.project.workingCalendar.allowNonWorkingDates,
      maxOperations: AI_GUIDED_CAPS.revisionOperations,
    },
  }
}

export interface AppliedAiGuidedRevision {
  draft: Draft
  touchedIds: Set<string>
}

function assertOp(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

/**
 * Applies revision operations deterministically. Throws a readable message when
 * an operation is not applicable (unknown ref, missing field) so the repair round
 * can correct it — and so a forged/stale token can never apply partial work.
 */
export function applyAiGuidedRevisionOperations(input: {
  draft: Draft
  output: AiGuidedRevisionOutput
  context: AiGuidedRevisionContext
  brief: AiGuidedBrief | null
  activeUsers: readonly AiGuidedActiveUser[]
  idFactory: AiGuidedIdFactory
}): AppliedAiGuidedRevision {
  const output = aiGuidedRevisionOutputSchema.parse(input.output)
  const draft = structuredClone(input.draft)
  const refs = new Map(input.context.refToId)
  const touched = new Set<string>()
  const resolve = (ref: string | null, label: string) => {
    assertOp(ref, `${label} is required`)
    const id = refs.get(ref)
    assertOp(id, `${label} ${ref} does not exist`)
    return id
  }
  const phaseById = (id: string) => draft.phases.find((phase) => phase.id === id)
  const milestoneById = (id: string) => draft.milestones.find((milestone) => milestone.id === id)
  const activityById = (id: string) => draft.activities.find((activity) => activity.id === id)
  const claimNewRef = (op: AiGuidedRevisionOperation, id: string) => {
    if (!op.newRef) return
    assertOp(!refs.has(op.newRef), `newRef ${op.newRef} is already used`)
    refs.set(op.newRef, id)
  }
  const removeActivities = (ids: Set<string>) => {
    for (const activity of draft.activities) if (activity.parentActivityId && ids.has(activity.parentActivityId)) ids.add(activity.id)
    draft.activities = draft.activities.filter((activity) => !ids.has(activity.id))
    draft.dependencies = draft.dependencies.filter((dependency) => !ids.has(dependency.predecessorActivityId) && !ids.has(dependency.successorActivityId))
    for (const deliverable of draft.deliverables) {
      deliverable.producingActivityIds = deliverable.producingActivityIds.filter((id) => !ids.has(id))
      if (deliverable.approvalActivityId && ids.has(deliverable.approvalActivityId)) deliverable.approvalActivityId = null
    }
  }
  const removeMilestones = (ids: Set<string>) => {
    removeActivities(new Set(draft.activities.filter((activity) => ids.has(activity.milestoneId)).map((activity) => activity.id)))
    draft.milestones = draft.milestones.filter((milestone) => !ids.has(milestone.id))
    draft.deliverables = draft.deliverables.filter((deliverable) => !ids.has(deliverable.milestoneId))
  }
  const assignee = (op: AiGuidedRevisionOperation) => resolveAiGuidedAssignee({
    teamRef: null,
    suggestedRole: op.suggestedRole,
    team: input.brief?.team ?? [],
    activeUsers: input.activeUsers,
  })

  for (const op of output.operations) {
    switch (op.op) {
      case 'ADD_PHASE': {
        assertOp(op.name, 'ADD_PHASE requires name')
        const phase = { id: input.idFactory('aiphase'), name: op.name, position: draft.phases.length, weight: 0, plannedStart: null, plannedEnd: null }
        draft.phases.push(phase)
        claimNewRef(op, phase.id)
        touched.add(phase.id)
        touched.add('project')
        break
      }
      case 'UPDATE_PHASE': {
        const phase = phaseById(resolve(op.targetRef, 'targetRef'))
        assertOp(phase, 'UPDATE_PHASE target is not a phase')
        if (op.name) phase.name = op.name
        touched.add(phase.id)
        break
      }
      case 'DELETE_PHASE': {
        const id = resolve(op.targetRef, 'targetRef')
        assertOp(phaseById(id), 'DELETE_PHASE target is not a phase')
        removeMilestones(new Set(draft.milestones.filter((milestone) => milestone.phaseId === id).map((milestone) => milestone.id)))
        draft.phases = draft.phases.filter((phase) => phase.id !== id)
        touched.add('project')
        break
      }
      case 'ADD_MILESTONE': {
        assertOp(op.name, 'ADD_MILESTONE requires name')
        const phaseId = resolve(op.phaseRef, 'phaseRef')
        assertOp(phaseById(phaseId), 'ADD_MILESTONE phaseRef is not a phase')
        const milestone = {
          id: input.idFactory('aimilestone'),
          name: op.name,
          position: draft.milestones.filter((item) => item.phaseId === phaseId).length,
          weight: 0,
          phaseId,
          isKeyMilestone: false,
          dueDate: op.endDate ?? op.startDate ?? null,
        }
        draft.milestones.push(milestone)
        claimNewRef(op, milestone.id)
        touched.add(milestone.id)
        touched.add(phaseId)
        break
      }
      case 'UPDATE_MILESTONE': {
        const milestone = milestoneById(resolve(op.targetRef, 'targetRef'))
        assertOp(milestone, 'UPDATE_MILESTONE target is not a milestone')
        if (op.name) milestone.name = op.name
        if (op.phaseRef) {
          const phaseId = resolve(op.phaseRef, 'phaseRef')
          assertOp(phaseById(phaseId), 'UPDATE_MILESTONE phaseRef is not a phase')
          touched.add(milestone.phaseId)
          milestone.phaseId = phaseId
          touched.add(phaseId)
        }
        touched.add(milestone.id)
        break
      }
      case 'DELETE_MILESTONE': {
        const id = resolve(op.targetRef, 'targetRef')
        const milestone = milestoneById(id)
        assertOp(milestone, 'DELETE_MILESTONE target is not a milestone')
        touched.add(milestone.phaseId)
        removeMilestones(new Set([id]))
        break
      }
      case 'ADD_ACTIVITY': {
        assertOp(op.name, 'ADD_ACTIVITY requires name')
        assertOp(op.startDate && op.endDate, 'ADD_ACTIVITY requires startDate and endDate')
        const milestoneId = resolve(op.milestoneRef, 'milestoneRef')
        assertOp(milestoneById(milestoneId), 'ADD_ACTIVITY milestoneRef is not a milestone')
        const parentActivityId = op.parentRef ? resolve(op.parentRef, 'parentRef') : null
        if (parentActivityId) {
          const parent = activityById(parentActivityId)
          assertOp(parent && !parent.parentActivityId && parent.milestoneId === milestoneId, 'ADD_ACTIVITY parentRef must be a top-level activity in the same milestone')
        }
        const person = assignee(op)
        const activity: Activity = {
          id: input.idFactory('aiactivity'),
          sourceRowId: null,
          milestoneId,
          parentActivityId,
          position: draft.activities.filter((item) => item.milestoneId === milestoneId && item.parentActivityId === parentActivityId).length,
          title: op.name,
          description: op.description,
          ownerParty: op.ownerParty ?? '360GROUND',
          assigneeId: null,
          assigneeEmail: null,
          suggestedRole: person.suggestedRole,
          startDate: op.startDate <= op.endDate ? op.startDate : op.endDate,
          endDate: op.startDate <= op.endDate ? op.endDate : op.startDate,
          weight: 0,
          estimatedHours: op.estimatedHours,
          priority: op.priority,
          risk: op.risk,
          isBlocked: false,
          blockerDetails: null,
          isApproval: op.isApproval ?? false,
        }
        draft.activities.push(activity)
        claimNewRef(op, activity.id)
        touched.add(activity.id)
        touched.add(parentActivityId ?? milestoneId)
        break
      }
      case 'UPDATE_ACTIVITY': {
        const activity = activityById(resolve(op.targetRef, 'targetRef'))
        assertOp(activity, 'UPDATE_ACTIVITY target is not an activity')
        if (op.name) activity.title = op.name
        if (op.description) activity.description = op.description
        if (op.ownerParty) activity.ownerParty = op.ownerParty
        if (op.suggestedRole) activity.suggestedRole = assignee(op).suggestedRole
        if (op.isApproval !== null) activity.isApproval = op.isApproval
        if (op.priority) activity.priority = op.priority
        if (op.risk) activity.risk = op.risk
        if (op.estimatedHours !== null) activity.estimatedHours = op.estimatedHours
        if (op.startDate) activity.startDate = op.startDate
        if (op.endDate) activity.endDate = op.endDate
        if (activity.startDate && activity.endDate && activity.endDate < activity.startDate) activity.endDate = activity.startDate
        if (op.milestoneRef) {
          const milestoneId = resolve(op.milestoneRef, 'milestoneRef')
          assertOp(milestoneById(milestoneId), 'UPDATE_ACTIVITY milestoneRef is not a milestone')
          touched.add(activity.milestoneId)
          activity.milestoneId = milestoneId
          activity.parentActivityId = null
          for (const child of draft.activities) {
            if (child.parentActivityId === activity.id) {
              child.milestoneId = milestoneId
              touched.add(child.id)
            }
          }
          touched.add(milestoneId)
        }
        touched.add(activity.id)
        break
      }
      case 'DELETE_ACTIVITY': {
        const id = resolve(op.targetRef, 'targetRef')
        const activity = activityById(id)
        assertOp(activity, 'DELETE_ACTIVITY target is not an activity')
        touched.add(activity.parentActivityId ?? activity.milestoneId)
        removeActivities(new Set([id]))
        break
      }
      case 'ADD_DEPENDENCY': {
        const predecessorActivityId = resolve(op.predecessorRef, 'predecessorRef')
        const successorActivityId = resolve(op.successorRef, 'successorRef')
        assertOp(activityById(predecessorActivityId) && activityById(successorActivityId), 'ADD_DEPENDENCY must link two activities')
        assertOp(predecessorActivityId !== successorActivityId, 'ADD_DEPENDENCY cannot link an activity to itself')
        if (draft.dependencies.some((dependency) => dependency.predecessorActivityId === predecessorActivityId && dependency.successorActivityId === successorActivityId)) break
        const dependency = {
          id: input.idFactory('aidependency'),
          predecessorActivityId,
          successorActivityId,
          type: op.dependencyType ?? 'FS',
          lagDays: op.lagDays ?? 0,
        }
        draft.dependencies.push(dependency)
        claimNewRef(op, dependency.id)
        touched.add(successorActivityId)
        break
      }
      case 'DELETE_DEPENDENCY': {
        const id = resolve(op.targetRef, 'targetRef')
        assertOp(draft.dependencies.some((dependency) => dependency.id === id), 'DELETE_DEPENDENCY target is not a dependency link')
        draft.dependencies = draft.dependencies.filter((dependency) => dependency.id !== id)
        break
      }
      case 'SET_CALENDAR': {
        assertOp(op.workingDays || op.allowNonWorkingDates !== null, 'SET_CALENDAR requires workingDays or allowNonWorkingDates')
        draft.project.workingCalendar = {
          ...draft.project.workingCalendar,
          mode: 'CUSTOM',
          workingDays: op.workingDays ? [...new Set(op.workingDays)] : draft.project.workingCalendar.workingDays,
          allowNonWorkingDates: op.allowNonWorkingDates ?? draft.project.workingCalendar.allowNonWorkingDates,
        }
        touched.add('calendar')
        break
      }
    }
  }

  // Cycle guard: a revision may not introduce a circular dependency.
  const next = new Map<string, string[]>()
  for (const dependency of draft.dependencies) {
    next.set(dependency.predecessorActivityId, [...(next.get(dependency.predecessorActivityId) ?? []), dependency.successorActivityId])
  }
  const visiting = new Set<string>()
  const done = new Set<string>()
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (done.has(id)) return false
    visiting.add(id)
    for (const successor of next.get(id) ?? []) if (visit(successor)) return true
    visiting.delete(id)
    done.add(id)
    return false
  }
  assertOp(![...next.keys()].some(visit), 'The operations create a circular dependency')

  const snapIds: Set<string> | 'ALL' = touched.has('calendar') ? 'ALL' : new Set(touched)
  enforceAiGuidedScheduleRules(draft, { snapIds })
  syncAiGuidedMilestoneAndPhaseDates(draft)
  normalizeAiGuidedDraftWeights(draft, touched)
  return { draft, touchedIds: touched }
}

// ---------------------------------------------------------------------------
// Diff + conflicts
// ---------------------------------------------------------------------------

export interface AiGuidedDiffEntry {
  path: string
  collection: AiGuidedCollection | 'project'
  id: string
  kind: 'ADDED' | 'REMOVED' | 'UPDATED'
  label: string
  fields: Array<{ field: string; before: unknown; after: unknown }>
  before: unknown
  after: unknown
  conflict: boolean
}

const COLLECTIONS: AiGuidedCollection[] = ['phases', 'milestones', 'activities', 'dependencies', 'deliverables']

function rowLabel(collection: AiGuidedCollection, row: Record<string, unknown>): string {
  const text = (row.title ?? row.name) as string | undefined
  if (text) return text
  if (collection === 'dependencies') return `${row.type} link`
  return collection.slice(0, -1)
}

/**
 * A row conflicts when the PM changed it directly after the AI proposed it
 * (fingerprint mismatch) or created it themselves (no AI fingerprint).
 */
export function isAiGuidedUserEdited(draft: Draft, row: { id: string }): boolean {
  const fingerprint = readAiGuidedRowFingerprint(draft, row.id)
  return fingerprint === null || fingerprint !== aiGuidedFingerprint(row)
}

export function diffAiGuidedDrafts(before: Draft, after: Draft): AiGuidedDiffEntry[] {
  const entries: AiGuidedDiffEntry[] = []
  for (const collection of COLLECTIONS) {
    const beforeRows = new Map((before[collection] as Array<{ id: string }>).map((row) => [row.id, row]))
    const afterRows = new Map((after[collection] as Array<{ id: string }>).map((row) => [row.id, row]))
    for (const [id, row] of afterRows) {
      const previous = beforeRows.get(id)
      if (!previous) {
        entries.push({ path: `${collection}.${id}`, collection, id, kind: 'ADDED', label: rowLabel(collection, row as never), fields: [], before: null, after: row, conflict: false })
        continue
      }
      if (aiGuidedCanonicalJson(previous) === aiGuidedCanonicalJson(row)) continue
      const fields = Object.keys(row)
        .filter((field) => aiGuidedCanonicalJson((previous as Record<string, unknown>)[field]) !== aiGuidedCanonicalJson((row as Record<string, unknown>)[field]))
        .map((field) => ({ field, before: (previous as Record<string, unknown>)[field], after: (row as Record<string, unknown>)[field] }))
      entries.push({ path: `${collection}.${id}`, collection, id, kind: 'UPDATED', label: rowLabel(collection, row as never), fields, before: previous, after: row, conflict: isAiGuidedUserEdited(before, previous) })
    }
    for (const [id, row] of beforeRows) {
      if (afterRows.has(id)) continue
      entries.push({ path: `${collection}.${id}`, collection, id, kind: 'REMOVED', label: rowLabel(collection, row as never), fields: [], before: row, after: null, conflict: isAiGuidedUserEdited(before, row) })
    }
  }
  if (aiGuidedCanonicalJson(before.project.workingCalendar) !== aiGuidedCanonicalJson(after.project.workingCalendar)) {
    entries.push({
      path: 'project.workingCalendar',
      collection: 'project',
      id: 'workingCalendar',
      kind: 'UPDATED',
      label: 'Working calendar',
      fields: [{ field: 'workingCalendar', before: before.project.workingCalendar, after: after.project.workingCalendar }],
      before: before.project.workingCalendar,
      after: after.project.workingCalendar,
      conflict: false,
    })
  }
  return entries
}

// ---------------------------------------------------------------------------
// Signed preview token
// ---------------------------------------------------------------------------

export interface AiGuidedRevisionTokenPayload {
  draftId: string
  version: number
  revisionId: string
  instruction: string
  output: AiGuidedRevisionOutput
  expiresAt: number
}

export const AI_GUIDED_PREVIEW_TTL_MS = 30 * 60_000

export class AiGuidedPreviewTokenError extends Error {
  constructor(message = 'This revision preview is no longer valid. Preview it again.') {
    super(message)
    this.name = 'AiGuidedPreviewTokenError'
  }
}

function sign(secret: string, body: string) {
  return createHmac('sha256', secret).update(`project-creation-ai-revision:v1:${body}`).digest('hex')
}

export function signAiGuidedRevisionToken(payload: AiGuidedRevisionTokenPayload, secret: string): string {
  if (!secret) throw new AiGuidedPreviewTokenError('Revision previews are not configured on this server.')
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${body}.${sign(secret, body)}`
}

export function verifyAiGuidedRevisionToken(token: string, secret: string, now = Date.now()): AiGuidedRevisionTokenPayload {
  if (!secret) throw new AiGuidedPreviewTokenError('Revision previews are not configured on this server.')
  const [body, signature] = token.split('.')
  if (!body || !signature || !/^[a-f0-9]{64}$/.test(signature)) throw new AiGuidedPreviewTokenError()
  const expected = Buffer.from(sign(secret, body), 'hex')
  const actual = Buffer.from(signature, 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new AiGuidedPreviewTokenError()
  let payload: AiGuidedRevisionTokenPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    throw new AiGuidedPreviewTokenError()
  }
  if (typeof payload.expiresAt !== 'number' || payload.expiresAt < now) throw new AiGuidedPreviewTokenError('This revision preview expired. Preview it again.')
  return { ...payload, output: aiGuidedRevisionOutputSchema.parse(payload.output) }
}

// ---------------------------------------------------------------------------
// Recording an applied revision and undoing it
// ---------------------------------------------------------------------------

const OVERRODE = ' — overrode a direct user edit'

/**
 * Stores the diff as ACCEPTED change entries (original → proposed), refreshes
 * AI fingerprints on touched rows, and adds a PROPOSED acceptance gate so the
 * revised rows still require the PM's acceptance before commit.
 */
export function recordAiGuidedRevision(input: {
  after: Draft
  entries: AiGuidedDiffEntry[]
  revisionId: string
  instruction: string
  summary: string
}): Draft {
  const draft = structuredClone(input.after)
  const sourceId = `${AI_GUIDED_IDS.revision}${input.revisionId}`
  const short = input.revisionId.slice(0, 8)
  input.entries.forEach((entry, index) => {
    draft.changes.push({
      id: `${AI_GUIDED_IDS.revision}${input.revisionId}-${index + 1}`,
      path: entry.path,
      kind: 'OTHER',
      operation: 'REPLACE',
      originalValue: entry.before as never,
      proposedValue: entry.after as never,
      reason: `AI revision ${short}: ${input.summary}`.slice(0, 950) + (entry.conflict ? OVERRODE : ''),
      confidence: 'MEDIUM',
      sourceIds: [sourceId],
      status: 'ACCEPTED',
    })
    if (entry.collection !== 'project' && entry.after) {
      upsertAiGuidedRowSource(draft, entry.collection, entry.after as { id: string }, {
        reference: `AI revision ${short}`,
        basis: 'INFERRED',
        confidence: 'MEDIUM',
      })
    }
  })
  draft.sources.push({
    id: sourceId,
    type: 'AI_ASSUMPTION',
    reference: `AI revision ${short} · ${input.entries.length} items`,
    excerpt: `Instruction: ${input.instruction}`.slice(0, 1_000),
    targetPaths: input.entries.length > 0 ? input.entries.map((entry) => entry.path).slice(0, 100) : ['phases'],
    basis: 'INFERRED_RECOMMENDATION',
    confidence: 'MEDIUM',
    lastEditor: 'AI',
  })
  const changedRows = input.entries.filter((entry) => entry.kind !== 'REMOVED')
  if (changedRows.length > 0) {
    draft.assumptions.push({
      id: `${AI_GUIDED_IDS.gate}rev-${input.revisionId}`,
      text: `Accept the ${changedRows.length} items added or changed by AI revision “${input.summary}”.`.slice(0, 2_000),
      category: 'OTHER',
      affectedPaths: changedRows.map((entry) => entry.path).slice(0, 100),
      sourceIds: [sourceId],
      status: 'PROPOSED',
    })
  }
  return draft
}

export interface AiGuidedRevisionSummary {
  revisionId: string
  reference: string
  instruction: string
  itemCount: number
  undone: boolean
  createdByUndo: boolean
}

export function listAiGuidedRevisions(draft: Draft): AiGuidedRevisionSummary[] {
  return draft.sources
    .filter((source) => source.id.startsWith(AI_GUIDED_IDS.revision) && !source.id.startsWith(AI_GUIDED_IDS.revisionUndo))
    .map((source) => {
      const revisionId = source.id.slice(AI_GUIDED_IDS.revision.length)
      return {
        revisionId,
        reference: source.reference,
        instruction: (source.excerpt ?? '').replace(/^Instruction: /, ''),
        itemCount: draft.changes.filter((change) => change.id.startsWith(`${AI_GUIDED_IDS.revision}${revisionId}-`)).length,
        undone: draft.sources.some((candidate) => candidate.id === `${AI_GUIDED_IDS.revisionUndo}${revisionId}`),
        createdByUndo: false,
      }
    })
}

function readPath(draft: Draft, path: string): unknown {
  const [collection, id] = path.split('.')
  if (collection === 'project') return (draft.project as Record<string, unknown>)[id] ?? null
  return (draft[collection as AiGuidedCollection] as Array<{ id: string }>).find((row) => row.id === id) ?? null
}

export interface AiGuidedUndoResult {
  draft: Draft
  conflicts: Array<{ path: string; label: string }>
  restored: number
}

/**
 * Reverts one applied revision. Items changed again after the revision are
 * reported as conflicts; they are only overwritten when `acceptConflicts`.
 */
export function undoAiGuidedRevision(input: {
  draft: Draft
  revisionId: string
  acceptConflicts: boolean
}): AiGuidedUndoResult {
  const draft = structuredClone(input.draft)
  const prefix = `${AI_GUIDED_IDS.revision}${input.revisionId}-`
  const changes = draft.changes.filter((change) => change.id.startsWith(prefix) && change.status === 'ACCEPTED')
  if (changes.length === 0 || !draft.sources.some((source) => source.id === `${AI_GUIDED_IDS.revision}${input.revisionId}`)) {
    throw new Error('This AI revision does not exist in the draft.')
  }
  if (draft.sources.some((source) => source.id === `${AI_GUIDED_IDS.revisionUndo}${input.revisionId}`)) {
    throw new Error('This AI revision has already been undone.')
  }
  const conflicts = changes
    .filter((change) => aiGuidedCanonicalJson(readPath(draft, change.path)) !== aiGuidedCanonicalJson(change.proposedValue))
    .map((change) => {
      const current = readPath(draft, change.path) as Record<string, unknown> | null
      const original = change.originalValue as Record<string, unknown> | null
      return { path: change.path, label: String(current?.title ?? current?.name ?? original?.title ?? original?.name ?? change.path) }
    })
  if (conflicts.length > 0 && !input.acceptConflicts) return { draft: input.draft, conflicts, restored: 0 }

  for (const change of [...changes].reverse()) {
    const [collection, id] = change.path.split('.')
    if (collection === 'project') {
      (draft.project as Record<string, unknown>)[id] = structuredClone(change.originalValue)
      continue
    }
    const rows = draft[collection as AiGuidedCollection] as Array<{ id: string }>
    const index = rows.findIndex((row) => row.id === id)
    if (change.originalValue === null) {
      if (index >= 0) rows.splice(index, 1)
    } else if (index >= 0) {
      rows[index] = structuredClone(change.originalValue) as never
    } else {
      rows.push(structuredClone(change.originalValue) as never)
    }
    if (change.originalValue !== null) {
      if (change.reason.endsWith(OVERRODE)) markAiGuidedRowUserOwned(draft, collection as AiGuidedCollection, id)
      else upsertAiGuidedRowSource(draft, collection as AiGuidedCollection, change.originalValue as { id: string }, {
        reference: `Restored by undo of AI revision ${input.revisionId.slice(0, 8)}`,
        basis: 'INFERRED',
        confidence: 'MEDIUM',
      })
    }
  }
  // Keep references consistent after rows reappear or disappear.
  const activityIds = new Set(draft.activities.map((activity) => activity.id))
  draft.dependencies = draft.dependencies.filter((dependency) => activityIds.has(dependency.predecessorActivityId) && activityIds.has(dependency.successorActivityId))
  const milestoneIds = new Set(draft.milestones.map((milestone) => milestone.id))
  draft.deliverables = draft.deliverables.filter((deliverable) => milestoneIds.has(deliverable.milestoneId))
  syncAiGuidedMilestoneAndPhaseDates(draft)

  const undoSourceId = `${AI_GUIDED_IDS.revisionUndo}${input.revisionId}`
  changes.forEach((change, index) => draft.changes.push({
    id: `${AI_GUIDED_IDS.revisionUndo}${input.revisionId}-${index + 1}`,
    path: change.path,
    kind: 'OTHER',
    operation: 'REPLACE',
    originalValue: readPathValue(input.draft, change.path),
    proposedValue: structuredClone(change.originalValue),
    reason: `Undo of AI revision ${input.revisionId.slice(0, 8)}`,
    confidence: 'HIGH',
    sourceIds: [undoSourceId],
    status: 'ACCEPTED',
  }))
  draft.sources.push({
    id: undoSourceId,
    type: 'USER_INPUT',
    reference: `Undo of AI revision ${input.revisionId.slice(0, 8)}`,
    excerpt: `${changes.length} items restored${conflicts.length > 0 ? `, ${conflicts.length} later edits overwritten after confirmation` : ''}.`,
    targetPaths: changes.map((change) => change.path).slice(0, 100),
    basis: 'USER_DECISION',
    confidence: 'HIGH',
    lastEditor: 'USER',
  })
  draft.assumptions = draft.assumptions.filter((assumption) => !(assumption.id === `${AI_GUIDED_IDS.gate}rev-${input.revisionId}` && assumption.status === 'PROPOSED'))
  return { draft, conflicts, restored: changes.length }
}

function readPathValue(draft: Draft, path: string) {
  return structuredClone(readPath(draft, path)) as never
}
