/**
 * PlanSpec validation and template resolution.
 * Spec: docs/AI_Automations_Requirements_v1.0.md §6.
 *
 * The instruction is the authoring surface; the PlanSpec is the execution
 * surface. Everything the worker is allowed to do must be expressible here and
 * validated here — the worker itself never improvises.
 */

import { z } from 'zod'
import {
  AVAILABLE_TOOL_IDS,
  CALENDAR_SYSTEMS,
  CATCH_UP_POLICIES,
  DEFAULT_MAX_COST_USD,
  DEFAULT_MAX_FINDINGS,
  DEFAULT_MAX_STEPS,
  DEFAULT_TIMEOUT_SECONDS,
  ODOO_ALLOWED_MODELS,
  ODOO_MAX_LIMIT,
  OKR_QUERY_ENTITIES,
  OKR_QUERY_SCOPES,
  ON_EMPTY_POLICIES,
  OVERLAP_POLICIES,
  QUARTER_OFFSETS,
  QUARTER_SOURCES,
  SCHEDULE_KINDS,
  TOOL_IDS,
  WEEKDAYS,
  type PlanSpec,
  type ToolGrant,
  type ToolId,
} from '@/types/automations'
import { parseCron } from './schedule'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const hhmm = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm (24-hour)')

const scheduleSchema = z.object({
  kind: z.enum(SCHEDULE_KINDS),
  timezone: z.string().min(1),
  calendarSystem: z.enum(CALENDAR_SYSTEMS).optional(),
  atTime: hhmm.optional(),
  runAt: z.string().optional(),
  minute: z.number().int().min(0).max(59).optional(),
  activeWindowStart: hhmm.optional(),
  activeWindowEnd: hhmm.optional(),
  weekdaysOnly: z.boolean().optional(),
  byDay: z.array(z.enum(WEEKDAYS)).min(1).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  nthWeekday: z.object({
    nth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(-1)]),
    day: z.enum(WEEKDAYS),
  }).optional(),
  lastBusinessDay: z.boolean().optional(),
  quarterSource: z.enum(QUARTER_SOURCES).optional(),
  quarterOffset: z.enum(QUARTER_OFFSETS).optional(),
  quarterOffsetDays: z.number().int().min(0).max(120).optional(),
  month: z.number().int().min(1).max(12).optional(),
  day: z.number().int().min(1).max(31).optional(),
  cron: z.string().optional(),
  catchUpPolicy: z.enum(CATCH_UP_POLICIES).optional(),
  catchUpWindowMinutes: z.number().int().min(1).max(10080).optional(),
  overlapPolicy: z.enum(OVERLAP_POLICIES).optional(),
  jitterSeconds: z.number().int().min(0).max(3600).optional(),
  skipHolidays: z.boolean().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  maxRuns: z.number().int().min(1).optional(),
})

const stepSchema = z.object({
  id: z.string().min(1).max(40).regex(/^[a-zA-Z0-9_-]+$/, 'Step id must be alphanumeric'),
  tool: z.enum(TOOL_IDS),
  label: z.string().min(1).max(120),
  params: z.record(z.string(), z.unknown()).default({}),
  from: z.string().optional(),
})

const planSchema = z.object({
  version: z.number().int().min(1),
  schedule: scheduleSchema,
  steps: z.array(stepSchema).max(DEFAULT_MAX_STEPS),
  synthesis: z.object({
    objective: z.string().min(1).max(2000),
    relevanceCriteria: z.string().max(2000).optional(),
    findingSchema: z.object({
      dedupeKeyFields: z.array(z.string().min(1)).min(1).max(8),
      fields: z.array(z.string().min(1)).max(20),
    }).optional(),
    maxFindings: z.number().int().min(1).max(200).optional(),
  }),
  briefing: z.object({
    titleTemplate: z.string().min(1).max(200),
    sections: z.array(z.string()).optional(),
    tone: z.string().max(200).optional(),
  }),
  notify: z.object({
    emailRecipients: z.array(z.string().min(1)).default([]),
    inApp: z.boolean().optional(),
    telegramChatId: z.string().nullable().optional(),
    onEmpty: z.enum(ON_EMPTY_POLICIES).optional(),
  }),
  limits: z.object({
    maxSteps: z.number().int().min(1).max(DEFAULT_MAX_STEPS).optional(),
    maxCostUsd: z.number().min(0).max(50).optional(),
    timeoutSeconds: z.number().int().min(10).max(3600).optional(),
  }).optional(),
})

