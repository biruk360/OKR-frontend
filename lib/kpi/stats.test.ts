import test from 'node:test'
import assert from 'node:assert/strict'
import {
  averageReadingsInRange,
  countKpiHealth,
  findOverduePeriods,
  formatKpiNumber,
  isReadingOverdue,
  latestReading,
  quarterToDateAverage,
  sparklineSeries,
} from './stats'

const r = (periodStart: string, value: number | null, rag: string | null = null) => ({ periodStart, value, rag })

test('sparkline: last 12 numeric values, oldest first, by period', () => {
  // 15 monthly readings, Jan 2026 … Mar 2027, values 0 … 14.
  const readings = Array.from({ length: 15 }, (_, i) =>
    r(`${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`, i),
  )
  readings.push(r('2027-04-01', null)) // text-only reading skipped
  const series = sparklineSeries(readings.reverse())
  assert.equal(series.length, 12)
  assert.deepEqual(series.slice(0, 2), [3, 4])
  assert.deepEqual(series.slice(-1), [14])
})

test('latest reading is by period, not by array order', () => {
  const latest = latestReading([r('2026-10-01', 3), r('2026-12-01', 5), r('2026-11-01', 4)])
  assert.equal(latest?.value, 5)
  assert.equal(latestReading([]), null)
})

test('quarter-to-date average uses the fiscal quarter and ignores text readings', () => {
  const readings = [r('2026-09-28', 100), r('2026-10-05', 80), r('2026-10-12', 90), r('2026-10-19', null)]
  const qtd = quarterToDateAverage(readings, '2026-10-14', 6)
  assert.ok(qtd)
  assert.equal(qtd.count, 2)
  assert.equal(qtd.average, 85)
  assert.equal(qtd.quarter.startKey, '2026-10-01')
  assert.equal(quarterToDateAverage([r('2026-09-01', 1)], '2026-10-14', 6), null)
  assert.deepEqual(averageReadingsInRange(readings, '2026-09-01', '2026-12-31'), { average: 90, count: 3 })
})

test('KPI-5: overdue only after more than 3 working days past period end', () => {
  // Week ends Sunday 2026-10-11. Mon=1, Tue=2, Wed=3 working days → not yet; Thu=4 → overdue.
  const week = { endKey: '2026-10-11' }
  assert.equal(isReadingOverdue(week, '2026-10-11'), false)
  assert.equal(isReadingOverdue(week, '2026-10-14'), false)
  assert.equal(isReadingOverdue(week, '2026-10-15'), true)
  // Month ends Friday 2026-10-30: Mon 2, Tue 3, Wed 4 Nov → not; Thu 5 Nov → overdue (weekend skipped).
  const month = { endKey: '2026-10-30' }
  assert.equal(isReadingOverdue(month, '2026-11-04'), false)
  assert.equal(isReadingOverdue(month, '2026-11-05'), true)
  // A holiday pushes it out by one day.
  assert.equal(isReadingOverdue(month, '2026-11-05', { holidays: new Set(['2026-11-02']) }), false)
})

test('findOverduePeriods: missing, ended, past grace, within the window', () => {
  const overdue = findOverduePeriods({
    frequency: 'MONTHLY',
    windowStartKey: '2026-07-01',
    windowEndKey: '2027-06-30',
    todayKey: '2026-10-12',
    readingStartKeys: new Set(['2026-08-01']),
  })
  // Jul missing (overdue), Aug has a reading, Sep ended 30 Sep → 8 working days ago → overdue, Oct not ended.
  assert.deepEqual(overdue.map((p) => p.startKey), ['2026-07-01', '2026-09-01'])
  // Window after the timeframe end is clipped.
  const closed = findOverduePeriods({
    frequency: 'QUARTERLY',
    fiscalStartMonth: 6,
    windowStartKey: '2025-07-01',
    windowEndKey: '2026-06-30',
    todayKey: '2026-10-12',
    readingStartKeys: new Set(['2025-07-01', '2025-10-01', '2026-01-01']),
  })
  assert.deepEqual(closed.map((p) => p.startKey), ['2026-04-01'])
})

test('health counts and number formatting', () => {
  assert.deepEqual(countKpiHealth(['GREEN', 'GREEN', 'AMBER', 'RED', null, undefined]), {
    green: 2,
    amber: 1,
    red: 1,
    notScored: 2,
  })
  assert.equal(formatKpiNumber(12345.678, 'ETB'), '12,345.68 ETB')
  assert.equal(formatKpiNumber(42, '%'), '42%')
  assert.equal(formatKpiNumber(null, '%'), '—')
})
