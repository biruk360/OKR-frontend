import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeNextRunAt,
  describeSchedule,
  jitterOffsetMs,
  lastBusinessDayOf,
  nthWeekdayOf,
  parseCron,
  planTickActions,
  utcFromZoned,
  weekdayOf,
  zonedParts,
} from './schedule'
import type { ScheduleSpec } from '@/types/automations'

const ADDIS = 'Africa/Addis_Ababa' // UTC+3, no DST
const LONDON = 'Europe/London' // UTC+0 / UTC+1 with DST

function spec(partial: Partial<ScheduleSpec>): ScheduleSpec {
  return { kind: 'DAILY', timezone: ADDIS, ...partial } as ScheduleSpec
}

// ---------------------------------------------------------------------------
// Timezone primitives
// ---------------------------------------------------------------------------

test('zonedParts renders the wall clock of the target zone, not the host', () => {
  const instant = new Date('2026-09-16T05:30:00Z')
  assert.deepEqual(zonedParts(instant, ADDIS), {
    year: 2026, month: 9, day: 16, hour: 8, minute: 30, second: 0,
  })
})

test('utcFromZoned inverts zonedParts for a fixed-offset zone', () => {
  const utc = utcFromZoned({ year: 2026, month: 9, day: 16, hour: 8, minute: 0 }, ADDIS)
  assert.equal(utc.toISOString(), '2026-09-16T05:00:00.000Z')
})

test('utcFromZoned resolves DST on both sides of a transition', () => {
  // London is UTC+1 in July, UTC+0 in January.
  assert.equal(
    utcFromZoned({ year: 2026, month: 7, day: 1, hour: 9, minute: 0 }, LONDON).toISOString(),
    '2026-07-01T08:00:00.000Z'
  )
  assert.equal(
    utcFromZoned({ year: 2026, month: 1, day: 1, hour: 9, minute: 0 }, LONDON).toISOString(),
    '2026-01-01T09:00:00.000Z'
  )
})

test('a daily 09:00 slot stays at 09:00 local across a DST boundary', () => {
  // The UK springs forward on 2026-03-29. A fixed-delta scheduler would drift to
  // 10:00 local; recomputing from the wall-clock rule must not.
  const s = spec({ kind: 'DAILY', timezone: LONDON, atTime: '09:00' })
  const before = computeNextRunAt(s, new Date('2026-03-28T12:00:00Z'))!
  const after = computeNextRunAt(s, new Date('2026-03-30T12:00:00Z'))!
  assert.equal(zonedParts(before, LONDON).hour, 9)
  assert.equal(zonedParts(after, LONDON).hour, 9)
  // And the UTC instants genuinely differ by the offset change.
  assert.equal(before.toISOString(), '2026-03-29T08:00:00.000Z')
  assert.equal(after.toISOString(), '2026-03-31T08:00:00.000Z')
})

// ---------------------------------------------------------------------------
// Calendar helpers
// ---------------------------------------------------------------------------

test('weekdayOf is locale-free', () => {
  assert.equal(weekdayOf(2026, 9, 16), 'WED')
  assert.equal(weekdayOf(2026, 1, 1), 'THU')
})

test('lastBusinessDayOf skips weekends', () => {
  // 2026-05-31 is a Sunday → last business day is Friday the 29th.
  assert.equal(lastBusinessDayOf(2026, 5), 29)
  // 2026-09-30 is a Wednesday.
  assert.equal(lastBusinessDayOf(2026, 9), 30)
})

test('nthWeekdayOf handles nth and last', () => {
  assert.equal(nthWeekdayOf(2026, 9, 1, 'MON'), 7)
  assert.equal(nthWeekdayOf(2026, 9, 2, 'MON'), 14)
  assert.equal(nthWeekdayOf(2026, 9, -1, 'MON'), 28)
})

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

