import { createHash } from 'crypto'
import type { NormalizedProjectCreationDraft } from './creation-normalize'
import type { AiGuidedBrief } from './ai-guided-brief'
import {
  AI_GUIDED_CAPS,
  AI_GUIDED_DETAIL_ACTIVITY_CAP,
  aiGuidedPlanSchema,
  type AiGuidedPlan,
} from './ai-guided-schema'
import { aiGuidedDeliverableRef, aiGuidedTeamRef } from './ai-guided-prompt'
import { AI_GUIDED_IDS } from './ai-guided-ids'

/**
 * Stories 3.4 (schema-forced generation → normalized draft), 3.5 (deterministic
 * schedule rules) and 3.6 (exact-match assignee safety).
 *
 * The model proposes structure; this module owns every rule the requirements
 * make deterministic (§9.5): working calendar, project boundary, dependency type
 * and lag, parent containment, milestone consistency, normalized weights, and the
 * infeasibility warning. Work is shifted, never compressed.
 */

type Draft = NormalizedProjectCreationDraft
type Phase = Draft['phases'][number]
type Milestone = Draft['milestones'][number]
type Activity = Draft['activities'][number]
type Dependency = Draft['dependencies'][number]
type Deliverable = Draft['deliverables'][number]
type Source = Draft['sources'][number]
type Assumption = Draft['assumptions'][number]
type Warning = Draft['warnings'][number]

export type AiGuidedIdFactory = (prefix: string) => string

export interface AiGuidedActiveUser {
  id: string
  name: string | null
  email: string
}

export { AI_GUIDED_IDS }

// ---------------------------------------------------------------------------
// Working calendar
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000
const WEEKDAY_INDEX: Record<string, number> = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 }
const SEARCH_LIMIT = 3_660

export interface AiGuidedCalendar {
  isWorking(date: string): boolean
}

export function toDayNumber(date: string): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / DAY_MS
}

export function fromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

export function createAiGuidedCalendar(calendar: Draft['project']['workingCalendar']): AiGuidedCalendar {
  const workingDays = new Set(calendar.workingDays.map((day) => WEEKDAY_INDEX[day]))
  const holidays = new Set(calendar.nonWorkingDates)
  return {
    isWorking(date: string) {
      if (calendar.allowNonWorkingDates) return true
      return workingDays.has(new Date(toDayNumber(date) * DAY_MS).getUTCDay()) && !holidays.has(date)
    },
  }
}

/** First working day on or after `date` (on or before when direction is -1). */
export function snapToWorkingDay(calendar: AiGuidedCalendar, date: string, direction: 1 | -1 = 1): string {
  let day = toDayNumber(date)
  for (let guard = 0; guard < SEARCH_LIMIT; guard += 1) {
    const key = fromDayNumber(day)
    if (calendar.isWorking(key)) return key
    day += direction
  }
  return date
}

/** Moves `n` working days from a working day (negative moves backwards). */
export function addWorkingDays(calendar: AiGuidedCalendar, date: string, n: number): string {
  let day = toDayNumber(snapToWorkingDay(calendar, date, n < 0 ? -1 : 1))
  let remaining = Math.abs(n)
  const step = n < 0 ? -1 : 1
  for (let guard = 0; remaining > 0 && guard < SEARCH_LIMIT; guard += 1) {
    day += step
    if (calendar.isWorking(fromDayNumber(day))) remaining -= 1
  }
  return fromDayNumber(day)
}

/** Working days in the inclusive range, minimum 1. */
export function workingDuration(calendar: AiGuidedCalendar, start: string, end: string): number {
  let count = 0
  const last = toDayNumber(end)
  for (let day = toDayNumber(start), guard = 0; day <= last && guard < SEARCH_LIMIT; day += 1, guard += 1) {
    if (calendar.isWorking(fromDayNumber(day))) count += 1
  }
  return Math.max(1, count)
}

// ---------------------------------------------------------------------------
// Fingerprints (Story 3.7 conflict detection)
// ---------------------------------------------------------------------------

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort()
      .map((key) => [key, canonical((value as Record<string, unknown>)[key])]))
  }
  return value
}

export function aiGuidedCanonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value))
}

export function aiGuidedFingerprint(row: unknown): string {
  return createHash('sha256').update(aiGuidedCanonicalJson(row)).digest('hex').slice(0, 16)
}

const FINGERPRINT = /fingerprint:([a-f0-9]{16})/

export function readAiGuidedRowFingerprint(draft: Draft, rowId: string): string | null {
  const source = draft.sources.find((item) => item.id === `${AI_GUIDED_IDS.rowSource}${rowId}`)
  return source?.excerpt?.match(FINGERPRINT)?.[1] ?? null
}

export type AiGuidedCollection = 'phases' | 'milestones' | 'activities' | 'dependencies' | 'deliverables'

