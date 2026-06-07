import type { Prisma } from '@prisma/client'
import { validateDecisionBands } from './scoring'
import type {
  DecisionBand,
  GatekeeperConfig,
  MetricScoringRule,
  RubricAnchors,
  TemplateValidationIssue,
} from './types'

type CriterionLike = {
  type: string
  title: string
  maxPoints: number
  anchorJson: Prisma.JsonValue | null
  target: number | null
  scoringRuleJson: Prisma.JsonValue | null
}

type TierLike = {
  id?: string
  name: string
  maxPoints: number
  criteria: CriterionLike[]
}

type TemplateLike = {
  gatekeeperJson: Prisma.JsonValue
  bandsJson: Prisma.JsonValue
  tiers: TierLike[]
}

const REQUIRED_RUBRIC_ANCHORS = ['0', '4', '7', '10']

export function parseBands(value: Prisma.JsonValue): DecisionBand[] {
  if (!Array.isArray(value)) throw new Error('Decision bands must be an array')
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('Each decision band must be an object')
    }
    const row = entry as Record<string, unknown>
    return { min: Number(row.min), label: String(row.label ?? '') }
  })
}

export function parseGatekeeper(value: Prisma.JsonValue): GatekeeperConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Gatekeeper configuration must be an object')
  }
  const row = value as Record<string, unknown>
  return {
    tierId: typeof row.tierId === 'string' ? row.tierId : undefined,
    tierName: typeof row.tierName === 'string' ? row.tierName : undefined,
    threshold: Number(row.threshold),
    failureBand: typeof row.failureBand === 'string' ? row.failureBand : undefined,
  }
}

export function parseMetricRule(value: Prisma.JsonValue | null): MetricScoringRule | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (row.type === 'MANUAL') return { type: 'MANUAL' }
  if (row.type === 'LINEAR_CAPPED') {
    return {
      type: 'LINEAR_CAPPED',
      maxScore: row.maxScore === undefined ? undefined : Number(row.maxScore),
    }
  }
  if (row.type === 'INVERSE_BANDS' && Array.isArray(row.bands)) {
    return {
      type: 'INVERSE_BANDS',
      bands: row.bands.map((band) => {
        const item = band as Record<string, unknown>
        return {
          maxActual: item.maxActual === null ? null : Number(item.maxActual),
          score: Number(item.score),
        }
      }),
    }
  }
  return null
}

export function validateTemplateForPublish(template: TemplateLike): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = []

  if (template.tiers.length === 0) {
    issues.push({ path: 'tiers', message: 'At least one tier is required' })
  }

  for (let tierIndex = 0; tierIndex < template.tiers.length; tierIndex++) {
    const tier = template.tiers[tierIndex]
    if (tier.criteria.length === 0) {
      issues.push({ path: `tiers.${tierIndex}.criteria`, message: `${tier.name} needs at least one criterion` })
    }
    const criterionTotal = tier.criteria.reduce((sum: number, criterion: CriterionLike) => sum + criterion.maxPoints, 0)
    if (Math.abs(criterionTotal - tier.maxPoints) > 0.0001) {
      issues.push({
        path: `tiers.${tierIndex}.maxPoints`,
        message: `${tier.name} max points must equal its criterion total (${criterionTotal})`,
      })
    }

    for (let criterionIndex = 0; criterionIndex < tier.criteria.length; criterionIndex++) {
      const criterion = tier.criteria[criterionIndex]
      const path = `tiers.${tierIndex}.criteria.${criterionIndex}`
      if (!criterion.title.trim()) issues.push({ path: `${path}.title`, message: 'Criterion title is required' })
      if (criterion.type === 'RUBRIC') {
        if (criterion.maxPoints !== 10) {
          issues.push({ path: `${path}.maxPoints`, message: 'Rubric criteria must use the 10-point scale in v1' })
        }
        const anchors = (criterion.anchorJson ?? {}) as RubricAnchors
        for (const anchor of REQUIRED_RUBRIC_ANCHORS) {
          if (!anchors[anchor]) {
            issues.push({ path: `${path}.anchorJson.${anchor}`, message: `Rubric anchor ${anchor} is required` })
          }
        }
      } else if (criterion.type === 'METRIC') {
        const rule = parseMetricRule(criterion.scoringRuleJson)
        if (!rule) issues.push({ path: `${path}.scoringRuleJson`, message: 'A supported metric scoring rule is required' })
        if (rule?.type === 'LINEAR_CAPPED' && (!criterion.target || criterion.target <= 0)) {
          issues.push({ path: `${path}.target`, message: 'Linear metric criteria require a positive target' })
        }
      } else {
        issues.push({ path: `${path}.type`, message: 'Criterion type must be RUBRIC or METRIC' })
      }
    }
  }

  try {
    for (const message of validateDecisionBands(parseBands(template.bandsJson))) {
      issues.push({ path: 'bandsJson', message })
    }
  } catch (error) {
    issues.push({ path: 'bandsJson', message: error instanceof Error ? error.message : 'Invalid decision bands' })
  }

  try {
    const gatekeeper = parseGatekeeper(template.gatekeeperJson)
    if (!Number.isFinite(gatekeeper.threshold)) {
      issues.push({ path: 'gatekeeperJson.threshold', message: 'Gatekeeper threshold must be finite' })
    }
    const tier = gatekeeper.tierId
      ? template.tiers.find((candidate) => candidate.id === gatekeeper.tierId)
      : template.tiers.find((candidate) => candidate.name === gatekeeper.tierName)
    if (!tier) issues.push({ path: 'gatekeeperJson', message: 'Gatekeeper tier must exist in the template' })
    if (tier && gatekeeper.threshold > tier.maxPoints) {
      issues.push({ path: 'gatekeeperJson.threshold', message: 'Gatekeeper threshold cannot exceed tier max points' })
    }
  } catch (error) {
    issues.push({ path: 'gatekeeperJson', message: error instanceof Error ? error.message : 'Invalid gatekeeper' })
  }

  return issues
}
