import { hasProviderKey, type AiProviderId } from '../config'
import { ProviderNotConfiguredError, type AiProvider } from './types'

/**
 * Factory that resolves the concrete AiProvider implementation for a given id.
 *
 * Phase 1 stub: throws ProviderNotConfiguredError unconditionally so the build
 * compiles without the actual SDK packages installed (`@anthropic-ai/sdk`,
 * `openai`, `@google/generative-ai`). Phase 3 wires the real implementations.
 *
 * Callers should use this to surface a 503 with the provider name when a feature
 * is requested that hasn't been wired yet — preserving a clean error path that
 * the admin observability surface can audit.
 */
export function getProvider(id: AiProviderId): AiProvider {
  if (!hasProviderKey(id)) {
    throw new ProviderNotConfiguredError(id)
  }
  // Phase 3: switch on `id` and return the real Anthropic / OpenAI / Gemini impl.
  // Until then, the route returns 503 by catching ProviderNotConfiguredError above.
  throw new ProviderNotConfiguredError(id)
}

export { ProviderNotConfiguredError, ProviderCallError } from './types'
export type { AiProvider, AiUsage, ContextBundle, GenerateSprintPlanOptions, SprintPlanToolPayload } from './types'
