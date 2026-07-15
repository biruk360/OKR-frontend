import test from 'node:test'
import assert from 'node:assert/strict'
import {
  currentWeeklyPeriod,
  markRecoveryPlan,
  mergeCarryForwardRedItems,
  portfolioSpi,
  type WbrRedItem,
} from './wbr-report'

test('currentWeeklyPeriod: returns Monday through Sunday UTC window', () => {
  const period = currentWeeklyPeriod(new Date('2026-07-15T12:00:00.000Z'))
  assert.equal(period.start.toISOString(), '2026-07-13T00:00:00.000Z')
  assert.equal(period.end.toISOString(), '2026-07-19T23:59:59.999Z')
})

test('portfolioSpi: contract-value weighted when values exist', () => {
  assert.equal(portfolioSpi([
    { spi: 1.2, contractValue: 100 },
    { spi: 0.8, contractValue: 300 },
  ]), 0.9)
})

test('markRecoveryPlan: missing committed date is flagged as NO RECOVERY PLAN', () => {
  const item = markRecoveryPlan({
    projectId: 'p1',
    projectCode: 'PRJ-1',
    projectName: 'Project',
    ragStatus: 'RED',
    ownerName: 'PM',
    committedRecoveryDate: null,
    reason: 'Red health',
    carriedForward: false,
  })
  assert.equal(item.noRecoveryPlan, true)
})

test('mergeCarryForwardRedItems: carries previous red item until project is green', () => {
  const previous: WbrRedItem[] = [markRecoveryPlan({
    projectId: 'p1',
    projectCode: 'PRJ-1',
    projectName: 'Project',
    ragStatus: 'RED',
    ownerName: 'PM',
    committedRecoveryDate: '2026-07-31',
    reason: 'Delay',
    carriedForward: false,
  })]
  const merged = mergeCarryForwardRedItems([], previous, new Map([['p1', { ragStatus: 'AMBER', status: 'ACTIVE' }]]))
  assert.equal(merged.length, 1)
  assert.equal(merged[0].carriedForward, true)

  const cleared = mergeCarryForwardRedItems([], previous, new Map([['p1', { ragStatus: 'GREEN', status: 'ACTIVE' }]]))
  assert.equal(cleared.length, 0)
})
