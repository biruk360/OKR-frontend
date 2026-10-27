/**
 * Employee OKR profile (PRF-7…11) — the JSON contract of
 * `GET /api/users/[id]/okr-profile?timeframeId=`.
 *
 * Plain JSON (dates as ISO strings). Built by `okr-profile.server.ts`, rendered by
 * `OkrProfileTab`. Redacted items (CON-8 / `isRedacted` in the quick views) carry
 * `redacted: true` and a null title; their actions are always off.
 */
import type { ConnectionItem } from '@/lib/connections/types'
import type { InitiativeMeta } from '@/lib/package/initiatives'
import type { KrCommitment, OkrLinkSubKind, TodoKind } from '@/types/package'

export interface OkrProfilePerson {
  id: string
  name: string | null
  avatar: string | null
}

/** PRF-9 level buckets. Owned objectives use their level; others are "contributed". */
export type OkrProfileLevelBucket = 'company' | 'department' | 'individual' | 'contributed'

/** PRF-9 status buckets (objective goalStatus / KR confidence, or closed). */
export type OkrProfileStatusKey = 'on_track' | 'at_risk' | 'off_track' | 'closed'

export interface OkrProfileTimeframe {
  id: string
  name: string
  startDate: string
  endDate: string
  /** The timeframe has ended (PRF-3: read-only, close flow open to owners/managers). */
  ended: boolean
}

export interface OkrProfileCheckpoint {
  id: string
  label: string
  dueDate: string
  status: string
  targetText: string
}

export interface OkrProfileTodoStep {
  id: string
  title: string
  completed: boolean
  dueDate: string | null
}

/** A card under a KR / objective: INITIATIVE, MILESTONE or task (TASK / DEPENDENCY). */
export interface OkrProfileTodo {
  id: string
  cardNumber: number
  title: string
  kind: TodoKind
  /** Workbook id (e.g. "EDN-IN1.1", "M1.1.1"), or null. */
  externalRef: string | null
  /** MILESTONE only: the initiative ref named on its description's first line. */
  initiativeRef: string | null
  /** INITIATIVE only: the parsed description block (C/A, target, measured by …). */
  initiative: InitiativeMeta | null
  status: string
  dueDate: string | null
  completedAt: string | null
  assignee: OkrProfilePerson | null
  /** Sprint the card is planned in — null when none or the viewer may not see the board. */
  sprint: { id: string; name: string } | null
  /** Late inbound dependency linked to this card (DEP-3). */
  blocked: boolean
  /** Milestone checklist steps (milestones only; tasks have none). */
  steps: OkrProfileTodoStep[]
}

export interface OkrProfileDuty {
  id: string
  title: string
  ref: string | null
  cadence: string
  status: string
  timingText: string | null
  owner: OkrProfilePerson
  /** Deep link to the owner's Role & duties tab. */
  href: string
}

export interface OkrProfileKrActions {
  /** Check in (KR edit rule, KR and objective open and unlocked, timeframe not ended). */
  canCheckIn: boolean
  /** Add a milestone or task (same rule as POST /api/keyresults/[id]/todos). */
  canAddInitiative: boolean
  /** Open the close flow (edit rule + timeframe ended or ADMIN/EXECUTIVE). */
  canClose: boolean
}

export interface OkrProfileKeyResult {
  id: string
  redacted: boolean
  title: string | null
  ref: string | null
  owner: OkrProfilePerson | null
  /** Owned by the profile person. */
  ownedBySubject: boolean
  progress: number
  confidence: string
  statusKey: OkrProfileStatusKey
  closureStatus: string
  outcome: string | null
  finalGrade: number | null
  closureNote: string | null
  isLocked: boolean
  commitment: KrCommitment | null
  unit: string | null
  startValue: number | null
  currentValue: number | null
  targetValue: number | null
  direction: string
  nextCheckpoint: OkrProfileCheckpoint | null
  checkpointCounts: { total: number; met: number; missed: number }
  lastCheckInAt: string | null
  blocked: boolean
  /** v2 initiatives (kind INITIATIVE), each with the milestones that name it. */
  initiatives: OkrProfileInitiativeGroup[]
  /** Milestones that name no initiative of this KR. */
  milestones: OkrProfileTodo[]
  tasks: OkrProfileTodo[]
  duties: OkrProfileDuty[]
  actions: OkrProfileKrActions
}

