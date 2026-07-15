import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeDaysOpen, computeRaidScore, isOverdueClientDependency, raidItemWhere, riskTone } from './raid'

test('computeRaidScore: probability × impact', () => {
  assert.equal(computeRaidScore(4, 5), 20)
  assert.equal(computeRaidScore(1, 5), 5)
  assert.equal(computeRaidScore(null, 5), null)
})

test('riskTone: score bands match H1 matrix', () => {
  assert.equal(riskTone(6), 'GREEN')
  assert.equal(riskTone(8), 'AMBER')
  assert.equal(riskTone(12), 'AMBER')
  assert.equal(riskTone(15), 'RED')
  assert.equal(riskTone(25), 'RED')
})

test('computeDaysOpen: auto-computes elapsed calendar days', () => {
  const createdAt = new Date('2026-07-01T12:00:00Z')
  const now = new Date('2026-07-16T08:00:00Z')
  assert.equal(computeDaysOpen(createdAt, null, now), 15)
})

test('isOverdueClientDependency: only open client dependencies past neededByDate flag red', () => {
  const now = new Date('2026-07-14T12:00:00Z')
  assert.equal(isOverdueClientDependency({ type: 'DEPENDENCY', dependsOnParty: 'CLIENT', neededByDate: '2026-07-10', status: 'OPEN' }, now), true)
  assert.equal(isOverdueClientDependency({ type: 'DEPENDENCY', dependsOnParty: '360GROUND', neededByDate: '2026-07-10', status: 'OPEN' }, now), false)
  assert.equal(isOverdueClientDependency({ type: 'DEPENDENCY', dependsOnParty: 'CLIENT', neededByDate: '2026-07-10', status: 'CLOSED' }, now), false)
  assert.equal(isOverdueClientDependency({ type: 'RISK', dependsOnParty: 'CLIENT', neededByDate: '2026-07-10', status: 'OPEN' }, now), false)
})

test('raidItemWhere: portal queries inject clientVisible at query level', () => {
  assert.deepEqual(raidItemWhere('p1'), { projectId: 'p1' })
  assert.deepEqual(raidItemWhere('p1', { type: 'RISK', portal: true }), {
    projectId: 'p1',
    type: 'RISK',
    clientVisible: true,
  })
})
