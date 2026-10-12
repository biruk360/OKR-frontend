import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEPENDENCY_LATE_REPEAT_DAYS,
  daysBetweenKeys,
  earliestSince,
  isAlreadySent,
  joinNames,
  keyStart,
  latestSentByEntity,
  partitionUnsent,
  planCheckpointDue,
  planDependencyDueSoon,
  planDependencyLate,
  planDevItemDue,
  planDueWithin,
  planKpiAutoFill,
  planKpiReadingDue,
  type KpiCronInput,
} from './selection'

function kpi(overrides: Partial<KpiCronInput> = {}): KpiCronInput {
  return {
    id: 'kpi1',
    status: 'ACTIVE',
    frequency: 'MONTHLY',
    direction: 'INCREASE',
    targetValue: 50,
    targetMin: null,
    targetMax: null,
    thresholdAmber: 0.9,
    scoredFrom: null,
    createdKey: '2026-07-01',
    windowStartKey: '2026-07-01',
    windowEndKey: '2027-06-30',
    fiscalStartMonth: 6,
    readingStartKeys: new Set<string>(),
    ...overrides,
  }
}

const linked = (overrides: Partial<KpiCronInput> = {}, krValue: number | null = 42, krActive = true) => ({
  ...kpi(overrides),
  krValue,
  krActive,
})

// ---------------------------------------------------------------------------
// Date + dedupe helpers
// ---------------------------------------------------------------------------

test('daysBetweenKeys counts whole days, signed', () => {
  assert.equal(daysBetweenKeys('2026-10-12', '2026-10-26'), 14)
  assert.equal(daysBetweenKeys('2026-10-12', '2026-10-10'), -2)
  assert.equal(daysBetweenKeys('2026-12-31', '2027-01-01'), 1)
})

test('latestSentByEntity keeps the latest send per entity and ignores bad metadata', () => {
  const map = latestSentByEntity([
    { metadata: JSON.stringify({ entityType: 'KPI', entityId: 'a' }), at: new Date('2026-10-01T02:00:00Z') },
    { metadata: JSON.stringify({ entityType: 'KPI', entityId: 'a' }), at: new Date('2026-10-05T02:00:00Z') },
    { metadata: JSON.stringify({ entityId: 'b' }), at: new Date('2026-10-03T02:00:00Z') },
    { metadata: '{not json', at: new Date('2026-10-09T02:00:00Z') },
    { metadata: null, at: new Date('2026-10-09T02:00:00Z') },
    { metadata: JSON.stringify({ entityType: 'KPI' }), at: new Date('2026-10-09T02:00:00Z') },
  ])
  assert.equal(map.size, 2)
  assert.equal(map.get('a')?.toISOString(), '2026-10-05T02:00:00.000Z')
  assert.equal(map.get('b')?.toISOString(), '2026-10-03T02:00:00.000Z')
})

test('isAlreadySent / partitionUnsent dedupe inside the window, once per entity per run', () => {
  const since = keyStart('2026-10-12')
  const lastSent = new Map([
    ['sent-today', new Date('2026-10-12T02:00:00Z')],
    ['sent-before-window', new Date('2026-10-11T23:59:59Z')],
  ])
  assert.equal(isAlreadySent({ entityId: 'sent-today', since }, lastSent), true)
  assert.equal(isAlreadySent({ entityId: 'sent-before-window', since }, lastSent), false)
  assert.equal(isAlreadySent({ entityId: 'never', since }, lastSent), false)

  const { send, skipped } = partitionUnsent(
    [
      { entityId: 'sent-today', since },
      { entityId: 'sent-before-window', since },
      { entityId: 'never', since },
      { entityId: 'never', since },
    ],
    lastSent,
  )
  assert.deepEqual(send.map((c) => c.entityId), ['sent-before-window', 'never'])
  assert.deepEqual(skipped.map((c) => c.entityId), ['sent-today', 'never'])
})

test('earliestSince is the lookup lower bound', () => {
  assert.equal(earliestSince([]), null)
  assert.equal(
    earliestSince([{ since: keyStart('2026-10-05') }, { since: keyStart('2026-09-30') }])?.toISOString(),
    '2026-09-30T00:00:00.000Z',
  )
})

// ---------------------------------------------------------------------------
// KPI-3 auto-fill
// ---------------------------------------------------------------------------

