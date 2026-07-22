import assert from 'node:assert/strict'
import test from 'node:test'
import { hasTodoParticipantWriteAccess } from './access'

const todo = {
  assigneeId: 'assignee',
  creatorId: 'creator',
  memberIds: ['member-a', 'member-b'],
}

test('allows the todo assignee to write', () => {
  assert.equal(hasTodoParticipantWriteAccess('assignee', todo), true)
})

test('allows the todo creator to write', () => {
  assert.equal(hasTodoParticipantWriteAccess('creator', todo), true)
})

test('allows an explicit todo member to write', () => {
  assert.equal(hasTodoParticipantWriteAccess('member-b', todo), true)
})

test('denies an unrelated user', () => {
  assert.equal(hasTodoParticipantWriteAccess('other-user', todo), false)
})

test('supports unassigned todos with members', () => {
  assert.equal(
    hasTodoParticipantWriteAccess('member-a', { ...todo, assigneeId: null }),
    true,
  )
})