/** An initiative under a KR and the milestones grouped under it. */
export interface OkrProfileInitiativeGroup {
  initiative: OkrProfileTodo
  milestones: OkrProfileTodo[]
}

export interface OkrProfileObjectiveActions {
  canClose: boolean
  /** Active KRs that are not closed yet (the close flow needs 0). */
  openKeyResults: number
}

export interface OkrProfileObjective {
  id: string
  redacted: boolean
  title: string | null
  ref: string | null
  level: string
  involvement: 'OWNED' | 'CONTRIBUTED'
  levelBucket: OkrProfileLevelBucket
  owner: OkrProfilePerson | null
  progress: number
  goalStatus: string
  statusKey: OkrProfileStatusKey
  closureStatus: string
  outcome: string | null
  finalGrade: number | null
  closureNote: string | null
  isLocked: boolean
  blocked: boolean
  keyResults: OkrProfileKeyResult[]
  /** Initiatives on the objective itself (no KR). */
  initiatives: OkrProfileTodo[]
  actions: OkrProfileObjectiveActions
}

export interface OkrProfileHeader {
  objectives: number
  ownedObjectives: number
  keyResults: number
  /** Mean progress of the person's own KRs (objectives when they own none), 0–100, or null. */
  averageProgress: number | null
  commitment: { committed: number; aspirational: number; mixed: number; unset: number }
  nextCheckpoint: (OkrProfileCheckpoint & { keyResultId: string; keyResultLabel: string }) | null
  lastCheckInAt: string | null
}

/** PRF-10 — what happened to a closed objective / KR. */
export type OkrProfileDisposition = 'CONTINUED' | 'COMPLETED' | 'RETIRED'

export interface OkrProfileSuccessor {
  item: ConnectionItem
  subKind: OkrLinkSubKind | null
  /** "Carried", "Reframed" … or "Rolled forward" for a rolledFromId-only successor. */
  relationLabel: string
  /** "C5", "company O4", or the title when there is no ref (redacted: "Private item"). */
  label: string
}

export interface OkrProfilePastKeyResult {
  id: string
  redacted: boolean
  title: string | null
  ref: string | null
  closureStatus: string
  outcome: string | null
  finalGrade: number | null
  finalProgress: number | null
  successors: OkrProfileSuccessor[]
  disposition: OkrProfileDisposition
}

export interface OkrProfilePastObjective {
  id: string
  redacted: boolean
  title: string | null
  ref: string | null
  level: string
  timeframe: { id: string; name: string }
  closedAt: string | null
  outcome: string | null
  finalGrade: number | null
  finalProgress: number | null
  /** The viewer may read the retrospective (not redacted and one exists). */
  hasRetrospective: boolean
  successors: OkrProfileSuccessor[]
  disposition: OkrProfileDisposition
  keyResults: OkrProfilePastKeyResult[]
}

export interface OkrProfilePayload {
  user: OkrProfilePerson
  /** Null when no timeframe exists at all. */
  timeframe: OkrProfileTimeframe | null
  viewer: {
    isSelf: boolean
    /** ADMIN / EXECUTIVE: may close before the timeframe ends. */
    canCloseEarly: boolean
  }
  header: OkrProfileHeader
  objectives: OkrProfileObjective[]
  /**
   * Initiatives assigned to the person that support a KPI only (kind INITIATIVE,
   * no KR, not on an objective in the tree). Shown as "Supporting KPIs".
   */
  supportingInitiatives: OkrProfileTodo[]
  past: OkrProfilePastObjective[]
  /** True when more past objectives exist than were returned. */
  pastTruncated: boolean
  generatedAt: string
}

/** PRF-9 filter state. `undefined` = no filter on that field. */
export interface OkrProfileFilters {
  level?: OkrProfileLevelBucket
  commitment?: KrCommitment
  status?: OkrProfileStatusKey
  blockedOnly?: boolean
  checkpointDue30?: boolean
}
