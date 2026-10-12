/**
 * Role definition (ROL-1…4) — client-safe JSON contracts.
 *
 * Value sets and labels (statuses, item sections) live in `types/package.ts`;
 * these are the shapes the API returns and the profile components render.
 */
import type { RoleDefinitionStatus, RoleItemSection } from '@/types/package'

export interface RoleDefinitionPerson {
  id: string
  name: string
  avatar: string | null
  designation: string | null
}

export interface RoleDefinitionItemDTO {
  id: string
  section: RoleItemSection
  /** Short heading (for a seat: the seat title). */
  label: string | null
  text: string
  position: number
}

export interface RoleDefinitionDTO {
  id: string
  userId: string
  timeframeId: string | null
  timeframeName: string | null
  packageId: string | null
  seatTitle: string
  reportsToId: string | null
  reportsTo: RoleDefinitionPerson | null
  reportsToText: string | null
  purpose: string
  effectiveFrom: string | null
  status: RoleDefinitionStatus
  approvedById: string | null
  approvedBy: RoleDefinitionPerson | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
  items: RoleDefinitionItemDTO[]
}

/** ROL-3: the role definition's reporting line compared with ManagerRelationship. */
export type ReportingLineState =
  /** reportsToId is one of the active org-chart managers. */
  | 'MATCH'
  /** reportsToId is set and is not an active org-chart manager. */
  | 'MISMATCH'
  /** Nothing to compare (no reportsToId — e.g. the manager is a seat, reportsToText). */
  | 'UNKNOWN'

export interface ReportingLineCheck {
  state: ReportingLineState
  /** Active managers from the org chart (ManagerRelationship, endedAt = null). */
  orgChartManagers: RoleDefinitionPerson[]
}

/** ROL-4: a planned direct-report seat and who (if anyone) fills it. */
export interface DirectReportSeat {
  itemId: string
  /** Seat title (item label, or the item text without its trailing "(date)"). */
  title: string
  /** Planned fill date / note from a trailing parenthetical, e.g. "30 Nov 2026". */
  plannedNote: string | null
  /** The full item text. */
  text: string
  /** Direct report (ManagerRelationship) whose title matches the seat; null = Vacant. */
  filledBy: RoleDefinitionPerson | null
}

export interface RoleDefinitionPermissions {
  /** May create a new role definition (draft or new version) for the subject. */
  canCreate: boolean
  /** May edit the subject's role definitions (manager chain / HR / Exec / Admin — never self). */
  canEdit: boolean
  /** May approve (manager chain / Exec / Admin — never self). */
  canApprove: boolean
  /** May delete a DRAFT. */
  canDelete: boolean
}

/** GET /api/package/role-definitions?userId&timeframeId */
export interface RoleDefinitionListResponse {
  userId: string
  timeframeId: string | null
  /** Subject's current designation (ROL-2 offer compares against it). */
  subjectDesignation: string | null
  /** The definition to show: APPROVED for the timeframe, else the latest DRAFT, else the latest evergreen one. */
  current: RoleDefinitionDTO | null
  /** A DRAFT newer than `current` (pending approval), when `current` is APPROVED. */
  pendingDraft: RoleDefinitionDTO | null
  /** Every version for the subject, newest first (includes `current`). */
  history: RoleDefinitionDTO[]
  reportingLine: ReportingLineCheck
  seats: DirectReportSeat[]
  /** Past timeframe — read-only for everyone but ADMIN / EXECUTIVE. */
  readOnly: boolean
  permissions: RoleDefinitionPermissions
}

/** Overview / sidebar summary (profile composition contract). */
export interface RoleDefinitionProfileSummary {
  id: string
  seatTitle: string
  reportsTo: { id: string | null; name: string } | null
  purpose: string
  topAccountabilities: string[]
  accountabilityCount: number
  status: RoleDefinitionStatus
  reportingLineMismatch: boolean
  vacantSeats: number
}

/** POST /api/package/role-definitions/[id]/approve */
export interface ApproveRoleDefinitionResult {
  definition: RoleDefinitionDTO
  supersededIds: string[]
  designationUpdated: boolean
}
