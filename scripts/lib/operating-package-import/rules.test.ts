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

// v2 (27 Oct 2026) KR targets from the real workbooks: one figure with notes around it.
// [target, baseline, KR title] → [scoring, start, target value, unit, direction]
const V2_KR_TARGETS: Array<[string, string, string, [string, number, number, string, string]]> = [
  ['≥200 (45 by 31 Dec · 115 by 31 Mar)', 'About 3 bids a month submitted', 'Submit at least 200 bids company-wide', ['NUMERIC', 0, 200, 'count', 'INCREASE']],
  ['≥30% and ≥60 wins (40% stretch)', 'Under 30% of submitted and 38% of qualified bids won', 'Win at least 30% of the bids we submit', ['NUMERIC', 0, 30, '%', 'INCREASE']],
  ['ETB 20M (offers to 100% of offices by 30 Nov)', 'No project-office campaign', 'Sign ETB 20M from donor-funded project offices', ['NUMERIC', 0, 20_000_000, 'ETB', 'INCREASE']],
  ['ETB 300M (floor 200M)', 'About ETB 100M signed', 'Sign ETB 300M by 6 Jul 2027', ['NUMERIC', 0, 300_000_000, 'ETB', 'INCREASE']],
  ['3 of 3 (2 by 30 Nov)', 'None in seat (11 Oct 2026)', 'Get the Presales Lead and 2 bid writers in seat', ['NUMERIC', 0, 3, 'count', 'INCREASE']],
  ['12 of 12 (first Sat 31 Oct 2026)', '0 sessions scheduled', 'Deliver the monthly all-company training', ['NUMERIC', 0, 12, 'count', 'INCREASE']],
  ['100% of hires within 3 business days', 'CEO involvement ad hoc', 'Interview every hire within 3 business days', ['NUMERIC', 0, 100, '%', 'INCREASE']],
  ['2 a quarter from Q3', 'Not tracked', 'Turn 2 strategic relationships into signed agreements each quarter', ['NUMERIC', 0, 2, 'count', 'INCREASE']],
  ['≥40 submitted; ≥30% won (40% stretch)', 'Bank-bid win rate not tracked', 'Win 30% of 40 bank and licence bids', ['NUMERIC', 0, 30, '%', 'INCREASE']],
  ['≥200 submitted; ≥60 won; ≥30% (40% stretch)', 'About 3 bids a month', 'Win 60 of at least 200 bids submitted (30% or more)', ['NUMERIC', 0, 60, 'count', 'INCREASE']],
  ['3 won from ≥12 submitted; ≥ETB 30M', '0 teaming frameworks', 'Win 3 international bids with partners', ['NUMERIC', 0, 3, 'count', 'INCREASE']],
  ['ETB 20M (25M stretch); 10M by 31 Mar', 'Fiscal-year-ended ERP revenue', 'Sign ETB 20M in private-sector ERP', ['NUMERIC', 0, 20_000_000, 'ETB', 'INCREASE']],
  ['200 MQLs and 60 SQLs a month', 'About 1,200 website visits a month', 'Generate 200 marketing-qualified leads a month', ['NUMERIC', 0, 200, 'count', 'INCREASE']],
  ['10, ≥4 government (6 by 31 Mar)', '2 AI projects in delivery', 'Sign 10 AI projects, at least 4 in government', ['NUMERIC', 0, 10, 'count', 'INCREASE']],
  ['≥9/10 every project; company NPS ≥ +70', 'No structured survey', 'Score 9/10 on client satisfaction on every project', ['NUMERIC', 0, 9, 'score', 'INCREASE']],
  ['≥99.5% crash-free sessions and uptime', 'Not in production', 'Keep Meda 99.5% crash-free', ['NUMERIC', 0, 99.5, '%', 'INCREASE']],
  ['≥30% hours saved on automated processes', 'No Odoo or AI automation measured', 'Save 30% of hours', ['NUMERIC', 0, 30, '%', 'INCREASE']],
  ['≤5 working days in 11 of 12 months', 'Close takes about 10 working days (11 Oct 2026)', 'Close the books within 5 working days every month', ['NUMERIC', 10, 5, 'count', 'DECREASE']],
  // Genuinely not numeric → milestone-scored 0 → 100 %.
  ['−50% against the Q2 median', 'Not measured; Q2 median is the baseline', 'Halve proposal hours per bid', ['MILESTONE', 0, 100, '%', 'INCREASE']],
  ['<5 a week', 'Not counted; 46 open decisions in the log (11 Oct 2026)', 'Cut operational decisions needing the CEO to under 5 a week', ['MILESTONE', 0, 100, '%', 'INCREASE']],
  ['ETB 0', "This year's penalties to be entered from the Baseline Pack", 'Pay zero avoidable tax penalties', ['MILESTONE', 0, 100, '%', 'INCREASE']],
  ['ETB 15–20M facility in place', 'No facility', 'Secure the trade-wing import facility', ['MILESTONE', 0, 100, '%', 'INCREASE']],
  ['Resubmitted 31 Oct; cleared and live', 'INSA rejected the 26 Aug request', 'Get Meda cleared by INSA and live', ['MILESTONE', 0, 100, '%', 'INCREASE']],
]

test('krNumericPlan reads the v2 one-number KR targets', () => {
  for (const [target, baseline, title, expected] of V2_KR_TARGETS) {
    const p = krNumericPlan(target, baseline, title)
    assert.deepEqual([p.scoring, p.startValue, p.targetValue, p.unit, p.direction], expected, `${target} — ${p.reason}`)
  }
})

test('checkpointValue reads the clause that matches the KR figure', () => {
  const kr12 = krNumericPlan('≥200 submitted; ≥60 won; ≥30% (40% stretch)', '', 'Win 60 of at least 200 bids submitted (30% or more)')
  assert.equal(checkpointValue('45 submitted', kr12.unit, kr12.pick), null)
  assert.equal(checkpointValue('200; 60 won', kr12.unit, kr12.pick), 60)
  const kr14 = krNumericPlan('3 won from ≥12 submitted; ≥ETB 30M', '', 'Win 3 international bids with partners')
  assert.equal(checkpointValue('4 submitted; 1 won', kr14.unit, kr14.pick), 1)
  assert.equal(checkpointValue('8 frameworks', kr14.unit, kr14.pick), null)
  const kr11 = krNumericPlan('ETB 300M (floor 200M)', '', 'Sign ETB 300M by 6 Jul 2027')
  assert.equal(checkpointValue('175M', kr11.unit, kr11.pick), 175_000_000)
  const kr41 = krNumericPlan('≥9/10; NPS ≥ +70', '', 'Client satisfaction 9/10 or higher on every project; NPS +70 or higher')
  assert.equal(checkpointValue('≥9/10', kr41.unit, kr41.pick), 9)
  assert.equal(checkpointValue('NPS +70', kr41.unit, kr41.pick), null)
  const kr25 = krNumericPlan('50', '', 'Sign 50 Cloud ERP companies')
  assert.equal(checkpointValue('10 pilots', kr25.unit, kr25.pick), 10)
})
