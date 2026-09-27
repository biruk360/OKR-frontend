import { randomUUID } from 'crypto'
import OpenAI from 'openai'
import { z } from 'zod'
import type { Prisma, ProjectCreationDraft } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { recordActivity, type ActivityAction } from '@/lib/activity-log'
import { getAiProviderAdminSettings } from '@/lib/ai/admin-settings'
import { AI_FEATURE_KEYS, requireProjectCreationAiEnabled } from '@/lib/ai/config'
import { resolveProjectCreationAiCredential } from '@/lib/ai/credentials'
import { recordGenerationLog, type RecordGenerationParams } from '@/lib/ai/generation-log'
import type { AiUsage } from '@/lib/ai/providers/types'
import { ProviderCallError } from '@/lib/ai/providers/types'
import { hitRateLimit } from '@/lib/security/rate-limit'
import {
  ProjectCreationDraftNotFoundError,
  ProjectCreationDraftStateError,
  ProjectCreationDraftVersionConflictError,
  isProjectCreationDraftJsonWithinLimit,
} from './creation-draft'
import {
  combineNormalizedProjectCreationDraft,
  createEmptyProjectCreationScheduleJson,
  createEmptyProjectCreationValidationJson,
  splitNormalizedProjectCreationDraft,
  type NormalizedProjectCreationDraft,
} from './creation-normalize'
import { labelProjectCreationInferredValues } from './creation-provenance'
import { aiGuidedBriefSchema, applyAiGuidedBrief, readAiGuidedBrief, type AiGuidedBrief } from './ai-guided-brief'
import {
  AI_GUIDED_CAPS,
  AI_GUIDED_CLARIFY_JSON_SCHEMA,
  AI_GUIDED_MAX_OUTPUT_TOKENS,
  AI_GUIDED_PLAN_JSON_SCHEMA,
  AI_GUIDED_PROMPT_VERSIONS,
  AI_GUIDED_REVISION_JSON_SCHEMA,
  aiGuidedClarifyOutputSchema,
  aiGuidedRevisionOutputSchema,
  type AiGuidedRevisionOutput,
} from './ai-guided-schema'
import {
  buildAiGuidedClarifyPrompt,
  buildAiGuidedGeneratePrompt,
  buildAiGuidedRevisePrompt,
  redactForProvider,
} from './ai-guided-prompt'
import {
  AiGuidedOutputInvalidError,
  requestAiGuidedStructuredOutput,
  type AiGuidedOpenAiClient,
} from './ai-guided-openai'
import {
  AI_GUIDED_IDS,
  buildAiGuidedDraft,
  validateAiGuidedPlan,
  type AiGuidedActiveUser,
  type AiGuidedGenerationSummary,
} from './ai-guided-schedule'
import {
  AI_GUIDED_PREVIEW_TTL_MS,
  AiGuidedPreviewTokenError,
  applyAiGuidedRevisionOperations,
  buildAiGuidedRevisionContext,
  diffAiGuidedDrafts,
  recordAiGuidedRevision,
  signAiGuidedRevisionToken,
  undoAiGuidedRevision,
  verifyAiGuidedRevisionToken,
  type AiGuidedDiffEntry,
} from './ai-guided-revise'

/**
 * Stories 3.1–3.7 orchestration. Every AI operation runs, in order:
 *   1. the independent project-creation AI flag (AC36 — refuse before anything);
 *   2. explicit external-provider notice acceptance (§14.3);
 *   3. owner/method/status/version checks on the private draft;
 *   4. provider availability, org daily cap (budget), per-user hourly limit,
 *      in-memory burst limit, and the admin per-user cooldown for generation;
 *   5. a schema-forced OpenAI call with one repair round;
 *   6. deterministic post-processing and full normalized-schema validation;
 *   7. one optimistic, versioned draft write with a transaction-bound audit.
 * Every provider call — success or failure — is written to AiGenerationLog with
 * metadata only (no source content). Nothing is committed; AI output lands only
 * in the creator-private draft as PROPOSED items that the PM must accept.
 */

export const AI_GUIDED_SOURCE_METHODS = ['AI_GUIDED', 'AI_TOR'] as const
export const AI_GUIDED_USER_HOURLY_LIMIT = 15
export const AI_GUIDED_BURST_LIMIT = { limit: 4, windowMs: 60_000 } as const
const EDITABLE_STATUSES = ['DRAFT', 'READY', 'FAILED'] as const

export const AI_GUIDED_OPERATIONS = {
  CLARIFY: 'AI_GUIDED_CLARIFY',
  GENERATE: 'AI_GUIDED_GENERATE',
  REVISE: 'AI_GUIDED_REVISE_PREVIEW',
} as const
type AiGuidedOperation = (typeof AI_GUIDED_OPERATIONS)[keyof typeof AI_GUIDED_OPERATIONS]

export class AiGuidedError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AiGuidedError'
  }
}

interface DraftDelegate {
  findUnique(args: { where: { id: string } }): Promise<ProjectCreationDraft | null>
  updateMany(args: Prisma.ProjectCreationDraftUpdateManyArgs): Promise<{ count: number }>
}

