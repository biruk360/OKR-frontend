import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SCRUM_METRIC_RESPONSE_KEYS, resolveScrumMetricValue, serializeScrumMetricActuals } from './scrum-metrics'

describe('scrum performance metrics privacy', () => {
  it('serializes only the four public Scrum metric fields', () => {
    const serialized = serializeScrumMetricActuals({
      submissionRate: 80,
      punctualityRate: 75,
      winCount: 3,
      blockerResolutionDays: 1.5,
      mood: 'STRUGGLING',
      SC16: 42,
    } as any)

    assert.deepEqual(Object.keys(serialized).sort(), [...SCRUM_METRIC_RESPONSE_KEYS].sort())
    assert.equal(Object.prototype.hasOwnProperty.call(serialized, 'mood'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(serialized, 'SC16'), false)
  })

  it('resolves only supported Scrum metric source keys', () => {
    const metrics = { submissionRate: 90, punctualityRate: 70, winCount: 4, blockerResolutionDays: 2 }
    assert.equal(resolveScrumMetricValue(metrics, 'SCRUM_SUBMISSION_RATE'), 90)
    assert.equal(resolveScrumMetricValue(metrics, 'SCRUM_PUNCTUALITY_RATE'), 70)
    assert.equal(resolveScrumMetricValue(metrics, 'SCRUM_WIN_COUNT'), 4)
    assert.equal(resolveScrumMetricValue(metrics, 'SCRUM_BLOCKER_RESOLUTION_DAYS'), 2)
    assert.throws(() => resolveScrumMetricValue(metrics, 'SCRUM_INDIVIDUAL_OKR_FOCUS_RATE'), /Unsupported scrum metric key/)
  })
})
