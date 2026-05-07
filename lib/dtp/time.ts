/**
 * HH:MM time math used across DTP. All times are local 24-hour strings to avoid
 * timezone drift between server (UTC) and Addis Ababa (UTC+3); a "trip date"
 * + an HH:MM is the canonical timestamp.
 */

export const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function parseHHMM(s: string): number {
  const m = s.match(HHMM_RE)
  if (!m) throw new Error(`Invalid HH:MM time: ${s}`)
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

export function isHHMM(s: string): boolean {
  return HHMM_RE.test(s)
}

export function formatHHMM(totalMin: number): string {
  const m = ((totalMin % (24 * 60)) + 24 * 60) % (24 * 60)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function addMinutes(time: string, mins: number): string {
  return formatHHMM(parseHHMM(time) + mins)
}

export function diffMinutes(later: string, earlier: string): number {
  return parseHHMM(later) - parseHHMM(earlier)
}

/** True iff `t` falls inside [start, end) (working-hours / rush-hour test). */
export function inWindow(t: string, start: string, end: string): boolean {
  const x = parseHHMM(t)
  return x >= parseHHMM(start) && x < parseHHMM(end)
}

/** Combine a UTC midnight Date (trip_date) with an HH:MM into an ISO string,
 * using Addis Ababa offset (+03:00) for predictability. */
export function toLocalIso(tripDate: Date, hhmm: string): string {
  const m = parseHHMM(hhmm)
  const y = tripDate.getUTCFullYear()
  const mo = String(tripDate.getUTCMonth() + 1).padStart(2, '0')
  const d = String(tripDate.getUTCDate()).padStart(2, '0')
  const hh = String(Math.floor(m / 60)).padStart(2, '0')
  const mm = String(m % 60).padStart(2, '0')
  return `${y}-${mo}-${d}T${hh}:${mm}:00+03:00`
}
