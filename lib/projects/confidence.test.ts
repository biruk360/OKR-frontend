/**
 * Unit tests for project confidence + RAG. Run: `npm run test:projects`
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeProjectConfidence, deriveRag } from './confidence'

test('computeProjectConfidence: build spec worked example ≈ 57.5', () => {
  // 60% complete vs 75% planned (behind 15 → 22.5), 20 slip (10), 2 high risks (10).
  const { confidence } = computeProjectConfidence({
    percentComplete: 60,
    percentPlanned: 75,
    totalSlipDays: 20,
    openHighRisks: 2,
    blockedActivities: 0,
    pendingApprovalDays: 0,
    daysSinceLastUpdate: 0,
  })
  assert.equal(confidence, 57.5)
})

test('computeProjectConfidence: slip penalty capped at 30', () => {
  const { penalties } = computeProjectConfidence({
    percentComplete: 100,
    percentPlanned: 100,
    totalSlipDays: 1000,
    openHighRisks: 0,
    blockedActivities: 0,
    pendingApprovalDays: 0,
    daysSinceLastUpdate: 0,
  })
  assert.equal(penalties.slip, 30)
})

test('computeProjectConfidence: approval penalty capped at 20; staleness threshold', () => {
  const { penalties } = computeProjectConfidence({
    percentComplete: 100,
    percentPlanned: 100,
    totalSlipDays: 0,
    openHighRisks: 0,
    blockedActivities: 0,
    pendingApprovalDays: 1000,
    daysSinceLastUpdate: 8,
  })
  assert.equal(penalties.approval, 20)
  assert.equal(penalties.staleness, 10)
})

test('computeProjectConfidence: ahead of schedule adds no penalty; clamps to 100', () => {
  const { confidence } = computeProjectConfidence({
    percentComplete: 90,
    percentPlanned: 50,
    totalSlipDays: 0,
    openHighRisks: 0,
    blockedActivities: 0,
    pendingApprovalDays: 0,
    daysSinceLastUpdate: 0,
  })
  assert.equal(confidence, 100)
})

test('deriveRag: AMBER for 57.5 confidence with healthy spi', () => {
  assert.equal(deriveRag(57.5, 0.96), 'AMBER')
})

test('deriveRag: RED when confidence < 50', () => {
  assert.equal(deriveRag(40, 1.0), 'RED')
})

test('deriveRag: RED when spi < 0.85 even if confidence high', () => {
  assert.equal(deriveRag(90, 0.8), 'RED')
})

test('deriveRag: GREEN when confidence ≥ 75 and spi ≥ 0.95', () => {
  assert.equal(deriveRag(80, 0.97), 'GREEN')
})

test('deriveRag: GREEN when confidence ≥ 75 and spi unknown', () => {
  assert.equal(deriveRag(80, null), 'GREEN')
})
