import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SPRINT_REALTIME_EVENTS,
  isOwnRealtimeEvent,
  parseSprintRealtimeChannel,
  sprintRealtimeChannel,
} from './realtime'

test('sprint channel is private and round-trips', () => {
  const ch = sprintRealtimeChannel('clx123abc')
  assert.equal(ch, 'private-sprint-clx123abc')
  assert.equal(parseSprintRealtimeChannel(ch), 'clx123abc')
})

test('non-sprint and malformed channels do not parse', () => {
  assert.equal(parseSprintRealtimeChannel('sprint-abc'), null)            // legacy public name
  assert.equal(parseSprintRealtimeChannel('private-user-abc'), null)
  assert.equal(parseSprintRealtimeChannel('private-sprint-'), null)
  assert.equal(parseSprintRealtimeChannel('private-sprint-a b'), null)
  assert.equal(parseSprintRealtimeChannel('private-sprint-a;b'), null)
  assert.equal(parseSprintRealtimeChannel(`private-sprint-${'x'.repeat(65)}`), null)
  assert.equal(parseSprintRealtimeChannel(undefined as unknown as string), null)
})

test('event list matches what the server broadcasts', () => {
  assert.deepEqual([...SPRINT_REALTIME_EVENTS].sort(), [
    'goal:updated', 'participants:changed', 'task:created', 'task:moved', 'task:updated',
  ])
})

test('own events are ignored only when an actor id matches', () => {
  assert.equal(isOwnRealtimeEvent({ actorId: 'me' }, 'me'), true)
  assert.equal(isOwnRealtimeEvent({ actorId: 'other' }, 'me'), false)
  assert.equal(isOwnRealtimeEvent({}, 'me'), false)
  assert.equal(isOwnRealtimeEvent({ actorId: 'me' }, null), false)
  assert.equal(isOwnRealtimeEvent(null, 'me'), false)
  assert.equal(isOwnRealtimeEvent('me', 'me'), false)
})