test('DAILY returns the next 08:00 local slot', () => {
  const next = computeNextRunAt(spec({ kind: 'DAILY', atTime: '08:00' }), new Date('2026-09-16T06:00:00Z'))!
  // 06:00Z is 09:00 in Addis — already past today's slot, so tomorrow.
  assert.equal(next.toISOString(), '2026-09-17T05:00:00.000Z')
})

test('DAILY weekdaysOnly skips the weekend', () => {
  // Friday 2026-09-18 18:00 Addis → next weekday slot is Monday the 21st.
  const next = computeNextRunAt(
    spec({ kind: 'DAILY', atTime: '08:00', weekdaysOnly: true }),
    new Date('2026-09-18T15:00:00Z')
  )!
  assert.equal(weekdayOf(...([2026, 9, 21] as const)), 'MON')
  assert.equal(next.toISOString(), '2026-09-21T05:00:00.000Z')
})

test('WEEKLY honours byDay', () => {
  const next = computeNextRunAt(
    spec({ kind: 'WEEKLY', byDay: ['MON'], atTime: '07:00' }),
    new Date('2026-09-16T12:00:00Z')
  )!
  assert.equal(next.toISOString(), '2026-09-21T04:00:00.000Z')
})

test('HOURLY respects the active window', () => {
  const s = spec({ kind: 'HOURLY', minute: 0, activeWindowStart: '08:00', activeWindowEnd: '18:00' })
  // 19:30 Addis on the 16th → first slot is 08:00 Addis on the 17th.
  const next = computeNextRunAt(s, new Date('2026-09-16T16:30:00Z'))!
  assert.equal(next.toISOString(), '2026-09-17T05:00:00.000Z')
  // Mid-window rolls to the next hour.
  const mid = computeNextRunAt(s, new Date('2026-09-16T07:30:00Z'))!
  assert.equal(mid.toISOString(), '2026-09-16T08:00:00.000Z')
})

test('MONTHLY clamps a day past the end of a short month instead of skipping it', () => {
  const next = computeNextRunAt(
    spec({ kind: 'MONTHLY', dayOfMonth: 31, atTime: '09:00' }),
    new Date('2026-02-01T00:00:00Z')
  )!
  // February 2026 has 28 days — the slot lands on the 28th, not in March.
  assert.equal(next.toISOString(), '2026-02-28T06:00:00.000Z')
})

test('MONTHLY lastBusinessDay lands on a weekday', () => {
  const next = computeNextRunAt(
    spec({ kind: 'MONTHLY', lastBusinessDay: true, atTime: '16:00' }),
    new Date('2026-05-01T00:00:00Z')
  )!
  assert.equal(next.toISOString(), '2026-05-29T13:00:00.000Z')
})

test('QUARTERLY calendar quarters fire at quarter end', () => {
  const next = computeNextRunAt(
    spec({ kind: 'QUARTERLY', quarterSource: 'CALENDAR', quarterOffset: 'LAST_DAY', atTime: '10:00' }),
    new Date('2026-09-16T12:00:00Z')
  )!
  assert.equal(next.toISOString(), '2026-09-30T07:00:00.000Z')
})

test('QUARTERLY N_DAYS_BEFORE_END can land in the preceding month', () => {
  const next = computeNextRunAt(
    spec({
      kind: 'QUARTERLY', quarterSource: 'CALENDAR',
      quarterOffset: 'N_DAYS_BEFORE_END', quarterOffsetDays: 35, atTime: '10:00',
    }),
    new Date('2026-08-01T00:00:00Z')
  )!
  // 35 days before 2026-09-30 is 2026-08-26.
  assert.equal(next.toISOString(), '2026-08-26T07:00:00.000Z')
})

test('YEARLY fires once a year', () => {
  const s = spec({ kind: 'YEARLY', month: 1, day: 15, atTime: '08:00' })
  const next = computeNextRunAt(s, new Date('2026-09-16T12:00:00Z'))!
  assert.equal(next.toISOString(), '2027-01-15T05:00:00.000Z')
})

