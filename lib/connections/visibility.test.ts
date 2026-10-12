import test from 'node:test'
import assert from 'node:assert/strict'
import { decisionVisible, kpiArea, projectReadable } from './visibility'

test('kpiArea follows isSensitive', () => {
  assert.equal(kpiArea({ isSensitive: true }), 'kpis_sensitive')
  assert.equal(kpiArea({ isSensitive: false }), 'kpis')
})

test('projectReadable mirrors getReadableProject', () => {
  const v = { userId: 'v', seesAll: false, departmentIds: new Set(['d1']) }
  const project = { projectManagerId: 'pm', departmentId: 'd2', memberIds: ['m1'] }
  assert.equal(projectReadable(v, project), false)
  assert.equal(projectReadable({ ...v, seesAll: true }, project), true)
  assert.equal(projectReadable({ ...v, userId: 'pm' }, project), true)
  assert.equal(projectReadable({ ...v, userId: 'm1' }, project), true)
  assert.equal(projectReadable(v, { ...project, departmentId: 'd1' }), true)
})

test('decisionVisible: parties or all-seeing roles only (never via the linked item)', () => {
  const d = { deciderId: 'ceo', requestedById: 'req', linkedUserIds: ['linked'] }
  assert.equal(decisionVisible({ userId: 'x', seesAll: false }, d), false)
  assert.equal(decisionVisible({ userId: 'x', seesAll: true }, d), true)
  for (const id of ['ceo', 'req', 'linked']) {
    assert.equal(decisionVisible({ userId: id, seesAll: false }, d), true, id)
  }
})
