/**
 * AI Automations module value sets and plan contracts.
 *
 * Spec: docs/AI_Automations_Requirements_v1.0.md
 *
 * Prisma stores enum-like values as strings in this repo. These const arrays are
 * the shared source of truth for validation, route schemas, the worker, and UI.
 *
 * The three layers to keep straight (§1 of the spec):
 *   Automation — the saved config (instruction + schedule + grants + recipients)
 *   Run        — one firing; the audit object
 *   Briefing   — the rendered document a Run produces; Findings are its payload
 */

// ---------------------------------------------------------------------------
// Value sets
// ---------------------------------------------------------------------------

export const SCHEDULE_KINDS = [
  'ONCE',
  'HOURLY',
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
  'CUSTOM_CRON',
] as const
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number]

export const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const
export type Weekday = (typeof WEEKDAYS)[number]

export const CATCH_UP_POLICIES = ['SKIP', 'RUN_LATE', 'RUN_ONCE_LATEST'] as const
export type CatchUpPolicy = (typeof CATCH_UP_POLICIES)[number]

export const OVERLAP_POLICIES = ['SKIP', 'QUEUE'] as const
export type OverlapPolicy = (typeof OVERLAP_POLICIES)[number]

export const CALENDAR_SYSTEMS = ['GREGORIAN', 'ETHIOPIAN'] as const
export type CalendarSystem = (typeof CALENDAR_SYSTEMS)[number]

export const QUARTER_SOURCES = ['CALENDAR', 'FISCAL'] as const
export type QuarterSource = (typeof QUARTER_SOURCES)[number]

export const QUARTER_OFFSETS = ['FIRST_DAY', 'LAST_DAY', 'N_DAYS_BEFORE_END'] as const
export type QuarterOffset = (typeof QUARTER_OFFSETS)[number]

/** Distribution mode. The gate is *distribution*, not creation — see spec §4.1. */
export const DISTRIBUTION_MODES = ['DRY_RUN', 'REVIEW', 'AUTO'] as const
export type DistributionMode = (typeof DISTRIBUTION_MODES)[number]

export const AUTOMATION_STATUSES = ['ENABLED', 'PAUSED', 'DISABLED_ON_FAILURE', 'ENDED'] as const
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number]

export const RUN_STATUSES = [
  'QUEUED',
  'LEASED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'SKIPPED',
  'MISSED',
  'CANCELLED',
] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

export const RUN_TRIGGERS = ['SCHEDULE', 'MANUAL', 'RETRY'] as const
export type RunTrigger = (typeof RUN_TRIGGERS)[number]

export const BRIEFING_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED'] as const
export type BriefingStatus = (typeof BRIEFING_STATUSES)[number]

export const DELIVERY_CHANNELS = ['EMAIL', 'IN_APP', 'TELEGRAM'] as const
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number]

export const DELIVERY_STATUSES = ['PENDING', 'SENT', 'FAILED', 'SUPPRESSED'] as const
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

export const ON_EMPTY_POLICIES = ['SKIP', 'SEND'] as const
export type OnEmptyPolicy = (typeof ON_EMPTY_POLICIES)[number]

/**
 * Tool ids. P0 ships `okr.query` only; the rest are declared here so the plan
 * validator can reject them with a "not available yet" message rather than an
 * "unknown tool" one. Phases: see spec §17.
 */
export const TOOL_IDS = [
  'okr.query',      // P0
  'odoo.search',    // P1
  'web.search',     // P2
  'web.fetch',      // P2
  'mail.search',    // P3
  'site.login',     // P3
] as const
export type ToolId = (typeof TOOL_IDS)[number]

export const AVAILABLE_TOOL_IDS: readonly ToolId[] = ['okr.query', 'odoo.search'] as const

export const OKR_QUERY_ENTITIES = [
  'objectives',
  'keyResults',
  'todos',
  'projects',
  'risks',
  'sprints',
] as const
export type OkrQueryEntity = (typeof OKR_QUERY_ENTITIES)[number]

