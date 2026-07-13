/**
 * Unit tests for rollup math. Run: `npm run test:projects`
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  weightedAverage,
  weightsMismatch,
  computeSlipDays,
  phasePlannedPercent,
  projectPlannedPercent,
  clamp01,
} from './rollup'

test('weightedAverage: build spec example — weights 2/1 at 100%/0% = 66.7%', () => {
  assert.equal(
    weightedAverage([
      { weight: 2, percentComplete: 100 },
      { weight: 1, percentComplete: 0 },
    ]),
    66.7
  )
})

test('weightedAverage: all-zero weights falls back to simple mean', () => {
  assert.equal(
    weightedAverage([
      { weight: 0, percentComplete: 100 },
      { weight: 0, percentComplete: 0 },
    ]),
    50
  )
})

test('weightedAverage: empty = 0', () => {
  assert.equal(weightedAverage([]), 0)
})

test('weightsMismatch: sums to 100 → false', () => {
  assert.equal(weightsMismatch([20, 20, 20, 20, 20]), false)
})

test('weightsMismatch: sums to 90 → true', () => {
  assert.equal(weightsMismatch([20, 20, 20, 30]), true)
})

test('computeSlipDays: 14-day slip', () => {
  assert.equal(
    computeSlipDays(new Date('2026-08-15T00:00:00Z'), new Date('2026-08-29T00:00:00Z')),
    14
  )
})

test('computeSlipDays: ahead of baseline → 0 (never negative)', () => {
  assert.equal(
    computeSlipDays(new Date('2026-08-15T00:00:00Z'), new Date('2026-08-10T00:00:00Z')),
    0
  )
})

test('computeSlipDays: not baselined → 0', () => {
  assert.equal(computeSlipDays(null, new Date('2026-08-29T00:00:00Z')), 0)
})

test('phasePlannedPercent: midpoint of baseline window = 50%', () => {
  const start = new Date('2026-01-01T00:00:00Z')
  const end = new Date('2026-01-11T00:00:00Z')
  const mid = new Date('2026-01-06T00:00:00Z')
  assert.equal(phasePlannedPercent(start, end, mid), 50)
})

test('phasePlannedPercent: before start = 0, after end = 100', () => {
  const start = new Date('2026-01-01T00:00:00Z')
  const end = new Date('2026-01-11T00:00:00Z')
  assert.equal(phasePlannedPercent(start, end, new Date('2025-12-01T00:00:00Z')), 0)
  assert.equal(phasePlannedPercent(start, end, new Date('2026-02-01T00:00:00Z')), 100)
})

test('projectPlannedPercent: weighted across phases', () => {
  const today = new Date('2026-01-06T00:00:00Z')
  const phases = [
    { weight: 1, baselineStart: new Date('2026-01-01T00:00:00Z'), baselineEnd: new Date('2026-01-11T00:00:00Z') }, // 50%
    { weight: 1, baselineStart: new Date('2025-12-01T00:00:00Z'), baselineEnd: new Date('2025-12-31T00:00:00Z') }, // 100%
  ]
  assert.equal(projectPlannedPercent(phases, today), 75)
})

test('clamp01', () => {
  assert.equal(clamp01(-1), 0)
  assert.equal(clamp01(2), 1)
  assert.equal(clamp01(0.5), 0.5)
})
