/**
 * Pure allocation math for AI sprint planning. Provider-agnostic.
 *
 * The deterministic shell that wraps the AI: server computes these numbers, the AI
 * gets the numbers + context and decides on actual task wording. See
 * docs/AI_SPRINT_PLANNING.md §3.2 for the full algorithm and §10 #2/#3/#16 for
 * the acceptance criteria these functions satisfy.
 *
 * All functions are pure: no DB calls, no I/O, no Date.now(). Pass dates in.
 */

export const VELOCITY_MIN = 0.5
export const VELOCITY_MAX = 1.5
export const VELOCITY_NEUTRAL = 1.0

/** Confidence buckets used to bias effort allocation. */
export type KrConfidence = 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK'

export interface KrForMath {
  id: string
  objectiveId: string
  startValue: number
  targetValue: number
  currentValue: number
  weight: number
  confidence: KrConfidence
}

export interface PrevSprintTodoOutcome {
  /** progressValue planned for the todo at sprint start. Use 0 for binary tasks. */
  planned: number
  /** progressValue actually delivered (i.e. completed sum). */
  delivered: number
}

export interface AllocationRow {
  keyResultId: string
  weightShare: number       // 0..1 — share of the parent objective's weighted total
  timeBudgetPct: number     // 0..1 — share of total sprint effort allocated to this KR
  linearShare: number       // remainingGap / sprintsLeft (raw fair-share for the sprint)
  velocityFactor: number    // clamp [0.5, 1.5]
  carryoverDelta: number    // sum of carried progressValue routed to this KR
  plannedDelta: number      // newTaskTarget = clamp(linearShare * velocity - carryover, 0, +inf)
  saturated: boolean        // true when carryoverDelta >= linearShare * velocity
}

// ---------------------------------------------------------------------------
// Per-KR primitives
// ---------------------------------------------------------------------------

export function computeRemainingGap(kr: Pick<KrForMath, 'targetValue' | 'currentValue'>): number {
  return Math.max(0, kr.targetValue - kr.currentValue)
}

/**
 * Number of weeks between sprintStart and the timeframe end. Floors negative values
 * to 0 (timeframe already ended) and ceils fractional weeks up so a 9-day remainder
 * becomes 2 weeks rather than 1.
 */
export function computeWeeksLeft(timeframeEnd: Date, sprintStart: Date): number {
  const ms = timeframeEnd.getTime() - sprintStart.getTime()
  if (ms <= 0) return 0
  const weeks = ms / (1000 * 60 * 60 * 24 * 7)
  return Math.max(0, Math.ceil(weeks))
}

/** ceil(weeksLeft / sprintDurationWeeks). At least 1 sprint when there's any time left. */
export function computeSprintsLeft(weeksLeft: number, sprintDurationWeeks = 2): number {
  if (weeksLeft <= 0) return 0
  return Math.max(1, Math.ceil(weeksLeft / sprintDurationWeeks))
}

/** Raw fair-share allocation per sprint. Returns 0 when no sprints remain. */
export function computeLinearShare(remainingGap: number, sprintsLeft: number): number {
  if (sprintsLeft <= 0) return 0
  return remainingGap / sprintsLeft
}

/**
 * Velocity factor from the last N sprint outcomes — ratio of delivered/planned,
 * clamped to [0.5, 1.5]. With no history (or zero planned across the window) we
 * return the neutral 1.0 so a first sprint isn't biased.
 *
 * Binary tasks (planned=0) are excluded from the ratio rather than skewing it
 * toward 0; sprints made entirely of binary tasks return VELOCITY_NEUTRAL.
 */
export function computeVelocityFactor(history: PrevSprintTodoOutcome[]): number {
  if (history.length === 0) return VELOCITY_NEUTRAL
  let plannedSum = 0
  let deliveredSum = 0
  for (const t of history) {
    if (t.planned > 0) {
      plannedSum += t.planned
      deliveredSum += t.delivered
    }
  }
  if (plannedSum === 0) return VELOCITY_NEUTRAL
  const ratio = deliveredSum / plannedSum
  return clamp(ratio, VELOCITY_MIN, VELOCITY_MAX)
}

// ---------------------------------------------------------------------------
// Per-objective (siblings)
// ---------------------------------------------------------------------------

/**
 * Per-KR weightShare across an objective. Auto-equal split when every KR has
 * weight=0; otherwise the relative weight among siblings determines the share.
 * Returns a Map keyed by KR id with values summing to ~1.0.
 */
export function computeWeightShares(siblings: Array<Pick<KrForMath, 'id' | 'weight'>>): Map<string, number> {
  const total = siblings.reduce((acc, k) => acc + (k.weight > 0 ? k.weight : 0), 0)
  const out = new Map<string, number>()
  if (siblings.length === 0) return out
  if (total === 0) {
    const equal = 1 / siblings.length
    for (const k of siblings) out.set(k.id, equal)
    return out
  }
  for (const k of siblings) {
    const w = k.weight > 0 ? k.weight : 0
    out.set(k.id, w / total)
  }
  return out
}

