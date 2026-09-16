/**
 * Instruction → PlanSpec compiler.
 * Spec: docs/AI_Automations_Requirements_v1.0.md §6, FR-01, FR-03.
 *
 * The whole point of compiling (§6.1): the instruction is the *authoring*
 * surface and the PlanSpec is the *execution* surface. Re-prompting from free
 * text on every run would make cost unpredictable, runs irreproducible, and let
 * a vague sentence quietly change behaviour at 03:00. So the model is asked once,
 * interactively, and the user reviews the result before it is ever scheduled.
 *
 * Failure posture: a plan that does not validate is re-prompted **once** with the
 * exact validation issues appended, then surfaced to the user. Two shots, not a
 * loop — an instruction the model cannot compile twice is one the user needs to
 * see the errors for, and an unbounded retry loop spends real money on it.
 */

import OpenAI from 'openai'
import { AI_FEATURE_KEYS, AI_MODELS } from '@/lib/ai/config'
import { resolveAiProviderCredential } from '@/lib/ai/credentials'
import { recordGenerationLog } from '@/lib/ai/generation-log'
import { estimateCostUsd } from '@/lib/ai/cost'
import { ProviderCallError, type AiUsage } from '@/lib/ai/providers/types'
import {
  AVAILABLE_TOOL_IDS,
  DEFAULT_TIMEZONE,
  ODOO_ALLOWED_MODELS,
  OKR_QUERY_ENTITIES,
  OKR_QUERY_SCOPES,
  SCHEDULE_KINDS,
  WEEKDAYS,
  type PlanSpec,
  type ToolGrant,
  type ToolId,
} from '@/types/automations'
import { PlanValidationError, TEMPLATE_VARS, validatePlan, withPlanDefaults } from './plan'

const MAX_OUTPUT_TOKENS = 4000

/**
 * The compiler's output schema. Deliberately narrower than the full PlanSpec:
 * the model chooses schedule anchors, steps and synthesis, but never the
 * recipients (an identity question the server resolves) and never the cost caps
 * (a governance question the owner's grant already fixes).
 */
const PLAN_JSON_SCHEMA = {
  name: 'automation_plan',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'schedule', 'steps', 'synthesis', 'briefing', 'notes'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 80 },
      notes: {
        type: 'string', maxLength: 600,
        description: 'What you assumed or could not determine from the instruction. Shown to the user.',
      },
      schedule: {
        type: 'object',
        additionalProperties: false,
        required: [
          'kind', 'atTime', 'byDay', 'dayOfMonth', 'minute',
          'weekdaysOnly', 'month', 'day', 'catchUpPolicy',
        ],
        properties: {
          kind: { type: 'string', enum: [...SCHEDULE_KINDS.filter((k) => k !== 'CUSTOM_CRON' && k !== 'ONCE')] },
          atTime: { type: ['string', 'null'], description: 'HH:mm, 24-hour' },
          byDay: { type: ['array', 'null'], items: { type: 'string', enum: [...WEEKDAYS] } },
          dayOfMonth: { type: ['integer', 'null'], minimum: 1, maximum: 31 },
          minute: { type: ['integer', 'null'], minimum: 0, maximum: 59 },
          weekdaysOnly: { type: ['boolean', 'null'] },
          month: { type: ['integer', 'null'], minimum: 1, maximum: 12 },
          day: { type: ['integer', 'null'], minimum: 1, maximum: 31 },
          catchUpPolicy: { type: ['string', 'null'], enum: ['SKIP', 'RUN_LATE', 'RUN_ONCE_LATEST', null] },
        },
      },
      steps: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['tool', 'label', 'okrQuery', 'odooSearch'],
          properties: {
            tool: { type: 'string', enum: [...AVAILABLE_TOOL_IDS] },
            label: { type: 'string', minLength: 1, maxLength: 80 },
            okrQuery: {
              type: ['object', 'null'],
              additionalProperties: false,
              required: ['entities', 'scope', 'staleForDays', 'updatedWithinDays', 'statuses', 'limit'],
              properties: {
                entities: { type: 'array', items: { type: 'string', enum: [...OKR_QUERY_ENTITIES] } },
                scope: { type: ['string', 'null'], enum: [...OKR_QUERY_SCOPES, null] },
                staleForDays: { type: ['integer', 'null'], minimum: 1, maximum: 3650 },
                updatedWithinDays: { type: ['integer', 'null'], minimum: 1, maximum: 3650 },
                statuses: { type: ['array', 'null'], items: { type: 'string' } },
                limit: { type: ['integer', 'null'], minimum: 1, maximum: 500 },
              },
            },
            odooSearch: {
              type: ['object', 'null'],
              additionalProperties: false,
              required: ['model', 'untouchedForDays', 'fields', 'limit'],
              properties: {
                model: { type: 'string', enum: [...ODOO_ALLOWED_MODELS] },
                untouchedForDays: { type: ['integer', 'null'], minimum: 1, maximum: 3650 },
                fields: { type: ['array', 'null'], items: { type: 'string' } },
                limit: { type: ['integer', 'null'], minimum: 1, maximum: 200 },
              },
            },
          },
        },
      },
      synthesis: {
        type: 'object',
        additionalProperties: false,
        required: ['objective', 'relevanceCriteria', 'dedupeKeyFields', 'fields', 'maxFindings'],
        properties: {
          objective: { type: 'string', minLength: 1, maxLength: 1000 },
          relevanceCriteria: { type: ['string', 'null'], maxLength: 1000 },
          dedupeKeyFields: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string' } },
          fields: { type: 'array', maxItems: 12, items: { type: 'string' } },
          maxFindings: { type: ['integer', 'null'], minimum: 1, maximum: 100 },
        },
      },
      briefing: {
        type: 'object',
        additionalProperties: false,
        required: ['titleTemplate', 'tone'],
        properties: {
          titleTemplate: { type: 'string', minLength: 1, maxLength: 120 },
          tone: { type: ['string', 'null'], maxLength: 160 },
        },
      },
    },
  },
} as const

