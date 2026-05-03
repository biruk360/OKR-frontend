import type { AiProviderId } from '../config'

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

/**
 * Provider-agnostic context bundle handed to generateSprintPlan. The actual
 * shape is finalized in Phase 2 (the deterministic context bundler). This stub
 * keeps the interface compilable until then.
 */
export type ContextBundle = unknown

/**
 * Normalized sprint-plan payload returned by every provider after structured-output
 * parsing + Zod validation. Phase 3 fills in the concrete schema; for now this is
 * an opaque type so the interface compiles without coupling to the schema yet.
 */
export type SprintPlanToolPayload = unknown

export interface GenerateSprintPlanOptions {
  modelId: string
  maxOutputTokens: number
  signal?: AbortSignal
}

export interface AiProvider {
  readonly id: AiProviderId
  generateSprintPlan(
    bundle: ContextBundle,
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