export interface AiGuidedTransaction {
  projectCreationDraft: DraftDelegate
  activityLog: { create(args: unknown): Promise<unknown> }
}

export interface AiGuidedDatabase {
  projectCreationDraft: DraftDelegate
  aiGenerationLog: {
    count(args: unknown): Promise<number>
    findFirst(args: unknown): Promise<{ createdAt: Date } | null>
  }
  user: { findMany(args: unknown): Promise<AiGuidedActiveUser[]> }
  $transaction<T>(operation: (tx: AiGuidedTransaction) => Promise<T>): Promise<T>
}

export interface AiGuidedSettings {
  available: boolean
  model: string
  dailyGenerationCap: number
  perUserCooldownMinutes: number
}

export interface AiGuidedDeps {
  db: AiGuidedDatabase
  requireEnabled(): Promise<void>
  getSettings(): Promise<AiGuidedSettings>
  resolveCredential(): Promise<{ apiKey: string } | null>
  createClient(apiKey: string): AiGuidedOpenAiClient
  logGeneration(params: RecordGenerationParams): Promise<unknown>
  hitBurstLimit(userId: string): { allowed: boolean; retryAfterMs: number }
  previewSecret(): string
  randomId(): string
  now(): Date
}

export function defaultAiGuidedDeps(): AiGuidedDeps {
  return {
    db: prisma as unknown as AiGuidedDatabase,
    requireEnabled: () => requireProjectCreationAiEnabled(),
    getSettings: () => getAiProviderAdminSettings(),
    resolveCredential: () => resolveProjectCreationAiCredential(),
    createClient: (apiKey) => new OpenAI({ apiKey, timeout: 90_000, maxRetries: 1 }),
    logGeneration: (params) => recordGenerationLog(params),
    hitBurstLimit: (userId) => hitRateLimit(`project-creation-ai-guided:${userId}`, AI_GUIDED_BURST_LIMIT),
    previewSecret: () => process.env.NEXTAUTH_SECRET ?? '',
    randomId: () => randomUUID(),
    now: () => new Date(),
  }
}

type Draft = NormalizedProjectCreationDraft

interface LoadedDraft {
  row: ProjectCreationDraft
  draft: Draft
}

async function loadOwnedDraft(
  deps: AiGuidedDeps,
  input: { draftId: string; actorUserId: string; version: number },
): Promise<LoadedDraft> {
  const row = await deps.db.projectCreationDraft.findUnique({ where: { id: input.draftId } })
  if (!row || row.ownerUserId !== input.actorUserId) throw new ProjectCreationDraftNotFoundError()
  if (!(AI_GUIDED_SOURCE_METHODS as readonly string[]).includes(row.sourceMethod)) {
    throw new AiGuidedError('AI_METHOD_MISMATCH', 409, 'This draft was not started with AI-guided creation.')
  }
  if (!(EDITABLE_STATUSES as readonly string[]).includes(row.status)) {
    throw new ProjectCreationDraftStateError(row.status, `Drafts in ${row.status} status cannot be edited`)
  }
  if (row.version !== input.version) throw new ProjectCreationDraftVersionConflictError(input.version, row.version)
  return {
    row,
    draft: combineNormalizedProjectCreationDraft(
      row.projectJson,
      row.scheduleJson ?? createEmptyProjectCreationScheduleJson(),
      row.validationJson ?? createEmptyProjectCreationValidationJson(),
    ),
  }
}

async function persistDraft(
  deps: AiGuidedDeps,
  input: {
    row: ProjectCreationDraft
    next: Draft
    actorUserId: string
    kind: string
    /** Dedicated audit action (AI plan generation/revision/undo); plain edits stay `UPDATED`. */
    action?: ActivityAction
    metadata?: Record<string, unknown>
    ai?: { modelId: string; promptVersion: string }
  },
): Promise<ProjectCreationDraft> {
  // Full strict normalized-schema validation is the last gate before storage.
  const { projectJson, scheduleJson, validationJson } = splitNormalizedProjectCreationDraft(input.next)
  if (![projectJson, scheduleJson, validationJson].every((value) => isProjectCreationDraftJsonWithinLimit(value))) {
    throw new AiGuidedError('AI_DRAFT_TOO_LARGE', 413, 'The draft would exceed its size limit. Apply a smaller change or remove rows first.')
  }
  return deps.db.$transaction(async (tx) => {
    const result = await tx.projectCreationDraft.updateMany({
      where: {
        id: input.row.id,
        ownerUserId: input.actorUserId,
        version: input.row.version,
        status: { in: [...EDITABLE_STATUSES] },
      },
      data: {
        projectJson: projectJson as Prisma.InputJsonValue,
        scheduleJson: scheduleJson as Prisma.InputJsonValue,
        validationJson: validationJson as Prisma.InputJsonValue,
        ...(input.ai ? { aiProvider: 'openai', aiModelId: input.ai.modelId, aiPromptVersion: input.ai.promptVersion } : {}),
        version: { increment: 1 },
      },
    })
    if (result.count !== 1) {
      const latest = await tx.projectCreationDraft.findUnique({ where: { id: input.row.id } })
      if (!latest) throw new ProjectCreationDraftNotFoundError()
      throw new ProjectCreationDraftVersionConflictError(input.row.version, latest.version)
    }
    const updated = await tx.projectCreationDraft.findUnique({ where: { id: input.row.id } })
    if (!updated) throw new ProjectCreationDraftNotFoundError()
    await recordActivity({
      entityType: 'PROJECT_CREATION_DRAFT',
      action: input.action ?? 'UPDATED',
      actorId: input.actorUserId,
      changes: { version: { from: input.row.version, to: updated.version } },
      metadata: {
        draftId: updated.id,
        kind: input.kind,
        status: updated.status,
        ...(input.ai ? { provider: 'openai', modelId: input.ai.modelId, promptVersion: input.ai.promptVersion } : {}),
        ...input.metadata,
      },
    }, { client: tx, required: true })
    return updated
  })
}

