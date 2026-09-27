import test from 'node:test'
import assert from 'node:assert/strict'
import { completionRate, countByGoalStatus, isObjectiveComplete, progressBand } from './progress-thresholds'

test('progress bands match getProgressColor (70 / 40)', () => {
  assert.equal(progressBand(100), 'healthy')
  assert.equal(progressBand(70), 'healthy')
  assert.equal(progressBand(69.9), 'warning')
  assert.equal(progressBand(40), 'warning')
  assert.equal(progressBand(39), 'critical')
})

test('completion means CLOSED or 100% — never 75%', () => {
  assert.equal(isObjectiveComplete({ progress: 75, goalStatus: 'ON_TRACK' }), false)
  assert.equal(isObjectiveComplete({ progress: 100, goalStatus: 'ON_TRACK' }), true)
  assert.equal(isObjectiveComplete({ progress: 20, goalStatus: 'CLOSED' }), true)
  assert.equal(completionRate([{ progress: 80 }, { progress: 100 }, { progress: 10, goalStatus: 'CLOSED' }, { progress: 0 }]), 50)
  assert.equal(completionRate([]), 0)
})

test('health counts come from goalStatus, not progress', () => {
  const counts = countByGoalStatus([
    { goalStatus: 'ON_TRACK' }, { goalStatus: 'ON_TRACK' }, { goalStatus: 'AT_RISK' },
    { goalStatus: 'OFF_TRACK' }, { goalStatus: 'CLOSED' }, { goalStatus: null },
  ])
  assert.deepEqual(counts, { onTrack: 2, atRisk: 1, offTrack: 1, closed: 1 })
})
