import { hasProviderKey, providerKeyEnvName, type AiProviderId } from '../config'
import { ProviderNotConfiguredError, type AiProvider } from './types'
import { OpenAIProvider } from './openai'

/**
 * Factory that resolves the concrete AiProvider implementation for a given id.
 *
 * Throws ProviderNotConfiguredError when the API key is missing OR when the
 * provider implementation hasn't been wired yet (Anthropic + Gemini stubs land
 * in subsequent commits). Routes catch this and return a 503 naming the provider.
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
export type {
  AiProvider,
  AiUsage,
  ContextBundle,
  GenerateSprintPlanInput,
  GenerateSprintPlanOptions,
  SprintPlanToolPayload,
} from './types'