function requireNotice(accepted: unknown) {
  if (accepted !== true) {
    throw new AiGuidedError('PROVIDER_NOTICE_REQUIRED', 400, 'Confirm the external AI provider notice before sending project content to OpenAI.')
  }
}

async function gateAiCall(
  deps: AiGuidedDeps,
  input: { userId: string; operation: AiGuidedOperation },
): Promise<{ settings: AiGuidedSettings; apiKey: string }> {
  const settings = await deps.getSettings()
  if (!settings.available) {
    throw new AiGuidedError('AI_PROVIDER_UNAVAILABLE', 503, 'AI planning is unavailable because no verified OpenAI key is configured. Continue manually or ask an Administrator.')
  }
  const now = deps.now()
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  const feature = AI_FEATURE_KEYS.PROJECT_CREATION_AI
  const [dailyUsed, hourlyUsed, lastGeneration] = await Promise.all([
    deps.db.aiGenerationLog.count({ where: { feature, status: 'OK', createdAt: { gte: startOfDay } } }),
    deps.db.aiGenerationLog.count({ where: { feature, userId: input.userId, createdAt: { gte: new Date(now.getTime() - 3_600_000) } } }),
    input.operation === AI_GUIDED_OPERATIONS.GENERATE
      ? deps.db.aiGenerationLog.findFirst({
        where: { feature, userId: input.userId, status: 'OK', responseJson: { path: ['operation'], equals: AI_GUIDED_OPERATIONS.GENERATE } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      })
      : Promise.resolve(null),
  ])
  if (dailyUsed >= settings.dailyGenerationCap) {
    throw new AiGuidedError('AI_DAILY_CAP_REACHED', 429, 'The daily AI project-creation budget has been used. Your draft is saved; continue manually or try again tomorrow.')
  }
  if (hourlyUsed >= AI_GUIDED_USER_HOURLY_LIMIT) {
    throw new AiGuidedError('AI_USER_RATE_LIMITED', 429, 'You have reached the hourly AI planning limit. Your draft is saved; continue editing manually and try again later.')
  }
  if (lastGeneration) {
    const cooldownMs = settings.perUserCooldownMinutes * 60_000
    const elapsed = now.getTime() - lastGeneration.createdAt.getTime()
    if (elapsed < cooldownMs) {
      const retryAfterSeconds = Math.ceil((cooldownMs - elapsed) / 1000)
      throw new AiGuidedError('AI_USER_COOLDOWN', 429, 'A new full plan generation is cooling down. You can still revise or edit the current plan.', { retryAfterSeconds })
    }
  }
  const burst = deps.hitBurstLimit(input.userId)
  if (!burst.allowed) {
    throw new AiGuidedError('AI_USER_RATE_LIMITED', 429, 'Too many AI requests in a short time. Wait a moment and try again.', { retryAfterSeconds: Math.ceil(burst.retryAfterMs / 1000) })
  }
  let credential: { apiKey: string } | null
  try {
    credential = await deps.resolveCredential()
  } catch {
    credential = null
  }
  if (!credential) {
    throw new AiGuidedError('AI_PROVIDER_UNAVAILABLE', 503, 'AI planning is unavailable because no usable OpenAI key is configured. Continue manually or ask an Administrator.')
  }
  return { settings, apiKey: credential.apiKey }
}

async function activeUsers(deps: AiGuidedDeps): Promise<AiGuidedActiveUser[]> {
  return deps.db.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true },
    take: 5_000,
  })
}

function personNames(users: readonly AiGuidedActiveUser[]): string[] {
  return users.map((user) => user.name ?? '').filter(Boolean)
}

const ZERO_USAGE: AiUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }

async function logCall(
  deps: AiGuidedDeps,
  input: {
    userId: string
    modelId: string
    usage: AiUsage
    startedAt: number
    status: 'OK' | 'ERROR'
    errorCode?: string
    responseJson: Record<string, unknown>
  },
) {
  await deps.logGeneration({
    userId: input.userId,
    feature: AI_FEATURE_KEYS.PROJECT_CREATION_AI,
    provider: 'openai',
    modelId: input.modelId,
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    cachedTokens: input.usage.cachedTokens,
    latencyMs: deps.now().getTime() - input.startedAt,
    status: input.status,
    errorMessage: input.errorCode ?? null,
    responseJson: input.responseJson,
  })
}