test('ONCE fires only while still in the future', () => {
  const s = spec({ kind: 'ONCE', runAt: '2026-09-20T05:00:00.000Z' })
  assert.equal(computeNextRunAt(s, new Date('2026-09-16T00:00:00Z'))!.toISOString(), '2026-09-20T05:00:00.000Z')
  assert.equal(computeNextRunAt(s, new Date('2026-09-21T00:00:00Z')), null)
})

test('endDate stops the series', () => {
  const s = spec({ kind: 'DAILY', atTime: '08:00', endDate: '2026-09-17T00:00:00.000Z' })
  assert.equal(computeNextRunAt(s, new Date('2026-09-18T00:00:00Z')), null)
})

test('skipHolidays skips configured dates', () => {
  const next = computeNextRunAt(
    spec({ kind: 'DAILY', atTime: '08:00', skipHolidays: true }),
    new Date('2026-09-16T06:00:00Z'),
    { holidays: ['2026-09-17'] }
  )!
  assert.equal(next.toISOString(), '2026-09-18T05:00:00.000Z')
})

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

test('parseCron expands ranges, lists and steps', () => {
  const c = parseCron('0,30 9-11 * * 1-5')
  assert.deepEqual(c.minutes, [0, 30])
  assert.deepEqual(c.hours, [9, 10, 11])
  assert.deepEqual(c.daysOfWeek, [1, 2, 3, 4, 5])
  assert.equal(c.dowRestricted, true)
  assert.equal(c.domRestricted, false)
  assert.deepEqual(parseCron('*/15 * * * *').minutes, [0, 15, 30, 45])
})

test('parseCron rejects malformed expressions', () => {
  assert.throws(() => parseCron('* * * *'), /5 fields/)
  assert.throws(() => parseCron('99 * * * *'), /Invalid cron range/)
})

test('CUSTOM_CRON produces the next matching local slot', () => {
  const next = computeNextRunAt(
    spec({ kind: 'CUSTOM_CRON', cron: '30 6 * * 1' }),
    new Date('2026-09-16T12:00:00Z')
  )!
  // Monday 2026-09-21 06:30 Addis = 03:30Z.
  assert.equal(next.toISOString(), '2026-09-21T03:30:00.000Z')
})

// ---------------------------------------------------------------------------
// Jitter
// ---------------------------------------------------------------------------

test('jitter is deterministic per automation and inside the bound', () => {
  const a = jitterOffsetMs('automation-abc', 300)
  assert.equal(a, jitterOffsetMs('automation-abc', 300))
  assert.ok(a >= 0 && a < 300_000)
  assert.equal(jitterOffsetMs('anything', 0), 0)
})

// ---------------------------------------------------------------------------
// Tick planning — catch-up semantics
// ---------------------------------------------------------------------------

test('a due slot inside the window is enqueued and the cursor advances', () => {
  const now = new Date('2026-09-16T05:10:00Z') // 10 min after the 08:00 Addis slot
  const actions = planTickActions(
    { id: 'a1', scheduleJson: spec({ kind: 'DAILY', atTime: '08:00', jitterSeconds: 0 }), nextRunAt: new Date('2026-09-16T05:00:00Z') },
    now
  )
  assert.equal(actions.enqueue.length, 1)
  assert.equal(actions.enqueue[0].toISOString(), '2026-09-16T05:00:00.000Z')
  assert.equal(actions.nextRunAt!.toISOString(), '2026-09-17T05:00:00.000Z')
  assert.equal(actions.missed.length, 0)
})

test('SKIP loses slots that blew past the catch-up window', () => {
  // Three days of downtime on a daily schedule.
  const actions = planTickActions(
    {
      id: 'a1',
      scheduleJson: spec({ kind: 'DAILY', atTime: '08:00', catchUpPolicy: 'SKIP', catchUpWindowMinutes: 120, jitterSeconds: 0 }),
      nextRunAt: new Date('2026-09-13T05:00:00Z'),
    },
    new Date('2026-09-16T05:30:00Z')
  )
  // Only today's slot is inside the window; the three older ones vanish.
  assert.equal(actions.enqueue.length, 1)
  assert.equal(actions.enqueue[0].toISOString(), '2026-09-16T05:00:00.000Z')
  assert.equal(actions.missed.length, 0)
})