export interface CompileInput {
  instruction: string
  ownerUserId: string
  timezone?: string
  /** Tools the author may actually use — the model is told about no others. */
  availableTools: ToolId[]
  now?: Date
  modelId?: string
  signal?: AbortSignal
}

export interface CompileResult {
  plan: PlanSpec
  grants: ToolGrant[]
  suggestedName: string
  /** What the model assumed — surfaced verbatim so the user can correct it. */
  notes: string
  usage: AiUsage
  modelId: string
  costUsd: number
  /** True when the first attempt failed validation and a repair pass was needed. */
  repaired: boolean
}

export class CompilerNotConfiguredError extends Error {
  readonly code = 'AI_NOT_CONFIGURED'
  constructor() {
    super('No OpenAI credential is configured — add one in Settings → Integrations → AI')
    this.name = 'CompilerNotConfiguredError'
  }
}

export class CompilerFailedError extends Error {
  readonly code = 'COMPILE_FAILED'
  constructor(message: string, readonly issues: string[] = []) {
    super(message)
    this.name = 'CompilerFailedError'
  }
}

function buildSystemPrompt(availableTools: ToolId[], timezone: string, today: string): string {
  const toolLines: string[] = []
  if (availableTools.includes('okr.query')) {
    toolLines.push(
      '- `okr.query` — internal OKR and delivery data. Fill `okrQuery` and set `odooSearch` to null.',
      `  entities: ${OKR_QUERY_ENTITIES.join(', ')}. scope: OWNER (the author's own records), DEPARTMENT, or ORG.`,
      '  `staleForDays` applies to keyResults and means "no check-in for N days".'
    )
  }
  if (availableTools.includes('odoo.search')) {
    toolLines.push(
      '- `odoo.search` — read-only Odoo CRM/ERP. Fill `odooSearch` and set `okrQuery` to null.',
      `  model must be one of: ${ODOO_ALLOWED_MODELS.join(', ')}.`,
      '  `untouchedForDays` becomes a write_date filter — use it for "stalled" or "not followed up".'
    )
  }

  return [
    'You turn a plain-language description of a recurring business task into a structured plan that a scheduler will execute unattended.',
    '',
    `Today is ${today}. The user\'s timezone is ${timezone}; all times you choose are in that timezone.`,
    '',
    'Available tools — you may use ONLY these:',
    ...toolLines,
    '',
    'Rules:',
    '- Every property in the schema must be present. Use null for the ones that do not apply.',
    '- One step per distinct source. Do not invent a step for a source that is not listed above.',
    '- If the instruction does not state a time, choose a sensible one (08:00 for morning work) and say so in `notes`.',
    '- If the instruction names a source you have no tool for, do NOT fake it: leave it out and say so plainly in `notes`.',
    '- `dedupeKeyFields` are the fields that identify an item across runs, so the system can tell a new item from one it already reported. Prefer stable identifiers over volatile ones like status or progress.',
    `- \`titleTemplate\` may use these variables: ${TEMPLATE_VARS.map((v) => `{{${v}}}`).join(', ')}.`,
    '- `notes` is for the user, not for you. State every assumption you made and anything you could not determine.',
    '- Be conservative. A plan that reads less and runs less often is easier for the user to widen than to claw back.',
  ].join('\n')
}

