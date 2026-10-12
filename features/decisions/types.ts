/**
 * Decisions (DEC-1…4): JSON contracts shared by the API routes, the server
 * service and the client components. Pure and client-safe.
 *
 * Value sets and labels (statuses, link entity types) live in types/package.ts.
 */
import type { DecisionLinkEntityType, DecisionStatus, DependencyStatus } from '@/types/package'

export interface DecisionPerson {
  id: string
  name: string
  avatar: string | null
}

/** What the viewer may do with one decision (lib/package/access.ts resolveDecisionAccess). */
export interface DecisionRecordAccess {
  /** DEC-2 / DEC-4: record or change the decision. Decider, Executive or Admin. */
  canDecide: boolean
  /** Edit the request (title, needed by, options, links). Requester, decider, Executive or Admin. */
  canEdit: boolean
  /** Withdraw the request (requester while OPEN, or anyone who can decide). */
  canWithdraw: boolean
  /** DEC-4: anyone who can view. Comments are not built yet (no generic Comment model). */
  canComment: boolean
}

/** How a decision relates to the person whose profile is shown (DEC-3). */
export type DecisionRelation = 'LINKED' | 'ITEM' | 'REQUESTER' | 'DECIDER'

/** One DecisionLink, resolved for display. Private OKR items come back redacted (CON-8). */
export interface DecisionLinkView {
  id: string
  entityType: DecisionLinkEntityType
  entityId: string
  /** Null when redacted or the target no longer exists. */
  title: string | null
  /** Workbook id (D46, DEP14, KR1.2 …) when the target has one. */
  ref: string | null
  href: string | null
  status: string | null
  owner: DecisionPerson | null
  redacted: boolean
  /** The target was deleted. */
  missing: boolean
}

/** WorkDependency rows of type DECISION that wait on this decision (DEC-2). */
export interface DecisionDependencyView {
  id: string
  externalRef: string | null
  title: string
  status: DependencyStatus
  neededByDate: string | null
}

export interface DecisionDTO {
  id: string
  externalRef: string | null
  timeframeId: string
  timeframeName: string | null
  title: string
  requestedById: string | null
  requestedBy: DecisionPerson | null
  requestedByText: string | null
  deciderId: string
  decider: DecisionPerson | null
  /** ISO timestamp. */
  neededBy: string | null
  batch: string | null
  optionsText: string | null
  unblocksText: string | null
  status: DecisionStatus
  decisionText: string | null
  decidedAt: string | null
  decidedById: string | null
  decidedBy: DecisionPerson | null
  createdAt: string
  updatedAt: string
  /** DEC-1: OPEN and neededBy before today. */
  overdue: boolean
  links: DecisionLinkView[]
  /** Set by the "affecting" filter: why the decision shows on that person's profile. */
  relations?: DecisionRelation[]
  access: DecisionRecordAccess
}

export interface DecisionDetailDTO extends DecisionDTO {
  dependencies: DecisionDependencyView[]
}

export interface DecisionListPermissions {
  /** Request a decision (any signed-in user with the package module). */
  canCreate: boolean
  /** `button.decision.decide` held (the per-record decider rule still applies). */
  canDecideFeature: boolean
}

export interface DecisionListResponse {
  items: DecisionDTO[]
  total: number
  permissions: DecisionListPermissions
  /** OrganizationSettings.companyCeoUserId: the default decider for new requests. */
  defaultDeciderId: string | null
}

/** DEC-1: one batch of the decider's queue. */
export interface DecisionBatchGroup<T extends { batch: string | null; overdue: boolean } = DecisionDTO> {
  /** Batch label, or null for "No batch". */
  batch: string | null
  items: T[]
  overdueCount: number
}

export interface DecideDecisionResult {
  decision: DecisionDetailDTO
  /** Dependencies of type DECISION closed by recording this decision. */
  closedDependencyIds: string[]
}

/** Profile composition contract: `getDecisionsProfileSummary`. */
export interface DecisionsProfileSummary {
  /** OPEN decisions linked to the person or their items, or requested by them. */
  openAffecting: number
  /** OPEN decisions where the person is the decider. */
  awaitingMyDecision: number
  /** Of `awaitingMyDecision`, how many are past neededBy. */
  awaitingOverdue: number
  /** Of `openAffecting`, how many are past neededBy. */
  affectingOverdue: number
}
