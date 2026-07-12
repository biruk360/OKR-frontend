export type PerformanceActor = {
  userId: string
  role: string
}

export type DecisionBand = {
  min: number
  label: string
}

export type GatekeeperConfig = {
  tierName?: string
  tierId?: string
  threshold: number
  failureBand?: string
}

export type LinearCappedRule = {
  type: 'LINEAR_CAPPED'
  maxScore?: number
}

export type InverseBand = {
  maxActual: number | null
  score: number
}

export type InverseBandsRule = {
  type: 'INVERSE_BANDS'
  bands: InverseBand[]
}

export type ManualRule = {
  type: 'MANUAL'
}

export type MetricScoringRule = LinearCappedRule | InverseBandsRule | ManualRule

export type RubricAnchors = Record<string, string | { en?: string; am?: string }>

export type TemplateValidationIssue = {
  path: string
  message: string
}

/**
 * Configurable reward/development recommendation rules stored on
 * PerformanceSettings.recommendationRulesJson (null = defaults).
 */
export type RecommendationRules = {
  /** PROMOTION for Ready band requires an improving normalized trend vs the prior finalized cycle. */
  readyPromotionRequiresImprovingTrend: boolean
  /** SALARY_ADJUSTMENT for Ready band + gatekeeper pass. */
  readySalaryAdjustment: boolean
  /** Top-tier BONUS ({ tier: 'top' }) for Ready band + gatekeeper pass. */
  readyTopTierBonus: boolean
  /** BONUS for On Track band. */
  onTrackBonus: boolean
  /** TRAINING recommended for each criterion consolidated below this score. */
  criterionTrainingThreshold: number
}

