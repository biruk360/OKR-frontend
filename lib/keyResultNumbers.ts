/** KR measurement direction (KRX-1). INCREASE is the default and the historical behaviour. */
export type KrDirection = 'INCREASE' | 'DECREASE'

/** Anything that is not exactly `DECREASE` (case-insensitive) is treated as INCREASE. */
export function normalizeKrDirection(raw: unknown): KrDirection {
  return typeof raw === 'string' && raw.trim().toUpperCase() === 'DECREASE' ? 'DECREASE' : 'INCREASE'
}

/**
 * HTML forms / react-hook-form often send number inputs as strings in JSON.
 * Prisma Float fields require actual numbers.
 *
 * INCREASE (default): target > 0 and start < target.
 * DECREASE (KRX-1): target < start; target may be 0 (or below). start === target is always rejected.
 */
export function parseStartAndTarget(
  startValue: unknown,
  targetValue: unknown,
  direction: unknown = 'INCREASE',
): { ok: true; start: number; target: number } | { ok: false; message: string } {
  const start =
    startValue === undefined || startValue === null || startValue === ''
      ? 0
      : Number(startValue)
  const target =
    targetValue === undefined || targetValue === null || targetValue === ''
      ? Number.NaN
      : Number(targetValue)

  if (!Number.isFinite(start) || !Number.isFinite(target)) {
    return { ok: false, message: 'Start and target values must be valid numbers' }
  }
  if (normalizeKrDirection(direction) === 'DECREASE') {
    if (start === target) {
      return { ok: false, message: 'Target Value must be different from Start Value.' }
    }
    if (target > start) {
      return { ok: false, message: 'For a decreasing key result, Target Value must be lower than Start Value.' }
    }
    return { ok: true, start, target }
  }
  if (target <= 0) {
    return { ok: false, message: 'Target value must be greater than 0' }
  }
  if (start >= target) {
    return { ok: false, message: 'Target Value must be greater than Start Value.' }
  }
  return { ok: true, start, target }
}

/**
 * KR progress as a fraction 0..1 (FND-3 / KRX-1).
 *   INCREASE: (current − start) / (target − start)
 *   DECREASE: (start − current) / (start − target)
 * Returns null when the span is not positive in the KR's direction (legacy rows with
 * target ≤ start, or start === target) — callers fall back to the stored progress.
 */
export function krProgressFraction(kr: {
  startValue: number | null | undefined
  targetValue: number
  currentValue: number
  direction?: string | null
}): number | null {
  const start = typeof kr.startValue === 'number' && Number.isFinite(kr.startValue) ? kr.startValue : 0
  const { targetValue: target, currentValue: current } = kr
  if (!Number.isFinite(target) || !Number.isFinite(current)) return null
  const decrease = normalizeKrDirection(kr.direction) === 'DECREASE'
  const span = decrease ? start - target : target - start
  if (!(span > 0)) return null
  const done = decrease ? start - current : current - start
  return Math.min(1, Math.max(0, done / span))
}

/** KR progress as a 0..100 percentage, rounded; 0 when the span is degenerate. */
export function krProgressPercent(kr: Parameters<typeof krProgressFraction>[0]): number {
  const f = krProgressFraction(kr)
  return f === null ? 0 : Math.round(f * 100)
}

export function parseCurrentValue(
  currentValue: unknown,
  fallback: number
): { ok: true; current: number } | { ok: false; message: string } {
  if (currentValue === undefined || currentValue === null || currentValue === '') {
    return { ok: true, current: fallback }
  }
  const current = Number(currentValue)
  if (!Number.isFinite(current)) {
    return { ok: false, message: 'Current value must be a valid number' }
  }
  return { ok: true, current }
}

/** Absolute value, or "+N" / "+10" to add to the current cumulative value. */
export function parseProgressInput(
  raw: unknown,
  currentValue: number
): { ok: true; value: number } | { ok: false; message: string } {
  if (raw === undefined || raw === null) {
    return { ok: false, message: 'Progress is required' }
  }
  const s = (typeof raw === 'number' ? String(raw) : String(raw)).trim()
  if (!s) {
    return { ok: false, message: 'Progress is required' }
  }
  const normalized = s.replace(/,/g, '')
  if (normalized.startsWith('+')) {
    const delta = Number(normalized.slice(1))
    if (!Number.isFinite(delta)) {
      return { ok: false, message: 'Invalid number after +' }
    }
    return { ok: true, value: currentValue + delta }
  }
  const abs = Number(normalized)
  if (!Number.isFinite(abs)) {
    return { ok: false, message: 'Progress must be a valid number' }
  }
  return { ok: true, value: abs }
}
