import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextOccurrence, shouldGenerate } from '@/lib/todos/recurrence'
import {
  cadenceToRecurrenceRule,
  dutyCardDescription,
  dutyPlannerTimes,
  dutyWantsHead,
  firstDutyOccurrence,
  formatDuration,
  isCalendarCadence,
  nextFutureOccurrence,
  parseDutyDate,
  parseTimingText,
  planHeadCursor,
  sprintNumberFor,
  sprintStartOnOrAfter,
  sprintStartOnOrBefore,
  toDutyDateKey,
} from './schedule'
import { DUTY_CADENCES } from '@/types/package'

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)
const key = (x: Date | null) => toDutyDateKey(x)

// ── cadence → rule (DUT-1, DUT-2, DUT-3) ────────────────────────────────────

test('calendar cadences map 1:1 onto Todo recurrence rules, incl. QUARTERLY / SEMIANNUAL', () => {
  for (const c of ['DAILY', 'WEEKDAYS', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'YEARLY']) {
    assert.equal(cadenceToRecurrenceRule(c), c)
  }
})

test('EVERY_SPRINT is BIWEEKLY; EVENT and unknown values have no rule', () => {
  assert.equal(cadenceToRecurrenceRule('EVERY_SPRINT'), 'BIWEEKLY')
  assert.equal(cadenceToRecurrenceRule('EVENT'), null)
  assert.equal(cadenceToRecurrenceRule('PER_BID'), null)
  assert.equal(cadenceToRecurrenceRule(null), null)
  assert.equal(isCalendarCadence('EVENT'), false)
  assert.equal(isCalendarCadence('EVERY_SPRINT'), true)
})

test('every duty cadence except EVENT maps to a rule', () => {
  const unmapped = DUTY_CADENCES.filter((c) => cadenceToRecurrenceRule(c) === null)
  assert.deepEqual(unmapped, ['EVENT'])
})

test('dutyWantsHead: autoTask + calendar cadence + not retired', () => {
  assert.equal(dutyWantsHead({ cadence: 'WEEKLY', autoTask: true }), true)
  assert.equal(dutyWantsHead({ cadence: 'WEEKLY', autoTask: false }), false)
  assert.equal(dutyWantsHead({ cadence: 'EVENT', autoTask: true }), false)
  assert.equal(dutyWantsHead({ cadence: 'WEEKLY', autoTask: true, status: 'RETIRED' }), false)
  assert.equal(dutyWantsHead({ cadence: 'WEEKLY', autoTask: true, status: 'PAUSED' }), true)
})

// ── sprint calendar (DUT-2) ─────────────────────────────────────────────────

test('sprint calendar: S1 starts Mon 12 Oct 2026, two-week sprints', () => {
  assert.equal(key(sprintStartOnOrBefore(d(2026, 10, 12))), '2026-10-12')
  assert.equal(key(sprintStartOnOrBefore(d(2026, 10, 25))), '2026-10-12')
  assert.equal(key(sprintStartOnOrBefore(d(2026, 10, 26))), '2026-10-26')
  assert.equal(key(sprintStartOnOrAfter(d(2026, 10, 13))), '2026-10-26')
  assert.equal(key(sprintStartOnOrAfter(d(2026, 10, 12))), '2026-10-12')
  // Before the calendar starts, the grid still aligns on it.
  assert.equal(key(sprintStartOnOrAfter(d(2026, 10, 1))), '2026-10-12')
  assert.equal(key(sprintStartOnOrBefore(d(2026, 10, 1))), '2026-09-28')
  assert.equal(sprintNumberFor(d(2026, 10, 12)), 1)
  assert.equal(sprintNumberFor(d(2026, 10, 26)), 2)
  assert.equal(sprintNumberFor(d(2026, 12, 7)), 5)
})

