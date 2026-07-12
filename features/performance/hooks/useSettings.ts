'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

export type RecommendationRulesInput = {
  readyPromotionRequiresImprovingTrend: boolean
  readySalaryAdjustment: boolean
  readyTopTierBonus: boolean
  onTrackBonus: boolean
  criterionTrainingThreshold: number
}

export type PerformanceSettingsData = {
  id: string
  varianceThreshold: number
  improvementFocusLimit: number
  remarkAttributionEnabled: boolean
  weeklyNudgeDay: number
  recommendationRulesJson: Partial<RecommendationRulesInput> | null
  /** Effective rules (stored JSON merged over defaults) as resolved by the API. */
  recommendationRules: RecommendationRulesInput
  updatedAt: string
}

export type PerformanceSettingsInput = {
  varianceThreshold?: number
  improvementFocusLimit?: number
  remarkAttributionEnabled?: boolean
  weeklyNudgeDay?: number
  recommendationRulesJson?: RecommendationRulesInput | null
}

type Envelope<T> = { success?: boolean; data?: T; error?: string } | null

async function parse<T>(response: Response): Promise<T> {
  const json = await response.json().catch(() => null) as Envelope<T>
  if (!response.ok || !json?.success || json.data === undefined) {
    throw new Error(json?.error ?? `Request failed: ${response.status}`)
  }
  return json.data
}

/**
 * Self-contained fetch/mutation hooks for GET/PATCH /api/performance/settings.
 * Lives in its own file so the shared services/api.ts stays untouched
 * (same pattern as useTemplateSettings).
 */
export function usePerformanceSettings() {
  return useQuery({
    queryKey: ['performance', 'settings'],
    queryFn: async () => parse<PerformanceSettingsData>(await fetch('/api/performance/settings')),
  })
}

export function useSavePerformanceSettings() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (body: PerformanceSettingsInput) => {
      const response = await fetch('/api/performance/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return parse<PerformanceSettingsData>(response)
    },
    onSuccess: (data) => {
      client.setQueryData(['performance', 'settings'], data)
      toast.success('Performance settings saved')
    },
    onError: (error: Error) => toast.error(error.message),
  })
}
