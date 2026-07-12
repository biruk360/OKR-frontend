/**
 * Project confidence score (0–100) and RAG derivation.
 *
 * Mirrors the OKR confidence pattern (`lib/confidence-calc.ts`): a 100-point score
 * reduced by named penalties, so a project "80% complete but 40 days late with 6 open
 * high risks" does not read as healthy (build spec §B2, Issue #13). Pure — unit-tested.
 */

import type { RagStatus } from '@/features/projects/types'

export interface ConfidenceInputs {
  /** Weighted actual completion, 0–100. */
  percentComplete: number
  /** Expected completion as of today (from baseline), 0–100. */
  percentPlanned: number
  /** Sum of slip days across the project. */
  totalSlipDays: number
  /** Count of open RAID risks scored High (score ≥ 15, i.e. red zone). */
  openHighRisks: number
  /** Count of activities currently blocked. */
  blockedActivities: number
  /** Sum of business days currently pending client approval. */
  pendingApprovalDays: number
  /** Days since any activity on the project was last updated. */
  daysSinceLastUpdate: number
}

export interface ConfidenceBreakdown {
  confidence: number
  penalties: {
    scheduleVariance: number
    slip: number
    risk: number
    blocked: number
    approval: number
    staleness: number
  }
}

/** Compute the confidence score and its penalty breakdown. Build spec §B2. */
export function computeProjectConfidence(input: ConfidenceInputs): ConfidenceBreakdown {
  const behind = Math.max(0, input.percentPlanned - input.percentComplete)

  const penalties = {
    scheduleVariance: behind * 1.5,
    slip: Math.min(30, Math.max(0, input.totalSlipDays) * 0.5),
    risk: Math.max(0, input.openHighRisks) * 5,
    blocked: Math.max(0, input.blockedActivities) * 3,
    approval: Math.min(20, Math.max(0, input.pendingApprovalDays) * 0.4),
    staleness: input.daysSinceLastUpdate > 7 ? 10 : 0,
  }

  const total =
    penalties.scheduleVariance +
    penalties.slip +
    penalties.risk +
    penalties.blocked +
    penalties.approval +
    penalties.staleness

  const confidence = Math.max(0, Math.min(100, Math.round((100 - total) * 10) / 10))
  return { confidence, penalties }
}

/**
 * Derive RAG from confidence + SPI. Build spec §B2:
 *   RED   : confidence < 50 OR spi < 0.85
 *   GREEN : confidence ≥ 75 AND spi ≥ 0.95
 *   AMBER : everything else
 * When SPI is unknown (no baseline / EVM yet), it is treated as neutral (not a red/green trigger).
 */
export function deriveRag(confidence: number, spi: number | null | undefined): RagStatus {
  const hasSpi = spi !== null && spi !== undefined
  if (confidence < 50 || (hasSpi && (spi as number) < 0.85)) return 'RED'
  if (confidence >= 75 && (!hasSpi || (spi as number) >= 0.95)) return 'GREEN'
  return 'AMBER'
}
