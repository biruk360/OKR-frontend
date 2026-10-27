/**
 * Employee Operating Package — shared value sets and labels.
 *
 * Prisma stores enum-like values as strings in this repo (see prisma/schema.prisma,
 * models OkrLink … PackageItemReview). These const arrays are the single source of
 * truth for zod schemas, services and UI labels. Import from here — never redeclare.
 *
 * Spec: docs/employee_operating_package_REQUIREMENTS.md (§3, §8, §9).
 */

/** Builds a `(value) => boolean` type guard for a const value set. */
function guard<T extends string>(values: readonly T[]) {
  const set = new Set<string>(values)
  return (value: unknown): value is T => typeof value === 'string' && set.has(value)
}

// ---------------------------------------------------------------------------
// OKR links (LNK)
// ---------------------------------------------------------------------------

export const OKR_LINK_ENTITY_TYPES = ['OBJECTIVE', 'KEY_RESULT'] as const
export type OkrLinkEntityType = (typeof OKR_LINK_ENTITY_TYPES)[number]
export const isOkrLinkEntityType = guard(OKR_LINK_ENTITY_TYPES)

export const OKR_LINK_KINDS = ['SUCCEEDS', 'CONTRIBUTES_TO'] as const
export type OkrLinkKind = (typeof OKR_LINK_KINDS)[number]
export const isOkrLinkKind = guard(OKR_LINK_KINDS)
export const OKR_LINK_KIND_LABELS: Record<OkrLinkKind, string> = {
  SUCCEEDS: 'Succeeds',
  CONTRIBUTES_TO: 'Contributes to',
}

export const OKR_LINK_SUB_KINDS = ['CARRIED', 'REFRAMED', 'SUPERSEDED', 'MERGED', 'SPLIT'] as const
export type OkrLinkSubKind = (typeof OKR_LINK_SUB_KINDS)[number]
export const isOkrLinkSubKind = guard(OKR_LINK_SUB_KINDS)
export const OKR_LINK_SUB_KIND_LABELS: Record<OkrLinkSubKind, string> = {
  CARRIED: 'Carried',
  REFRAMED: 'Reframed',
  SUPERSEDED: 'Superseded',
  MERGED: 'Merged',
  SPLIT: 'Split',
}

// ---------------------------------------------------------------------------
// KR extensions (KRX) + Todo kind (FND-4)
// ---------------------------------------------------------------------------

export const KR_COMMITMENTS = ['COMMITTED', 'ASPIRATIONAL', 'MIXED'] as const
export type KrCommitment = (typeof KR_COMMITMENTS)[number]
export const isKrCommitment = guard(KR_COMMITMENTS)
export const KR_COMMITMENT_LABELS: Record<KrCommitment, string> = {
  COMMITTED: 'Committed',
  ASPIRATIONAL: 'Aspirational',
  MIXED: 'Committed / Aspirational',
}
/** Short workbook codes (C / A / C/A). */
export const KR_COMMITMENT_SHORT: Record<KrCommitment, string> = {
  COMMITTED: 'C',
  ASPIRATIONAL: 'A',
  MIXED: 'C/A',
}

export const KR_DIRECTIONS = ['INCREASE', 'DECREASE'] as const
export type KrDirection = (typeof KR_DIRECTIONS)[number]
export const isKrDirection = guard(KR_DIRECTIONS)
export const KR_DIRECTION_LABELS: Record<KrDirection, string> = {
  INCREASE: 'Increase',
  DECREASE: 'Decrease',
}

export const CHECKPOINT_STATUSES = ['PENDING', 'MET', 'MISSED'] as const
export type CheckpointStatus = (typeof CHECKPOINT_STATUSES)[number]
export const isCheckpointStatus = guard(CHECKPOINT_STATUSES)
export const CHECKPOINT_STATUS_LABELS: Record<CheckpointStatus, string> = {
  PENDING: 'Pending',
  MET: 'Met',
  MISSED: 'Missed',
}

/**
 * INITIATIVE (v2 workbook): the work behind a KR (`keyResultId` = that KR) or,
 * with no KR, behind a KPI. Its MILESTONE todos name it on their description's
 * first line ("Initiative: <externalRef> — <title>"); see lib/package/initiatives.ts.
 */
