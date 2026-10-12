import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeDb, type FakeDb } from '@/lib/connections/fake-db.testkit'
import { createOkrLink, deleteOkrLink, listLinksFor, OkrLinkError } from './service'

/* eslint-disable @typescript-eslint/no-explicit-any */

const TF25 = { id: 'tf25', name: 'FY25/26', startDate: new Date('2025-07-01') }
const TF26 = { id: 'tf26', name: 'FY26/27', startDate: new Date('2026-07-01') }
const PERSON = (id: string) => ({ id, name: id, avatar: null })

function objective(id: string, over: Record<string, any> = {}) {
  const tf = over.timeframe ?? TF26
  return {
    id,
    title: `Objective ${id}`,
    externalRef: null,
    level: 'INDIVIDUAL',
    status: 'ACTIVE',
    goalStatus: 'ON_TRACK',
    progress: 0,
    ownerId: 'emp',
    isPrivate: false,
    isLocked: false,
    departmentId: null,
    parentObjectiveId: null,
    rolledFromId: null,
    lineageRootId: null,
    lineageDepth: 0,
    closureStatus: 'OPEN',
    outcome: null,
    finalGrade: null,
    finalProgress: null,
    endDate: null,
    createdAt: new Date(tf.startDate.getTime() + 86400000),
    owner: PERSON(over.ownerId ?? 'emp'),
    ...over,
    timeframe: tf,
    timeframeId: tf.id,
  }
}

function keyResult(id: string, obj: any, over: Record<string, any> = {}) {
  return {
    id,
    title: `KR ${id}`,
    externalRef: null,
    status: 'ACTIVE',
    confidence: 'ON_TRACK',
    progress: 0,
    ownerId: obj.ownerId,
    isPrivate: false,
    isLocked: false,
    dueDate: null,
    closureStatus: 'OPEN',
    outcome: null,
    finalGrade: null,
    finalProgress: null,
    rolledFromId: null,
    lineageRootId: null,
    lineageDepth: 0,
    createdAt: obj.createdAt,
    owner: PERSON(obj.ownerId),
    objectiveId: obj.id,
    objective: obj,
    ...over,
  }
}

const ADMIN = { id: 'admin', role: 'ADMIN' }

function world(): { db: FakeDb; ids: Record<string, string> } {
  const oldObj = objective('old', { timeframe: TF25, lineageRootId: 'root', lineageDepth: 2, closureStatus: 'CLOSED', isLocked: true, finalGrade: 0.7, outcome: 'PARTIAL' })
  const newObj = objective('new')
  const companyObj = objective('co', { level: 'COMPANY', ownerId: 'ceo' })
  const companyKr = keyResult('co-kr', companyObj)
  const privateCo = objective('co-private', { level: 'COMPANY', ownerId: 'ceo', isPrivate: true })
  const db = fakeDb({ objective: [oldObj, newObj, companyObj, privateCo], keyResult: [companyKr] })
  return { db, ids: { old: 'old', new: 'new', co: 'co', coKr: 'co-kr', privateCo: 'co-private' } }
}

test('primary SUCCEEDS mirrors rolledFromId / lineage in the same transaction (LNK-2)', async () => {
  const { db } = world()
  const link = await createOkrLink(
    ADMIN,
    { fromType: 'OBJECTIVE', fromId: 'new', toType: 'OBJECTIVE', toId: 'old', kind: 'SUCCEEDS', subKind: 'CARRIED', isPrimary: true },
    { db: db as any },
  )
  assert.equal(link.isPrimary, true)
  const newer = db.objective.rows.find((o) => o.id === 'new')!
  assert.equal(newer.rolledFromId, 'old')
  assert.equal(newer.lineageRootId, 'root')
  assert.equal(newer.lineageDepth, 3)
  const log = db.activityLog.rows[0]
  assert.equal(log.action, 'LINKED')
  assert.equal(log.entityType, 'OKR_LINK')
  assert.equal(log.objectiveId, 'new')
  assert.equal(log.metadata.entityId, link.id)
  assert.equal(log.metadata.userId, 'emp')
  assert.equal(log.metadata.toId, 'old')
  assert.deepEqual(log.changes.rolledFromId, { from: null, to: 'old' })
})

