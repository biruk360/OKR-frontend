import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  OKR_REALTIME_EVENTS,
  OKR_REALTIME_EVENT_NAMES,
  buildOkrRealtimePayload,
  canSubscribeToOkrChannel,
  keyResultEventChannels,
  keyResultRealtimeChannel,
  objectiveRealtimeChannel,
  parseOkrRealtimeChannel,
} from './realtime'
import {
  canViewKeyResultInMemory,
  canViewObjectiveInMemory,
  makeViewerContext,
} from './visibility-scope'
import { parseSprintRealtimeChannel } from '../sprints/realtime'

test('channel names round-trip through the parser', () => {
  assert.equal(objectiveRealtimeChannel('obj1'), 'private-objective-obj1')
  assert.equal(keyResultRealtimeChannel('kr1'), 'private-keyresult-kr1')
  assert.deepEqual(parseOkrRealtimeChannel('private-objective-obj1'), { entity: 'objective', id: 'obj1' })
  assert.deepEqual(parseOkrRealtimeChannel('private-keyresult-kr_1-x'), { entity: 'keyResult', id: 'kr_1-x' })
})

test('parser rejects non-OKR, public, empty and malformed channel names', () => {
  for (const bad of [
    'objective-obj1', // public
    'private-objective-',
    'private-keyresult-',
    'private-objective-a/b',
    'private-objective-a b',
    `private-objective-${'x'.repeat(65)}`,
    'private-user-u1',
    'private-sprint-s1',
    'presence-objective-obj1',
    '',
    null,
    undefined,
    42,
  ]) {
    assert.equal(parseOkrRealtimeChannel(bad), null, String(bad))
  }
})

test('OKR and sprint channel families do not overlap', () => {
  assert.equal(parseSprintRealtimeChannel('private-objective-obj1'), null)
  assert.equal(parseSprintRealtimeChannel('private-keyresult-kr1'), null)
  assert.equal(parseOkrRealtimeChannel('private-sprint-s1'), null)
})

test('auth decision: only an unredacted view may subscribe', () => {
  assert.equal(canSubscribeToOkrChannel({ canView: true, isRedacted: false }), true)
  assert.equal(canSubscribeToOkrChannel({ canView: true, isRedacted: true }), false)
  assert.equal(canSubscribeToOkrChannel({ canView: false, isRedacted: false }), false)
  // Missing or DELETED entity reads the same as forbidden.
  assert.equal(canSubscribeToOkrChannel(null), false)
  // Client-portal sessions never get OKR channels.
  assert.equal(canSubscribeToOkrChannel({ canView: true, isRedacted: false }, { userType: 'CLIENT_PORTAL' }), false)
  assert.equal(canSubscribeToOkrChannel({ canView: true, isRedacted: false }, { userType: 'STAFF' }), true)
})

test('auth decision composed with the visibility rules (private objective)', () => {
  const privateObj = { ownerId: 'owner', isPrivate: true, level: 'INDIVIDUAL' }
  const publicObj = { ownerId: 'owner', isPrivate: false, level: 'INDIVIDUAL' }
  const stranger = makeViewerContext({ id: 'x', role: 'EMPLOYEE' })
  const owner = makeViewerContext({ id: 'owner', role: 'EMPLOYEE' })
  const manager = makeViewerContext({ id: 'm', role: 'DEPARTMENT_LEAD' }, { directReportIds: ['owner'] })
  const admin = makeViewerContext({ id: 'a', role: 'ADMIN' })

  assert.equal(canSubscribeToOkrChannel(canViewObjectiveInMemory(stranger, privateObj)), false)
  assert.equal(canSubscribeToOkrChannel(canViewObjectiveInMemory(owner, privateObj)), true)
  assert.equal(canSubscribeToOkrChannel(canViewObjectiveInMemory(manager, privateObj)), true)
  assert.equal(canSubscribeToOkrChannel(canViewObjectiveInMemory(admin, privateObj)), true)
  assert.equal(canSubscribeToOkrChannel(canViewObjectiveInMemory(stranger, publicObj)), true)

  // Key result: a private KR on a public objective is refused to a stranger;
  // a public KR under a private objective is refused too (redacted by parent).
  const privateKr = { ownerId: 'krOwner', isPrivate: true }
  const publicKr = { ownerId: 'krOwner', isPrivate: false }
  assert.equal(
    canSubscribeToOkrChannel(canViewKeyResultInMemory(stranger, privateKr, canViewObjectiveInMemory(stranger, publicObj))),
    false,
  )
  assert.equal(
    canSubscribeToOkrChannel(canViewKeyResultInMemory(stranger, publicKr, canViewObjectiveInMemory(stranger, privateObj))),
    false,
  )
  assert.equal(
    canSubscribeToOkrChannel(canViewKeyResultInMemory(stranger, publicKr, canViewObjectiveInMemory(stranger, publicObj))),
    true,
  )
})

const ALLOWED_PAYLOAD_KEYS = new Set(['entity', 'id', 'objectiveId', 'keyResultId', 'kind', 'actorId', 'at'])

test('payload carries only ids, kind, actorId and a timestamp — never text fields', () => {
  const payload = buildOkrRealtimePayload({
    entity: 'keyResult',
    id: 'kr1',
    objectiveId: 'obj1',
    keyResultId: 'kr1',
    kind: OKR_REALTIME_EVENTS.CHECK_IN_CREATED,
    actorId: 'u1',
    at: new Date('2026-09-25T00:00:00Z'),
    // Anything smuggled in beyond the declared input is dropped.
    ...({ title: 'Secret KR', description: 'hidden', currentValue: 42, body: 'comment text', note: 'x' } as object),
  })
  assert.deepEqual(payload, {
    entity: 'keyResult',
    id: 'kr1',
    objectiveId: 'obj1',
    keyResultId: 'kr1',
    kind: 'okr:check-in-created',
    actorId: 'u1',
    at: '2026-09-25T00:00:00.000Z',
  })
  for (const key of Object.keys(payload)) assert.ok(ALLOWED_PAYLOAD_KEYS.has(key), `unexpected key ${key}`)
  for (const value of Object.values(payload)) assert.equal(typeof value, 'string')
})

test('payload: objective event omits KR fields, missing actor becomes null', () => {
  const payload = buildOkrRealtimePayload({ entity: 'objective', id: 'obj1', kind: OKR_REALTIME_EVENTS.UPDATED })
  assert.deepEqual(Object.keys(payload).sort(), ['actorId', 'at', 'entity', 'id', 'kind'])
  assert.equal(payload.actorId, null)
})

test('key-result events fan out to the KR channel and the parent objective channel', () => {
  assert.deepEqual(keyResultEventChannels('kr1', 'obj1'), ['private-keyresult-kr1', 'private-objective-obj1'])
  assert.deepEqual(keyResultEventChannels('kr1', null), ['private-keyresult-kr1'])
})

test('event names are unique, namespaced and cover every required kind', () => {
  assert.equal(new Set(OKR_REALTIME_EVENT_NAMES).size, OKR_REALTIME_EVENT_NAMES.length)
  for (const name of OKR_REALTIME_EVENT_NAMES) assert.match(name, /^okr:[a-z-]+$/)
  for (const kind of ['UPDATED', 'CHECK_IN_CREATED', 'KR_PROGRESS_CHANGED', 'COMMENT_ADDED', 'CLOSED', 'REOPENED', 'ARCHIVED', 'DELETED'] as const) {
    assert.ok(OKR_REALTIME_EVENT_NAMES.includes(OKR_REALTIME_EVENTS[kind]))
  }
})
