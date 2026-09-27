import { hasProviderKey, providerKeyEnvName, type AiProviderId } from '../config'
import { ProviderNotConfiguredError, type AiProvider } from './types'
import { OpenAIProvider } from './openai'

/**
 * Factory that resolves the concrete AiProvider implementation for a given id.
 *
 * Throws ProviderNotConfiguredError when the API key is missing OR when the
 * provider implementation hasn't been wired yet (Anthropic + Gemini stubs land
 * in subsequent commits). Routes catch this and return a 503 naming the provider.
 * Keep WIRED_AI_PROVIDERS (./wired.ts) in step with the cases below — UI
 * pickers only offer the providers listed there.
 */
export function getProvider(id: AiProviderId): AiProvider {
  if (!hasProviderKey(id)) {
    throw new ProviderNotConfiguredError(id)
  }
  const apiKey = process.env[providerKeyEnvName(id)]!
  switch (id) {
    case 'openai':
      return new OpenAIProvider(apiKey)
    case 'anthropic':
    case 'gemini':
      // Concrete impls land in a follow-up. Until then, the route returns 503.
      throw new ProviderNotConfiguredError(id)
  }
}

export { ProviderNotConfiguredError, ProviderCallError } from './types'
export { WIRED_AI_PROVIDERS, AI_PROVIDER_LABELS, isWiredAiProvider, type WiredAiProviderId } from './wired'
export type {
  AiProvider,
  AiUsage,
  ContextBundle,
  GenerateSprintPlanInput,
  GenerateSprintPlanOptions,
  SprintPlanToolPayload,
} from './types'