test('KPI-3 fills the month that just ended from the KR value, with a computed RAG', () => {
  const plan = planKpiAutoFill(linked(), '2026-10-02')
  assert.ok(plan)
  assert.equal(plan.period.startKey, '2026-09-01')
  assert.equal(plan.period.endKey, '2026-09-30')
  assert.equal(plan.value, 42)
  assert.equal(plan.rag, 'RED') // 42 < 50 − 5
  assert.equal(planKpiAutoFill(linked({}, 46), '2026-10-02')?.rag, 'AMBER')
  assert.equal(planKpiAutoFill(linked({}, 50), '2026-10-02')?.rag, 'GREEN')
})

test('KPI-3 tolerates a missed run within 7 days, but never fills older periods', () => {
  assert.equal(planKpiAutoFill(linked(), '2026-10-07')?.period.startKey, '2026-09-01')
  assert.equal(planKpiAutoFill(linked(), '2026-10-08'), null) // 8 days after 30 Sep
  assert.equal(planKpiAutoFill(linked(), '2026-10-20'), null)
})

test('KPI-3 weekly and fiscal-quarter periods', () => {
  // Monday 12 Oct 2026 → the week of Mon 5 – Sun 11 Oct.
  const weekly = planKpiAutoFill(linked({ frequency: 'WEEKLY' }), '2026-10-12')
  assert.equal(weekly?.period.startKey, '2026-10-05')
  assert.equal(weekly?.period.endKey, '2026-10-11')
  // Fiscal year from July: Q1 = Jul–Sep.
  const quarterly = planKpiAutoFill(linked({ frequency: 'QUARTERLY' }), '2026-10-01')
  assert.equal(quarterly?.period.startKey, '2026-07-01')
  assert.equal(quarterly?.period.endKey, '2026-09-30')
})

test('KPI-3 skips: existing reading, inactive KR, retired KPI, created after the period, outside the timeframe', () => {
  assert.equal(planKpiAutoFill(linked({ readingStartKeys: new Set(['2026-09-01']) }), '2026-10-02'), null)
  assert.equal(planKpiAutoFill(linked({}, 42, false), '2026-10-02'), null)
  assert.equal(planKpiAutoFill(linked({}, null), '2026-10-02'), null)
  assert.equal(planKpiAutoFill(linked({ status: 'RETIRED' }), '2026-10-02'), null)
  assert.equal(planKpiAutoFill(linked({ createdKey: '2026-10-01' }), '2026-10-02'), null)
  // Created mid-period: the period still counts.
  assert.equal(planKpiAutoFill(linked({ createdKey: '2026-09-15' }), '2026-10-02')?.period.startKey, '2026-09-01')
  // The timeframe started after the period.
  assert.equal(planKpiAutoFill(linked({ windowStartKey: '2026-10-01', createdKey: '2026-06-01' }), '2026-10-02'), null)
  // The timeframe ended before the period.
  assert.equal(planKpiAutoFill(linked({ windowEndKey: '2026-08-31' }), '2026-10-02'), null)
})

test('KPI-3 before scoredFrom stores no RAG (measured, not scored)', () => {
  const plan = planKpiAutoFill(linked({ scoredFrom: new Date('2027-01-01T00:00:00Z') }), '2026-10-02')
  assert.ok(plan)
  assert.equal(plan.rag, null)
})

// ---------------------------------------------------------------------------
// KPI-5 reading due
// ---------------------------------------------------------------------------

test('KPI-5 announces the latest overdue period once, from the day after it ended', () => {
  const c = planKpiReadingDue(kpi({ readingStartKeys: new Set(['2026-07-01', '2026-08-01']) }), '2026-10-12')
  assert.ok(c)
  assert.equal(c.entityId, 'kpi1')
  assert.equal(c.since.toISOString(), '2026-10-01T00:00:00.000Z')
  assert.equal(c.data.periodStart, '2026-09-01')
  assert.equal(c.data.periodEnd, '2026-09-30')
  assert.equal(c.data.daysOverdue, 12)
  assert.equal(c.data.overdueCount, 1)
  assert.equal(typeof c.data.periodLabel, 'string')

  const many = planKpiReadingDue(kpi(), '2026-10-12')
  assert.equal(many?.data.periodStart, '2026-09-01')
  assert.equal(many?.data.overdueCount, 3)
})