/**
 * timeBudgetPct allocation across KRs in a single objective. Off-track KRs get
 * +20% effort, on-track -10%, AT_RISK neutral; results are normalized so they sum
 * to weightShareSum (typically 1.0 for a single objective).
 */
export function computeTimeBudgets(
  weightShares: Map<string, number>,
  confidenceById: Map<string, KrConfidence>
): Map<string, number> {
  const adjusted = new Map<string, number>()
  let sum = 0
  weightShares.forEach((share, id) => {
    const conf = confidenceById.get(id) ?? 'AT_RISK'
    const boost = conf === 'OFF_TRACK' ? 1.2 : conf === 'ON_TRACK' ? 0.9 : 1.0
    const v = share * boost
    adjusted.set(id, v)
    sum += v
  })
  if (sum <= 0) return adjusted
  // Normalize back to the original weightShares total to avoid inflating budget.
  const target = Array.from(weightShares.values()).reduce((a, b) => a + b, 0)
  const k = target / sum
  adjusted.forEach((v, id) => adjusted.set(id, v * k))
  return adjusted
}

// ---------------------------------------------------------------------------
// Plan-level
// ---------------------------------------------------------------------------

/**
 * After velocity scaling and carryover subtraction, the new-task target for a KR.
 * Clamped at 0 — when carryovers already saturate the KR's sprint share, the AI
 * generates no new tasks for it (see AC #17).
 */
export function computeNewTaskTarget(linearShare: number, velocityFactor: number, carryoverDelta: number): number {
  const adjusted = linearShare * velocityFactor
  return Math.max(0, adjusted - carryoverDelta)
}

/**
 * Full per-KR allocation table. Pass the subject's KRs grouped by objective along
 * with the timeframe end date and the prior-sprint history. Returns one row per KR.
 */
export interface BuildAllocationsParams {
  krs: KrForMath[]
  timeframeEnd: Date
  sprintStart: Date
  sprintDurationWeeks: number
  /** Map keyResultId → carryover progressValue routed to this KR for the new sprint. */
  carryoverByKr: Map<string, number>
  /** Outcomes from the prior 1–2 sprints across the subject's KRs. */
  velocityHistory: PrevSprintTodoOutcome[]
}

export function buildAllocations(params: BuildAllocationsParams): AllocationRow[] {
  const weeksLeft = computeWeeksLeft(params.timeframeEnd, params.sprintStart)
  const sprintsLeft = computeSprintsLeft(weeksLeft, params.sprintDurationWeeks)
  const velocityFactor = computeVelocityFactor(params.velocityHistory)

  // Group by objective so weight + time-budget calc happens within siblings.
  const byObj = new Map<string, KrForMath[]>()
  for (const kr of params.krs) {
    const arr = byObj.get(kr.objectiveId) ?? []
    arr.push(kr)
    byObj.set(kr.objectiveId, arr)
  }

  const out: AllocationRow[] = []
  byObj.forEach((siblings) => {
    const weightShares = computeWeightShares(siblings)
    const confById = new Map<string, KrConfidence>(siblings.map((k: KrForMath) => [k.id, k.confidence]))
    const timeBudgets = computeTimeBudgets(weightShares, confById)

    for (const kr of siblings) {
      const remainingGap = computeRemainingGap(kr)
      const linearShare = computeLinearShare(remainingGap, sprintsLeft)
      const carryoverDelta = params.carryoverByKr.get(kr.id) ?? 0
      const adjustedTarget = linearShare * velocityFactor
      const plannedDelta = computeNewTaskTarget(linearShare, velocityFactor, carryoverDelta)
      out.push({
        keyResultId: kr.id,
        weightShare: weightShares.get(kr.id) ?? 0,
        timeBudgetPct: timeBudgets.get(kr.id) ?? 0,
        linearShare,
        velocityFactor,
        carryoverDelta,
        plannedDelta,
        saturated: carryoverDelta > 0 && carryoverDelta >= adjustedTarget,
      })
    }
  })
  return out
}

/**
 * Returns true when carryovers consume ≥ 80% of total sprint capacity — the
 * "sprint debt" threshold (AC #25). Capacity = sum of (linearShare * velocity)
 * across all KRs; carryovers = sum of carryoverDelta.
 */
export function isSprintDebt(rows: AllocationRow[], threshold = 0.8): boolean {
  let capacity = 0
  let carry = 0
  for (const r of rows) {
    capacity += r.linearShare * r.velocityFactor
    carry += r.carryoverDelta
  }
  if (capacity <= 0) return false
  return carry / capacity >= threshold
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min
  return Math.min(max, Math.max(min, n))
}
