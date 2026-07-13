/**
 * Unit tests for the Invariant #1 baseline-field guard (Epic C1).
 * Run: `npm run test:projects`  (tsx + Node built-in test runner — no extra deps)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasBaselineFieldWrite, BASELINE_FIELD_NAMES, computeRebaselineDiff, datesEqual } from './baseline'

const d = (iso: string) => new Date(iso)

// --- computeRebaselineDiff (C2 diff preview) ---------------------------------

test('computeRebaselineDiff: unchanged schedule → empty diff', () => {
  const diff = computeRebaselineDiff([
    { id: 'a1', title: 'A', phaseName: 'P1', baselineStart: d('2026-08-03'), baselineEnd: d('2026-08-14'), currentStart: d('2026-08-03'), currentEnd: d('2026-08-14') },
    { id: 'a2', title: 'B', phaseName: 'P1', baselineStart: null, baselineEnd: null, currentStart: null, currentEnd: null },
  ])
  assert.deepEqual(diff, [])
})

test('computeRebaselineDiff: moved end date → one change with old→new ISO', () => {
  const diff = computeRebaselineDiff([
    { id: 'a1', title: 'Requirements Doc', phaseName: 'Discovery', baselineStart: d('2026-08-03'), baselineEnd: d('2026-08-14'), currentStart: d('2026-08-03'), currentEnd: d('2026-08-28') },
  ])
  assert.equal(diff.length, 1)
  assert.deepEqual(diff[0], {
    activityId: 'a1',
    title: 'Requirements Doc',
    phaseName: 'Discovery',
    oldStart: '2026-08-03T00:00:00.000Z',
    oldEnd: '2026-08-14T00:00:00.000Z',
    newStart: '2026-08-03T00:00:00.000Z',
    newEnd: '2026-08-28T00:00:00.000Z',
  })
})

test('computeRebaselineDiff: null→date counts as a change', () => {
  const diff = computeRebaselineDiff([
    { id: 'a1', title: 'A', phaseName: 'P1', baselineStart: null, baselineEnd: null, currentStart: d('2026-09-01'), currentEnd: d('2026-09-10') },
  ])
  assert.equal(diff.length, 1)
  assert.equal(diff[0].oldEnd, null)
  assert.equal(diff[0].newEnd, '2026-09-10T00:00:00.000Z')
})

test('datesEqual: null-safe comparison', () => {
  assert.equal(datesEqual(null, null), true)
  assert.equal(datesEqual(d('2026-01-01'), d('2026-01-01')), true)
  assert.equal(datesEqual(d('2026-01-01'), d('2026-01-02')), false)
  assert.equal(datesEqual(null, d('2026-01-01')), false)
  assert.equal(datesEqual(d('2026-01-01'), null), false)
})

test('hasBaselineFieldWrite: rejects every frozen baseline field', () => {
  for (const field of BASELINE_FIELD_NAMES) {
    assert.equal(hasBaselineFieldWrite({ [field]: '2026-08-15' }), true, `${field} must be rejected`)
    assert.equal(hasBaselineFieldWrite({ [field]: null }), true, `${field}: null must also be rejected`)
  }
})

test('hasBaselineFieldWrite: allows normal schedule edits', () => {
  assert.equal(hasBaselineFieldWrite({ title: 'New title' }), false)
  assert.equal(hasBaselineFieldWrite({ currentStart: '2026-08-15', currentEnd: '2026-09-01', slipReason: 'X', slipOwner: 'CLIENT' }), false)
  assert.equal(hasBaselineFieldWrite({}), false)
})

test('hasBaselineFieldWrite: non-object payloads are safe (no write attempted)', () => {
  assert.equal(hasBaselineFieldWrite(null), false)
  assert.equal(hasBaselineFieldWrite(undefined), false)
  assert.equal(hasBaselineFieldWrite('baselineStart'), false)
  assert.equal(hasBaselineFieldWrite(42), false)
  assert.equal(hasBaselineFieldWrite(['baselineStart']), false) // arrays are not flat payloads
})

test('hasBaselineFieldWrite: mixed payload with a baseline key is rejected', () => {
  assert.equal(hasBaselineFieldWrite({ title: 'ok', baselineEnd: '2026-01-01' }), true)
})

test('hasBaselineFieldWrite: nested baseline keys are not top-level writes', () => {
  // Schedule payloads are flat; a nested key is some other structure, not a column write.
  assert.equal(hasBaselineFieldWrite({ nested: { baselineStart: '2026-01-01' } }), false)
})