test('KPI-5 waits for 3 working days after the period ends', () => {
  const k = kpi({ readingStartKeys: new Set(['2026-07-01', '2026-08-01']) })
  // 30 Sep (Wed) → Thu 1, Fri 2 = 2 working days.
  assert.equal(planKpiReadingDue(k, '2026-10-02'), null)
  // Sat/Sun do not count.
  assert.equal(planKpiReadingDue(k, '2026-10-04'), null)
  // Mon 5 Oct = 3 working days — still within grace; Tue 6 Oct = 4.
  assert.equal(planKpiReadingDue(k, '2026-10-05'), null)
  assert.ok(planKpiReadingDue(k, '2026-10-06'))
  // A holiday extends the grace.
  assert.equal(planKpiReadingDue(k, '2026-10-06', new Set(['2026-10-01'])), null)
})

test('KPI-5 skips retired KPIs, filled periods and very old gaps', () => {
  assert.equal(planKpiReadingDue(kpi({ status: 'RETIRED' }), '2026-10-12'), null)
  assert.equal(
    planKpiReadingDue(kpi({ readingStartKeys: new Set(['2026-07-01', '2026-08-01', '2026-09-01']) }), '2026-10-12'),
    null,
  )
  // Timeframe ended in June; the June gap is 104 days old by 12 Oct.
  assert.equal(
    planKpiReadingDue(kpi({ windowStartKey: '2026-01-01', createdKey: '2026-01-01', windowEndKey: '2026-06-30', fiscalStartMonth: 0 }), '2026-10-12'),
    null,
  )
})

// ---------------------------------------------------------------------------
// DEP-2 dependencies
// ---------------------------------------------------------------------------

const NOW = new Date('2026-10-12T12:00:00Z')

test('DEPENDENCY_DUE_SOON: open and due within 7 days, once per needed-by date', () => {
  const c = planDependencyDueSoon({ id: 'd1', status: 'OPEN', neededByDate: new Date('2026-10-15T00:00:00Z') }, '2026-10-12', NOW)
  assert.ok(c)
  assert.equal(c.data.daysLeft, 3)
  assert.equal(c.data.neededByDate, '2026-10-15')
  assert.equal(c.since.toISOString(), '2026-10-08T00:00:00.000Z')
  assert.equal(planDependencyDueSoon({ id: 'd1', status: 'DONE', neededByDate: new Date('2026-10-15T00:00:00Z') }, '2026-10-12', NOW), null)
  assert.equal(planDependencyDueSoon({ id: 'd1', status: 'OPEN', neededByDate: null }, '2026-10-12', NOW), null)
  assert.equal(planDependencyDueSoon({ id: 'd1', status: 'OPEN', neededByDate: new Date('2026-10-30T00:00:00Z') }, '2026-10-12', NOW), null)
  // Late is not "due soon".
  assert.equal(planDependencyDueSoon({ id: 'd1', status: 'OPEN', neededByDate: new Date('2026-10-09T00:00:00Z') }, '2026-10-12', NOW), null)
})

test('DEPENDENCY_LATE: first day late, then weekly', () => {
  const dep = { id: 'd2', status: 'IN_PROGRESS', neededByDate: new Date('2026-10-10T00:00:00Z') }
  // First day late (11 Oct): the window starts at the lateness episode.
  const first = planDependencyLate(dep, '2026-10-11', new Date('2026-10-11T12:00:00Z'))
  assert.ok(first)
  assert.equal(first.since.toISOString(), '2026-10-11T00:00:00.000Z')
  assert.equal(first.data.daysLate, 1)
  assert.equal(isAlreadySent(first, new Map()), false)
  // Re-running on the same day after the 02:00 send: suppressed.
  const sentAt = new Map([['d2', new Date('2026-10-11T02:00:00Z')]])
  assert.equal(isAlreadySent(first, sentAt), true)

  // Days 2 … 7: already sent this week.
  for (let day = 12; day <= 10 + DEPENDENCY_LATE_REPEAT_DAYS; day++) {
    const key = `2026-10-${String(day).padStart(2, '0')}`
    const c = planDependencyLate(dep, key, new Date(`${key}T12:00:00Z`))
    assert.ok(c)
    assert.equal(isAlreadySent(c, sentAt), true, `suppressed on ${key}`)
  }
  // A week after the first notice: sent again.
  const again = planDependencyLate(dep, '2026-10-18', new Date('2026-10-18T12:00:00Z'))
  assert.ok(again)
  assert.equal(again.data.daysLate, 8)
  assert.equal(isAlreadySent(again, sentAt), false)
})

