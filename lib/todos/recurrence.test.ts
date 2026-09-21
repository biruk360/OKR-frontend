import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  nextOccurrence,
  shouldGenerate,
  occurrencesUpTo,
  isRecurrenceRule,
  recurrenceLabel,
} from './recurrence'

/** Local-time helper so these tests do not depend on the runner's TZ. */
function d(y: number, m: number, day: number) {
  return new Date(y, m - 1, day)
}
const iso = (x: Date | null) => (x ? `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` : null)

// ── Cadence maths ───────────────────────────────────────────────────────────

test('R-01: simple cadences advance by their interval', () => {
  const wed = d(2026, 9, 16) // Wednesday
  assert.equal(iso(nextOccurrence('DAILY', wed)), '2026-09-17')
  assert.equal(iso(nextOccurrence('WEEKLY', wed)), '2026-09-23')
  assert.equal(iso(nextOccurrence('BIWEEKLY', wed)), '2026-09-30')
  assert.equal(iso(nextOccurrence('MONTHLY', wed)), '2026-10-16')
  assert.equal(iso(nextOccurrence('YEARLY', wed)), '2027-09-16')
})

test('R-02: WEEKDAYS skips the weekend', () => {
  assert.equal(iso(nextOccurrence('WEEKDAYS', d(2026, 9, 18))), '2026-09-21') // Fri → Mon
  assert.equal(iso(nextOccurrence('WEEKDAYS', d(2026, 9, 19))), '2026-09-21') // Sat → Mon
  assert.equal(iso(nextOccurrence('WEEKDAYS', d(2026, 9, 20))), '2026-09-21') // Sun → Mon
  assert.equal(iso(nextOccurrence('WEEKDAYS', d(2026, 9, 17))), '2026-09-18') // Thu → Fri
})

test('R-03: MONTHLY clamps rather than skipping a month', () => {
  // The bug this guards: Jan 31 + 1 month naively rolls into March, so a
  // month-end card silently misses February altogether.
  assert.equal(iso(nextOccurrence('MONTHLY', d(2026, 1, 31))), '2026-02-28')
  assert.equal(iso(nextOccurrence('MONTHLY', d(2028, 1, 31))), '2028-02-29') // leap year
  assert.equal(iso(nextOccurrence('MONTHLY', d(2026, 3, 31))), '2026-04-30')
})

test('R-04: YEARLY clamps Feb 29 into a non-leap year', () => {
  assert.equal(iso(nextOccurrence('YEARLY', d(2028, 2, 29))), '2029-02-28')
})

test('R-05: an unknown or absent rule yields nothing', () => {
  for (const v of [null, undefined, '', 'HOURLY', 'never']) {
    assert.equal(nextOccurrence(v as never, d(2026, 9, 16)), null)
    assert.equal(isRecurrenceRule(v), false)
  }
  assert.equal(nextOccurrence('DAILY', new Date('nonsense')), null)
})

test('R-06: labels exist for every rule and only for real rules', () => {
  assert.equal(recurrenceLabel('WEEKDAYS'), 'Every weekday (Mon–Fri)')
  assert.equal(recurrenceLabel('nope'), null)
  assert.equal(recurrenceLabel(null), null)
})

// ── Generation gate ─────────────────────────────────────────────────────────

const head = (over: Partial<Parameters<typeof shouldGenerate>[0]> = {}) => ({
  recurrenceRule: 'WEEKLY',
  dueDate: d(2026, 9, 16),
  ...over,
})

test('R-07: generates only once the next occurrence is inside the horizon', () => {
  // Next occurrence is 2026-09-23. With a 1-day horizon it arms on the 22nd.
  assert.equal(shouldGenerate(head(), d(2026, 9, 20)), false)
  assert.equal(shouldGenerate(head(), d(2026, 9, 22)), true)
  assert.equal(shouldGenerate(head(), d(2026, 9, 23)), true)
  // A wider horizon arms it earlier.
  assert.equal(shouldGenerate(head(), d(2026, 9, 20), 3), true)
})

test('R-08: recurrenceEndsAt stops the series, inclusively', () => {
  assert.equal(shouldGenerate(head({ recurrenceEndsAt: d(2026, 9, 23) }), d(2026, 9, 23)), true)
  assert.equal(shouldGenerate(head({ recurrenceEndsAt: d(2026, 9, 22) }), d(2026, 9, 23)), false)
})

test('R-09: an archived or ruleless or undated series never generates', () => {
  assert.equal(shouldGenerate(head({ archivedAt: d(2026, 9, 1) }), d(2026, 9, 23)), false)
  assert.equal(shouldGenerate(head({ recurrenceRule: null }), d(2026, 9, 23)), false)
  assert.equal(shouldGenerate(head({ dueDate: null }), d(2026, 9, 23)), false)
})

// ── Catch-up is bounded ─────────────────────────────────────────────────────

test('R-10: a dormant series catches up but does not flood the board', () => {
  // A daily card last due 2026-09-01, first run a month later.
  const dormant = { recurrenceRule: 'DAILY', dueDate: d(2026, 9, 1) }
  const dates = occurrencesUpTo(dormant, d(2026, 10, 1))
  assert.equal(dates.length, 5, 'capped at maxPerRun')
  assert.equal(iso(dates[0]), '2026-09-02')
  assert.equal(iso(dates[4]), '2026-09-06')
  // The cap is a parameter, and the sequence is contiguous.
  assert.equal(occurrencesUpTo(dormant, d(2026, 10, 1), 1, 2).length, 2)
})

test('R-11: a healthy series emits exactly one occurrence per run', () => {
  assert.equal(occurrencesUpTo(head(), d(2026, 9, 22)).length, 1)
  assert.equal(occurrencesUpTo(head(), d(2026, 9, 20)).length, 0)
})

test('R-12: catch-up respects the end date', () => {
  const dates = occurrencesUpTo(
    { recurrenceRule: 'DAILY', dueDate: d(2026, 9, 1), recurrenceEndsAt: d(2026, 9, 3) },
    d(2026, 10, 1),
  )
  assert.deepEqual(dates.map(iso), ['2026-09-02', '2026-09-03'])
})
