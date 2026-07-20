import test from 'node:test'
import assert from 'node:assert/strict'
import {
  confidenceTierFromScore,
  firstConfidence,
  isTimeframeEnded,
  parseInitiateCloseInput,
  isWithinReopenWindow,
  validateReopenReason,
} from './period-close'

test('parseInitiateCloseInput validates grade divergence and abandoned reason', () => {
  assert.equal(parseInitiateCloseInput({ outcome: 'PARTIAL', finalGrade: 0.8 }, 60).ok, false)
  assert.equal(
    parseInitiateCloseInput({ outcome: 'PARTIAL', finalGrade: 0.8, gradeRationale: 'Verified external impact' }, 60).ok,
    true,
  )
  assert.equal(parseInitiateCloseInput({ outcome: 'ABANDONED' }, 20).ok, false)
  assert.equal(parseInitiateCloseInput({ outcome: 'ABANDONED', closureNote: 'Priority was intentionally withdrawn' }, 20).ok, true)
})

test('reopen validation enforces reason length and configurable window', () => {
  assert.equal(validateReopenReason('too short'), 'Reopen reason must be at least 20 characters')
  assert.equal(validateReopenReason('Correcting a verified data-entry mistake'), null)
  assert.equal(isWithinReopenWindow('2026-07-01', 14, new Date('2026-07-14T23:59:00Z')), true)
  assert.equal(isWithinReopenWindow('2026-07-01', 14, new Date('2026-07-16T00:00:00Z')), false)
})

test('parseInitiateCloseInput snaps grades to 0.05 increments', () => {
  const parsed = parseInitiateCloseInput({ outcome: 'ACHIEVED', finalGrade: 0.73 }, 73)
  assert.equal(parsed.ok, true)
  if (parsed.ok) assert.equal(parsed.data.finalGrade, 0.75)
})

test('period and confidence helpers are deterministic', () => {
  assert.equal(isTimeframeEnded('2026-06-30', new Date('2026-07-01T00:00:00Z')), true)
  assert.equal(confidenceTierFromScore(67), 'ON_TRACK')
  assert.equal(confidenceTierFromScore(50), 'AT_RISK')
  assert.equal(confidenceTierFromScore(10), 'OFF_TRACK')
  assert.equal(firstConfidence([
    { confidence: 'ON_TRACK', asOfDate: '2026-02-01' },
    { confidence: 'AT_RISK', asOfDate: '2026-01-01' },
  ]), 'AT_RISK')
})