/** Marks a row as AI-authored with a fingerprint of the exact proposed values. */
export function upsertAiGuidedRowSource(
  draft: Draft,
  collection: AiGuidedCollection,
  row: { id: string },
  input: { reference: string; basis: 'SOURCE_FACT' | 'INFERRED'; confidence: 'HIGH' | 'MEDIUM' | 'LOW' },
): void {
  const id = `${AI_GUIDED_IDS.rowSource}${row.id}`
  const source: Source = {
    id,
    type: 'AI_ASSUMPTION',
    reference: input.reference.slice(0, 500),
    excerpt: `AI ${input.basis === 'SOURCE_FACT' ? 'extracted from the brief' : 'planning recommendation'} · fingerprint:${aiGuidedFingerprint(row)}`,
    targetPaths: [`${collection}.${row.id}`],
    basis: input.basis === 'SOURCE_FACT' ? 'SOURCE_FACT' : 'INFERRED_RECOMMENDATION',
    confidence: input.confidence,
    lastEditor: 'AI',
  }
  const index = draft.sources.findIndex((item) => item.id === id)
  if (index >= 0) draft.sources[index] = source
  else draft.sources.push(source)
}

/** Marks a row as user-owned (no fingerprint) so later AI revisions flag it. */
export function markAiGuidedRowUserOwned(draft: Draft, collection: AiGuidedCollection, rowId: string): void {
  const index = draft.sources.findIndex((item) => item.id === `${AI_GUIDED_IDS.rowSource}${rowId}`)
  if (index < 0) return
  draft.sources[index] = {
    ...draft.sources[index],
    excerpt: 'Directly edited by the project manager',
    targetPaths: [`${collection}.${rowId}`],
    lastEditor: 'USER',
  }
}

// ---------------------------------------------------------------------------
// Deterministic schedule rules (Story 3.5)
// ---------------------------------------------------------------------------

export interface AiGuidedRuleReport {
  movedActivityIds: string[]
  extendedParentIds: string[]
  infeasible: null | { latestEnd: string; plannedEnd: string; overrunWorkingDays: number }
}

function shiftToStart(calendar: AiGuidedCalendar, activity: Activity, start: string): void {
  if (!activity.startDate || !activity.endDate) return
  const duration = workingDuration(calendar, activity.startDate, activity.endDate)
  const nextStart = snapToWorkingDay(calendar, start)
  activity.startDate = nextStart
  activity.endDate = addWorkingDays(calendar, nextStart, duration - 1)
}

function shiftToEnd(calendar: AiGuidedCalendar, activity: Activity, end: string): void {
  if (!activity.startDate || !activity.endDate) return
  const duration = workingDuration(calendar, activity.startDate, activity.endDate)
  const nextEnd = snapToWorkingDay(calendar, end)
  activity.endDate = nextEnd
  activity.startDate = addWorkingDays(calendar, nextEnd, -(duration - 1))
}

/**
 * Applies §9.5 to the draft in place. `snapIds` limits calendar snapping to the
 * rows that were generated/revised; dependency, containment, boundary-start and
 * milestone/phase consistency always apply. Dates only ever move later, so the
 * loop converges; work is never shortened.
 */
export function enforceAiGuidedScheduleRules(
  draft: Draft,
  options: { snapIds: ReadonlySet<string> | 'ALL' },
): AiGuidedRuleReport {
  const calendar = createAiGuidedCalendar(draft.project.workingCalendar)
  const before = new Map(draft.activities.map((activity) => [activity.id, `${activity.startDate}|${activity.endDate}`]))
  const extended = new Set<string>()
  const plannedStart = draft.project.plannedStart
  const byId = new Map(draft.activities.map((activity) => [activity.id, activity]))

  for (const activity of draft.activities) {
    if (!activity.startDate || !activity.endDate) continue
    if (activity.endDate < activity.startDate) activity.endDate = activity.startDate
    const shouldSnap = options.snapIds === 'ALL' || options.snapIds.has(activity.id)
    if (shouldSnap) {
      const duration = workingDuration(calendar, activity.startDate, activity.endDate)
      const start = snapToWorkingDay(calendar, activity.startDate)
      activity.startDate = start
      activity.endDate = addWorkingDays(calendar, start, duration - 1)
    }
    if (plannedStart && activity.startDate < plannedStart) shiftToStart(calendar, activity, plannedStart)
  }

  for (let iteration = 0; iteration < 25; iteration += 1) {
    let changed = false
    for (const dependency of draft.dependencies) {
      const predecessor = byId.get(dependency.predecessorActivityId)
      const successor = byId.get(dependency.successorActivityId)
      if (!predecessor?.startDate || !predecessor.endDate || !successor?.startDate || !successor.endDate) continue
      const lag = dependency.lagDays
      if (dependency.type === 'FS' || dependency.type === 'SS') {
        const anchor = dependency.type === 'FS' ? predecessor.endDate : predecessor.startDate
        const minStart = snapToWorkingDay(calendar, addWorkingDays(calendar, anchor, (dependency.type === 'FS' ? 1 : 0) + lag))
        if (successor.startDate < minStart) {
          shiftToStart(calendar, successor, minStart)
          changed = true
        }
      } else {
        const anchor = dependency.type === 'FF' ? predecessor.endDate : predecessor.startDate
        const minEnd = snapToWorkingDay(calendar, addWorkingDays(calendar, anchor, lag))
        if (successor.endDate < minEnd) {
          shiftToEnd(calendar, successor, minEnd)
          changed = true
        }
      }
    }
    for (const child of draft.activities) {
      if (!child.parentActivityId || !child.startDate || !child.endDate) continue
      const parent = byId.get(child.parentActivityId)
      if (!parent?.startDate || !parent.endDate) continue
      if (child.startDate < parent.startDate) {
        shiftToStart(calendar, child, parent.startDate)
        changed = true
      }
      if (child.endDate && child.endDate > parent.endDate) {
        parent.endDate = child.endDate
        extended.add(parent.id)
        changed = true
      }
    }
    if (!changed) break
  }

  syncAiGuidedMilestoneAndPhaseDates(draft)

  const latestEnd = draft.activities.reduce<string | null>((latest, activity) => (
    activity.endDate && (!latest || activity.endDate > latest) ? activity.endDate : latest
  ), null)
  const plannedEnd = draft.project.plannedEnd
  const infeasible = latestEnd && plannedEnd && latestEnd > plannedEnd
    ? {
      latestEnd,
      plannedEnd,
      overrunWorkingDays: Math.max(1, workingDuration(calendar, addWorkingDays(calendar, plannedEnd, 1), latestEnd)),
    }
    : null

  return {
    movedActivityIds: draft.activities
      .filter((activity) => before.get(activity.id) !== `${activity.startDate}|${activity.endDate}`)
      .map((activity) => activity.id),
    extendedParentIds: [...extended],
    infeasible,
  }
}