function providerFailure(error: unknown): AiGuidedError {
  if (error instanceof AiGuidedOutputInvalidError) {
    return new AiGuidedError('AI_OUTPUT_INVALID', 502, 'AI returned a plan that failed validation twice. Nothing was changed; try again or continue manually.')
  }
  return new AiGuidedError('AI_PROVIDER_FAILED', 502, 'The AI provider request failed. Nothing was changed; try again or continue manually.')
}

/**
 * Runs one provider call with logging. `apply` performs the deterministic
 * post-processing and draft write; any failure after tokens were spent is
 * logged as ERROR with the real usage, and the draft is left unchanged.
 */
async function runLoggedCall<TValue, TResult>(
  deps: AiGuidedDeps,
  input: {
    userId: string
    modelId: string
    operation: AiGuidedOperation
    draftId: string
    promptVersion: string
    call: () => Promise<{ value: TValue; usage: AiUsage; attempts: number }>
    apply: (value: TValue) => Promise<{ result: TResult; logMetadata: Record<string, unknown> }>
  },
): Promise<TResult> {
  const startedAt = deps.now().getTime()
  const base = { operation: input.operation, draftId: input.draftId, promptVersion: input.promptVersion }
  let called: { value: TValue; usage: AiUsage; attempts: number }
  try {
    called = await input.call()
  } catch (error) {
    const usage = error instanceof AiGuidedOutputInvalidError ? error.usage : ZERO_USAGE
    const errorCode = error instanceof AiGuidedOutputInvalidError ? 'OUTPUT_SCHEMA_INVALID' : 'PROVIDER_CALL_FAILED'
    await logCall(deps, { userId: input.userId, modelId: input.modelId, usage, startedAt, status: 'ERROR', errorCode, responseJson: { ...base, attempts: error instanceof AiGuidedOutputInvalidError ? error.attempts : 1 } })
    if (error instanceof AiGuidedOutputInvalidError || error instanceof ProviderCallError) throw providerFailure(error)
    throw error
  }
  try {
    const { result, logMetadata } = await input.apply(called.value)
    await logCall(deps, { userId: input.userId, modelId: input.modelId, usage: called.usage, startedAt, status: 'OK', responseJson: { ...base, attempts: called.attempts, ...logMetadata } })
    return result
  } catch (error) {
    await logCall(deps, { userId: input.userId, modelId: input.modelId, usage: called.usage, startedAt, status: 'ERROR', errorCode: 'DRAFT_UPDATE_FAILED', responseJson: { ...base, attempts: called.attempts } })
    throw error
  }
}

const ROW_COLLECTIONS = ['phases', 'milestones', 'activities', 'dependencies', 'deliverables'] as const

/**
 * AC12 / Story 2.6 contract: every AI-written date/owner value is labelled by the
 * shared server-owned `labelProjectCreationInferredValues` (AI_ASSUMPTION source +
 * PROPOSED assumption). Its source ids are sequence-numbered, so inferred sources
 * are append-only here; only assumptions whose target rows no longer exist (after a
 * regeneration or undo) are removed so they cannot block commit.
 */
export function labelAiGuidedInferredValues(previous: Draft, next: Draft, reason: string): Draft {
  return dropStaleInferredAssumptions(labelProjectCreationInferredValues(previous, next, { reason }))
}