/** Per-tool parameter schemas. A tool without an entry accepts no parameters. */
const toolParamSchemas: Partial<Record<ToolId, z.ZodTypeAny>> = {
  'okr.query': z.object({
    entities: z.array(z.enum(OKR_QUERY_ENTITIES)).min(1),
    scope: z.enum(OKR_QUERY_SCOPES).optional(),
    updatedWithinDays: z.number().int().min(1).max(3650).optional(),
    staleForDays: z.number().int().min(1).max(3650).optional(),
    statuses: z.array(z.string().min(1)).max(20).optional(),
    confidence: z.array(z.string().min(1)).max(10).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  }),
  // An Odoo domain is an array of [field, operator, value] triples interleaved
  // with '&' | '|' | '!'. Deep validation happens in the tool; this is the shape.
  'odoo.search': z.object({
    model: z.enum(ODOO_ALLOWED_MODELS),
    domain: z.array(z.union([z.string(), z.array(z.unknown()).length(3)])).max(40).optional(),
    fields: z.array(z.string().min(1).max(64)).max(30).optional(),
    limit: z.number().int().min(1).max(ODOO_MAX_LIMIT).optional(),
    order: z.string().max(120).optional(),
  }),
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export class PlanValidationError extends Error {
  readonly code = 'PLAN_INVALID'
  constructor(message: string, readonly issues: string[] = []) {
    super(message)
    this.name = 'PlanValidationError'
  }
}

export interface ValidatePlanOptions {
  /** Tool grants held by the automation. A step outside these is rejected. */
  grants?: ToolGrant[]
  /** Owner's per-run spend ceiling; a plan may lower it but never raise it. */
  maxCostUsdPerRun?: number
}

/**
 * Parse and validate a PlanSpec. Throws PlanValidationError with every problem
 * collected, so the compile UI can show them all at once rather than one per
 * round-trip.
 */
export function validatePlan(input: unknown, options: ValidatePlanOptions = {}): PlanSpec {
  const parsed = planSchema.safeParse(input)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'plan'}: ${i.message}`)
    throw new PlanValidationError('Plan failed schema validation', issues)
  }
  const plan = parsed.data as PlanSpec
  const issues: string[] = []

  // --- Schedule anchors --------------------------------------------------
  const s = plan.schedule
  if (s.kind === 'ONCE') {
    if (!s.runAt || Number.isNaN(new Date(s.runAt).getTime())) issues.push('schedule.runAt: required valid datetime for ONCE')
  } else if (s.kind === 'CUSTOM_CRON') {
    if (!s.cron) issues.push('schedule.cron: required for CUSTOM_CRON')
    else {
      try {
        parseCron(s.cron)
      } catch (error) {
        issues.push(`schedule.cron: ${(error as Error).message}`)
      }
    }
  } else if (s.kind !== 'HOURLY' && !s.atTime) {
    issues.push(`schedule.atTime: required for ${s.kind}`)
  }

  if (s.kind === 'WEEKLY' && !s.byDay?.length) issues.push('schedule.byDay: at least one weekday required for WEEKLY')

  if (s.kind === 'MONTHLY') {
    const anchors = [s.dayOfMonth !== undefined, s.nthWeekday !== undefined, s.lastBusinessDay === true]
    const count = anchors.filter(Boolean).length
    if (count === 0) issues.push('schedule: MONTHLY needs one of dayOfMonth, nthWeekday, or lastBusinessDay')
    if (count > 1) issues.push('schedule: MONTHLY accepts exactly one of dayOfMonth, nthWeekday, lastBusinessDay')
  }

  if (s.kind === 'YEARLY' && (s.month === undefined || s.day === undefined)) {
    issues.push('schedule: YEARLY needs both month and day')
  }

  if (s.activeWindowStart && s.activeWindowEnd && s.activeWindowStart >= s.activeWindowEnd) {
    issues.push('schedule.activeWindowEnd: must be later than activeWindowStart')
  }

  try {
    Intl.DateTimeFormat('en-US', { timeZone: s.timezone })
  } catch {
    issues.push(`schedule.timezone: "${s.timezone}" is not a recognised IANA timezone`)
  }

  if (s.calendarSystem === 'ETHIOPIAN' && !['MONTHLY', 'YEARLY'].includes(s.kind)) {
    issues.push('schedule.calendarSystem: ETHIOPIAN applies to MONTHLY and YEARLY only')
  }

  // --- Steps -------------------------------------------------------------
  const maxSteps = plan.limits?.maxSteps ?? DEFAULT_MAX_STEPS
  if (plan.steps.length > maxSteps) issues.push(`steps: ${plan.steps.length} exceeds limits.maxSteps (${maxSteps})`)

  const seen = new Set<string>()
  const grantedTools = new Set((options.grants ?? []).map((g) => g.tool))

  plan.steps.forEach((step, index) => {
    if (seen.has(step.id)) issues.push(`steps[${index}].id: duplicate step id "${step.id}"`)
    seen.add(step.id)

    if (!AVAILABLE_TOOL_IDS.includes(step.tool)) {
      issues.push(`steps[${index}].tool: "${step.tool}" is specified but not available yet in this phase`)
    } else if (options.grants && !grantedTools.has(step.tool)) {
      issues.push(`steps[${index}].tool: "${step.tool}" is not granted to this automation`)
    }

    // The egress rule (spec §7.1): a step may only consume an EARLIER step's
    // output, never a later one, and never a step that doesn't exist.
    if (step.from !== undefined) {
      if (!seen.has(step.from) || step.from === step.id) {
        issues.push(`steps[${index}].from: "${step.from}" must reference an earlier step`)
      }
    }

    const paramSchema = toolParamSchemas[step.tool]
    if (paramSchema) {
      const result = paramSchema.safeParse(step.params)
      if (!result.success) {
        for (const issue of result.error.issues) {
          issues.push(`steps[${index}].params.${issue.path.join('.') || '*'}: ${issue.message}`)
        }
      }
    }
  })

  if (plan.steps.length === 0) issues.push('steps: a plan needs at least one step')

  // --- Templates ---------------------------------------------------------
  for (const unknownVar of unknownTemplateVars(plan)) {
    issues.push(`template: unknown variable {{${unknownVar}}}`)
  }

  // --- Limits ------------------------------------------------------------
  const cap = options.maxCostUsdPerRun
  const planCost = plan.limits?.maxCostUsd
  if (cap !== undefined && planCost !== undefined && planCost > cap) {
    issues.push(`limits.maxCostUsd: ${planCost} exceeds the automation's per-run cap of ${cap}`)
  }

  if (issues.length > 0) throw new PlanValidationError('Plan failed validation', issues)
  return plan
}