export const OKR_QUERY_SCOPES = ['OWNER', 'DEPARTMENT', 'ORG'] as const
export type OkrQueryScope = (typeof OKR_QUERY_SCOPES)[number]

/**
 * Models `odoo.search` may read. A grant narrows this further per automation;
 * this constant is the outer bound nothing can exceed. Read-only is enforced
 * separately and unconditionally by lib/odoo/client.ts.
 */
export const ODOO_ALLOWED_MODELS = [
  'crm.lead',
  'crm.stage',
  'sale.order',
  'sale.order.line',
  'account.move',
  'res.partner',
  'project.task',
  'project.project',
] as const
export type OdooModel = (typeof ODOO_ALLOWED_MODELS)[number]

export const ODOO_MAX_LIMIT = 200

// ---------------------------------------------------------------------------
// Briefing block model (spec §8.1)
//
// The model emits typed blocks; the server renders them. Raw HTML never comes
// out of the model — that keeps every Briefing on-brand, makes the email
// rendering reliable, and makes sanitisation structural instead of a blocklist.
// ---------------------------------------------------------------------------

export const BLOCK_TYPES = [
  'heading',
  'paragraph',
  'metric',
  'table',
  'list',
  'callout',
  'finding',
  'linkCard',
  'divider',
] as const
export type BlockType = (typeof BLOCK_TYPES)[number]

export const BLOCK_TONES = ['neutral', 'success', 'warning', 'danger'] as const
export type BlockTone = (typeof BLOCK_TONES)[number]

export const FINDING_STATUSES = ['NEW', 'CHANGED', 'UNCHANGED', 'RESOLVED'] as const
export type FindingStatus = (typeof FINDING_STATUSES)[number]

export interface HeadingBlock {
  type: 'heading'
  level: 2 | 3
  text: string
}

export interface ParagraphBlock {
  type: 'paragraph'
  /** Plain text with inline `**bold**`, `_italic_`, and `[label](url)` only. */
  text: string
}

export interface MetricBlock {
  type: 'metric'
  label: string
  value: string
  delta?: string
  tone?: BlockTone
}

export interface TableBlock {
  type: 'table'
  columns: string[]
  rows: string[][]
  caption?: string
}

export interface ListBlock {
  type: 'list'
  ordered?: boolean
  items: string[]
}

export interface CalloutBlock {
  type: 'callout'
  tone: BlockTone
  title?: string
  text: string
}

export interface FindingBlock {
  type: 'finding'
  dedupeKey: string
  status: FindingStatus
  title: string
  url?: string
  fields?: Record<string, string>
  score?: number
  /** Populated by the differ for CHANGED findings — "deadline 12 Aug → 19 Aug". */
  changeNote?: string
}

export interface LinkCardBlock {
  type: 'linkCard'
  url: string
  title: string
  source?: string
  publishedAt?: string
  snippet?: string
}

export interface DividerBlock {
  type: 'divider'
}

export type BriefingBlock =
  | HeadingBlock
  | ParagraphBlock
  | MetricBlock
  | TableBlock
  | ListBlock
  | CalloutBlock
  | FindingBlock
  | LinkCardBlock
  | DividerBlock

// ---------------------------------------------------------------------------
// Findings (spec §8.3)
// ---------------------------------------------------------------------------

/** What the model returns. `dedupeKey` is derived server-side, never by the model. */
export interface RawFinding {
  title: string
  url?: string
  fields?: Record<string, string>
  score?: number
}

/** What gets persisted on the run and diffed against the previous run. */
export interface Finding extends RawFinding {
  dedupeKey: string
  contentHash: string
  status: FindingStatus
  changeNote?: string
}

// ---------------------------------------------------------------------------
// PlanSpec (spec §6.2)
//
// The instruction is the authoring surface; this is the execution surface. The
// worker walks it deterministically — the model is used for judgment and prose,
// never for deciding what to do.
// ---------------------------------------------------------------------------