function dropStaleInferredAssumptions(draft: Draft): Draft {
  const exists = (path: string) => {
    const [collection, id] = path.replace(/^\//, '').split(/[./]/)
    if (!(ROW_COLLECTIONS as readonly string[]).includes(collection)) return true
    return (draft[collection as (typeof ROW_COLLECTIONS)[number]] as Array<{ id: string }>).some((row) => row.id === id)
  }
  return {
    ...draft,
    assumptions: draft.assumptions.filter((assumption) => !(
      assumption.id.startsWith('assumption-inferred-')
      && assumption.affectedPaths.length > 0
      && assumption.affectedPaths.every((path) => !exists(path))
    )),
  }
}

function requireBrief(draft: Draft): AiGuidedBrief {
  const brief = readAiGuidedBrief(draft)
  if (!brief) throw new AiGuidedError('AI_BRIEF_REQUIRED', 409, 'Save the project brief before asking AI to plan.')
  return brief
}

function clarifyQuestions(draft: Draft) {
  return draft.questions.filter((question) => question.id.startsWith(AI_GUIDED_IDS.clarifyQuestion))
}

function linkedAssumptionId(questionId: string) {
  return `${AI_GUIDED_IDS.clarifyAssumption}${questionId.slice(AI_GUIDED_IDS.clarifyQuestion.length)}`
}

// ---------------------------------------------------------------------------
// Story 3.1 / 3.2 — save the guided brief or pasted TOR (no provider call)
// ---------------------------------------------------------------------------

export async function saveAiGuidedBrief(
  input: { draftId: string; actorUserId: string; version: number; brief: unknown },
  deps: AiGuidedDeps = defaultAiGuidedDeps(),
): Promise<ProjectCreationDraft> {
  await deps.requireEnabled()
  const parsed = aiGuidedBriefSchema.safeParse(input.brief)
  if (!parsed.success) {
    throw new AiGuidedError('VALIDATION_ERROR', 422, 'Check the highlighted brief fields.', parsed.error.flatten())
  }
  const loaded = await loadOwnedDraft(deps, input)
  const next = applyAiGuidedBrief(loaded.draft, parsed.data)
  return persistDraft(deps, {
    row: loaded.row,
    next,
    actorUserId: input.actorUserId,
    kind: 'AI_GUIDED_BRIEF_SAVED',
    metadata: {
      mode: parsed.data.mode,
      detailLevel: parsed.data.detailLevel,
      deliverables: parsed.data.deliverables.length,
      teamRoles: parsed.data.team.length,
      torCharacters: parsed.data.torText?.length ?? 0,
    },
  })
}

// ---------------------------------------------------------------------------
// Story 3.3 — focused clarification questions (≤5) with default assumptions
// ---------------------------------------------------------------------------

const TOPIC_CATEGORY = {
  SCOPE: 'SCOPE',
  DATES: 'DATE',
  DELIVERABLES: 'DELIVERABLE',
  OWNERSHIP: 'OWNERSHIP',
  DEPENDENCIES: 'DEPENDENCY',
  OTHER: 'OTHER',
} as const

function normalizedQuestion(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export const AI_GUIDED_MAX_CLARIFY_ROUNDS = 2

export async function clarifyAiGuidedDraft(
  input: { draftId: string; actorUserId: string; version: number; providerNoticeAccepted: unknown; signal?: AbortSignal },
  deps: AiGuidedDeps = defaultAiGuidedDeps(),
): Promise<{ draft: ProjectCreationDraft; questionsAdded: number; skipped: null | 'OPEN_QUESTIONS' | 'ROUND_LIMIT' | 'NONE_NEEDED' }> {
  await deps.requireEnabled()
  requireNotice(input.providerNoticeAccepted)
  const loaded = await loadOwnedDraft(deps, input)
  const brief = requireBrief(loaded.draft)
  if (loaded.draft.activities.length > 0) {
    throw new AiGuidedError('AI_SCHEDULE_EXISTS', 409, 'A plan already exists. Use a revision instruction or edit the schedule directly.')
  }
  const existing = clarifyQuestions(loaded.draft)
  // Never re-ask: open questions are returned as-is, and rounds are capped.
  if (existing.some((question) => question.status === 'OPEN')) return { draft: loaded.row, questionsAdded: 0, skipped: 'OPEN_QUESTIONS' }
  const rounds = new Set(existing.map((question) => question.round))
  if (rounds.size >= AI_GUIDED_MAX_CLARIFY_ROUNDS) return { draft: loaded.row, questionsAdded: 0, skipped: 'ROUND_LIMIT' }

  const { settings, apiKey } = await gateAiCall(deps, { userId: input.actorUserId, operation: AI_GUIDED_OPERATIONS.CLARIFY })
  const users = await activeUsers(deps)
  const prompt = buildAiGuidedClarifyPrompt({
    brief,
    personNames: personNames(users),
    previousQuestions: existing.map((question) => question.text),
  })
  const client = deps.createClient(apiKey)
  type ClarifyResult = { draft: ProjectCreationDraft; questionsAdded: number; skipped: null | 'OPEN_QUESTIONS' | 'ROUND_LIMIT' | 'NONE_NEEDED' }
  return runLoggedCall<z.infer<typeof aiGuidedClarifyOutputSchema>, ClarifyResult>(deps, {
    userId: input.actorUserId,
    modelId: settings.model,
    operation: AI_GUIDED_OPERATIONS.CLARIFY,
    draftId: loaded.row.id,
    promptVersion: AI_GUIDED_PROMPT_VERSIONS.CLARIFY,
    call: () => requestAiGuidedStructuredOutput({
      client,
      modelId: settings.model,
      system: prompt.system,
      user: prompt.user,
      jsonSchema: AI_GUIDED_CLARIFY_JSON_SCHEMA,
      maxOutputTokens: AI_GUIDED_MAX_OUTPUT_TOKENS.CLARIFY,
      validate: (value) => aiGuidedClarifyOutputSchema.parse(value),
      signal: input.signal,
    }),
    apply: async (output) => {
      const asked = new Set(existing.map((question) => normalizedQuestion(question.text)))
      const impactOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const
      const selected = output.questions
        .filter((question) => question.impact !== 'LOW')
        .filter((question) => {
          const key = normalizedQuestion(question.text)
          if (!key || asked.has(key)) return false
          asked.add(key)
          return true
        })
        .sort((left, right) => impactOrder[left.impact] - impactOrder[right.impact])
        .slice(0, AI_GUIDED_CAPS.questionsPerRound)
      if (selected.length === 0) {
        return { result: { draft: loaded.row, questionsAdded: 0, skipped: 'NONE_NEEDED' as const }, logMetadata: { questionCount: 0 } }
      }
      const next = structuredClone(loaded.draft)
      const round = Math.min(100, next.questions.reduce((max, question) => Math.max(max, question.round), 0) + 1)
      for (const question of selected) {
        const suffix = deps.randomId()
        const questionId = `${AI_GUIDED_IDS.clarifyQuestion}${suffix}`
        next.questions.push({
          id: questionId,
          round,
          text: question.text,
          impact: question.impact,
          affectedPaths: [`brief.${question.topic.toLowerCase()}`],
          status: 'OPEN',
          answer: null,
        })
        next.assumptions.push({
          id: linkedAssumptionId(questionId),
          text: `If unanswered: ${question.defaultAssumption}`.slice(0, 2_000),
          category: TOPIC_CATEGORY[question.topic],
          affectedPaths: [`questions.${questionId}`],
          sourceIds: [],
          status: 'PROPOSED',
        })
      }
      const draft = await persistDraft(deps, {
        row: loaded.row,
        next,
        actorUserId: input.actorUserId,
        kind: 'AI_GUIDED_CLARIFIED',
        metadata: { questionCount: selected.length, round },
        ai: { modelId: settings.model, promptVersion: AI_GUIDED_PROMPT_VERSIONS.CLARIFY },
      })
      return { result: { draft, questionsAdded: selected.length, skipped: null }, logMetadata: { questionCount: selected.length, round } }
    },
  })
}

export const aiGuidedAnswersSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string().trim().min(1).max(100),
    answer: z.string().trim().max(2_000).nullable(),
  }).strict()).max(50),
  continueWithAssumptions: z.boolean(),
}).strict()

