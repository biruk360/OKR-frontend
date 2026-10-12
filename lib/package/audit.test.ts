import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPackageActivityMetadata, diffPackageFields } from './audit'

test('diffPackageFields: only listed fields, dates normalised, null when unchanged', () => {
  const before = { title: 'A', cadence: 'WEEKLY', endsOn: new Date('2026-12-31T00:00:00Z'), ignored: 1 }
  const after = { title: 'A', cadence: 'QUARTERLY', endsOn: new Date('2026-12-31T00:00:00Z'), ignored: 2 }
  assert.deepEqual(diffPackageFields(before, after, ['title', 'cadence', 'endsOn']), {
    cadence: { from: 'WEEKLY', to: 'QUARTERLY' },
  })
  assert.equal(diffPackageFields(before, { ...before }, ['title', 'cadence', 'endsOn']), null)
  assert.deepEqual(diffPackageFields({ note: undefined }, { note: 'x' }, ['note']), { note: { from: null, to: 'x' } })
  assert.equal(diffPackageFields(null, after, ['title']), null)
})

test('buildPackageActivityMetadata: entity + subject ids, PKG-3 flag, OKR ids kept in metadata', () => {
  assert.deepEqual(
    buildPackageActivityMetadata({
      entityType: 'KPI_READING',
      action: 'READING_ENTERED',
      entityId: 'r1',
      subjectUserId: 'u1',
      timeframeId: 'tf',
      packageId: 'p1',
      keyResultId: 'kr1',
      editedAfterApproval: true,
      metadata: { kpiId: 'k1' },
    }),
    { kpiId: 'k1', entityId: 'r1', userId: 'u1', timeframeId: 'tf', packageId: 'p1', keyResultId: 'kr1', editedAfterApproval: true },
  )
  assert.deepEqual(buildPackageActivityMetadata({ entityType: 'DECISION', action: 'DECIDED', entityId: 'd1' }), { entityId: 'd1' })
})