export const TODO_KINDS = ['TASK', 'MILESTONE', 'DUTY', 'DEPENDENCY', 'INITIATIVE'] as const
export type TodoKind = (typeof TODO_KINDS)[number]
export const isTodoKind = guard(TODO_KINDS)
export const TODO_KIND_LABELS: Record<TodoKind, string> = {
  TASK: 'Task',
  MILESTONE: 'Milestone',
  DUTY: 'Duty',
  DEPENDENCY: 'Delivery task',
  INITIATIVE: 'Initiative',
}
/** Display order inside a KR: initiatives, then milestones, then the rest. */
export const TODO_KIND_ORDER: Record<TodoKind, number> = {
  INITIATIVE: 0,
  MILESTONE: 1,
  TASK: 2,
  DEPENDENCY: 3,
  DUTY: 4,
}

// ---------------------------------------------------------------------------
// Recurring duties (DUT)
// ---------------------------------------------------------------------------

export const DUTY_CADENCES = [
  'DAILY',
  'WEEKDAYS',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'YEARLY',
  'EVERY_SPRINT',
  'EVENT',
] as const
export type DutyCadence = (typeof DUTY_CADENCES)[number]
export const isDutyCadence = guard(DUTY_CADENCES)
export const DUTY_CADENCE_LABELS: Record<DutyCadence, string> = {
  DAILY: 'Daily',
  WEEKDAYS: 'Weekdays',
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Every two weeks',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  SEMIANNUAL: 'Every six months',
  YEARLY: 'Yearly',
  EVERY_SPRINT: 'Every sprint',
  EVENT: 'Per event',
}
/** Display order for grouping duties by cadence (PRF-13: Daily → Yearly → Every sprint → Event). */
export const DUTY_CADENCE_ORDER: readonly DutyCadence[] = DUTY_CADENCES

export const DUTY_STATUSES = ['ACTIVE', 'PAUSED', 'RETIRED'] as const
export type DutyStatus = (typeof DUTY_STATUSES)[number]
export const isDutyStatus = guard(DUTY_STATUSES)
export const DUTY_STATUS_LABELS: Record<DutyStatus, string> = {
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  RETIRED: 'Retired',
}

// ---------------------------------------------------------------------------
// Role definition (ROL)
// ---------------------------------------------------------------------------

export const ROLE_DEFINITION_STATUSES = ['DRAFT', 'APPROVED', 'SUPERSEDED'] as const
export type RoleDefinitionStatus = (typeof ROLE_DEFINITION_STATUSES)[number]
export const isRoleDefinitionStatus = guard(ROLE_DEFINITION_STATUSES)
export const ROLE_DEFINITION_STATUS_LABELS: Record<RoleDefinitionStatus, string> = {
  DRAFT: 'Draft',
  APPROVED: 'Approved',
  SUPERSEDED: 'Superseded',
}

export const ROLE_ITEM_SECTIONS = ['ACCOUNTABILITY', 'DIRECT_REPORT_SEAT', 'DECISION_RIGHT', 'INTERFACE', 'OTHER'] as const
export type RoleItemSection = (typeof ROLE_ITEM_SECTIONS)[number]
export const isRoleItemSection = guard(ROLE_ITEM_SECTIONS)
export const ROLE_ITEM_SECTION_LABELS: Record<RoleItemSection, string> = {
  ACCOUNTABILITY: 'Accountabilities',
  DIRECT_REPORT_SEAT: 'Direct-report seats',
  DECISION_RIGHT: 'Decision rights',
  INTERFACE: 'Interfaces',
  OTHER: 'Other',
}

// ---------------------------------------------------------------------------
// KPIs (KPI)
// ---------------------------------------------------------------------------

export const KPI_TYPES = ['LEADING', 'LAGGING'] as const
export type KpiType = (typeof KPI_TYPES)[number]
export const isKpiType = guard(KPI_TYPES)
export const KPI_TYPE_LABELS: Record<KpiType, string> = {
  LEADING: 'Leading',
  LAGGING: 'Lagging',
}

export const KPI_DIRECTIONS = ['INCREASE', 'DECREASE', 'RANGE'] as const
export type KpiDirection = (typeof KPI_DIRECTIONS)[number]
export const isKpiDirection = guard(KPI_DIRECTIONS)
export const KPI_DIRECTION_LABELS: Record<KpiDirection, string> = {
  INCREASE: 'Higher is better',
  DECREASE: 'Lower is better',
  RANGE: 'Within range',
}