export async function answerAiGuidedQuestions(
  input: { draftId: string; actorUserId: string; version: number; answers: z.infer<typeof aiGuidedAnswersSchema>['answers']; continueWithAssumptions: boolean },
  deps: AiGuidedDeps = defaultAiGuidedDeps(),
): Promise<ProjectCreationDraft> {
  await deps.requireEnabled()
  const loaded = await loadOwnedDraft(deps, input)
  const next = structuredClone(loaded.draft)
  const answers = new Map(input.answers.map((item) => [item.questionId, item.answer?.trim() || null]))
  const open = clarifyQuestions(next).filter((question) => question.status === 'OPEN')
  for (const questionId of answers.keys()) {
    if (!open.some((question) => question.id === questionId)) {
      throw new AiGuidedError('VALIDATION_ERROR', 422, 'An answered question is no longer open. Reload the draft.')
    }
  }
  let answered = 0
  let continued = 0
  for (const question of open) {
    const answer = answers.get(question.id) ?? null
    if (answer) {
      question.status = 'ANSWERED'
      question.answer = answer
      next.assumptions = next.assumptions.filter((assumption) => assumption.id !== linkedAssumptionId(question.id))
      answered += 1
    } else if (input.continueWithAssumptions) {
      question.status = 'CONTINUED_WITH_ASSUMPTION'
      continued += 1
    }
  }
  return persistDraft(deps, {
    row: loaded.row,
    next,
    actorUserId: input.actorUserId,
    kind: 'AI_GUIDED_QUESTIONS_ANSWERED',
    metadata: { answered, continuedWithAssumptions: continued },
  })
}

// ---------------------------------------------------------------------------
// Story 3.4–3.6 — schema-forced generation into the shared draft model
// ---------------------------------------------------------------------------

export async function generateAiGuidedDraft(
  input: {
    draftId: string
    actorUserId: string
    version: number
    providerNoticeAccepted: unknown
    replaceExisting: boolean
    signal?: AbortSignal
  },
  deps: AiGuidedDeps = defaultAiGuidedDeps(),
): Promise<{ draft: ProjectCreationDraft; summary: AiGuidedGenerationSummary }> {
  await deps.requireEnabled()
  requireNotice(input.providerNoticeAccepted)
  const loaded = await loadOwnedDraft(deps, input)
  const brief = requireBrief(loaded.draft)
  const hadSchedule = loaded.draft.activities.length > 0 || loaded.draft.phases.length > 0
  if (hadSchedule && !input.replaceExisting) {
    throw new AiGuidedError('AI_SCHEDULE_EXISTS', 409, 'Regenerating replaces the current schedule and its AI proposals. Confirm the replacement or use a revision instead.')
  }
  const questions = clarifyQuestions(loaded.draft)
  if (questions.some((question) => question.status === 'OPEN')) {
    throw new AiGuidedError('AI_QUESTIONS_OPEN', 409, 'Answer the clarification questions or continue with the listed assumptions first.')
  }

  const { settings, apiKey } = await gateAiCall(deps, { userId: input.actorUserId, operation: AI_GUIDED_OPERATIONS.GENERATE })
  const users = await activeUsers(deps)
  const continued = new Set(questions.filter((question) => question.status === 'CONTINUED_WITH_ASSUMPTION').map((question) => linkedAssumptionId(question.id)))
  const prompt = buildAiGuidedGeneratePrompt({
    brief,
    personNames: personNames(users),
    answeredQuestions: questions
      .filter((question) => question.status === 'ANSWERED' && question.answer)
      .map((question) => ({ question: question.text, answer: question.answer! })),
    assumptionsToUse: loaded.draft.assumptions
      .filter((assumption) => continued.has(assumption.id) && assumption.status !== 'REJECTED')
      .map((assumption) => assumption.text.replace(/^If unanswered: /, '')),
  })
  const client = deps.createClient(apiKey)
  const generationId = deps.randomId()
  return runLoggedCall(deps, {
    userId: input.actorUserId,
    modelId: settings.model,
    operation: AI_GUIDED_OPERATIONS.GENERATE,
    draftId: loaded.row.id,
    promptVersion: AI_GUIDED_PROMPT_VERSIONS.GENERATE,
    call: () => requestAiGuidedStructuredOutput({
      client,
      modelId: settings.model,
      system: prompt.system,
      user: prompt.user,
      jsonSchema: AI_GUIDED_PLAN_JSON_SCHEMA,
      maxOutputTokens: AI_GUIDED_MAX_OUTPUT_TOKENS.GENERATE,
      validate: (value) => validateAiGuidedPlan(value, brief),
      signal: input.signal,
    }),
    apply: async (plan) => {
      const built = buildAiGuidedDraft({
        current: loaded.draft,
        brief,
        plan,
        activeUsers: users,
        generationId,
        modelId: settings.model,
        promptVersion: AI_GUIDED_PROMPT_VERSIONS.GENERATE,
        idFactory: (prefix) => `${prefix}-${deps.randomId()}`,
      })
      const next = labelAiGuidedInferredValues(loaded.draft, built.draft, 'AI proposed this value in the generated plan; the brief did not state it.')
      const draft = await persistDraft(deps, {
        row: loaded.row,
        next,
        actorUserId: input.actorUserId,
        kind: 'AI_GUIDED_GENERATED',
        action: 'AI_PLAN_GENERATED',
        metadata: { generationId, replacedExistingSchedule: hadSchedule, ...built.summary },
        ai: { modelId: settings.model, promptVersion: AI_GUIDED_PROMPT_VERSIONS.GENERATE },
      })
      return { result: { draft, summary: built.summary }, logMetadata: { generationId, ...built.summary } }
    },
  })
}