test('EVERY_SPRINT: first due is the next sprint start, then every 14 days on the grid', () => {
  const first = firstDutyOccurrence({ cadence: 'EVERY_SPRINT', now: d(2026, 10, 14) })
  assert.equal(key(first), '2026-10-26')
  assert.equal(key(nextOccurrence('BIWEEKLY', first!)), '2026-11-09')
  assert.equal(sprintNumberFor(nextOccurrence('BIWEEKLY', first!)!), 3)
  // On a sprint start the duty is due that day.
  assert.equal(key(firstDutyOccurrence({ cadence: 'EVERY_SPRINT', now: d(2026, 10, 12) })), '2026-10-12')
})

test('EVERY_SPRINT with a weekday: that weekday of the current sprint while still ahead', () => {
  // Sprint S1 = 12–25 Oct. "Friday" from Tue 13 Oct → Fri 16 Oct.
  assert.equal(key(firstDutyOccurrence({ cadence: 'EVERY_SPRINT', timingText: 'Friday review', now: d(2026, 10, 13) })), '2026-10-16')
  // From Sat 17 Oct the S1 Friday is gone → S2 Friday 30 Oct.
  assert.equal(key(firstDutyOccurrence({ cadence: 'EVERY_SPRINT', timingText: 'Friday review', now: d(2026, 10, 17) })), '2026-10-30')
})

// ── timing text ─────────────────────────────────────────────────────────────

test('parseTimingText: clock times and deadline mode', () => {
  assert.deepEqual(parseTimingText('By 10:00'), { time: '10:00', timeMode: 'BY', weekday: null, ordinal: null, dayOfMonth: null })
  assert.equal(parseTimingText('Fixed slot 9.30').time, '09:30')
  assert.equal(parseTimingText('Fixed slot 9.30').timeMode, 'AT')
  assert.equal(parseTimingText('before 5pm').time, '17:00')
  assert.equal(parseTimingText('before 5pm').timeMode, 'BY')
  assert.equal(parseTimingText('12am').time, '00:00')
  assert.equal(parseTimingText('2:15 pm').time, '14:15')
})

test('parseTimingText: weekdays, ordinals, days of month', () => {
  assert.equal(parseTimingText('First Saturday').weekday, 6)
  assert.equal(parseTimingText('First Saturday').ordinal, 1)
  assert.equal(parseTimingText('last Friday of the month').ordinal, -1)
  assert.equal(parseTimingText('Mondays 9am').weekday, 1)
  assert.equal(parseTimingText('15th').dayOfMonth, 15)
  assert.equal(parseTimingText('Month end').dayOfMonth, 31)
  assert.equal(parseTimingText('end of the month').dayOfMonth, 31)
  // "Monthly" must not read as Monday.
  assert.equal(parseTimingText('Monthly close').weekday, null)
  assert.deepEqual(parseTimingText(''), { time: null, timeMode: null, weekday: null, ordinal: null, dayOfMonth: null })
  assert.equal(parseTimingText('Fixed slot').time, null)
})

test('dutyPlannerTimes: deadline vs fixed slot', () => {
  assert.deepEqual(dutyPlannerTimes(parseTimingText('By 10:00'), 30), { startTime: '09:30', endTime: '10:00' })
  assert.deepEqual(dutyPlannerTimes(parseTimingText('By 10:00'), null), { startTime: null, endTime: '10:00' })
  assert.deepEqual(dutyPlannerTimes(parseTimingText('09:00'), 90), { startTime: '09:00', endTime: '10:30' })
  assert.deepEqual(dutyPlannerTimes(parseTimingText('No time'), 30), { startTime: null, endTime: null })
  // Clamped inside the day.
  assert.deepEqual(dutyPlannerTimes(parseTimingText('23:30'), 120), { startTime: '23:30', endTime: '23:59' })
})

// ── first occurrence (DUT-1) ────────────────────────────────────────────────

