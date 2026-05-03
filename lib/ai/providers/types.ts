import type { AiProviderId } from '../config'
import type { ContextBundle as RealContextBundle } from '../context-bundler'
import type { AllocationRow } from '../sprint-math'
import type { CarryoverCandidate } from '../carryover'
import type { SprintPlan } from '../sprint-plan-schema'

/**
 * Normalized usage tally returned by every provider. Each provider's SDK reports
 * tokens differently; the implementation maps to this shape so the caller and
 * AiGenerationLog only ever see one schema.
 *
 * `cachedTokens` represents tokens billed at the cache-hit rate. The semantics
 * vary by provider:
 *   - anthropic: explicit `cache_control` blocks → reported in `cache_read_input_tokens`.
 *   - openai: automatic prompt caching for inputs > 1024 tokens → `cached_tokens` in
 *     prompt_tokens_details.
 *   - gemini: explicit cached content via the Cache API → `cachedContentTokenCount`.
 */
export interface AiUsage {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
}

/** Re-exported for convenience — provider impls import this name. */
export type ContextBundle = RealContextBundle

/**
 * Normalized sprint-plan payload returned by every provider after structured-output
 * parsing + Zod validation. Defined in lib/ai/sprint-plan-schema.ts.
 */
export type SprintPlanToolPayload = SprintPlan

/** Inputs the route handler hands to the provider. The provider does not run the
 * math or the carryover classification itself — it receives the deterministic
 * outputs and renders them into the prompt. */
export interface GenerateSprintPlanInput {
  bundle: ContextBundle
  allocations: AllocationRow[]
  carryoverCandidates: Array<{
    candidate: CarryoverCandidate
    todo: {
      id: string
      title: string
      description?: string | null
      status: string
      priority?: string
      dueDate: Date | null
      progressValue: number | null
      carryoverCount: number
    }
  }>
  sprintStart: Date
  sprintEnd: Date
  durationDays: number
}

export interface GenerateSprintPlanOptions {
  modelId: string
  maxOutputTokens: number
  signal?: AbortSignal
}

export interface AiProvider {
  readonly id: AiProviderId
  generateSprintPlan(
    input: GenerateSprintPlanInput,
    options: GenerateSprintPlanOptions
  ): Promise<{
    plan: SprintPlanToolPayload
    usage: AiUsage
    raw: unknown
  }>
}

/** Thrown when a route requests a provider whose API key is not set. */
export class ProviderNotConfiguredError extends Error {
  constructor(public readonly provider: AiProviderId) {
    super(`Provider not configured: ${provider}`)
    this.name = 'ProviderNotConfiguredError'
  }
}

/** Thrown when a provider's SDK call fails. Wraps the original error for logging. */
export class ProviderCallError extends Error {
  constructor(
    public readonly provider: AiProviderId,
    public readonly modelId: string,
    public readonly cause: unknown,
    message?: string
  ) {
    super(message ?? `Provider call failed (${provider}/${modelId})`)
    this.name = 'ProviderCallError'
  }
}