export const KPI_FREQUENCIES = ['WEEKLY', 'MONTHLY', 'QUARTERLY'] as const
export type KpiFrequency = (typeof KPI_FREQUENCIES)[number]
export const isKpiFrequency = guard(KPI_FREQUENCIES)
export const KPI_FREQUENCY_LABELS: Record<KpiFrequency, string> = {
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
}

export const KPI_RAGS = ['GREEN', 'AMBER', 'RED'] as const
export type KpiRag = (typeof KPI_RAGS)[number]
export const isKpiRag = guard(KPI_RAGS)
export const KPI_RAG_LABELS: Record<KpiRag, string> = {
  GREEN: 'On target',
  AMBER: 'Near target',
  RED: 'Off target',
}
/** Label for a reading taken before `scoredFrom` (KPI-2) or without a RAG. */
export const KPI_NOT_SCORED_LABEL = 'Measured (not scored)'

export const KPI_STATUSES = ['ACTIVE', 'RETIRED'] as const
export type KpiStatus = (typeof KPI_STATUSES)[number]
export const isKpiStatus = guard(KPI_STATUSES)
export const KPI_STATUS_LABELS: Record<KpiStatus, string> = {
  ACTIVE: 'Active',
  RETIRED: 'Retired',
}

export const KPI_READING_SOURCES = ['MANUAL', 'KR', 'IMPORT', 'ODOO'] as const
export type KpiReadingSource = (typeof KPI_READING_SOURCES)[number]
export const isKpiReadingSource = guard(KPI_READING_SOURCES)
export const KPI_READING_SOURCE_LABELS: Record<KpiReadingSource, string> = {
  MANUAL: 'Manual',
  KR: 'From key result',
  IMPORT: 'Imported',
  ODOO: 'Odoo CRM',
}

/**
 * `Kpi.externalSource`: readings come from an integration and manual entry is
 * disabled (only a manager's RAG override remains). See lib/integrations/odoo-sales.
 */
export const KPI_EXTERNAL_SOURCES = ['ODOO_WON', 'ODOO_COVERAGE', 'ODOO_PACE'] as const
export type KpiExternalSource = (typeof KPI_EXTERNAL_SOURCES)[number]
export const isKpiExternalSource = guard(KPI_EXTERNAL_SOURCES)
export const KPI_EXTERNAL_SOURCE_LABELS: Record<KpiExternalSource, string> = {
  ODOO_WON: 'Odoo CRM',
  ODOO_COVERAGE: 'Odoo CRM',
  ODOO_PACE: 'Odoo CRM',
}

// ---------------------------------------------------------------------------
// Development plan (DEV)
// ---------------------------------------------------------------------------

export const DEVELOPMENT_KINDS = ['CERTIFICATION', 'COURSE', 'TRAINING_HOURS', 'MENTORING', 'OTHER'] as const
export type DevelopmentKind = (typeof DEVELOPMENT_KINDS)[number]
export const isDevelopmentKind = guard(DEVELOPMENT_KINDS)
export const DEVELOPMENT_KIND_LABELS: Record<DevelopmentKind, string> = {
  CERTIFICATION: 'Certification',
  COURSE: 'Course',
  TRAINING_HOURS: 'Training hours',
  MENTORING: 'Mentoring',
  OTHER: 'Other',
}
/** Kinds that need evidence before DONE (DEV-2) and count toward the "items" rule (DEV-3). */
export const DEVELOPMENT_EVIDENCE_KINDS: readonly DevelopmentKind[] = ['CERTIFICATION', 'COURSE']

export const DEVELOPMENT_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'DROPPED'] as const
export type DevelopmentStatus = (typeof DEVELOPMENT_STATUSES)[number]
export const isDevelopmentStatus = guard(DEVELOPMENT_STATUSES)
export const DEVELOPMENT_STATUS_LABELS: Record<DevelopmentStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
  DROPPED: 'Dropped',
}

// ---------------------------------------------------------------------------
// Work dependencies (DEP)
// ---------------------------------------------------------------------------

