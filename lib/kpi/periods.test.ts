import test from 'node:test'
import assert from 'node:assert/strict'
import {
  dateKeyInZone,
  fiscalQuarterOf,
  fiscalStartMonthOf,
  isDateKey,
  kpiPeriodFor,
  kpiPeriodForKey,
  listKpiPeriods,
  nextKpiPeriod,
  periodEndDate,
  periodStartDate,
  previousKpiPeriod,
  storedDateKey,
  timeframeWindowKeys,
} from './periods'

test('weekly periods run Monday → Sunday', () => {
  // 2026-10-12 is a Monday.
  assert.deepEqual(
    { s: kpiPeriodForKey('WEEKLY', '2026-10-12').startKey, e: kpiPeriodForKey('WEEKLY', '2026-10-12').endKey },
    { s: '2026-10-12', e: '2026-10-18' },
  )
  // Sunday belongs to the week that started the previous Monday.
  assert.equal(kpiPeriodForKey('WEEKLY', '2026-10-18').startKey, '2026-10-12')
  // Wednesday mid-week, across a month boundary.
  const p = kpiPeriodForKey('WEEKLY', '2026-10-01')
  assert.equal(p.startKey, '2026-09-28')
  assert.equal(p.endKey, '2026-10-04')
  assert.equal(p.label, 'Week of 28 Sep 2026')
  // Across a year boundary.
  assert.equal(kpiPeriodForKey('WEEKLY', '2027-01-01').startKey, '2026-12-28')
})

test('monthly periods are calendar months, incl. leap February', () => {
  const feb = kpiPeriodForKey('MONTHLY', '2028-02-15')
  assert.equal(feb.startKey, '2028-02-01')
  assert.equal(feb.endKey, '2028-02-29')
  assert.equal(feb.label, 'Feb 2028')
  assert.equal(kpiPeriodForKey('MONTHLY', '2026-12-31').endKey, '2026-12-31')
})

test('quarterly periods follow the fiscal year of the timeframe start', () => {
  // FY starting July (month 6).
  const q1 = kpiPeriodForKey('QUARTERLY', '2026-08-20', { fiscalStartMonth: 6 })
  assert.deepEqual([q1.startKey, q1.endKey, q1.label], ['2026-07-01', '2026-09-30', 'Q1 FY26/27'])
  const q2 = kpiPeriodForKey('QUARTERLY', '2026-10-12', { fiscalStartMonth: 6 })
  assert.deepEqual([q2.startKey, q2.endKey, q2.label], ['2026-10-01', '2026-12-31', 'Q2 FY26/27'])
  const q3 = kpiPeriodForKey('QUARTERLY', '2027-02-01', { fiscalStartMonth: 6 })
  assert.deepEqual([q3.startKey, q3.endKey, q3.label], ['2027-01-01', '2027-03-31', 'Q3 FY26/27'])
  const q4 = kpiPeriodForKey('QUARTERLY', '2027-06-30', { fiscalStartMonth: 6 })
  assert.deepEqual([q4.startKey, q4.endKey, q4.label], ['2027-04-01', '2027-06-30', 'Q4 FY26/27'])
  // Calendar quarters by default.
  const cal = kpiPeriodForKey('QUARTERLY', '2026-05-05')
  assert.deepEqual([cal.startKey, cal.endKey, cal.label], ['2026-04-01', '2026-06-30', 'Q2 2026'])
  // Odd fiscal start (November): Q1 = Nov–Jan spans a year end.
  const nov = fiscalQuarterOf('2027-01-15', 10)
  assert.deepEqual([nov.startKey, nov.endKey, nov.quarter, nov.fiscalYearStart], ['2026-11-01', '2027-01-31', 1, 2026])
})

test('fiscal start month and timeframe window keys tolerate local-midnight storage', () => {
  // Stored as Addis local midnight (UTC+3) → still July.
  assert.equal(fiscalStartMonthOf(new Date('2026-06-30T21:00:00.000Z')), 6)
  assert.equal(fiscalStartMonthOf(new Date('2026-07-01T00:00:00.000Z')), 6)
  assert.equal(fiscalStartMonthOf('not a date'), 0)
  assert.deepEqual(timeframeWindowKeys(new Date('2026-07-01T00:00:00Z'), new Date('2026-09-30T23:59:59Z')), {
    startKey: '2026-07-01',
    endKey: '2026-09-30',
  })
  assert.deepEqual(timeframeWindowKeys('2026-06-30T21:00:00Z', '2027-06-30T00:00:00Z'), {
    startKey: '2026-07-01',
    endKey: '2027-06-30',
  })
})

test('kpiPeriodFor reads a Date in the timezone; date keys pass through', () => {
  // 22:30Z on Sunday 18 Oct is already Monday 19 Oct in Addis Ababa.
  const instant = new Date('2026-10-18T22:30:00.000Z')
  assert.equal(dateKeyInZone(instant), '2026-10-19')
  assert.equal(kpiPeriodFor('WEEKLY', instant).startKey, '2026-10-19')
  assert.equal(kpiPeriodFor('WEEKLY', instant, { timeZone: 'UTC' }).startKey, '2026-10-12')
  assert.equal(kpiPeriodFor('MONTHLY', '2026-10-31').startKey, '2026-10-01')
})

test('next / previous / list periods', () => {
  const opts = { fiscalStartMonth: 6 }
  const q = kpiPeriodForKey('QUARTERLY', '2026-10-12', opts)
  assert.equal(nextKpiPeriod(q, opts).startKey, '2027-01-01')
  assert.equal(previousKpiPeriod(q, opts).startKey, '2026-07-01')
  const months = listKpiPeriods('MONTHLY', '2026-07-15', '2026-10-01')
  assert.deepEqual(months.map((m) => m.startKey), ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'])
  assert.deepEqual(listKpiPeriods('WEEKLY', '2026-10-20', '2026-10-01'), [])
  assert.equal(listKpiPeriods('WEEKLY', '2026-01-01', '2030-12-31', { limit: 5 }).length, 5)
})

test('stored boundaries are UTC day edges and round-trip', () => {
  assert.equal(periodStartDate('2026-10-12').toISOString(), '2026-10-12T00:00:00.000Z')
  assert.equal(periodEndDate('2026-10-18').toISOString(), '2026-10-18T23:59:59.999Z')
  assert.equal(storedDateKey(periodEndDate('2026-10-18')), '2026-10-18')
  assert.equal(storedDateKey('2026-10-12'), '2026-10-12')
  assert.ok(isDateKey('2026-02-28'))
  assert.ok(!isDateKey('2026-02-30'))
  assert.ok(!isDateKey('2026-2-3'))
})
