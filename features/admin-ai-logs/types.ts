export interface AiLogRow {
  id: string
  createdAt: string
  user: { id: string; email: string; name: string; role: string }
  feature: string
  provider: 'anthropic' | 'openai' | 'gemini' | string
  modelId: string
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  cacheHitPct: number
  costUsd: number
  latencyMs: number | null
  status: 'OK' | 'ERROR'
  errorMessage: string | null
  planId: string | null
}

export interface AiLogsAggregate {
  totalGenerations: number
  totalCostUsd: number
  avgLatencyMs: number | null
  cacheHitPct: number
  errorRate: number
}
