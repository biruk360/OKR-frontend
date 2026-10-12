/**
 * Connections (CON-1 / CON-2) — the JSON contract of `GET /api/connections?type=&id=`.
 *
 * Consumed by `components/shared/connections/` (ConnectionChips, ConnectionsPanel),
 * the employee OKR profile tree and the quick views. Every shape here is plain JSON
 * (dates as ISO strings) so it can cross the API boundary unchanged.
 *
 * Redaction (CON-8): a linked item the viewer may not see is returned as
 * `{ redacted: true, type, id, … relation fields }` with no title, owner, status
 * or progress — the UI renders it as "Private item".
 */
import type { OkrLinkKind, OkrLinkSubKind } from '@/types/package'

/** Entities whose connections can be requested. */
export const CONNECTION_ENTITY_TYPES = ['OBJECTIVE', 'KEY_RESULT', 'TODO', 'KPI', 'DUTY', 'DEVELOPMENT'] as const
export type ConnectionEntityType = (typeof CONNECTION_ENTITY_TYPES)[number]
export function isConnectionEntityType(value: unknown): value is ConnectionEntityType {
  return typeof value === 'string' && (CONNECTION_ENTITY_TYPES as readonly string[]).includes(value)
}

/** Every kind of item that can appear in a connections payload. */
export type ConnectionItemType = ConnectionEntityType | 'MILESTONE' | 'DEPENDENCY' | 'DECISION'

/**
 * How a linked item relates to the subject.
 *   PARENT        — `parentObjectiveId` (objective → parent objective), or a KR's / duty's /
 *                   KPI's / development item's / task's own KR or objective
 *   CHILD         — child objective (`parentObjectiveId` points at the subject)
 *   CONTRIBUTES_TO / SUCCEEDS — an `OkrLink` (see `linkId`, `subKind`, `isPrimary`)
 *   ROLLED_FROM   — `rolledFromId` with no matching SUCCEEDS link (clone / roll-forward)
 *   ATTACHED      — KPI / duty / development item / project milestone hanging off a KR or objective
 */
export type ConnectionVia = 'PARENT' | 'CHILD' | 'CONTRIBUTES_TO' | 'SUCCEEDS' | 'ROLLED_FROM' | 'ATTACHED'

export interface ConnectionPerson {
  id: string
  name: string | null
  avatar: string | null
}

/** Relation metadata shared by visible and redacted items. */
export interface ConnectionRelation {
  type: ConnectionItemType
  id: string
  via: ConnectionVia
  /** OkrLink id when `via` is CONTRIBUTES_TO / SUCCEEDS (lets the UI offer "remove link"). */
  linkId?: string
  linkKind?: OkrLinkKind
  subKind?: OkrLinkSubKind | null
  isPrimary?: boolean
}

export interface RedactedConnectionItem extends ConnectionRelation {
  redacted: true
}

/** Final state of a closed OKR item (predecessors, CON-6 / PRF-10). */
export interface ConnectionFinal {
  closureStatus: string
  outcome: string | null
  finalGrade: number | null
  finalProgress: number | null
}

export interface VisibleConnectionItem extends ConnectionRelation {
  redacted: false
  title: string
  /** Workbook id, card number ("#482"), project code … when the item has one. */
  ref: string | null
  /** Deep link to the item (detail page, todo modal or profile tab). */
  href: string
  status: string | null
  progress: number | null
  owner: ConnectionPerson | null
  /** OBJECTIVE level (COMPANY / DEPARTMENT / INDIVIDUAL); KRs carry their objective's level. */
  level?: string | null
  timeframe?: { id: string; name: string } | null
  dueDate?: string | null
  /** Set on closed objectives / KRs (predecessors in particular). */
  final?: ConnectionFinal | null
  /** MILESTONE only: the project it belongs to. */
  project?: { id: string; code: string; name: string } | null
  /** KR / KPI / duty / development rows: the KR or objective it hangs off. */
  parentLabel?: string | null
}

export type ConnectionItem = VisibleConnectionItem | RedactedConnectionItem

/** DEP-2 timing flags. */
export interface DependencyTiming {
  /** status ∉ {DONE, DROPPED} and neededByDate < today. */
  late: boolean
  /** Open, not late, and due within the next 7 days (today included). */
  dueSoon: boolean
  /** status ∉ {DONE, DROPPED}. */
  open: boolean
}

/**
 * INBOUND  — the subject waits on this dependency ("clear first").
 * OUTBOUND — others wait on the subject's owner ("others wait on this").
 * Derived per subject: OUTBOUND when the subject's owner is a PROVIDER and not a
 * NEEDER of the dependency, otherwise INBOUND (WorkDependencyLink has no direction).
 */
export type DependencyDirection = 'INBOUND' | 'OUTBOUND'

export interface ConnectionDependency extends DependencyTiming {
  type: 'DEPENDENCY'
  id: string
  ref: string | null
  title: string
  depType: string
  status: string
  neededByDate: string | null
  direction: DependencyDirection
  providers: ConnectionPerson[]
  needers: ConnectionPerson[]
  decisionId: string | null
  href: string
}

export interface VisibleConnectionDecision {
  type: 'DECISION'
  id: string
  redacted: false
  ref: string | null
  title: string
  status: string
  neededBy: string | null
  overdue: boolean
  batch: string | null
  decider: ConnectionPerson | null
  href: string
}

export interface RedactedConnectionDecision {
  type: 'DECISION'
  id: string
  redacted: true
}

export type ConnectionDecision = VisibleConnectionDecision | RedactedConnectionDecision

export interface ConnectionSummary {
  alignsTo: number
  supportedBy: number
  predecessors: number
  successors: number
  /** Late inbound dependencies (⛔ Blocked by). */
  blockedBy: number
  /** Refs (DEPxx) of the late inbound dependencies, for the chip label. */
  blockedByRefs: string[]
  /** Open inbound dependencies (⏳ Waiting on n). */
  waitingOn: number
  /** Open outbound dependencies (⇢ n waiting on this). */
  waitingOnThis: number
  /** Open outbound dependencies due within 7 days or late. */
  outboundDueSoon: number
  openDecisions: number
  kpis: number
  duties: number
  development: number
  milestones: number
}

export interface ConnectionsPayload {
  subject: { type: ConnectionEntityType; id: string; title: string | null; redacted: boolean }
  /** ↑ Aligns to: parent objective / own KR or objective + CONTRIBUTES_TO out. */
  alignsTo: ConnectionItem[]
  /** ↓ Supported by: child objectives + CONTRIBUTES_TO in. */
  supportedBy: ConnectionItem[]
  /** ⟲ From: SUCCEEDS out (+ rolledFromId fallback). */
  predecessors: ConnectionItem[]
  /** → Continued as: SUCCEEDS in (+ rolledTo fallback). */
  successors: ConnectionItem[]
  dependencies: { inbound: ConnectionDependency[]; outbound: ConnectionDependency[] }
  /** Open decisions linked to the subject. */
  decisions: ConnectionDecision[]
  /** KPIs linked to a KR (or empty). */
  kpis: ConnectionItem[]
  /** Duties linked to a KR / objective. */
  duties: ConnectionItem[]
  /** Development items linked to a KR. */
  development: ConnectionItem[]
  /** Project milestones driving a KR (CON-3). */
  milestones: ConnectionItem[]
  summary: ConnectionSummary
  permissions: {
    /** Viewer may add / remove OkrLinks that start at the subject (OBJECTIVE / KEY_RESULT only). */
    canManageLinks: boolean
  }
}
