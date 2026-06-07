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

