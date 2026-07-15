import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clientHealthScore, clientHealthTone, clientObligationWhere, computeComplianceRate } from './client-obligations'

test('computeComplianceRate: within SLA approvals over total approvals', () => {
  assert.equal(computeComplianceRate(0, 0), null)
  assert.equal(computeComplianceRate(10, 0), 100)
  assert.equal(computeComplianceRate(10, 4), 60)
  assert.equal(computeComplianceRate(5, 9), 0)
})

test('clientHealthScore: averages known compliance rates and defaults to 100', () => {
  assert.equal(clientHealthScore([]), 100)
  assert.equal(clientHealthScore([null, undefined]), 100)
  assert.equal(clientHealthScore([100, 50, null]), 75)
})

test('clientHealthTone: <60 is RED, 60-79 AMBER, 80+ GREEN', () => {
  assert.equal(clientHealthTone(59), 'RED')
  assert.equal(clientHealthTone(60), 'AMBER')
  assert.equal(clientHealthTone(79), 'AMBER')
  assert.equal(clientHealthTone(80), 'GREEN')
})

test('clientObligationWhere: report query filters contractual obligations', () => {
  assert.deepEqual(clientObligationWhere('p1'), { projectId: 'p1' })
  assert.deepEqual(clientObligationWhere('p1', { report: true }), {
    projectId: 'p1',
    isContractual: true,
  })
})