export const DEPENDENCY_TYPES = ['DECISION', 'POLICY', 'HIRE', 'ASSET', 'DATA', 'SYSTEM', 'BUDGET', 'OTHER'] as const
export type DependencyType = (typeof DEPENDENCY_TYPES)[number]
export const isDependencyType = guard(DEPENDENCY_TYPES)
export const DEPENDENCY_TYPE_LABELS: Record<DependencyType, string> = {
  DECISION: 'Decision',
  POLICY: 'Policy',
  HIRE: 'Hire',
  ASSET: 'Asset',
  DATA: 'Data',
  SYSTEM: 'System',
  BUDGET: 'Budget',
  OTHER: 'Other',
}

export const DEPENDENCY_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'DROPPED'] as const
export type DependencyStatus = (typeof DEPENDENCY_STATUSES)[number]
export const isDependencyStatus = guard(DEPENDENCY_STATUSES)
export const DEPENDENCY_STATUS_LABELS: Record<DependencyStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
  BLOCKED: 'Blocked',
  DROPPED: 'Dropped',
}
/** Statuses that close a dependency (DEP-2: never late/due soon). */
export const DEPENDENCY_CLOSED_STATUSES: readonly DependencyStatus[] = ['DONE', 'DROPPED']

export const DEPENDENCY_PARTY_ROLES = ['PROVIDER', 'NEEDER'] as const
export type DependencyPartyRole = (typeof DEPENDENCY_PARTY_ROLES)[number]
export const isDependencyPartyRole = guard(DEPENDENCY_PARTY_ROLES)
export const DEPENDENCY_PARTY_ROLE_LABELS: Record<DependencyPartyRole, string> = {
  PROVIDER: 'Owner (delivers)',
  NEEDER: 'Needed by',
}

export const DEPENDENCY_LINK_ENTITY_TYPES = ['OBJECTIVE', 'KEY_RESULT', 'TODO', 'KPI', 'DUTY', 'DEVELOPMENT'] as const
export type DependencyLinkEntityType = (typeof DEPENDENCY_LINK_ENTITY_TYPES)[number]
export const isDependencyLinkEntityType = guard(DEPENDENCY_LINK_ENTITY_TYPES)

// ---------------------------------------------------------------------------
// Decisions (DEC)
// ---------------------------------------------------------------------------

export const DECISION_STATUSES = ['OPEN', 'DECIDED', 'DEFERRED', 'WITHDRAWN'] as const
export type DecisionStatus = (typeof DECISION_STATUSES)[number]
export const isDecisionStatus = guard(DECISION_STATUSES)
export const DECISION_STATUS_LABELS: Record<DecisionStatus, string> = {
  OPEN: 'Open',
  DECIDED: 'Decided',
  DEFERRED: 'Deferred',
  WITHDRAWN: 'Withdrawn',
}

export const DECISION_LINK_ENTITY_TYPES = [
  'USER',
  'OBJECTIVE',
  'KEY_RESULT',
  'TODO',
  'KPI',
  'DUTY',
  'DEVELOPMENT',
  'DEPENDENCY',
] as const
export type DecisionLinkEntityType = (typeof DECISION_LINK_ENTITY_TYPES)[number]
export const isDecisionLinkEntityType = guard(DECISION_LINK_ENTITY_TYPES)

// ---------------------------------------------------------------------------
// Operating package + review (PKG)
// ---------------------------------------------------------------------------

export const PACKAGE_STATUSES = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'ARCHIVED'] as const
export type PackageStatus = (typeof PACKAGE_STATUSES)[number]
export const isPackageStatus = guard(PACKAGE_STATUSES)
export const PACKAGE_STATUS_LABELS: Record<PackageStatus, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In review',
  APPROVED: 'Approved',
  ARCHIVED: 'Archived',
}

export const PACKAGE_REVIEW_ENTITY_TYPES = [
  'OBJECTIVE',
  'KEY_RESULT',
  'TODO',
  'KPI',
  'DUTY',
  'DEVELOPMENT',
  'ROLE_ITEM',
  'DEPENDENCY',
] as const
export type PackageReviewEntityType = (typeof PACKAGE_REVIEW_ENTITY_TYPES)[number]
export const isPackageReviewEntityType = guard(PACKAGE_REVIEW_ENTITY_TYPES)