/** Milestone due = latest producing activity end; phase range = its activities' range. */
export function syncAiGuidedMilestoneAndPhaseDates(draft: Draft): void {
  const activitiesByMilestone = new Map<string, Activity[]>()
  for (const activity of draft.activities) {
    const list = activitiesByMilestone.get(activity.milestoneId) ?? []
    list.push(activity)
    activitiesByMilestone.set(activity.milestoneId, list)
  }
  for (const milestone of draft.milestones) {
    const ends = (activitiesByMilestone.get(milestone.id) ?? [])
      .map((activity) => activity.endDate)
      .filter((value): value is string => Boolean(value))
      .sort()
    if (ends.length > 0) milestone.dueDate = ends[ends.length - 1]
  }
  for (const phase of draft.phases) {
    const milestoneIds = new Set(draft.milestones.filter((milestone) => milestone.phaseId === phase.id).map((milestone) => milestone.id))
    const activities = draft.activities.filter((activity) => milestoneIds.has(activity.milestoneId))
    const starts = activities.map((activity) => activity.startDate).filter((value): value is string => Boolean(value)).sort()
    const ends = activities.map((activity) => activity.endDate).filter((value): value is string => Boolean(value)).sort()
    if (starts.length > 0) phase.plannedStart = starts[0]
    if (ends.length > 0) phase.plannedEnd = ends[ends.length - 1]
  }
  for (const deliverable of draft.deliverables) {
    const milestone = draft.milestones.find((item) => item.id === deliverable.milestoneId)
    if (milestone) deliverable.dueDate = milestone.dueDate
  }
}

/** Splits 100 across items proportionally (equal when no basis), 2 decimals, exact total. */
export function normalizeAiGuidedWeights<T extends { weight: number }>(items: T[], basis: (item: T) => number): void {
  if (items.length === 0) return
  const values = items.map((item) => Math.max(0, basis(item)))
  const total = values.reduce((sum, value) => sum + value, 0)
  const raw = values.map((value) => total > 0 ? (value / total) * 100 : 100 / items.length)
  let assigned = 0
  items.forEach((item, index) => {
    if (index === items.length - 1) {
      item.weight = Math.max(0, Math.min(100, Math.round((100 - assigned) * 100) / 100))
    } else {
      item.weight = Math.round(raw[index] * 100) / 100
      assigned += item.weight
    }
  })
}

/** Normalizes phase, milestone (within phase), and activity (within milestone/parent) weights. */
export function normalizeAiGuidedDraftWeights(draft: Draft, containers?: ReadonlySet<string>): void {
  const hours = (activities: Activity[]) => activities.reduce((sum, activity) => sum + (activity.estimatedHours ?? 0), 0)
  const milestoneActivities = (milestoneId: string) => draft.activities.filter((activity) => activity.milestoneId === milestoneId && !activity.parentActivityId)
  const include = (id: string) => !containers || containers.has(id)
  if (include('project')) {
    normalizeAiGuidedWeights(draft.phases, (phase) => {
      const ids = new Set(draft.milestones.filter((milestone) => milestone.phaseId === phase.id).map((milestone) => milestone.id))
      const activities = draft.activities.filter((activity) => ids.has(activity.milestoneId) && !activity.parentActivityId)
      return hours(activities) || activities.length
    })
  }
  for (const phase of draft.phases) {
    if (!include(phase.id)) continue
    normalizeAiGuidedWeights(draft.milestones.filter((milestone) => milestone.phaseId === phase.id), (milestone) => {
      const activities = milestoneActivities(milestone.id)
      return hours(activities) || activities.length
    })
  }
  for (const milestone of draft.milestones) {
    if (!include(milestone.id)) continue
    normalizeAiGuidedWeights(milestoneActivities(milestone.id), (activity) => activity.estimatedHours ?? 1)
  }
  for (const parent of draft.activities) {
    if (!include(parent.id)) continue
    const children = draft.activities.filter((activity) => activity.parentActivityId === parent.id)
    normalizeAiGuidedWeights(children, (activity) => activity.estimatedHours ?? 1)
  }
}