/** Convert the model's flattened wire shape into a real PlanSpec. */
function toPlanSpec(raw: Record<string, unknown>, timezone: string): { plan: unknown; grants: ToolGrant[]; name: string; notes: string } {
  const schedule = (raw.schedule ?? {}) as Record<string, unknown>
  const synthesis = (raw.synthesis ?? {}) as Record<string, unknown>
  const briefing = (raw.briefing ?? {}) as Record<string, unknown>
  const rawSteps = Array.isArray(raw.steps) ? (raw.steps as Array<Record<string, unknown>>) : []

  const steps: unknown[] = []
  const grants = new Map<ToolId, ToolGrant>()

  rawSteps.forEach((step, index) => {
    const tool = String(step.tool) as ToolId
    const id = `s${index + 1}`

    if (tool === 'okr.query' && step.okrQuery) {
      const q = step.okrQuery as Record<string, unknown>
      steps.push({
        id, tool, label: String(step.label ?? 'Internal data'),
        params: {
          entities: Array.isArray(q.entities) && q.entities.length ? q.entities : ['keyResults'],
          ...(q.scope ? { scope: q.scope } : {}),
          ...(typeof q.staleForDays === 'number' ? { staleForDays: q.staleForDays } : {}),
          ...(typeof q.updatedWithinDays === 'number' ? { updatedWithinDays: q.updatedWithinDays } : {}),
          ...(Array.isArray(q.statuses) && q.statuses.length ? { statuses: q.statuses } : {}),
          limit: typeof q.limit === 'number' ? q.limit : 100,
        },
      })
      grants.set(tool, { tool })
      return
    }

    if (tool === 'odoo.search' && step.odooSearch) {
      const o = step.odooSearch as Record<string, unknown>
      const model = String(o.model)
      const days = typeof o.untouchedForDays === 'number' ? o.untouchedForDays : null
      steps.push({
        id, tool, label: String(step.label ?? `Odoo ${model}`),
        params: {
          model,
          // Resolved by the worker before the call — never by the model.
          ...(days ? { domain: [['write_date', '<', `{{now-${days}d}}`]] } : {}),
          ...(Array.isArray(o.fields) && o.fields.length ? { fields: o.fields } : {}),
          limit: typeof o.limit === 'number' ? o.limit : 50,
          order: 'write_date asc',
        },
      })
      // The grant pins the model the plan chose; widening it later needs a new grant.
      const existing = grants.get(tool)
      const models = new Set([...(((existing?.params?.models as string[]) ?? [])), model])
      grants.set(tool, { tool, params: { models: Array.from(models), maxLimit: 200 } })
    }
  })

  const plan = {
    version: 1,
    schedule: {
      kind: schedule.kind ?? 'WEEKLY',
      timezone,
      ...(schedule.atTime ? { atTime: schedule.atTime } : {}),
      ...(Array.isArray(schedule.byDay) && schedule.byDay.length ? { byDay: schedule.byDay } : {}),
      ...(typeof schedule.dayOfMonth === 'number' ? { dayOfMonth: schedule.dayOfMonth } : {}),
      ...(typeof schedule.minute === 'number' ? { minute: schedule.minute } : {}),
      ...(typeof schedule.weekdaysOnly === 'boolean' ? { weekdaysOnly: schedule.weekdaysOnly } : {}),
      ...(typeof schedule.month === 'number' ? { month: schedule.month } : {}),
      ...(typeof schedule.day === 'number' ? { day: schedule.day } : {}),
      catchUpPolicy: schedule.catchUpPolicy ?? 'SKIP',
      ...(schedule.kind === 'QUARTERLY'
        ? { quarterSource: 'CALENDAR', quarterOffset: 'LAST_DAY' }
        : {}),
    },
    steps,
    synthesis: {
      objective: String(synthesis.objective ?? ''),
      ...(synthesis.relevanceCriteria ? { relevanceCriteria: synthesis.relevanceCriteria } : {}),
      findingSchema: {
        dedupeKeyFields: Array.isArray(synthesis.dedupeKeyFields) && synthesis.dedupeKeyFields.length
          ? synthesis.dedupeKeyFields
          : ['title'],
        fields: Array.isArray(synthesis.fields) ? synthesis.fields : [],
      },
      maxFindings: typeof synthesis.maxFindings === 'number' ? synthesis.maxFindings : 30,
    },
    briefing: {
      titleTemplate: String(briefing.titleTemplate ?? '{{date}} briefing'),
      ...(briefing.tone ? { tone: briefing.tone } : {}),
    },
    // Recipients are an identity question the server resolves, never the model.
    notify: { emailRecipients: [], inApp: true, onEmpty: 'SKIP' },
    limits: { maxCostUsd: 0.5, timeoutSeconds: 600 },
  }

  return {
    plan,
    grants: Array.from(grants.values()),
    name: String(raw.name ?? 'Untitled automation').slice(0, 80),
    notes: String(raw.notes ?? ''),
  }
}