export const REVIEW_VERDICTS = ['AGREE', 'DISPUTE'] as const
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number]
export const isReviewVerdict = guard(REVIEW_VERDICTS)
export const REVIEW_VERDICT_LABELS: Record<ReviewVerdict, string> = {
  AGREE: 'Agree',
  DISPUTE: 'Dispute',
}

/** Performance mix stored on `OperatingPackage.weightsJson` (PKG-4). */
export interface PackageWeights {
  kpis?: number
  values?: number
  okr?: number
  development?: number
  [key: string]: number | undefined
}
export const DEFAULT_PACKAGE_WEIGHTS: Readonly<Required<Pick<PackageWeights, 'kpis' | 'values' | 'okr' | 'development'>>> = {
  kpis: 50,
  values: 20,
  okr: 15,
  development: 15,
}

// ---------------------------------------------------------------------------
// Profile tabs + access areas (PRF-1, §8)
// ---------------------------------------------------------------------------

/** Profile tab keys (`?tab=` on /dashboard/org/users/[id]). */
export const PROFILE_TABS = ['overview', 'okrs', 'role', 'kpis', 'development', 'links', 'decisions'] as const
export type ProfileTab = (typeof PROFILE_TABS)[number]
export const isProfileTab = guard(PROFILE_TABS)
export const PROFILE_TAB_LABELS: Record<ProfileTab, string> = {
  overview: 'Overview',
  okrs: 'OKRs',
  role: 'Role & duties',
  kpis: 'KPIs',
  development: 'Development',
  links: 'Links & dependencies',
  decisions: 'Decisions',
}

/** Deep link to a profile tab — used by activity hydration, notifications and summary cards. */
export function profileTabHref(userId: string, tab: ProfileTab = 'overview'): string {
  const base = `/dashboard/org/users/${encodeURIComponent(userId)}`
  return tab === 'overview' ? base : `${base}?tab=${tab}`
}

/** Areas of a person's operating package that the §8 access matrix governs (lib/package/access.ts). */
export const PACKAGE_AREAS = [
  'okr',
  'role',
  'duties',
  'kpis',
  'kpis_sensitive',
  'development',
  'dependencies',
  'decisions',
  'package',
  'weights',
] as const
export type PackageArea = (typeof PACKAGE_AREAS)[number]
export const isPackageArea = guard(PACKAGE_AREAS)

/** Profile tab that shows a given area. */
export const PACKAGE_AREA_TAB: Record<PackageArea, ProfileTab> = {
  okr: 'okrs',
  role: 'role',
  duties: 'role',
  kpis: 'kpis',
  kpis_sensitive: 'kpis',
  development: 'development',
  dependencies: 'links',
  decisions: 'decisions',
  package: 'overview',
  weights: 'overview',
}

// ---------------------------------------------------------------------------
// Permissions (§8)
// ---------------------------------------------------------------------------

/** Doctypes registered by scripts/seed-package-permissions.ts (module `package`). */
export const PACKAGE_DOCTYPES = [
  'okr_link',
  'kr_checkpoint',
  'recurring_duty',
  'role_definition',
  'kpi',
  'kpi_reading',
  'development_item',
  'work_dependency',
  'decision',
  'operating_package',
  'package_item_review',
] as const
export type PackageDocType = (typeof PACKAGE_DOCTYPES)[number]

/** Feature keys (§8). Seeded in scripts/seed-permissions.ts and listed in FeaturesNavTab. */
export const PACKAGE_FEATURE_KEYS = {
  module: 'module.package',
  pagePeoplePackage: 'page.people.package',
  pageDependencyMap: 'page.okr.dependency-map',
  pageDecisions: 'page.okr.decisions',
  buttonDutyCreate: 'button.package.duty.create',
  buttonKpiCreate: 'button.package.kpi.create',
  buttonRoleApprove: 'button.package.role.approve',
  buttonPackageApprove: 'button.package.approve',
  buttonDecisionDecide: 'button.decision.decide',
  kpiSensitiveRead: 'package.kpi.sensitive.read',
  hr: 'package.hr',
} as const
export type PackageFeatureKey = (typeof PACKAGE_FEATURE_KEYS)[keyof typeof PACKAGE_FEATURE_KEYS]