test('RUN_LATE records slots beyond the window as MISSED rather than firing them', () => {
  const actions = planTickActions(
    {
      id: 'a1',
      scheduleJson: spec({ kind: 'DAILY', atTime: '08:00', catchUpPolicy: 'RUN_LATE', catchUpWindowMinutes: 120, jitterSeconds: 0 }),
      nextRunAt: new Date('2026-09-14T05:00:00Z'),
    },
    new Date('2026-09-16T05:30:00Z')
  )
  assert.deepEqual(actions.missed.map((d) => d.toISOString()), [
    '2026-09-14T05:00:00.000Z',
    '2026-09-15T05:00:00.000Z',
  ])
  assert.equal(actions.enqueue.length, 1)
  assert.equal(actions.enqueue[0].toISOString(), '2026-09-16T05:00:00.000Z')
})

test('RUN_ONCE_LATEST collapses a backlog into a single run', () => {
  const actions = planTickActions(
    {
      id: 'a1',
      scheduleJson: spec({ kind: 'HOURLY', minute: 0, catchUpPolicy: 'RUN_ONCE_LATEST', catchUpWindowMinutes: 5, jitterSeconds: 0 }),
      nextRunAt: new Date('2026-09-16T00:00:00Z'),
    },
    new Date('2026-09-16T06:02:00Z')
  )
  assert.equal(actions.enqueue.length, 1)
  assert.equal(actions.enqueue[0].toISOString(), '2026-09-16T06:00:00.000Z')
})

test('jitter delays firing without moving the nominal slot', () => {
  const schedule = spec({ kind: 'DAILY', atTime: '08:00', jitterSeconds: 300 })
  const slot = new Date('2026-09-16T05:00:00Z')
  const jitter = jitterOffsetMs('jitter-test', 300)
  const beforeJitter = planTickActions(
    { id: 'jitter-test', scheduleJson: schedule, nextRunAt: slot },
    new Date(slot.getTime() + jitter - 1000)
  )
  assert.equal(beforeJitter.enqueue.length, 0)

  const afterJitter = planTickActions(
    { id: 'jitter-test', scheduleJson: schedule, nextRunAt: slot },
    new Date(slot.getTime() + jitter + 1000)
  )
  assert.equal(afterJitter.enqueue.length, 1)
  // scheduledFor is the nominal slot — jitter never leaks into the identity.
  assert.equal(afterJitter.enqueue[0].toISOString(), slot.toISOString())
})

test('maxRuns ends the automation', () => {
  const actions = planTickActions(
    {
      id: 'a1',
      scheduleJson: spec({ kind: 'DAILY', atTime: '08:00', maxRuns: 2, jitterSeconds: 0 }),
      nextRunAt: new Date('2026-09-16T05:00:00Z'),
      runCount: 2,
    },
    new Date('2026-09-16T05:30:00Z')
  )
  assert.equal(actions.enqueue.length, 0)
  assert.equal(actions.ended, true)
})

test('nothing is enqueued before the slot is due', () => {
  const actions = planTickActions(
    { id: 'a1', scheduleJson: spec({ kind: 'DAILY', atTime: '08:00', jitterSeconds: 0 }), nextRunAt: new Date('2026-09-16T05:00:00Z') },
    new Date('2026-09-16T04:59:00Z')
  )
  assert.equal(actions.enqueue.length, 0)
  assert.equal(actions.nextRunAt!.toISOString(), '2026-09-16T05:00:00.000Z')
})

// ---------------------------------------------------------------------------
// Description
// ---------------------------------------------------------------------------

test('describeSchedule produces readable summaries', () => {
  assert.match(describeSchedule(spec({ kind: 'WEEKLY', byDay: ['MON'], atTime: '07:00' })), /Weekly on MON at 07:00/)
  assert.match(describeSchedule(spec({ kind: 'MONTHLY', lastBusinessDay: true })), /last business day/)
})