test('first occurrence: no parseable timing → next working day', () => {
  // Sat 17 Oct 2026 → Mon 19 Oct.
  assert.equal(key(firstDutyOccurrence({ cadence: 'WEEKLY', now: d(2026, 10, 17) })), '2026-10-19')
  assert.equal(key(firstDutyOccurrence({ cadence: 'MONTHLY', now: d(2026, 10, 14) })), '2026-10-14')
  assert.equal(key(firstDutyOccurrence({ cadence: 'WEEKDAYS', now: d(2026, 10, 18) })), '2026-10-19')
  // DAILY includes weekends.
  assert.equal(key(firstDutyOccurrence({ cadence: 'DAILY', now: d(2026, 10, 17) })), '2026-10-17')
})

test('first occurrence: weekly on a named weekday', () => {
  // Wed 14 Oct, "Saturday management meeting" → Sat 17 Oct.
  assert.equal(key(firstDutyOccurrence({ cadence: 'WEEKLY', timingText: 'Saturday 9:00', now: d(2026, 10, 14) })), '2026-10-17')
  assert.equal(key(firstDutyOccurrence({ cadence: 'WEEKLY', timingText: 'Wednesday', now: d(2026, 10, 14) })), '2026-10-14')
})

test('first occurrence: monthly ordinal weekday and day of month', () => {
  // First Saturday of Oct 2026 is 3 Oct (past on 14 Oct) → 7 Nov.
  assert.equal(key(firstDutyOccurrence({ cadence: 'MONTHLY', timingText: 'First Saturday', now: d(2026, 10, 14) })), '2026-11-07')
  assert.equal(key(firstDutyOccurrence({ cadence: 'MONTHLY', timingText: 'last Friday', now: d(2026, 10, 14) })), '2026-10-30')
  assert.equal(key(firstDutyOccurrence({ cadence: 'QUARTERLY', timingText: '15th', now: d(2026, 10, 14) })), '2026-10-15')
  assert.equal(key(firstDutyOccurrence({ cadence: 'MONTHLY', timingText: '5th', now: d(2026, 10, 14) })), '2026-11-05')
  // Month end clamps.
  assert.equal(key(firstDutyOccurrence({ cadence: 'MONTHLY', timingText: 'Month end', now: d(2027, 2, 3) })), '2027-02-28')
})

test('first occurrence honours a future startsOn and never lands in the past', () => {
  assert.equal(key(firstDutyOccurrence({ cadence: 'WEEKLY', timingText: 'Monday', startsOn: d(2026, 11, 4), now: d(2026, 10, 14) })), '2026-11-09')
  // startsOn in the past: today is the floor (no backfill).
  assert.equal(key(firstDutyOccurrence({ cadence: 'DAILY', startsOn: d(2026, 9, 1), now: d(2026, 10, 14) })), '2026-10-14')
})

test('first occurrence: null for EVENT and when it would fall after endsOn', () => {
  assert.equal(firstDutyOccurrence({ cadence: 'EVENT', now: d(2026, 10, 14) }), null)
  assert.equal(firstDutyOccurrence({ cadence: 'MONTHLY', timingText: '20th', endsOn: d(2026, 10, 18), now: d(2026, 10, 14) }), null)
  assert.equal(key(firstDutyOccurrence({ cadence: 'MONTHLY', timingText: '18th', endsOn: d(2026, 10, 18), now: d(2026, 10, 14) })), '2026-10-18')
})

test('a head created on its first due date is picked up by the generator for the next date', () => {
  const due = firstDutyOccurrence({ cadence: 'QUARTERLY', timingText: 'Month end', now: d(2026, 11, 2) })!
  assert.equal(key(due), '2026-11-30')
  // Quarterly from Nov 30 with anchor 31 → Feb 28 (not Mar 2).
  assert.equal(key(nextOccurrence('QUARTERLY', due, 31)), '2027-02-28')
  assert.equal(shouldGenerate({ recurrenceRule: 'QUARTERLY', dueDate: due, anchorDay: 31 }, d(2027, 2, 27)), true)
  assert.equal(shouldGenerate({ recurrenceRule: 'QUARTERLY', dueDate: due, anchorDay: 31 }, d(2027, 2, 20)), false)
})

