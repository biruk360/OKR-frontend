import type { AiProviderId } from '../config'

/**
 * Providers with a concrete AiProvider implementation in getProvider().
 * Anthropic and Gemini are still stubs that throw ProviderNotConfiguredError
 * (→ 503), so UI pickers offer only these. Client-safe: type-only import.
 */
export const WIRED_AI_PROVIDERS = ['openai'] as const satisfies readonly AiProviderId[]
export type WiredAiProviderId = (typeof WIRED_AI_PROVIDERS)[number]

export const AI_PROVIDER_LABELS: Record<AiProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
}

export function isWiredAiProvider(id: string): id is WiredAiProviderId {
  return (WIRED_AI_PROVIDERS as readonly string[]).includes(id)
}
