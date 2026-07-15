import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseChecklistText, stageGateWhere, validateGateTransition } from './stage-gates'

test('parseChecklistText: accepts newline, comma, and array input', () => {
  assert.deepEqual(parseChecklistText('Entry 1\nEntry 2, Entry 3'), ['Entry 1', 'Entry 2', 'Entry 3'])
  assert.deepEqual(parseChecklistText([' A ', '', 'B']), ['A', 'B'])
})

test('validateGateTransition: WAIVED requires waiverReason', () => {
  assert.deepEqual(validateGateTransition({ status: 'WAIVED', exitCriteria: ['Done'] }), {
    ok: false,
    error: 'A waiver reason is required',
  })
  assert.deepEqual(validateGateTransition({ status: 'WAIVED', exitCriteria: ['Done'], waiverReason: 'Client accepted risk' }), { ok: true })
})

test('validateGateTransition: PASSED requires exit criteria', () => {
  assert.deepEqual(validateGateTransition({ status: 'PASSED', exitCriteria: [] }), {
    ok: false,
    error: 'At least one exit criterion is required before passing a gate',
  })
  assert.deepEqual(validateGateTransition({ status: 'PASSED', exitCriteria: ['UAT signed'] }), { ok: true })
})

test('stageGateWhere: report query includes reportable gate statuses', () => {
  assert.deepEqual(stageGateWhere('p1'), { projectId: 'p1' })
  assert.deepEqual(stageGateWhere('p1', { report: true }), {
    projectId: 'p1',
    status: { in: ['PENDING', 'PASSED', 'FAILED', 'WAIVED'] },
  })
})