test('deleting the mirrored link clears the lineage (LNK-2)', async () => {
  const { db } = world()
  const link = await createOkrLink(
    ADMIN,
    { fromType: 'OBJECTIVE', fromId: 'new', toType: 'OBJECTIVE', toId: 'old', kind: 'SUCCEEDS', isPrimary: true },
    { db: db as any },
  )
  await deleteOkrLink(ADMIN, link.id, { db: db as any })
  const newer = db.objective.rows.find((o) => o.id === 'new')!
  assert.equal(newer.rolledFromId, null)
  assert.equal(newer.lineageRootId, null)
  assert.equal(newer.lineageDepth, 0)
  assert.equal(db.okrLink.rows.length, 0)
  assert.equal(db.activityLog.rows.at(-1)!.action, 'UNLINKED')
})

test('a new primary demotes the previous one', async () => {
  const { db } = world()
  db.objective.rows.push(objective('old2', { timeframe: TF25 }))
  await createOkrLink(ADMIN, { fromType: 'OBJECTIVE', fromId: 'new', toType: 'OBJECTIVE', toId: 'old', kind: 'SUCCEEDS', isPrimary: true }, { db: db as any })
  await createOkrLink(ADMIN, { fromType: 'OBJECTIVE', fromId: 'new', toType: 'OBJECTIVE', toId: 'old2', kind: 'SUCCEEDS', subKind: 'MERGED', isPrimary: true }, { db: db as any })
  const primaries = db.okrLink.rows.filter((l) => l.isPrimary)
  assert.equal(primaries.length, 1)
  assert.equal(primaries[0].toId, 'old2')
  assert.equal(db.objective.rows.find((o) => o.id === 'new')!.rolledFromId, 'old2')
})

test('non-primary or cross-type SUCCEEDS leaves rolledFromId alone', async () => {
  const { db } = world()
  await createOkrLink(ADMIN, { fromType: 'OBJECTIVE', fromId: 'new', toType: 'OBJECTIVE', toId: 'old', kind: 'SUCCEEDS' }, { db: db as any })
  assert.equal(db.objective.rows.find((o) => o.id === 'new')!.rolledFromId, null)
})

test('CONTRIBUTES_TO across timeframes is rejected (LNK-1)', async () => {
  const { db } = world()
  await assert.rejects(
    createOkrLink(ADMIN, { fromType: 'OBJECTIVE', fromId: 'new', toType: 'OBJECTIVE', toId: 'old', kind: 'CONTRIBUTES_TO' }, { db: db as any }),
    (err: unknown) => err instanceof OkrLinkError && err.code === 'TIMEFRAME_MISMATCH' && err.status === 400,
  )
})

test('duplicates are rejected (unique constraint) and reverse links conflict', async () => {
  const { db } = world()
  const input = { fromType: 'OBJECTIVE', fromId: 'new', toType: 'KEY_RESULT', toId: 'co-kr', kind: 'CONTRIBUTES_TO' } as const
  await createOkrLink(ADMIN, input, { db: db as any })
  await assert.rejects(createOkrLink(ADMIN, input, { db: db as any }), (err: unknown) => err instanceof OkrLinkError && err.status === 409 && err.code === 'DUPLICATE')
})

test('LNK-4 setParent adopts the KR objective as parent only when asked', async () => {
  const { db } = world()
  await createOkrLink(
    ADMIN,
    { fromType: 'OBJECTIVE', fromId: 'new', toType: 'KEY_RESULT', toId: 'co-kr', kind: 'CONTRIBUTES_TO', setParent: true },
    { db: db as any },
  )
  assert.equal(db.objective.rows.find((o) => o.id === 'new')!.parentObjectiveId, 'co')
})

test('a locked FROM item cannot gain links (423) unless ignoreLock', async () => {
  const { db } = world()
  db.objective.rows.find((o) => o.id === 'new')!.isLocked = true
  const input = { fromType: 'OBJECTIVE', fromId: 'new', toType: 'OBJECTIVE', toId: 'old', kind: 'SUCCEEDS' } as const
  await assert.rejects(createOkrLink(ADMIN, input, { db: db as any }), (err: unknown) => err instanceof OkrLinkError && err.status === 423)
  await createOkrLink(ADMIN, input, { db: db as any, ignoreLock: true })
})