// ---------------------------------------------------------------------------
// Assignee safety (Story 3.6)
// ---------------------------------------------------------------------------

function normalizedName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

export const AI_GUIDED_GENERIC_ROLE = 'Team member'

/**
 * Assigns a person only when a brief team member resolves to exactly one active
 * user by exact email, or by exact full name when no email was given. Anything
 * else — near names, unknown people, model text that looks like a person — is a
 * role suggestion with no assignee (§9.4, AC17).
 */
export function resolveAiGuidedAssignee(input: {
  teamRef: string | null
  suggestedRole: string | null
  team: AiGuidedBrief['team']
  activeUsers: readonly AiGuidedActiveUser[]
}): { assigneeId: string | null; assigneeEmail: string | null; suggestedRole: string | null } {
  const index = input.teamRef ? input.team.findIndex((_, i) => aiGuidedTeamRef(i) === input.teamRef) : -1
  const member = index >= 0 ? input.team[index] : null
  if (member) {
    const matches = member.email
      ? input.activeUsers.filter((user) => user.email.trim().toLowerCase() === member.email)
      : member.name
      ? input.activeUsers.filter((user) => user.name && normalizedName(user.name) === normalizedName(member.name!))
      : []
    if (matches.length === 1) {
      return { assigneeId: matches[0].id, assigneeEmail: matches[0].email.trim().toLowerCase(), suggestedRole: member.role }
    }
    return { assigneeId: null, assigneeEmail: null, suggestedRole: member.role }
  }
  const role = input.suggestedRole?.trim() || null
  if (!role) return { assigneeId: null, assigneeEmail: null, suggestedRole: null }
  const personNames = new Set([
    ...input.activeUsers.map((user) => user.name ?? '').filter(Boolean).map(normalizedName),
    ...input.team.map((teamMember) => teamMember.name ?? '').filter(Boolean).map(normalizedName),
  ])
  const looksLikePerson = role.includes('@') || personNames.has(normalizedName(role))
  return { assigneeId: null, assigneeEmail: null, suggestedRole: looksLikePerson ? AI_GUIDED_GENERIC_ROLE : role }
}

// ---------------------------------------------------------------------------
// Plan validation + normalization (Story 3.4)
// ---------------------------------------------------------------------------

function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/**
 * Zod shape validation plus the semantic checks a JSON schema cannot express.
 * Throws with a readable summary so the repair round can correct the output.
 */
export function validateAiGuidedPlan(value: unknown, brief: AiGuidedBrief): AiGuidedPlan {
  const plan = aiGuidedPlanSchema.parse(value)
  const problems: string[] = []
  const refs = new Set<string>()
  const claim = (ref: string) => {
    if (refs.has(ref)) problems.push(`ref ${ref} is used more than once`)
    refs.add(ref)
  }
  const phaseRefs = new Set(plan.phases.map((phase) => phase.ref))
  const milestoneRefs = new Set(plan.milestones.map((milestone) => milestone.ref))
  const activityByRef = new Map(plan.activities.map((activity) => [activity.ref, activity]))
  plan.phases.forEach((phase) => claim(phase.ref))
  plan.milestones.forEach((milestone) => {
    claim(milestone.ref)
    if (!phaseRefs.has(milestone.phaseRef)) problems.push(`milestone ${milestone.ref} references unknown phase ${milestone.phaseRef}`)
    if (milestone.deliverableRef && !brief.deliverables.some((_, index) => aiGuidedDeliverableRef(index) === milestone.deliverableRef)) {
      problems.push(`milestone ${milestone.ref} references unknown deliverable ${milestone.deliverableRef}`)
    }
  })
  plan.activities.forEach((activity) => {
    claim(activity.ref)
    if (!milestoneRefs.has(activity.milestoneRef)) problems.push(`activity ${activity.ref} references unknown milestone ${activity.milestoneRef}`)
    if (!isRealDate(activity.startDate) || !isRealDate(activity.endDate)) problems.push(`activity ${activity.ref} has an invalid date`)
    else if (activity.endDate < activity.startDate) problems.push(`activity ${activity.ref} ends before it starts`)
    if (activity.teamRef && !brief.team.some((_, index) => aiGuidedTeamRef(index) === activity.teamRef)) {
      problems.push(`activity ${activity.ref} references unknown team member ${activity.teamRef}`)
    }
    if (activity.parentRef) {
      const parent = activityByRef.get(activity.parentRef)
      if (!parent || parent.ref === activity.ref) problems.push(`activity ${activity.ref} has an invalid parentRef`)
      else if (parent.parentRef) problems.push(`activity ${activity.ref} nests deeper than one subtask level`)
      else if (parent.milestoneRef !== activity.milestoneRef) problems.push(`subtask ${activity.ref} must share its parent's milestone`)
      if (brief.detailLevel === 'SUMMARY') problems.push('summary schedules must not contain subtasks')
    }
  })
  for (const phase of plan.phases) {
    if (!plan.milestones.some((milestone) => milestone.phaseRef === phase.ref)) problems.push(`phase ${phase.ref} has no milestones`)
  }
  const cap = AI_GUIDED_DETAIL_ACTIVITY_CAP[brief.detailLevel]
  if (plan.activities.length > cap) problems.push(`${plan.activities.length} activities exceed the ${brief.detailLevel} limit of ${cap}`)
  plan.dependencies.forEach((dependency) => {
    if (!activityByRef.has(dependency.predecessorRef) || !activityByRef.has(dependency.successorRef)) {
      problems.push(`dependency ${dependency.predecessorRef}->${dependency.successorRef} references an unknown activity`)
    } else if (dependency.predecessorRef === dependency.successorRef) {
      problems.push(`dependency ${dependency.predecessorRef} cannot depend on itself`)
    }
  })
  if (problems.length > 0) throw new Error([...new Set(problems)].slice(0, 25).join('; '))
  return plan
}

