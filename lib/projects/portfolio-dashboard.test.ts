/**
 * Unit tests for portfolio dashboard aggregation. Run: `npm run test:projects`
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDelayReasonPareto } from './portfolio-dashboard'

test('buildDelayReasonPareto: ranks reasons by days and computes cumulative %', () => {
  const delays = [
    { reason: 'CLIENT_APPROVAL_DELAY', daysLost: 10 },
    { reason: 'CLIENT_APPROVAL_DELAY', daysLost: 5 },
    { reason: 'INTERNAL_CAPACITY', daysLost: 3 },
    { reason: 'ESTIMATION_ERROR', daysLost: 2 },
    { reason: null, daysLost: 1 },
  ]

  const result = buildDelayReasonPareto(delays)
  assert.equal(result.length, 4)
  assert.equal(result[0].reason, 'Client approval delay')
  assert.equal(result[0].days, 15)
  assert.equal(result[0].cumulative, 71.4)
  assert.equal(result[1].reason, 'Internal capacity')
  assert.equal(result[1].days, 3)
  assert.equal(result[1].cumulative, 85.7)
  assert.equal(result[3].cumulative, 100)
})

test('buildDelayReasonPareto: empty input returns empty array', () => {
  assert.deepEqual(buildDelayReasonPareto([]), [])
})