/** Fill in every optional the worker relies on, so the runner never guesses. */
export function withPlanDefaults(plan: PlanSpec): PlanSpec {
  return {
    ...plan,
    synthesis: {
      ...plan.synthesis,
      maxFindings: plan.synthesis.maxFindings ?? DEFAULT_MAX_FINDINGS,
      findingSchema: plan.synthesis.findingSchema ?? { dedupeKeyFields: ['title'], fields: [] },
    },
    notify: {
      ...plan.notify,
      inApp: plan.notify.inApp ?? true,
      onEmpty: plan.notify.onEmpty ?? 'SKIP',
    },
    limits: {
      maxSteps: plan.limits?.maxSteps ?? DEFAULT_MAX_STEPS,
      maxCostUsd: plan.limits?.maxCostUsd ?? DEFAULT_MAX_COST_USD,
      timeoutSeconds: plan.limits?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
    },
  }
}

// ---------------------------------------------------------------------------
// Template variables (spec §6.3)
//
// Resolved by the worker before tool invocation — never by the model. An
// unrecognised variable is a validation error rather than a silent empty string.
// ---------------------------------------------------------------------------

export interface TemplateContext {
  now: Date
  timezone: string
  lastRunAt?: Date | null
  ownerName?: string
  orgName?: string
}

const RELATIVE_VAR = /^now([+-])(\d+)([dhwm])$/

export const TEMPLATE_VARS = [
  'now', 'today', 'date', 'month', 'monthName', 'year', 'quarter',
  'lastRunAt', 'owner.name', 'org.name',
] as const

function isKnownVar(name: string): boolean {
  if ((TEMPLATE_VARS as readonly string[]).includes(name)) return true
  return RELATIVE_VAR.test(name)
}

function collectTemplateVars(value: unknown, out: Set<string>): void {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) out.add(match[1])
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTemplateVars(item, out)
    return
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectTemplateVars(item, out)
  }
}

export function unknownTemplateVars(plan: PlanSpec): string[] {
  const found = new Set<string>()
  collectTemplateVars(plan.steps, found)
  collectTemplateVars(plan.briefing, found)
  collectTemplateVars(plan.synthesis, found)
  return Array.from(found).filter((name) => !isKnownVar(name))
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function shiftDate(from: Date, sign: string, amount: number, unit: string): Date {
  const ms = { h: 3_600_000, d: 86_400_000, w: 604_800_000 }[unit]
  if (ms) return new Date(from.getTime() + (sign === '-' ? -1 : 1) * amount * ms)
  // months: calendar-aware rather than 30-day approximations
  const shifted = new Date(from.getTime())
  shifted.setUTCMonth(shifted.getUTCMonth() + (sign === '-' ? -amount : amount))
  return shifted
}

export function resolveTemplateValue(name: string, ctx: TemplateContext): string {
  const relative = RELATIVE_VAR.exec(name)
  if (relative) {
    return shiftDate(ctx.now, relative[1], Number(relative[2]), relative[3]).toISOString()
  }

  const iso = ctx.now.toISOString()
  switch (name) {
    case 'now': return iso
    case 'today':
    case 'date': return iso.slice(0, 10)
    case 'month': return iso.slice(5, 7)
    case 'monthName': return MONTH_NAMES[ctx.now.getUTCMonth()]
    case 'year': return String(ctx.now.getUTCFullYear())
    case 'quarter': return `Q${Math.floor(ctx.now.getUTCMonth() / 3) + 1}`
    case 'lastRunAt': return ctx.lastRunAt ? ctx.lastRunAt.toISOString() : ''
    case 'owner.name': return ctx.ownerName ?? ''
    case 'org.name': return ctx.orgName ?? ''
    default: return ''
  }
}

/** Substitute {{vars}} throughout any JSON-ish value. Strings only; keys untouched. */
export function resolveTemplates<T>(value: T, ctx: TemplateContext): T {
  if (typeof value === 'string') {
    return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, name: string) =>
      resolveTemplateValue(name.trim(), ctx)
    ) as unknown as T
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplates(item, ctx)) as unknown as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) out[key] = resolveTemplates(item, ctx)
    return out as unknown as T
  }
  return value
}
