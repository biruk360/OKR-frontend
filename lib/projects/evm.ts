/**
 * Earned Value Management (EVM) metrics for the Project Management module.
 *
 * SPI (Schedule Performance Index), CPI (Cost Performance Index), and EAC (Estimate At
 * Completion). Feeds RAG derivation (§B2), the SPI/CPI trend chart (C3), and the
 * portfolio bubble (C17). Pure — unit-tested.
 *
 *   PV  = Planned Value   (budgeted cost of work scheduled)
 *   EV  = Earned Value    (budgeted cost of work performed) = BAC × %complete
 *   AC  = Actual Cost     (actual cost of work performed)
 *   BAC = Budget At Completion
 *   SPI = EV / PV
 *   CPI = EV / AC
 *   EAC = BAC / CPI       (assumes current cost performance continues)
 */

export interface EvmInputs {
  budgetAtCompletion: number | null
  percentComplete: number // 0–100
  percentPlanned: number // 0–100
  actualCost: number | null
}

export interface EvmResult {
  plannedValue: number | null
  earnedValue: number | null
  actualCost: number | null
  spi: number | null
  cpi: number | null
  eac: number | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function computeEvm(input: EvmInputs): EvmResult {
  const bac = input.budgetAtCompletion
  if (bac == null || bac <= 0) {
    return { plannedValue: null, earnedValue: null, actualCost: input.actualCost ?? null, spi: null, cpi: null, eac: null }
  }

  const ev = bac * (clampPct(input.percentComplete) / 100)
  const pv = bac * (clampPct(input.percentPlanned) / 100)
  const ac = input.actualCost

  const spi = pv > 0 ? round2(ev / pv) : null
  const cpi = ac != null && ac > 0 ? round2(ev / ac) : null
  const eac = cpi != null && cpi > 0 ? round2(bac / cpi) : null

  return {
    plannedValue: round2(pv),
    earnedValue: round2(ev),
    actualCost: ac ?? null,
    spi,
    cpi,
    eac,
  }
}

function clampPct(n: number): number {
  if (Number.isNaN(n)) return 0
  return n < 0 ? 0 : n > 100 ? 100 : n
}