function wouldCycle(edges: Map<string, Set<string>>, from: string, to: string): boolean {
  const stack = [to]
  const seen = new Set<string>()
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === from) return true
    if (seen.has(current)) continue
    seen.add(current)
    for (const next of edges.get(current) ?? []) stack.push(next)
  }
  return false
}

export interface BuildAiGuidedDraftInput {
  current: Draft
  brief: AiGuidedBrief
  plan: AiGuidedPlan
  activeUsers: readonly AiGuidedActiveUser[]
  generationId: string
  modelId: string
  promptVersion: string
  idFactory: AiGuidedIdFactory
}

export interface AiGuidedGenerationSummary {
  phases: number
  milestones: number
  activities: number
  dependencies: number
  deliverables: number
  assignedActivities: number
  roleSuggestions: number
  movedActivities: number
  warnings: number
  proposals: number
  infeasible: boolean
}

function isAiGuidedGenerated(id: string) {
  return [
    AI_GUIDED_IDS.rowSource,
    AI_GUIDED_IDS.generationSource,
    AI_GUIDED_IDS.gate,
    AI_GUIDED_IDS.assumption,
    AI_GUIDED_IDS.exclusion,
    AI_GUIDED_IDS.warning,
    AI_GUIDED_IDS.question,
    AI_GUIDED_IDS.change,
    AI_GUIDED_IDS.revision,
    AI_GUIDED_IDS.revisionUndo,
  ].some((prefix) => id.startsWith(prefix))
}

function warning(idFactory: AiGuidedIdFactory, code: string, message: string, affectedPaths: string[], sourceIds: string[]): Warning {
  return {
    id: idFactory(AI_GUIDED_IDS.warning.slice(0, -1)),
    code,
    message: message.slice(0, 2_000),
    severity: 'WARNING',
    affectedPaths: affectedPaths.slice(0, 100),
    sourceIds: sourceIds.slice(0, 100),
    acknowledged: false,
  }
}

/**
 * Replaces the draft schedule with a validated AI plan. Brief sources, the
 * clarification questions/assumptions, and user-added assumptions are kept;
 * every generated row is marked AI-authored and covered by a PROPOSED
 * acceptance assumption, so commit stays blocked until the PM decides.
 */