// ── resume / no backfill (DUT-4) ────────────────────────────────────────────

test('nextFutureOccurrence: steps a paused cursor to the next date on or after today', () => {
  // Weekly, last due Mon 19 Oct, resumed Wed 18 Nov → Mon 23 Nov.
  assert.equal(key(nextFutureOccurrence('WEEKLY', d(2026, 10, 19), d(2026, 11, 18))), '2026-11-23')
  // Already in the future: unchanged.
  assert.equal(key(nextFutureOccurrence('WEEKLY', d(2026, 11, 30), d(2026, 11, 18))), '2026-11-30')
  // Monthly anchored on the 31st keeps its anchor across short months.
  assert.equal(key(nextFutureOccurrence('MONTHLY', d(2027, 1, 31), d(2027, 3, 2), { anchorDay: 31 })), '2027-03-31')
  // Past the series end → null.
  assert.equal(nextFutureOccurrence('WEEKLY', d(2026, 10, 19), d(2026, 11, 18), { endsOn: d(2026, 11, 20) }), null)
  assert.equal(nextFutureOccurrence('PER_BID', d(2026, 10, 19), d(2026, 11, 18)), null)
})

test('planHeadCursor: an open head with no occurrences becomes the target card itself', () => {
  const target = d(2026, 11, 23)
  assert.equal(
    key(planHeadCursor({ rule: 'WEEKLY', target, headOpen: true, headHasChildren: false, currentDue: d(2026, 10, 19) })),
    '2026-11-23',
  )
})

test('planHeadCursor: an advanced or completed head sits one step before the target, so nothing earlier is generated', () => {
  const target = d(2026, 11, 23)
  const now = d(2026, 11, 18)
  const cursor = planHeadCursor({ rule: 'WEEKLY', target, headOpen: true, headHasChildren: true, currentDue: d(2026, 10, 19) })
  assert.equal(key(cursor), '2026-11-16')
  // The generator's next date from that cursor is exactly the target — the paused weeks are skipped.
  assert.equal(key(nextOccurrence('WEEKLY', cursor)), '2026-11-23')
  assert.equal(shouldGenerate({ recurrenceRule: 'WEEKLY', dueDate: cursor }, now), false)
  assert.equal(shouldGenerate({ recurrenceRule: 'WEEKLY', dueDate: cursor }, d(2026, 11, 22)), true)
  const done = planHeadCursor({ rule: 'WEEKLY', target, headOpen: false, headHasChildren: false, currentDue: d(2026, 10, 19) })
  assert.equal(key(done), '2026-11-16')
  // Cursor already on the target: unchanged.
  assert.equal(
    key(planHeadCursor({ rule: 'WEEKLY', target, headOpen: true, headHasChildren: true, currentDue: target })),
    '2026-11-23',
  )
})

// ── misc ────────────────────────────────────────────────────────────────────

test('parseDutyDate / toDutyDateKey round-trip local dates', () => {
  assert.equal(toDutyDateKey(parseDutyDate('2026-10-12')), '2026-10-12')
  assert.equal(parseDutyDate('2026-02-30'), null)
  assert.equal(parseDutyDate(''), null)
  assert.equal(parseDutyDate('nonsense'), null)
})

test('formatDuration and dutyCardDescription', () => {
  assert.equal(formatDuration(30), '30 min')
  assert.equal(formatDuration(60), '1 h')
  assert.equal(formatDuration(90), '1 h 30 min')
  assert.equal(formatDuration(0), null)
  assert.equal(dutyCardDescription({}), null)
  assert.equal(
    dutyCardDescription({ timingText: 'By 10:00', durationMin: 30, outputText: 'Bid register entries' }),
    'Recurring duty.\nTiming: By 10:00\nDuration: 30 min\nOutput: Bid register entries',
  )
})
