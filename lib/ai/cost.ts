import type { AiProviderId } from './config'

/**
 * Per-million-token USD pricing per provider/model. Cached input is billed at the
 * cache-hit rate where applicable (Anthropic explicit cache, OpenAI auto cache,
 * Gemini cached content). Output is the generated tokens. Update when providers
 * change pricing — keep this file as the single source of truth.
 *
 * Values reflect public list pricing as of 2026-05; update on price changes.
 */
const PRICING_USD_PER_MTOK: Record<string, { input: number; cachedInput: number; output: number }> = {
  // Anthropic
  'claude-sonnet-4-6': { input: 3, cachedInput: 0.3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, cachedInput: 0.1, output: 5 },
  'claude-opus-4-7': { input: 15, cachedInput: 1.5, output: 75 },
  // OpenAI
  'gpt-4.1': { input: 2.5, cachedInput: 1.25, output: 10 },
  'gpt-4.1-mini': { input: 0.15, cachedInput: 0.075, output: 0.6 },
  'gpt-5': { input: 5, cachedInput: 2.5, output: 15 },
  // gpt-5.5 / 5.5-pro pricing is provisional — refine when OpenAI publishes the
  // public rate card; the values below approximate the 5.x family ratio.
  'gpt-5.5': { input: 6, cachedInput: 0.75, output: 18 },
  'gpt-5.5-pro': { input: 18, cachedInput: 2.25, output: 60 },
  // Gemini
  'gemini-2.5-pro': { input: 1.25, cachedInput: 0.31, output: 10 },
  'gemini-2.5-flash': { input: 0.075, cachedInput: 0.019, output: 0.3 },
}

export function estimateCostUsd(params: {
  modelId: string
  inputTokens: number
  cachedTokens: number
  outputTokens: number
}): number {
  const price = PRICING_USD_PER_MTOK[params.modelId]
  if (!price) return 0
  const freshInput = Math.max(0, params.inputTokens - params.cachedTokens)
  const usd =
    (freshInput * price.input + params.cachedTokens * price.cachedInput + params.outputTokens * price.output) /
    1_000_000
  return Math.round(usd * 1_000_000) / 1_000_000
}

export function isPricedModel(modelId: string): boolean {
  return modelId in PRICING_USD_PER_MTOK
}

/**
 * Sanity helper for logs/debug pages — reports which provider's price table a model
 * came from. Best-effort; defaults to "unknown" when prefix doesn't match.
 */
export function inferProvider(modelId: string): AiProviderId | 'unknown' {
  if (modelId.startsWith('claude-')) return 'anthropic'
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1') || modelId.startsWith('o3')) return 'openai'
  if (modelId.startsWith('gemini-')) return 'gemini'
  return 'unknown'
}
