import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { serializeScrumUpdate } from './scrum-serializer'

const baseUpdate = {
  id: 'update-1',
  userId: 'employee-1',
  managerId: 'manager-1',
  todayPlan: 'Ship the API route',
  mood: 'GOOD',
}

describe('serializeScrumUpdate', () => {
  it('keeps mood for the subject user', async () => {
    const serialized = await serializeScrumUpdate(baseUpdate, { id: 'employee-1' })
    assert.equal(serialized.mood, 'GOOD')
  })

  it('keeps mood for the direct manager', async () => {
    const serialized = await serializeScrumUpdate(baseUpdate, { id: 'manager-1' })
    assert.equal(serialized.mood, 'GOOD')
  })

  it('deletes the mood key for peers and executives', async () => {
    const serialized = await serializeScrumUpdate(baseUpdate, { id: 'peer-1', role: 'EXECUTIVE' })
    assert.equal(Object.prototype.hasOwnProperty.call(serialized, 'mood'), false)
  })

  it('can resolve the active direct manager when update.managerId is absent', async () => {
    const serialized = await serializeScrumUpdate(
      { ...baseUpdate, managerId: null },
      { id: 'resolved-manager' },
      { managerIdResolver: async () => 'resolved-manager' },
    )
    assert.equal(serialized.mood, 'GOOD')
  })
})