export function buildAiGuidedDraft(input: BuildAiGuidedDraftInput): { draft: Draft; summary: AiGuidedGenerationSummary } {
  const { brief, plan, idFactory } = input
  const draft = structuredClone(input.current)
  const generationSourceId = `${AI_GUIDED_IDS.generationSource}${input.generationId}`
  const shortGeneration = input.generationId.slice(0, 8)

  draft.phases = []
  draft.milestones = []
  draft.activities = []
  draft.dependencies = []
  draft.deliverables = []
  draft.sources = draft.sources.filter((source) => !isAiGuidedGenerated(source.id))
  draft.changes = draft.changes.filter((change) => !isAiGuidedGenerated(change.id))
  draft.assumptions = draft.assumptions.filter((assumption) => !isAiGuidedGenerated(assumption.id))
  draft.warnings = draft.warnings.filter((item) => !isAiGuidedGenerated(item.id))
  draft.questions = draft.questions.filter((question) => !question.id.startsWith(AI_GUIDED_IDS.question))

  const phaseIdByRef = new Map<string, string>()
  const milestoneIdByRef = new Map<string, string>()
  const activityIdByRef = new Map<string, string>()
  const basisById = new Map<string, 'SOURCE_FACT' | 'INFERRED'>()

  plan.phases.forEach((item, position) => {
    const phase: Phase = { id: idFactory('aiphase'), name: item.name, position, weight: 0, plannedStart: null, plannedEnd: null }
    phaseIdByRef.set(item.ref, phase.id)
    basisById.set(phase.id, 'INFERRED')
    draft.phases.push(phase)
  })
  const milestonePosition = new Map<string, number>()
  plan.milestones.forEach((item) => {
    const phaseId = phaseIdByRef.get(item.phaseRef)!
    const position = milestonePosition.get(phaseId) ?? 0
    milestonePosition.set(phaseId, position + 1)
    const milestone: Milestone = {
      id: idFactory('aimilestone'),
      name: item.name,
      position,
      weight: 0,
      phaseId,
      isKeyMilestone: false,
      dueDate: null,
    }
    milestoneIdByRef.set(item.ref, milestone.id)
    basisById.set(milestone.id, item.basis)
    draft.milestones.push(milestone)
  })

  let assignedActivities = 0
  let roleSuggestions = 0
  const activityPosition = new Map<string, number>()
  const orderedActivities = [
    ...plan.activities.filter((activity) => !activity.parentRef),
    ...plan.activities.filter((activity) => activity.parentRef),
  ]
  orderedActivities.forEach((item) => activityIdByRef.set(item.ref, idFactory('aiactivity')))
  for (const item of orderedActivities) {
    const milestoneId = milestoneIdByRef.get(item.milestoneRef)!
    const parentActivityId = item.parentRef ? activityIdByRef.get(item.parentRef) ?? null : null
    const containerKey = parentActivityId ?? milestoneId
    const position = activityPosition.get(containerKey) ?? 0
    activityPosition.set(containerKey, position + 1)
    const assignee = resolveAiGuidedAssignee({
      teamRef: item.teamRef,
      suggestedRole: item.suggestedRole,
      team: brief.team,
      activeUsers: input.activeUsers,
    })
    if (assignee.assigneeId) assignedActivities += 1
    else if (assignee.suggestedRole) roleSuggestions += 1
    const activity: Activity = {
      id: activityIdByRef.get(item.ref)!,
      sourceRowId: null,
      milestoneId,
      parentActivityId,
      position,
      title: item.title,
      description: item.description,
      ownerParty: item.ownerParty,
      assigneeId: assignee.assigneeId,
      assigneeEmail: assignee.assigneeEmail,
      suggestedRole: assignee.suggestedRole,
      startDate: item.startDate,
      endDate: item.endDate,
      weight: 0,
      estimatedHours: item.estimatedHours,
      priority: item.priority,
      risk: item.risk,
      isBlocked: false,
      blockerDetails: null,
      isApproval: item.isApproval,
    }
    basisById.set(activity.id, item.basis)
    draft.activities.push(activity)
  }

  const warnings: Warning[] = []
  const edges = new Map<string, Set<string>>()
  const seenLinks = new Set<string>()
  for (const item of plan.dependencies) {
    const predecessorActivityId = activityIdByRef.get(item.predecessorRef)!
    const successorActivityId = activityIdByRef.get(item.successorRef)!
    const key = `${predecessorActivityId}>${successorActivityId}`
    if (seenLinks.has(key)) continue
    if (wouldCycle(edges, predecessorActivityId, successorActivityId)) {
      warnings.push(warning(idFactory, 'AI_DEPENDENCY_DROPPED', `The AI proposed a circular link from ${item.predecessorRef} to ${item.successorRef}; it was not added. Add the correct sequence manually if needed.`, [`activities.${successorActivityId}`], [generationSourceId]))
      continue
    }
    seenLinks.add(key)
    const successors = edges.get(predecessorActivityId) ?? new Set<string>()
    successors.add(successorActivityId)
    edges.set(predecessorActivityId, successors)
    const dependency: Dependency = {
      id: idFactory('aidependency'),
      predecessorActivityId,
      successorActivityId,
      type: item.type,
      lagDays: item.lagDays,
    }
    basisById.set(dependency.id, 'INFERRED')
    draft.dependencies.push(dependency)
  }

  // Deliverables are key milestones (no Deliverable model, strategy §2.8).
  const usedDeliverables = new Set<string>()
  const addedApprovals: string[] = []
  for (const item of plan.milestones) {
    const milestoneId = milestoneIdByRef.get(item.ref)!
    const briefIndex = item.deliverableRef
      ? brief.deliverables.findIndex((_, index) => aiGuidedDeliverableRef(index) === item.deliverableRef)
      : -1
    const deliverableKey = briefIndex >= 0 ? `brief:${briefIndex}` : item.newDeliverableName ? `tor:${item.newDeliverableName.toLowerCase()}` : null
    if (!deliverableKey || usedDeliverables.has(deliverableKey)) continue
    usedDeliverables.add(deliverableKey)
    const milestone = draft.milestones.find((candidate) => candidate.id === milestoneId)!
    milestone.isKeyMilestone = true
    const milestoneActivities = draft.activities.filter((activity) => activity.milestoneId === milestoneId)
    let approval = milestoneActivities.find((activity) => activity.isApproval) ?? null
    if (item.approvalRequired && !approval) {
      const producing = milestoneActivities.filter((activity) => !activity.parentActivityId)
      const lastEnd = producing.map((activity) => activity.endDate).filter((value): value is string => Boolean(value)).sort().at(-1) ?? brief.plannedStart
      approval = {
        id: idFactory('aiactivity'),
        sourceRowId: null,
        milestoneId,
        parentActivityId: null,
        position: producing.length,
        title: `Client approval: ${briefIndex >= 0 ? brief.deliverables[briefIndex].name : item.newDeliverableName}`.slice(0, 300),
        description: null,
        ownerParty: 'CLIENT',
        assigneeId: null,
        assigneeEmail: null,
        suggestedRole: null,
        startDate: lastEnd,
        endDate: lastEnd,
        weight: 0,
        estimatedHours: null,
        priority: null,
        risk: null,
        isBlocked: false,
        blockerDetails: null,
        isApproval: true,
      }
      draft.activities.push(approval)
      basisById.set(approval.id, 'INFERRED')
      addedApprovals.push(approval.id)
      for (const predecessor of producing) {
        const dependency: Dependency = { id: idFactory('aidependency'), predecessorActivityId: predecessor.id, successorActivityId: approval.id, type: 'FS', lagDays: 0 }
        basisById.set(dependency.id, 'INFERRED')
        draft.dependencies.push(dependency)
      }
    }
    const deliverable: Deliverable = {
      id: idFactory('aideliverable'),
      milestoneId,
      name: (briefIndex >= 0 ? brief.deliverables[briefIndex].name : item.newDeliverableName!).slice(0, 300),
      producingActivityIds: milestoneActivities.filter((activity) => !activity.isApproval).map((activity) => activity.id),
      dueDate: null,
      ownerParty: '360GROUND',
      approvalActivityId: approval?.id ?? null,
      // Acceptance criteria are never invented (§12.6): only the user's own text.
      approvalCriteria: briefIndex >= 0 ? brief.deliverables[briefIndex].approvalCriteria : null,
    }
    basisById.set(deliverable.id, briefIndex >= 0 ? 'SOURCE_FACT' : 'INFERRED')
    draft.deliverables.push(deliverable)
  }
  brief.deliverables.forEach((item, index) => {
    if (!usedDeliverables.has(`brief:${index}`)) {
      warnings.push(warning(idFactory, 'AI_DELIVERABLE_UNPLANNED', `The deliverable “${item.name}” has no milestone in the generated plan. Add one in Schedule or ask for a revision.`, ['deliverables'], [`brief-deliverable-${String(index + 1).padStart(3, '0')}`]))
    }
  })

  const report = enforceAiGuidedScheduleRules(draft, { snapIds: 'ALL' })
  normalizeAiGuidedDraftWeights(draft)

  // Provenance for every generated row (§10.3).
  const reference = (ref: string) => `AI plan ${shortGeneration} · ${ref}`
  const moved = new Set([...report.movedActivityIds, ...report.extendedParentIds])
  const refById = new Map<string, string>()
  phaseIdByRef.forEach((id, ref) => refById.set(id, ref))
  milestoneIdByRef.forEach((id, ref) => refById.set(id, ref))
  activityIdByRef.forEach((id, ref) => refById.set(id, ref))
  const mark = (collection: AiGuidedCollection, row: { id: string }) => {
    const basis = basisById.get(row.id) ?? 'INFERRED'
    upsertAiGuidedRowSource(draft, collection, row, {
      reference: reference(refById.get(row.id) ?? collection),
      basis,
      confidence: moved.has(row.id) ? 'LOW' : basis === 'SOURCE_FACT' ? 'HIGH' : 'MEDIUM',
    })
  }
  draft.phases.forEach((row) => mark('phases', row))
  draft.milestones.forEach((row) => mark('milestones', row))
  draft.activities.forEach((row) => mark('activities', row))
  draft.dependencies.forEach((row) => mark('dependencies', row))
  draft.deliverables.forEach((row) => mark('deliverables', row))
  draft.sources.push({
    id: generationSourceId,
    type: 'AI_ASSUMPTION',
    reference: `AI generation ${shortGeneration} · OpenAI ${input.modelId} · ${input.promptVersion}`.slice(0, 500),
    excerpt: `${draft.phases.length} phases, ${draft.milestones.length} milestones, ${draft.activities.length} activities proposed. Every value is a proposal until accepted.`,
    targetPaths: ['phases', 'milestones', 'activities', 'dependencies', 'deliverables'],
    basis: 'INFERRED_RECOMMENDATION',
    confidence: 'MEDIUM',
    lastEditor: 'AI',
  })

  // Acceptance gates: one PROPOSED assumption per generated phase plus one for
  // dependencies and deliverables. Commit is blocked while any is PROPOSED.
  const gates: Assumption[] = []
  for (const phase of draft.phases) {
    const milestones = draft.milestones.filter((milestone) => milestone.phaseId === phase.id)
    const milestoneIds = new Set(milestones.map((milestone) => milestone.id))
    const activities = draft.activities.filter((activity) => milestoneIds.has(activity.milestoneId))
    gates.push({
      id: `${AI_GUIDED_IDS.gate}${phase.id}`,
      text: `Accept the AI-proposed phase “${phase.name}” (${milestones.length} milestones, ${activities.length} activities). Its dates, owners, roles, and weights are proposals until you accept; reject and edit or delete the rows you do not want.`.slice(0, 2_000),
      category: 'SCOPE',
      affectedPaths: [`phases.${phase.id}`, ...milestones.map((row) => `milestones.${row.id}`), ...activities.map((row) => `activities.${row.id}`)].slice(0, 100),
      sourceIds: [generationSourceId],
      status: 'PROPOSED',
    })
  }
  if (draft.dependencies.length > 0) {
    gates.push({
      id: `${AI_GUIDED_IDS.gate}dependencies-${shortGeneration}`,
      text: `Accept the ${draft.dependencies.length} AI-proposed dependency links and lags.`,
      category: 'DEPENDENCY',
      affectedPaths: draft.dependencies.map((row) => `dependencies.${row.id}`).slice(0, 100),
      sourceIds: [generationSourceId],
      status: 'PROPOSED',
    })
  }
  if (draft.deliverables.length > 0) {
    gates.push({
      id: `${AI_GUIDED_IDS.gate}deliverables-${shortGeneration}`,
      text: `Accept the ${draft.deliverables.length} deliverables mapped to key milestones, their producing activities, approval steps, and proposed due dates.`,
      category: 'DELIVERABLE',
      affectedPaths: draft.deliverables.map((row) => `deliverables.${row.id}`).slice(0, 100),
      sourceIds: [generationSourceId],
      status: 'PROPOSED',
    })
  }
  plan.assumptions.forEach((item) => gates.push({
    id: idFactory(AI_GUIDED_IDS.assumption.slice(0, -1)),
    text: item.text,
    category: item.category,
    affectedPaths: [],
    sourceIds: [generationSourceId],
    status: 'PROPOSED',
  }))
  plan.exclusions.forEach((item) => gates.push({
    id: idFactory(AI_GUIDED_IDS.exclusion.slice(0, -1)),
    text: `Proposed exclusion: ${item}`.slice(0, 2_000),
    category: 'SCOPE',
    affectedPaths: ['project.scopeExcluded'],
    sourceIds: [generationSourceId],
    status: 'PROPOSED',
  }))
  draft.assumptions.push(...gates)

  const nextRound = Math.min(100, draft.questions.reduce((max, question) => Math.max(max, question.round), 0) + 1)
  plan.openQuestions.slice(0, AI_GUIDED_CAPS.openQuestions).forEach((text) => draft.questions.push({
    id: idFactory(AI_GUIDED_IDS.question.slice(0, -1)),
    round: nextRound,
    text,
    impact: 'MEDIUM',
    affectedPaths: [],
    status: 'OPEN',
    answer: null,
  }))

  if (report.movedActivityIds.length > 0 || report.extendedParentIds.length > 0) {
    warnings.push(warning(idFactory, 'AI_SCHEDULE_ADJUSTED', `${report.movedActivityIds.length} proposed activities were moved later to respect the working calendar, project start, dependencies, and parent ranges. Durations were preserved. Review the low-confidence dates.`, report.movedActivityIds.map((id) => `activities.${id}`), [generationSourceId]))
  }
  if (report.infeasible) {
    warnings.push(warning(idFactory, 'AI_SCHEDULE_INFEASIBLE', `The proposed work needs about ${report.infeasible.overrunWorkingDays} more working days than the project period allows (latest end ${report.infeasible.latestEnd}, planned end ${report.infeasible.plannedEnd}). Required work was not shortened. Options: extend the planned end to ${report.infeasible.latestEnd}; reduce or phase the scope; run independent activities in parallel by removing dependencies; or allow work on non-working days.`, ['project.plannedEnd', ...draft.activities.filter((activity) => activity.endDate && activity.endDate > report.infeasible!.plannedEnd).map((activity) => `activities.${activity.id}`)], [generationSourceId]))
  }
  plan.scheduleRisks.forEach((text) => warnings.push(warning(idFactory, 'AI_SCHEDULE_RISK', `AI-identified schedule risk: ${text}`, [], [generationSourceId])))
  draft.warnings.push(...warnings)

  // Title/description are proposals shown original → proposed (§9.4).
  const proposals: Draft['changes'] = []
  if (plan.description && plan.description !== draft.project.description) {
    proposals.push({
      id: `${AI_GUIDED_IDS.change}${shortGeneration}-description`,
      path: 'project.description',
      kind: 'OTHER',
      operation: 'REPLACE',
      originalValue: draft.project.description,
      proposedValue: plan.description.slice(0, AI_GUIDED_CAPS.descriptionChars),
      reason: 'AI-proposed concise project description.',
      confidence: 'MEDIUM',
      sourceIds: [generationSourceId],
      status: 'PROPOSED',
    })
  }
  if (plan.title.trim().toLowerCase() !== (draft.project.name ?? '').trim().toLowerCase()) {
    proposals.push({
      id: `${AI_GUIDED_IDS.change}${shortGeneration}-name`,
      path: 'project.name',
      kind: 'OTHER',
      operation: 'REPLACE',
      originalValue: draft.project.name,
      proposedValue: plan.title,
      reason: 'AI-proposed project title. Your working title is kept unless you accept.',
      confidence: 'LOW',
      sourceIds: [generationSourceId],
      status: 'PROPOSED',
    })
  }
  draft.changes.push(...proposals)

  return {
    draft,
    summary: {
      phases: draft.phases.length,
      milestones: draft.milestones.length,
      activities: draft.activities.length,
      dependencies: draft.dependencies.length,
      deliverables: draft.deliverables.length,
      assignedActivities,
      roleSuggestions,
      movedActivities: report.movedActivityIds.length,
      warnings: warnings.length,
      proposals: gates.length + proposals.length,
      infeasible: Boolean(report.infeasible),
    },
  }
}