export interface ScheduleSpec {
  kind: ScheduleKind
  timezone: string
  calendarSystem?: CalendarSystem
  /** HH:mm, 24h, in `timezone`. Required for every kind except ONCE and CUSTOM_CRON. */
  atTime?: string
  /** ONCE — ISO datetime. */
  runAt?: string
  /** HOURLY — minute of the hour, plus an optional active window "HH:mm"–"HH:mm". */
  minute?: number
  activeWindowStart?: string
  activeWindowEnd?: string
  /** DAILY / HOURLY — restrict to Mon–Fri. */
  weekdaysOnly?: boolean
  /** WEEKLY. */
  byDay?: Weekday[]
  /** MONTHLY — exactly one of these three. */
  dayOfMonth?: number
  nthWeekday?: { nth: 1 | 2 | 3 | 4 | -1; day: Weekday }
  lastBusinessDay?: boolean
  /** QUARTERLY. */
  quarterSource?: QuarterSource
  quarterOffset?: QuarterOffset
  quarterOffsetDays?: number
  /** YEARLY — month is 1-12. */
  month?: number
  day?: number
  /** CUSTOM_CRON — standard 5-field cron, evaluated in `timezone`. */
  cron?: string
  /** Policies (spec §5.2). */
  catchUpPolicy?: CatchUpPolicy
  catchUpWindowMinutes?: number
  overlapPolicy?: OverlapPolicy
  jitterSeconds?: number
  skipHolidays?: boolean
  startDate?: string
  endDate?: string
  maxRuns?: number
}

export interface PlanStep {
  id: string
  tool: ToolId
  label: string
  params: Record<string, unknown>
  /** References an earlier step's output. Restricted by the egress rule, spec §7.1. */
  from?: string
}

export interface SynthesisSpec {
  objective: string
  relevanceCriteria?: string
  findingSchema?: {
    /** Fields hashed into the dedupe key. Order-insensitive. */
    dedupeKeyFields: string[]
    fields: string[]
  }
  maxFindings?: number
}

export interface BriefingSpec {
  titleTemplate: string
  sections?: string[]
  tone?: string
}

export interface NotifySpec {
  emailRecipients: string[]
  inApp?: boolean
  telegramChatId?: string | null
  onEmpty?: OnEmptyPolicy
}

export interface PlanLimits {
  maxSteps?: number
  maxCostUsd?: number
  timeoutSeconds?: number
}

export interface PlanSpec {
  version: number
  schedule: ScheduleSpec
  steps: PlanStep[]
  synthesis: SynthesisSpec
  briefing: BriefingSpec
  notify: NotifySpec
  limits?: PlanLimits
}

// ---------------------------------------------------------------------------
// Run transcript (spec §10.1)
// ---------------------------------------------------------------------------

export interface StepTrace {
  stepId: string
  tool: ToolId
  label: string
  /** Resolved arguments, after template substitution and redaction. */
  args: Record<string, unknown>
  startedAt: string
  durationMs: number
  status: 'OK' | 'ERROR' | 'REFUSED'
  /** Rows / documents returned. */
  resultCount?: number
  resultBytes?: number
  /** Truncated preview so post-mortems don't need a re-run. */
  preview?: string
  error?: string
}

export interface ToolGrant {
  tool: ToolId
  params?: Record<string, unknown>
}

/** Parameters an `odoo.search` grant may carry. Absent = the outer bound applies. */
export interface OdooToolGrantParams {
  models?: OdooModel[]
  maxLimit?: number
}

export interface AutomationRecipient {
  userId: string
  channels: DeliveryChannel[]
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_TIMEZONE = 'Africa/Addis_Ababa'
export const DEFAULT_CATCH_UP_WINDOW_MINUTES = 120
export const DEFAULT_MAX_STEPS = 20
export const DEFAULT_MAX_COST_USD = 0.5
export const DEFAULT_TIMEOUT_SECONDS = 600
export const DEFAULT_MAX_FINDINGS = 30
export const DEFAULT_JITTER_SECONDS = 300
export const MAX_CONSECUTIVE_FAILURES = 3
export const LEASE_TTL_SECONDS = 60
export const LEASE_HEARTBEAT_SECONDS = 30
export const MAX_RUN_ATTEMPTS = 3
