/**
 * Project Management & Delivery Intelligence — shared types & enums.
 *
 * Enums are stored as `String` in Prisma (platform convention). These const
 * objects + string-literal unions are the single source of truth for the values
 * and are reused across services, API routes, and UI. Do not re-declare elsewhere.
 *
 * Build spec: docs/project_management_module_BUILD_SPEC.md
 */

// --- Project ----------------------------------------------------------------

export const PROJECT_STATUSES = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const RAG_STATUSES = ['GREEN', 'AMBER', 'RED'] as const
export type RagStatus = (typeof RAG_STATUSES)[number]

export const CURRENCIES = ['ETB', 'USD', 'EUR'] as const
export type Currency = (typeof CURRENCIES)[number]

// --- Ownership / attribution ------------------------------------------------

export const OWNER_PARTIES = ['360GROUND', 'CLIENT', 'SHARED'] as const
export type OwnerParty = (typeof OWNER_PARTIES)[number]

// --- Activity status (exact Instagantt parity — colors in tailwind tokens) ---

export const ACTIVITY_STATUSES = [
  'NOT_STARTED',
  'STARTED',
  'FINISHED',
  'APPROVAL_REQUESTED',
  'APPROVED',
  'REJECTED',
] as const
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number]

/** Maps an activity status to its named Tailwind token (see tailwind.config.js). */
export const ACTIVITY_STATUS_TOKEN: Record<ActivityStatus, string> = {
  NOT_STARTED: 'project-status-not-started',
  STARTED: 'project-status-started',
  FINISHED: 'project-status-finished',
  APPROVAL_REQUESTED: 'project-status-approval-requested',
  APPROVED: 'project-status-approved',
  REJECTED: 'project-status-rejected',
}

/** Human-readable status labels for UI. */
export const ACTIVITY_STATUS_LABEL: Record<ActivityStatus, string> = {
  NOT_STARTED: 'Not started',
  STARTED: 'Started',
  FINISHED: 'Finished',
  APPROVAL_REQUESTED: 'Approval requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
}

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
export type Priority = (typeof PRIORITIES)[number]

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]

// --- Dependencies -----------------------------------------------------------

export const DEPENDENCY_TYPES = ['FS', 'SS', 'FF', 'SF'] as const
export type DependencyType = (typeof DEPENDENCY_TYPES)[number]

// --- Delay Ledger (Epic C) --------------------------------------------------

export const DELAY_EVENT_TYPES = ['APPROVAL_WAIT', 'BASELINE_SLIP', 'BLOCKED'] as const
export type DelayEventType = (typeof DELAY_EVENT_TYPES)[number]

/** Slip reason taxonomy → auto-suggested owner (overridable). Build spec §C4. */
export const SLIP_REASONS = [
  'CLIENT_APPROVAL_DELAY',
  'CLIENT_UNAVAILABILITY',
  'CLIENT_DEPENDENCY_NOT_PROVIDED',
  'SCOPE_ADDITION',
  'REQUIREMENT_CHANGE',
  'INTERNAL_CAPACITY',
  'TECHNICAL_BLOCKER',
  'ESTIMATION_ERROR',
  'EXTERNAL_DEPENDENCY',
] as const
export type SlipReason = (typeof SLIP_REASONS)[number]

/** Reason → default owner. UI pre-selects this; PM may override. */
export const SLIP_REASON_OWNER: Record<SlipReason, OwnerParty> = {
  CLIENT_APPROVAL_DELAY: 'CLIENT',
  CLIENT_UNAVAILABILITY: 'CLIENT',
  CLIENT_DEPENDENCY_NOT_PROVIDED: 'CLIENT',
  SCOPE_ADDITION: 'CLIENT',
  REQUIREMENT_CHANGE: 'CLIENT',
  INTERNAL_CAPACITY: '360GROUND',
  TECHNICAL_BLOCKER: '360GROUND',
  ESTIMATION_ERROR: '360GROUND',
  EXTERNAL_DEPENDENCY: 'SHARED',
}

export const SLIP_REASON_LABEL: Record<SlipReason, string> = {
  CLIENT_APPROVAL_DELAY: 'Client approval delay',
  CLIENT_UNAVAILABILITY: 'Client unavailability',
  CLIENT_DEPENDENCY_NOT_PROVIDED: 'Client dependency not provided',
  SCOPE_ADDITION: 'Scope addition',
  REQUIREMENT_CHANGE: 'Requirement change',
  INTERNAL_CAPACITY: 'Internal capacity',
  TECHNICAL_BLOCKER: 'Technical blocker',
  ESTIMATION_ERROR: 'Estimation error',
  EXTERNAL_DEPENDENCY: 'External dependency',
}

// --- Members ----------------------------------------------------------------

export const PROJECT_MEMBER_ROLES = ['PM', 'DEVELOPER', 'QA', 'DESIGNER', 'BA', 'CLIENT_CONTACT'] as const
export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number]

// --- Comment / attachment visibility (hard data rule — Epic F/I) ------------

export const VISIBILITY = ['INTERNAL', 'CLIENT_VISIBLE'] as const
export type Visibility = (typeof VISIBILITY)[number]

// --- Reports ----------------------------------------------------------------

export const REPORT_TYPES = [
  'CLIENT_BIMONTHLY',
  'WBR',
  'INDIVIDUAL',
  'TEAM',
  'SCRUM',
  'STEERING',
  'COE',
  'PORTFOLIO',
  'ESTIMATION',
  'CAPACITY',
] as const
export type ReportType = (typeof REPORT_TYPES)[number]

export const REPORT_STATUSES = ['DRAFT', 'PM_REVIEW', 'APPROVED', 'SENT'] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

// --- AI constraints (Issue #15 — enforced in code, not prompt) --------------

export const AI_SUMMARY_MAX_BULLETS = 5
export const AI_SUMMARY_MAX_CHARS = 800

// --- Rollup / confidence shared shapes --------------------------------------

/** A node in the schedule tree carrying the fields rollup/confidence need. */
export interface WeightedNode {
  weight: number
  percentComplete: number
}
