import test from 'node:test'
import assert from 'node:assert/strict'
import { computeKpiRag, isPeriodScored, kpiRagTone, normalizeThresholdAmber, resolveReadingRag } from './rag'

test('INCREASE: green at/above target, amber within the band, red below', () => {
  const spec = { direction: 'INCREASE', targetValue: 100, thresholdAmber: 0.9 }
  assert.equal(computeKpiRag(spec, 120), 'GREEN')
  assert.equal(computeKpiRag(spec, 100), 'GREEN')
  assert.equal(computeKpiRag(spec, 95), 'AMBER')
  assert.equal(computeKpiRag(spec, 90), 'AMBER')
  assert.equal(computeKpiRag(spec, 89.99), 'RED')
  // Float noise at the boundary: 30% target, 0.9 amber → 27 is amber.
  assert.equal(computeKpiRag({ direction: 'INCREASE', targetValue: 0.3, thresholdAmber: 0.9 }, 0.27), 'AMBER')
})

test('DECREASE: green at/below target, amber within the band above, red beyond', () => {
  const spec = { direction: 'DECREASE', targetValue: 5, thresholdAmber: 0.9 }
  assert.equal(computeKpiRag(spec, 3), 'GREEN')
  assert.equal(computeKpiRag(spec, 5), 'GREEN')
  assert.equal(computeKpiRag(spec, 5.5), 'AMBER')
  assert.equal(computeKpiRag(spec, 5.51), 'RED')
  // Zero target: no amber band.
  assert.equal(computeKpiRag({ direction: 'DECREASE', targetValue: 0 }, 0), 'GREEN')
  assert.equal(computeKpiRag({ direction: 'DECREASE', targetValue: 0 }, 1), 'RED')
})

test('RANGE: green inside, amber just outside either bound, red beyond', () => {
  const spec = { direction: 'RANGE', targetMin: 40, targetMax: 60, thresholdAmber: 0.9 }
  assert.equal(computeKpiRag(spec, 50), 'GREEN')
  assert.equal(computeKpiRag(spec, 40), 'GREEN')
  assert.equal(computeKpiRag(spec, 60), 'GREEN')
  assert.equal(computeKpiRag(spec, 37), 'AMBER') // ≥ 36
  assert.equal(computeKpiRag(spec, 65), 'AMBER') // ≤ 66
  assert.equal(computeKpiRag(spec, 35), 'RED')
  assert.equal(computeKpiRag(spec, 67), 'RED')
  // Open-ended range.
  assert.equal(computeKpiRag({ direction: 'RANGE', targetMin: 10 }, 1000), 'GREEN')
  assert.equal(computeKpiRag({ direction: 'RANGE', targetMax: 10 }, -5), 'GREEN')
  // No bounds: fall back to targetValue as a floor.
  assert.equal(computeKpiRag({ direction: 'RANGE', targetValue: 10 }, 9.5), 'AMBER')
  assert.equal(computeKpiRag({ direction: 'RANGE' }, 9.5), null)
})

test('no value or no numeric target → not computable (manual RAG for text KPIs)', () => {
  assert.equal(computeKpiRag({ direction: 'INCREASE', targetValue: 10 }, null), null)
  assert.equal(computeKpiRag({ direction: 'INCREASE', targetValue: null }, 5), null)
  assert.equal(computeKpiRag({ direction: 'DECREASE' }, 5), null)
})

test('thresholdAmber defaults to 0.9 and accepts percentages', () => {
  assert.equal(normalizeThresholdAmber(null), 0.9)
  assert.equal(normalizeThresholdAmber(80), 0.8)
  assert.equal(normalizeThresholdAmber(0.75), 0.75)
  assert.equal(normalizeThresholdAmber(-1), 0.9)
  assert.equal(normalizeThresholdAmber(500), 0.9)
  assert.equal(computeKpiRag({ direction: 'INCREASE', targetValue: 100, thresholdAmber: 80 }, 85), 'AMBER')
})

test('KPI-2: periods ending before scoredFrom are not scored', () => {
  const scoredFrom = new Date('2027-01-01T00:00:00.000Z')
  assert.equal(isPeriodScored(scoredFrom, '2026-12-31'), false)
  assert.equal(isPeriodScored(scoredFrom, new Date('2026-12-31T23:59:59.999Z')), false)
  assert.equal(isPeriodScored(scoredFrom, '2027-01-03'), true) // week containing 1 Jan
  assert.equal(isPeriodScored(null, '2020-01-01'), true)
})

test('resolveReadingRag: not scored wins, manual RAG overrides, else computed', () => {
  const spec = { direction: 'INCREASE', targetValue: 100 }
  assert.deepEqual(resolveReadingRag({ spec, value: 50, scored: false, manualRag: 'GREEN' }), {
    rag: null,
    computedRag: null,
    overridden: false,
  })
  assert.deepEqual(resolveReadingRag({ spec, value: 50, scored: true }), { rag: 'RED', computedRag: 'RED', overridden: false })
  assert.deepEqual(resolveReadingRag({ spec, value: 50, scored: true, manualRag: 'AMBER' }), {
    rag: 'AMBER',
    computedRag: 'RED',
    overridden: true,
  })
  // Compound KPI: text value, manual RAG only (KPI-6).
  assert.deepEqual(resolveReadingRag({ spec: { direction: 'INCREASE' }, value: null, scored: true, manualRag: 'GREEN' }), {
    rag: 'GREEN',
    computedRag: null,
    overridden: true,
  })
  // Garbage manual value is ignored.
  assert.equal(resolveReadingRag({ spec, value: 120, scored: true, manualRag: 'BLUE' }).rag, 'GREEN')
  assert.equal(kpiRagTone('AMBER'), 'warn')
  assert.equal(kpiRagTone(null), 'neutral')
})
