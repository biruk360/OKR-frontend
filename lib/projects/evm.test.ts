/**
 * Unit tests for EVM (SPI/CPI/EAC). Run: `npm run test:projects`
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeEvm } from './evm'

test('computeEvm: on-budget, behind schedule', () => {
  // BAC 1000, 60% done, 75% planned, AC 600.
  // EV = 600, PV = 750, AC = 600 → SPI 0.8, CPI 1.0, EAC 1000.
  const r = computeEvm({ budgetAtCompletion: 1000, percentComplete: 60, percentPlanned: 75, actualCost: 600 })
  assert.equal(r.earnedValue, 600)
  assert.equal(r.plannedValue, 750)
  assert.equal(r.spi, 0.8)
  assert.equal(r.cpi, 1.0)
  assert.equal(r.eac, 1000)
})

test('computeEvm: over budget → CPI < 1, EAC > BAC', () => {
  // BAC 1000, 50% done, AC 800 → EV 500, CPI 0.63, EAC ≈ 1587.
  const r = computeEvm({ budgetAtCompletion: 1000, percentComplete: 50, percentPlanned: 50, actualCost: 800 })
  assert.equal(r.spi, 1.0)
  assert.equal(r.cpi, 0.63)
  assert.ok(r.eac !== null && r.eac > 1000)
})

test('computeEvm: no budget → all nulls (graceful)', () => {
  const r = computeEvm({ budgetAtCompletion: null, percentComplete: 50, percentPlanned: 50, actualCost: 100 })
  assert.equal(r.spi, null)
  assert.equal(r.cpi, null)
  assert.equal(r.eac, null)
})

test('computeEvm: no actual cost → CPI/EAC null but SPI present', () => {
  const r = computeEvm({ budgetAtCompletion: 1000, percentComplete: 60, percentPlanned: 75, actualCost: null })
  assert.equal(r.spi, 0.8)
  assert.equal(r.cpi, null)
  assert.equal(r.eac, null)
})
