import { test } from 'node:test'
import assert from 'node:assert/strict'

// node --test runs each file in its own process, so pinning a DST zone here
// cannot leak into the other suites. Date reads TZ lazily, so setting it before
// the first Date is built is enough.
process.env.TZ = 'America/New_York'

import { planSeriesAdvance, shiftItemDates, nextOccurrence, anchorDayForDue } from './recurrence'

const d = (y: number, m: number, day: number, h = 0) => new Date(y, m - 1, day, h)
const stamp = (x: Date | null) =>
  x ? `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')} ${String(x.getHours()).padStart(2, '0')}:00` : null

test('DST-00: the zone really has DST here (guards the suite itself)', () => {
  assert.notEqual(d(2026, 1, 15).getTimezoneOffset(), d(2026, 7, 15).getTimezoneOffset())
})

test('DST-01: span across spring-forward (8 Mar 2026) stays whole days at midnight', () => {
  // Head Sat 7 Mar → Mon 9 Mar spans the 23-hour Sunday. In ms that is 47 h,
  // and the old `due − ms` put every later start at 01:00 or 23:00 the day before.
  const plan = planSeriesAdvance(
    { recurrenceRule: 'WEEKLY', startDate: d(2026, 3, 7), dueDate: d(2026, 3, 9) },
    d(2026, 3, 15),
  )
  assert.ok(plan)
  assert.equal(plan.spanDays, 2)
  assert.equal(stamp(plan.occurrences[0].startDate), '2026-03-14 00:00')
  assert.equal(stamp(plan.occurrences[0].dueDate), '2026-03-16 00:00')
  assert.equal(stamp(plan.head.startDate ?? null), '2026-03-14 00:00')
  // The defect this replaces, for the record:
  const msSpan = d(2026, 3, 9).getTime() - d(2026, 3, 7).getTime()
  assert.equal(stamp(new Date(d(2026, 3, 16).getTime() - msSpan)), '2026-03-14 01:00')
})

test('DST-02: occurrence inside the DST week gets a midnight start (fall-back, 1 Nov 2026)', () => {
  const plan = planSeriesAdvance(
    { recurrenceRule: 'WEEKLY', startDate: d(2026, 10, 23), dueDate: d(2026, 10, 26) },
    d(2026, 11, 1),
  )
  assert.ok(plan)
  assert.equal(stamp(plan.occurrences[0].startDate), '2026-10-30 00:00')
  assert.equal(stamp(plan.occurrences[0].dueDate), '2026-11-02 00:00')
})

test('DST-03: daily and weekly cadence land on local midnight across both transitions', () => {
  assert.equal(stamp(nextOccurrence('DAILY', d(2026, 3, 7))), '2026-03-08 00:00')
  assert.equal(stamp(nextOccurrence('DAILY', d(2026, 3, 8))), '2026-03-09 00:00')
  assert.equal(stamp(nextOccurrence('WEEKLY', d(2026, 10, 29))), '2026-11-05 00:00')
})

test('DST-04: checklist item dates keep their wall-clock time when shifted over a DST change', () => {
  const shifted = shiftItemDates({ startDate: d(2026, 3, 6, 9), dueDate: d(2026, 3, 7, 17) }, 7)
  assert.equal(stamp(shifted.startDate), '2026-03-13 09:00')
  assert.equal(stamp(shifted.dueDate), '2026-03-14 17:00')
})

test('DST-05: a stored month-end anchor steps Feb 28 → Mar 31 at local midnight across spring-forward', () => {
  const anchorDay = anchorDayForDue('MONTHLY', d(2026, 1, 31))
  const plan = planSeriesAdvance({ recurrenceRule: 'MONTHLY', dueDate: d(2026, 2, 28), anchorDay }, d(2026, 3, 30))
  assert.ok(plan)
  assert.equal(stamp(plan.occurrences[0].dueDate), '2026-03-31 00:00')
  assert.equal(anchorDayForDue('MONTHLY', d(2026, 3, 8, 3)), 8, 'day read in local time on the DST day')
})