async function callModel(
  client: OpenAI,
  modelId: string,
  system: string,
  user: string,
  signal?: AbortSignal
): Promise<{ content: string; usage: AiUsage }> {
  const response = await client.chat.completions.create({
    model: modelId,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_schema', json_schema: PLAN_JSON_SCHEMA },
    max_completion_tokens: MAX_OUTPUT_TOKENS,
  }, { signal })

  const content = response.choices[0]?.message?.content
  if (!content) throw new ProviderCallError('openai', modelId, null, 'OpenAI returned an empty plan')

  return {
    content,
    usage: {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      cachedTokens: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    },
  }
}

export async function compileInstruction(input: CompileInput): Promise<CompileResult> {
  const credential = await resolveAiProviderCredential('openai')
  if (!credential) throw new CompilerNotConfiguredError()

  const timezone = input.timezone || DEFAULT_TIMEZONE
  const now = input.now ?? new Date()
  const modelId = input.modelId ?? AI_MODELS.openai.planner
  const client = new OpenAI({ apiKey: credential.apiKey })

  const system = buildSystemPrompt(input.availableTools, timezone, now.toISOString().slice(0, 10))
  const baseUser = `Instruction:\n${input.instruction.trim()}`

  const startedAt = Date.now()
  const usage: AiUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }
  let repaired = false
  let lastIssues: string[] = []

  try {
    // Two attempts: the first from the instruction, the second with the exact
    // validation issues appended. Not a loop — see the file header.
    for (let attempt = 0; attempt < 2; attempt++) {
      const user = attempt === 0
        ? baseUser
        : `${baseUser}\n\nYour previous plan failed validation with these problems. Fix them and return the whole plan again:\n${lastIssues.map((i) => `- ${i}`).join('\n')}`

      const { content, usage: attemptUsage } = await callModel(client, modelId, system, user, input.signal)
      usage.inputTokens += attemptUsage.inputTokens
      usage.outputTokens += attemptUsage.outputTokens
      usage.cachedTokens += attemptUsage.cachedTokens

      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(content) as Record<string, unknown>
      } catch (error) {
        throw new ProviderCallError('openai', modelId, error, 'OpenAI returned an unparseable plan')
      }

      const { plan: draft, grants, name, notes } = toPlanSpec(parsed, timezone)

      try {
        const plan = withPlanDefaults(validatePlan(draft, { grants, maxCostUsdPerRun: 0.5 }))
        const costUsd = estimateCostUsd({
          modelId,
          inputTokens: usage.inputTokens,
          cachedTokens: usage.cachedTokens,
          outputTokens: usage.outputTokens,
        })

        await recordGenerationLog({
          userId: input.ownerUserId,
          feature: AI_FEATURE_KEYS.AUTOMATION_RUN,
          provider: 'openai',
          modelId,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cachedTokens: usage.cachedTokens,
          latencyMs: Date.now() - startedAt,
          status: 'OK',
          responseJson: { compiled: true, repaired, stepCount: plan.steps.length },
        }).catch(() => undefined)

        return { plan, grants, suggestedName: name, notes, usage, modelId, costUsd, repaired }
      } catch (error) {
        if (!(error instanceof PlanValidationError)) throw error
        lastIssues = error.issues
        repaired = true
      }
    }

    throw new CompilerFailedError(
      'The instruction could not be compiled into a valid plan. Edit it to be more specific, or configure the plan by hand.',
      lastIssues
    )
  } catch (error) {
    if (!(error instanceof CompilerFailedError)) {
      await recordGenerationLog({
        userId: input.ownerUserId,
        feature: AI_FEATURE_KEYS.AUTOMATION_RUN,
        provider: 'openai',
        modelId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedTokens: usage.cachedTokens,
        latencyMs: Date.now() - startedAt,
        status: 'ERROR',
        errorMessage: error instanceof Error ? error.message : String(error),
      }).catch(() => undefined)
    }
    throw error
  }
}

export { toPlanSpec as __toPlanSpecForTests }