test('DEPENDENCY_LATE: a rescheduled dependency that is late again starts a new episode', () => {
  // Notified on 11 Oct for a 10 Oct date; moved to 13 Oct and late again on 14 Oct.
  const sentAt = new Map([['d3', new Date('2026-10-11T02:00:00Z')]])
  const c = planDependencyLate({ id: 'd3', status: 'OPEN', neededByDate: new Date('2026-10-13T00:00:00Z') }, '2026-10-14', new Date('2026-10-14T12:00:00Z'))
  assert.ok(c)
  assert.equal(isAlreadySent(c, sentAt), false)
  assert.equal(planDependencyLate({ id: 'd3', status: 'DROPPED', neededByDate: new Date('2026-10-01T00:00:00Z') }, '2026-10-14', NOW), null)
})

// ---------------------------------------------------------------------------
// DEV-4 and KR checkpoints
// ---------------------------------------------------------------------------

test('DEV_ITEM_DUE: from 14 days before the due date, open items only, once per due date', () => {
  const c = planDevItemDue({ id: 'v1', status: 'NOT_STARTED', dueDate: new Date('2026-10-26T00:00:00Z') }, '2026-10-12')
  assert.ok(c)
  assert.equal(c.data.daysLeft, 14)
  assert.equal(c.since.toISOString(), '2026-10-12T00:00:00.000Z')
  assert.equal(planDevItemDue({ id: 'v1', status: 'IN_PROGRESS', dueDate: new Date('2026-10-27T00:00:00Z') }, '2026-10-12'), null)
  assert.equal(planDevItemDue({ id: 'v1', status: 'DONE', dueDate: new Date('2026-10-20T00:00:00Z') }, '2026-10-12'), null)
  assert.equal(planDevItemDue({ id: 'v1', status: 'DROPPED', dueDate: new Date('2026-10-20T00:00:00Z') }, '2026-10-12'), null)
  assert.equal(planDevItemDue({ id: 'v1', status: 'NOT_STARTED', dueDate: null }, '2026-10-12'), null)
  // Past due is an overdue chip in the UI, not a reminder.
  assert.equal(planDevItemDue({ id: 'v1', status: 'NOT_STARTED', dueDate: new Date('2026-10-11T00:00:00Z') }, '2026-10-12'), null)
  // Moving the due date out restarts the window.
  const moved = planDevItemDue({ id: 'v1', status: 'NOT_STARTED', dueDate: new Date('2026-11-09T00:00:00Z') }, '2026-10-27')
  assert.equal(moved?.since.toISOString(), '2026-10-26T00:00:00.000Z')
})

test('KR_CHECKPOINT_DUE: PENDING checkpoints of ACTIVE KRs within 7 days', () => {
  const c = planCheckpointDue({ id: 'c1', status: 'PENDING', dueDate: new Date('2026-10-19T00:00:00Z'), krStatus: 'ACTIVE' }, '2026-10-12')
  assert.ok(c)
  assert.equal(c.data.daysLeft, 7)
  assert.equal(c.data.dueDate, '2026-10-19')
  assert.equal(c.since.toISOString(), '2026-10-12T00:00:00.000Z')
  assert.equal(planCheckpointDue({ id: 'c1', status: 'PENDING', dueDate: new Date('2026-10-20T00:00:00Z'), krStatus: 'ACTIVE' }, '2026-10-12'), null)
  assert.equal(planCheckpointDue({ id: 'c1', status: 'MET', dueDate: new Date('2026-10-15T00:00:00Z'), krStatus: 'ACTIVE' }, '2026-10-12'), null)
  assert.equal(planCheckpointDue({ id: 'c1', status: 'PENDING', dueDate: new Date('2026-10-15T00:00:00Z'), krStatus: 'ARCHIVED' }, '2026-10-12'), null)
  // Due today still counts.
  assert.equal(planDueWithin('c2', '2026-10-12T00:00:00.000Z', '2026-10-12', 7)?.data.daysLeft, 0)
})

test('joinNames', () => {
  assert.equal(joinNames([]), '')
  assert.equal(joinNames(['Ana']), 'Ana')
  assert.equal(joinNames(['Ana', ' ', 'Bekele']), 'Ana and Bekele')
  assert.equal(joinNames(['Ana', 'Bekele', 'Chaltu']), 'Ana, Bekele and Chaltu')
  assert.equal(joinNames(['Ana', 'Bekele', 'Chaltu', 'Dawit', 'Eden']), 'Ana, Bekele, Chaltu and 2 more')
})
