import { prisma } from '@/lib/prisma'
import { estimateCostUsd } from './cost'
import { DAILY_GENERATION_CAP, type AiFeatureKey, type AiProviderId } from './config'

export interface RecordGenerationParams {
  userId: string
  feature: AiFeatureKey
  provider: AiProviderId
  modelId: string
  inputTokens: number
  outputTokens: number
  cachedTokens?: number
  latencyMs?: number
  status: 'OK' | 'ERROR'
  errorMessage?: string | null
  planId?: string | null
}

/**
 * Persist a single AI generation as an AiGenerationLog row. Cost is computed
 * from token counts via lib/ai/cost.ts. Failures here are intentionally rethrown
 * so the caller knows the audit row didn't land.
 */
export async function recordGenerationLog(params: RecordGenerationParams) {
  const cachedTokens = params.cachedTokens ?? 0
  const costUsd = estimateCostUsd({
    modelId: params.modelId,
    inputTokens: params.inputTokens,
    cachedTokens,
    outputTokens: params.outputTokens,
  })
  return prisma.aiGenerationLog.create({
    data: {
      userId: params.userId,
      feature: params.feature,
      provider: params.provider,
      modelId: params.modelId,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      cachedTokens,
      latencyMs: params.latencyMs ?? null,
      costUsd,
      status: params.status,
      errorMessage: params.errorMessage ?? null,
      planId: params.planId ?? null,
    },
  })
}

/**
 * Returns true when the org has hit its daily generation cap. Counts successful
 * generations across ALL providers since midnight server-time so a failed call
 * doesn't lock the org out, and so providers don't get separate buckets.
 */
export async function isDailyCapReached(feature: AiFeatureKey): Promise<{ reached: boolean; used: number; cap: number }> {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const used = await prisma.aiGenerationLog.count({
    where: { feature, status: 'OK', createdAt: { gte: startOfDay } },
  })
  return { reached: used >= DAILY_GENERATION_CAP, used, cap: DAILY_GENERATION_CAP }
}