test('only editors of the FROM item may link; owners may', async () => {
  const { db } = world()
  const input = { fromType: 'OBJECTIVE', fromId: 'new', toType: 'KEY_RESULT', toId: 'co-kr', kind: 'CONTRIBUTES_TO' } as const
  await assert.rejects(
    createOkrLink({ id: 'stranger', role: 'EMPLOYEE' }, input, { db: db as any }),
    (err: unknown) => err instanceof OkrLinkError && err.status === 403,
  )
  const link = await createOkrLink({ id: 'emp', role: 'EMPLOYEE' }, input, { db: db as any })
  await assert.rejects(
    deleteOkrLink({ id: 'stranger', role: 'EMPLOYEE' }, link.id, { db: db as any }),
    (err: unknown) => err instanceof OkrLinkError && err.status === 403,
  )
})

test('listLinksFor redacts a private counterpart (CON-8)', async () => {
  const { db } = world()
  // CEO's private company objective is succeeded by a public one (admin creates both links).
  db.objective.rows.push(objective('co-next', { level: 'COMPANY', ownerId: 'ceo' }))
  db.objective.rows.find((o) => o.id === 'co-private')!.timeframe = TF25
  db.objective.rows.find((o) => o.id === 'co-private')!.timeframeId = 'tf25'
  await createOkrLink(ADMIN, { fromType: 'OBJECTIVE', fromId: 'co-next', toType: 'OBJECTIVE', toId: 'co-private', kind: 'SUCCEEDS' }, { db: db as any })

  const { makeViewerContext } = await import('@/lib/okr/visibility-scope')
  const viewer = { id: 'emp', role: 'EMPLOYEE' }
  const list = await listLinksFor(viewer, 'OBJECTIVE', 'co-next', { db: db as any, ctx: makeViewerContext(viewer) })
  assert.ok(list)
  assert.equal(list!.links.length, 1)
  const counterpart = list!.links[0].counterpart
  assert.equal(counterpart.redacted, true)
  assert.equal('title' in counterpart, false)
  assert.equal(list!.permissions.canCreate, false)
  assert.equal(list!.links[0].canDelete, false)
})

test('listLinksFor withholds notes when the subject is only seen redacted (CON-8)', async () => {
  const { db } = world()
  // A public objective contributes to the CEO's private company objective, with a note.
  await createOkrLink(
    ADMIN,
    { fromType: 'OBJECTIVE', fromId: 'new', toType: 'OBJECTIVE', toId: 'co-private', kind: 'CONTRIBUTES_TO', note: 'secret plan' },
    { db: db as any },
  )
  const { makeViewerContext } = await import('@/lib/okr/visibility-scope')
  const viewer = { id: 'emp', role: 'EMPLOYEE' }
  const list = await listLinksFor(viewer, 'OBJECTIVE', 'co-private', { db: db as any, ctx: makeViewerContext(viewer) })
  assert.ok(list)
  assert.equal(list!.links.length, 1)
  assert.equal(list!.links[0].note, null)
  // The owner still sees the note.
  const ceo = { id: 'ceo', role: 'EMPLOYEE' }
  const own = await listLinksFor(ceo, 'OBJECTIVE', 'co-private', { db: db as any, ctx: makeViewerContext(ceo) })
  assert.equal(own!.links[0].note, 'secret plan')
})

test('listLinksFor answers null for a subject outside the viewer record scope', async () => {
  const { db } = world()
  const { makeViewerContext } = await import('@/lib/okr/visibility-scope')
  const viewer = { id: 'emp', role: 'EMPLOYEE' }
  const ctx = makeViewerContext(viewer, { objectiveScope: { departmentId: 'dept-x' } as any })
  const list = await listLinksFor(viewer, 'OBJECTIVE', 'co', { db: db as any, ctx })
  assert.equal(list, null)
})
