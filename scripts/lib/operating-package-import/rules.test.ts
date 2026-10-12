import test from 'node:test'
import assert from 'node:assert/strict'
import {
  checkpointValue,
  commitmentFromCa,
  dependencyType,
  developmentKind,
  kpiPlan,
  krNumericPlan,
  linkDirection,
  mapCadence,
  parseCleanFigure,
  parsePercent,
  reviewVerdict,
  roleRowKind,
  succeedsSubKind,
  targetHours,
  weightKey,
} from './rules'

test('parseCleanFigure accepts single figures only', () => {
  assert.deepEqual(parseCleanFigure('ETB 300M'), { value: 300_000_000, unit: 'ETB', decrease: false, comparator: null })
  assert.deepEqual(parseCleanFigure('≥200'), { value: 200, unit: 'count', decrease: false, comparator: '≥' })
  assert.equal(parseCleanFigure('≥ETB 20M signed')?.value, 20_000_000)
  assert.equal(parseCleanFigure('3 signed')?.value, 3)
  assert.deepEqual(parseCleanFigure('≤15%'), { value: 15, unit: '%', decrease: true, comparator: '≤' })
  assert.equal(parseCleanFigure('≥8x')?.unit, 'x')
  assert.equal(parseCleanFigure('≥8/10')?.unit, 'score')
  assert.equal(parseCleanFigure('<5 a week')?.decrease, true)
  assert.equal(parseCleanFigure('0 unapproved')?.decrease, true)
  assert.equal(parseCleanFigure('100% every month')?.value, 100)
  // Rejected: compound, dates, several numbers, relative changes.
  assert.equal(parseCleanFigure('40%; ≥80%; ≥25 add-ons'), null)
  assert.equal(parseCleanFigure('≥200 submitted · ≥60 won'), null)
  assert.equal(parseCleanFigure('15 Nov 2026'), null)
  assert.equal(parseCleanFigure('12 of 12'), null)
  assert.equal(parseCleanFigure('80% by Q4'), null)
  assert.equal(parseCleanFigure('−30%'), null)
  assert.equal(parseCleanFigure('Approved 30 Nov 2026'), null)
  assert.equal(parseCleanFigure(''), null)
})

test('krNumericPlan: numeric for clean figures, milestone-scored otherwise', () => {
  const etb = krNumericPlan('ETB 300M', 'About ETB 100M signed')
  assert.equal(etb.scoring, 'NUMERIC')
  assert.equal(etb.targetValue, 300_000_000)
  assert.equal(etb.unit, 'ETB')
  assert.equal(etb.startValue, 0)
  assert.equal(etb.direction, 'INCREASE')

  const compound = krNumericPlan('40%; ≥80%; ≥25 add-ons', '')
  assert.deepEqual([compound.scoring, compound.startValue, compound.targetValue, compound.unit, compound.direction], ['MILESTONE', 0, 100, '%', 'INCREASE'])

  // Decreasing figures need a numeric baseline above the target.
  assert.equal(krNumericPlan('<5 a week', 'Not counted').scoring, 'MILESTONE')
  const dec = krNumericPlan('≤15%', '37%')
  assert.deepEqual([dec.scoring, dec.startValue, dec.targetValue, dec.direction], ['NUMERIC', 37, 15, 'DECREASE'])
  assert.equal(krNumericPlan('30 Oct 2026', '').scoring, 'MILESTONE')
})

test('checkpointValue scales ETB checkpoints', () => {
  assert.equal(checkpointValue('75M', 'ETB'), 75_000_000)
  assert.equal(checkpointValue('—', 'ETB'), null)
  assert.equal(checkpointValue('10 seats filled; standards live', '%'), null)
})

test('commitmentFromCa', () => {
  assert.equal(commitmentFromCa('C'), 'COMMITTED')
  assert.equal(commitmentFromCa('A'), 'ASPIRATIONAL')
  assert.equal(commitmentFromCa('C/A'), 'MIXED')
  assert.equal(commitmentFromCa(''), null)
})

test('kpiPlan', () => {
  const quota = kpiPlan({ name: 'Quota', type: 'Lagging', definition: 'Signed revenue against her quota', target: 'ETB 25M by 31 Dec · 60M by 31 Mar', baseline: '', frequency: 'Monthly' })
  assert.equal(quota.kpiType, 'LAGGING')
  assert.equal(quota.isSensitive, true)
  assert.equal(quota.compound, true)
  assert.equal(quota.targetValue, null)
  assert.equal(quota.unit, 'ETB')

  const losses = kpiPlan({ name: 'Price-driven losses', type: 'Lagging', definition: 'Losses on price', target: '≤15%', baseline: '37% of losses', frequency: 'Quarterly' })
  assert.deepEqual([losses.direction, losses.targetValue, losses.unit, losses.frequency, losses.compound], ['DECREASE', 15, '%', 'QUARTERLY', false])

  const cov = kpiPlan({ name: 'Pipeline coverage', type: 'Leading', definition: 'x', target: '≥8x', baseline: 'Not measured', frequency: 'Every sprint' })
  assert.deepEqual([cov.kpiType, cov.targetValue, cov.unit, cov.frequency, cov.frequencyNote], ['LEADING', 8, 'x', 'MONTHLY', 'Every sprint'])

  const range = kpiPlan({ name: 'Range', type: 'Leading', definition: 'x', target: '8–12', baseline: '', frequency: 'Weekly' })
  assert.deepEqual([range.direction, range.targetMin, range.targetMax], ['RANGE', 8, 12])
})

