import test from 'node:test'
import assert from 'node:assert/strict'
import { capacityStatus, estimationBias, managementReportPeriod } from './management-reports'

test('managementReportPeriod: monthly returns first through last UTC day', () => {
  const period = managementReportPeriod('MONTHLY', new Date('2026-07-15T12:00:00.000Z'))
  assert.equal(period.start.toISOString(), '2026-07-01T00:00:00.000Z')
  assert.equal(period.end.toISOString(), '2026-07-31T23:59:59.999Z')
})

test('managementReportPeriod: quarterly returns quarter UTC window', () => {
  const period = managementReportPeriod('QUARTERLY', new Date('2026-07-15T12:00:00.000Z'))
  assert.equal(period.start.toISOString(), '2026-07-01T00:00:00.000Z')
  assert.equal(period.end.toISOString(), '2026-09-30T23:59:59.999Z')
})

test('estimationBias: classifies estimate accuracy bands', () => {
  assert.equal(estimationBias(1.15), 'UNDER')
  assert.equal(estimationBias(0.85), 'OVER')
  assert.equal(estimationBias(1), 'BALANCED')
})

test('capacityStatus: classifies allocation bands', () => {
  assert.equal(capacityStatus(101, 41), 'OVER_ALLOCATED')
  assert.equal(capacityStatus(0, 0), 'IDLE')
  assert.equal(capacityStatus(80, 32), 'HEALTHY')
})
