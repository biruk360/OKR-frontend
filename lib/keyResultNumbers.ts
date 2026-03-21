/**
 * HTML forms / react-hook-form often send number inputs as strings in JSON.
 * Prisma Float fields require actual numbers.
 */
export function parseStartAndTarget(
  startValue: unknown,
  targetValue: unknown
): { ok: true; start: number; target: number } | { ok: false; message: string } {
  const start =
    startValue === undefined || startValue === null || startValue === ''
      ? 0
      : Number(startValue)
  const target = Number(targetValue)

  if (!Number.isFinite(start) || !Number.isFinite(target)) {
    return { ok: false, message: 'Start and target values must be valid numbers' }
  }
  if (target <= 0) {
    return { ok: false, message: 'Target value must be greater than 0' }
  }
  if (start >= target) {
    return { ok: false, message: 'Target Value must be greater than Start Value.' }
  }
  return { ok: true, start, target }
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