test('mapCadence (DUT-1/2/3)', () => {
  assert.equal(mapCadence('Daily', 'Daily scrum at the fixed time', 'Fixed time').cadence, 'WEEKDAYS')
  assert.equal(mapCadence('Daily', 'Lead routing', 'Continuous').cadence, 'DAILY')
  assert.equal(mapCadence('Weekly').cadence, 'WEEKLY')
  assert.equal(mapCadence('Weekly per project').cadence, 'WEEKLY')
  assert.equal(mapCadence('Biweekly').cadence, 'BIWEEKLY')
  assert.equal(mapCadence('Every sprint').cadence, 'EVERY_SPRINT')
  assert.equal(mapCadence('Monthly').cadence, 'MONTHLY')
  assert.equal(mapCadence('Quarterly').cadence, 'QUARTERLY')
  assert.equal(mapCadence('Twice a year').cadence, 'SEMIANNUAL')
  assert.equal(mapCadence('Annually').cadence, 'YEARLY')
  assert.deepEqual(mapCadence('Per bid'), { cadence: 'EVENT', eventLabel: 'per bid', note: null })
  assert.equal(mapCadence('Per request').eventLabel, 'per request')
  const twoMonthly = mapCadence('Every two months')
  assert.equal(twoMonthly.cadence, 'EVENT')
  assert.ok(twoMonthly.note)
})

test('development kinds and hours', () => {
  assert.equal(developmentKind('Hardware/IoT architecture certification', 'Certified'), 'CERTIFICATION')
  assert.equal(developmentKind('First-time-manager course (leading the bid team)', 'Completed'), 'COURSE')
  assert.equal(developmentKind('Training hours logged (mandatory ≥40 in the year)', '≥40 hours'), 'TRAINING_HOURS')
  assert.equal(developmentKind('Mentoring three emerging leaders', 'Monthly one-to-ones'), 'MENTORING')
  assert.equal(developmentKind('Executive coach or structured leadership programme', 'Engaged'), 'MENTORING')
  assert.equal(developmentKind('Advisory circle', 'Composition decided'), 'OTHER')
  assert.equal(targetHours('≥40 hours'), 40)
  assert.equal(targetHours('Certified'), null)
})

test('role rows, dependency types, directions, verdicts, weights', () => {
  assert.deepEqual(roleRowKind('Seat'), { kind: 'SEAT' })
  assert.deepEqual(roleRowKind('Reports to'), { kind: 'REPORTS_TO' })
  assert.deepEqual(roleRowKind('Direct reports (planned)'), { kind: 'ITEM', section: 'DIRECT_REPORT_SEAT', split: true })
  assert.deepEqual(roleRowKind('Accountability 9 (interim)'), { kind: 'ITEM', section: 'ACCOUNTABILITY', split: false })
  assert.deepEqual(roleRowKind('Escalates to the CEO'), { kind: 'ITEM', section: 'DECISION_RIGHT', split: false })
  assert.deepEqual(roleRowKind('Key interfaces (external)'), { kind: 'ITEM', section: 'INTERFACE', split: false })
  assert.deepEqual(roleRowKind('Values modelled'), { kind: 'ITEM', section: 'OTHER', split: false })

  assert.equal(dependencyType('Decision'), 'DECISION')
  assert.equal(dependencyType('Finance'), 'BUDGET')
  assert.equal(dependencyType('Partnership'), 'OTHER')

  assert.equal(linkDirection('Inbound'), 'INBOUND')
  assert.equal(linkDirection('The CEO needs'), 'INBOUND')
  assert.equal(linkDirection('Others need from the CEO'), 'OUTBOUND')
  assert.equal(linkDirection('Outbound'), 'OUTBOUND')

  assert.equal(reviewVerdict('Agree'), 'AGREE')
  assert.equal(reviewVerdict('Dispute'), 'DISPUTE')
  assert.equal(reviewVerdict(''), null)

  assert.equal(weightKey('Role KPIs'), 'kpis')
  assert.equal(weightKey('Values and A-Player behaviours'), 'values')
  assert.equal(weightKey('OKR contribution'), 'okr')
  assert.equal(weightKey('Development and certification (mandatory)'), 'development')
  assert.equal(weightKey('Reviewer'), null)
  assert.equal(parsePercent('50%'), 50)
  assert.equal(parsePercent('0.15'), 15)
  assert.equal(parsePercent(''), null)

  assert.equal(succeedsSubKind('Carried'), 'CARRIED')
  assert.equal(succeedsSubKind('Merged'), 'MERGED')
  assert.equal(succeedsSubKind('Retired'), null)
})
