/**
 * Local calendar helpers for the card modal's date panel and due badge.
 * Split out of TodoCardModal.tsx; behaviour unchanged.
 */

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function ymd(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export function parseYmd(s: string | null): Date | null {
  if (!s) return null
  // A date-only "YYYY-MM-DD" is taken literally — it has no timezone to honour.
  // NOTE the anchor: this regex used to be unanchored, so it also matched the
  // first ten characters of a full ISO datetime and read the **UTC** calendar
  // day. Everything else in the card (the due badge, due-tone) parses the same
  // value as a Date and reads the **local** day, so east of UTC a card due at
  // local midnight showed one day in the badge and the day before in this
  // panel — and saving would have written that wrong day back.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
  const d = new Date(s)
  // Normalise a full datetime to its LOCAL calendar day, matching the badge.
  return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
export function sameDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
export function inRange(day: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false
  const t = day.getTime(), s = start.getTime(), e = end.getTime()
  return t >= Math.min(s, e) && t <= Math.max(s, e)
}
export function fmtMd(s: string | null): string {
  const d = parseYmd(s)
  // "Sep 14" — the design's summary format. A slashed M/D/YYYY in a row that is
  // read, not typed into, is just noise.
  return d ? `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}` : ''
}
export function to12h(t: string | null): string {
  if (!t) return ''
  const [hh, mm] = t.split(':')
  let h = parseInt(hh, 10)
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${mm} ${ap}`
}