// ---------------------------------------------------------------------------
// Story 3.7 — preview → apply (signed) → diff → undo
// ---------------------------------------------------------------------------

export const aiGuidedInstructionSchema = z.string().trim().min(3).max(AI_GUIDED_CAPS.instructionChars)

function revisionIdFactory(revisionId: string) {
  let counter = 0
  return (prefix: string) => `${prefix}-r${revisionId.slice(0, 8)}-${++counter}`
}

export interface AiGuidedRevisionPreview {
  revisionId: string
  summary: string
  affectedCount: number
  conflictCount: number
  entries: AiGuidedDiffEntry[]
  previewToken: string | null
  basedOnVersion: number
}

export async function previewAiGuidedRevision(
  input: { draftId: string; actorUserId: string; version: number; instruction: string; providerNoticeAccepted: unknown; signal?: AbortSignal },
  deps: AiGuidedDeps = defaultAiGuidedDeps(),
): Promise<AiGuidedRevisionPreview> {
  await deps.requireEnabled()
  requireNotice(input.providerNoticeAccepted)
  const instruction = aiGuidedInstructionSchema.safeParse(input.instruction)
  if (!instruction.success) throw new AiGuidedError('VALIDATION_ERROR', 422, `Describe the revision in 3 to ${AI_GUIDED_CAPS.instructionChars} characters.`)
  const loaded = await loadOwnedDraft(deps, input)
  if (loaded.draft.activities.length === 0) {
    throw new AiGuidedError('AI_SCHEDULE_REQUIRED', 409, 'Generate or add a schedule before requesting a revision.')
  }
  const { settings, apiKey } = await gateAiCall(deps, { userId: input.actorUserId, operation: AI_GUIDED_OPERATIONS.REVISE })
  const users = await activeUsers(deps)
  const brief = readAiGuidedBrief(loaded.draft)
  const context = buildAiGuidedRevisionContext(loaded.draft)
  const names = [...personNames(users), ...(brief?.team.map((member) => member.name ?? '') ?? [])]
  const prompt = buildAiGuidedRevisePrompt({
    brief,
    personNames: names,
    instruction: instruction.data,
    plan: context.plan,
    constraints: context.constraints,
  })
  const revisionId = deps.randomId()
  const apply = (output: AiGuidedRevisionOutput) => applyAiGuidedRevisionOperations({
    draft: loaded.draft,
    output,
    context,
    brief,
    activeUsers: users,
    idFactory: revisionIdFactory(revisionId),
  })
  const client = deps.createClient(apiKey)
  return runLoggedCall(deps, {
    userId: input.actorUserId,
    modelId: settings.model,
    operation: AI_GUIDED_OPERATIONS.REVISE,
    draftId: loaded.row.id,
    promptVersion: AI_GUIDED_PROMPT_VERSIONS.REVISE,
    call: () => requestAiGuidedStructuredOutput({
      client,
      modelId: settings.model,
      system: prompt.system,
      user: prompt.user,
      jsonSchema: AI_GUIDED_REVISION_JSON_SCHEMA,
      maxOutputTokens: AI_GUIDED_MAX_OUTPUT_TOKENS.REVISE,
      validate: (value) => {
        const output = aiGuidedRevisionOutputSchema.parse(value)
        apply(output)
        return output
      },
      signal: input.signal,
    }),
    apply: async (output) => {
      const applied = apply(output)
      const entries = diffAiGuidedDrafts(loaded.draft, applied.draft)
      const previewToken = entries.length === 0 ? null : signAiGuidedRevisionToken({
        draftId: loaded.row.id,
        version: loaded.row.version,
        revisionId,
        instruction: redactForProvider(instruction.data, names),
        output,
        expiresAt: deps.now().getTime() + AI_GUIDED_PREVIEW_TTL_MS,
      }, deps.previewSecret())
      const conflictCount = entries.filter((entry) => entry.conflict).length
      return {
        result: {
          revisionId,
          summary: output.summary,
          affectedCount: entries.length,
          conflictCount,
          entries,
          previewToken,
          basedOnVersion: loaded.row.version,
        },
        logMetadata: { revisionId, operations: output.operations.length, affectedCount: entries.length, conflictCount },
      }
    },
  })
}

export async function applyAiGuidedRevision(
  input: { draftId: string; actorUserId: string; version: number; previewToken: string; acceptConflicts: boolean },
  deps: AiGuidedDeps = defaultAiGuidedDeps(),
): Promise<{ draft: ProjectCreationDraft; revisionId: string; affectedCount: number; conflictsOverridden: number }> {
  await deps.requireEnabled()
  const payload = verifyAiGuidedRevisionToken(input.previewToken, deps.previewSecret(), deps.now().getTime())
  if (payload.draftId !== input.draftId || payload.version !== input.version) {
    throw new AiGuidedPreviewTokenError('The draft changed after this preview. Preview the revision again.')
  }
  const loaded = await loadOwnedDraft(deps, input)
  const users = await activeUsers(deps)
  const brief = readAiGuidedBrief(loaded.draft)
  const applied = applyAiGuidedRevisionOperations({
    draft: loaded.draft,
    output: payload.output,
    context: buildAiGuidedRevisionContext(loaded.draft),
    brief,
    activeUsers: users,
    idFactory: revisionIdFactory(payload.revisionId),
  })
  const entries = diffAiGuidedDrafts(loaded.draft, applied.draft)
  if (entries.length === 0) throw new AiGuidedError('AI_REVISION_EMPTY', 422, 'This revision does not change the draft.')
  const conflicts = entries.filter((entry) => entry.conflict)
  if (conflicts.length > 0 && !input.acceptConflicts) {
    throw new AiGuidedError('AI_REVISION_CONFLICT', 409, `${conflicts.length} affected items were edited directly. Confirm that the revision may overwrite them, or edit them yourself.`, {
      conflicts: conflicts.map((entry) => ({ path: entry.path, label: entry.label })),
    })
  }
  const next = labelAiGuidedInferredValues(loaded.draft, recordAiGuidedRevision({
    after: applied.draft,
    entries,
    revisionId: payload.revisionId,
    instruction: payload.instruction,
    summary: payload.output.summary,
  }), `AI proposed this value in revision “${payload.output.summary}”.`.slice(0, 300))
  const draft = await persistDraft(deps, {
    row: loaded.row,
    next,
    actorUserId: input.actorUserId,
    kind: 'AI_GUIDED_REVISION_APPLIED',
    action: 'AI_PLAN_REVISED',
    metadata: { revisionId: payload.revisionId, affectedCount: entries.length, conflictsOverridden: conflicts.length },
    ai: { modelId: loaded.row.aiModelId ?? 'unknown', promptVersion: AI_GUIDED_PROMPT_VERSIONS.REVISE },
  })
  return { draft, revisionId: payload.revisionId, affectedCount: entries.length, conflictsOverridden: conflicts.length }
}

export async function undoAiGuidedRevisionForDraft(
  input: { draftId: string; actorUserId: string; version: number; revisionId: string; acceptConflicts: boolean },
  deps: AiGuidedDeps = defaultAiGuidedDeps(),
): Promise<{ draft: ProjectCreationDraft; restored: number }> {
  await deps.requireEnabled()
  const loaded = await loadOwnedDraft(deps, input)
  let result: ReturnType<typeof undoAiGuidedRevision>
  try {
    result = undoAiGuidedRevision({ draft: loaded.draft, revisionId: input.revisionId, acceptConflicts: input.acceptConflicts })
  } catch (error) {
    throw new AiGuidedError('AI_REVISION_NOT_UNDOABLE', 409, error instanceof Error ? error.message : 'This revision cannot be undone.')
  }
  if (result.conflicts.length > 0 && !input.acceptConflicts) {
    throw new AiGuidedError('AI_UNDO_CONFLICT', 409, `${result.conflicts.length} items changed after this revision. Confirm that undo may overwrite them.`, {
      conflicts: result.conflicts,
    })
  }
  const draft = await persistDraft(deps, {
    row: loaded.row,
    next: dropStaleInferredAssumptions(result.draft),
    actorUserId: input.actorUserId,
    kind: 'AI_GUIDED_REVISION_UNDONE',
    action: 'AI_PLAN_REVISION_UNDONE',
    metadata: { revisionId: input.revisionId, restored: result.restored, conflictsOverridden: result.conflicts.length },
  })
  return { draft, restored: result.restored }
}
