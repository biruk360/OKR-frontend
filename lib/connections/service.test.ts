import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeDb } from './fake-db.testkit'
import { getConnections } from './service'
import { makeViewerContext } from '@/lib/okr/visibility-scope'
import type { ManagerEdge, PackageAccessLoaders } from '@/lib/package/access'

/* eslint-disable @typescript-eslint/no-explicit-any */

const TF25 = { id: 'tf25', name: 'FY25/26', startDate: new Date('2025-07-01') }
const TF26 = { id: 'tf26', name: 'FY26/27', startDate: new Date('2026-07-01') }
const PERSON = (id: string) => ({ id, name: id, avatar: null })
const NOW = new Date(2026, 9, 14, 12)

/** In-memory §8 org: `edges` are active manager relationships; nobody has HR features. */
function orgLoaders(edges: ManagerEdge[] = []): PackageAccessLoaders {
  return {
    async userRole() { return 'EMPLOYEE' },
    async feature() { return false },
    async reportsOf(ids) { return edges.filter((e) => ids.includes(e.managerId)) },
    async managersOf(ids) { return edges.filter((e) => ids.includes(e.directReportId)) },
    async memberships() { return [] },
    async childDepartments() { return [] },
  }
}

function objective(id: string, over: Record<string, any> = {}) {
  const tf = over.timeframe ?? TF26
  const ownerId = over.ownerId ?? 'emp'
  return {
    id,
    title: `Objective ${id}`,
    externalRef: null,
    level: 'INDIVIDUAL',
    status: 'ACTIVE',
    goalStatus: 'ON_TRACK',
    progress: 40,
    ownerId,
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
    owner: PERSON(ownerId),
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
    progress: 10,
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

function link(id: string, from: [string, string], to: [string, string], kind: string, over: Record<string, any> = {}) {
  return { id, fromType: from[0], fromId: from[1], toType: to[0], toId: to[1], kind, subKind: null, isPrimary: false, createdAt: new Date(), ...over }
}

function world() {
  const company = objective('co', { level: 'COMPANY', ownerId: 'ceo', title: 'Company O1', externalRef: 'O1' })
  const companyKr = keyResult('co-kr', company, { externalRef: 'KR1.3', title: 'Company KR1.3' })
  const secret = objective('secret', { level: 'COMPANY', ownerId: 'ceo', isPrivate: true, title: 'Secret plan' })
  const subject = objective('subj', { parentObjectiveId: 'dept', rolledFromId: 'prev' })
  const dept = objective('dept', { level: 'DEPARTMENT', ownerId: 'lead' })
  const prev = objective('prev', { timeframe: TF25, closureStatus: 'CLOSED', outcome: 'PARTIAL', finalGrade: 0.6, finalProgress: 62 })
  const child = objective('child', { parentObjectiveId: 'subj', ownerId: 'peer' })
  const deletedChild = objective('gone', { parentObjectiveId: 'subj', status: 'DELETED' })
  const contributor = objective('contrib', { ownerId: 'peer', isPrivate: true })
  const subjKr = keyResult('subj-kr', subject)
  const db = fakeDb({
    objective: [company, secret, subject, dept, prev, child, deletedChild, contributor],
    keyResult: [companyKr, subjKr],
    okrLink: [
      link('l-align', ['OBJECTIVE', 'subj'], ['KEY_RESULT', 'co-kr'], 'CONTRIBUTES_TO'),
      link('l-secret', ['OBJECTIVE', 'subj'], ['OBJECTIVE', 'secret'], 'CONTRIBUTES_TO'),
      link('l-in', ['OBJECTIVE', 'contrib'], ['OBJECTIVE', 'subj'], 'CONTRIBUTES_TO'),
    ],
    workDependencyLink: [
      {
        entityType: 'OBJECTIVE',
        entityId: 'subj',
        dependency: {
          id: 'd14', externalRef: 'DEP14', title: 'Data feed', depType: 'DATA', status: 'OPEN',
          neededByDate: new Date(2026, 9, 1), decisionId: null,
          parties: [{ userId: 'ceo', role: 'PROVIDER', user: PERSON('ceo') }, { userId: 'emp', role: 'NEEDER', user: PERSON('emp') }],
        },
      },
      {
        entityType: 'OBJECTIVE',
        entityId: 'subj',
        dependency: {
          id: 'x03', externalRef: 'X03', title: 'Hand-over', depType: 'OTHER', status: 'IN_PROGRESS',
          neededByDate: new Date(2026, 9, 16), decisionId: null,
          parties: [{ userId: 'emp', role: 'PROVIDER', user: PERSON('emp') }, { userId: 'peer', role: 'NEEDER', user: PERSON('peer') }],
        },
      },
    ],
    decisionLink: [
      {
        entityType: 'OBJECTIVE',
        entityId: 'subj',
        decision: {
          id: 'd46', externalRef: 'D46', title: 'Pick vendor', status: 'OPEN', neededBy: new Date(2026, 9, 10),
          batch: '16 Oct', deciderId: 'ceo', requestedById: 'emp', decider: PERSON('ceo'), links: [],
        },
      },
      {
        entityType: 'OBJECTIVE',
        entityId: 'subj',
        decision: { id: 'd47', status: 'DECIDED', deciderId: 'ceo', requestedById: null, links: [] },
      },
    ],
    recurringDuty: [
      { id: 'duty1', title: 'Weekly report', externalRef: 'RD1', ownerId: 'emp', status: 'ACTIVE', cadence: 'WEEKLY', objectiveId: 'subj', keyResultId: null, owner: PERSON('emp') },
      { id: 'duty2', title: 'Old duty', externalRef: null, ownerId: 'emp', status: 'RETIRED', cadence: 'WEEKLY', objectiveId: 'subj', keyResultId: null, owner: PERSON('emp') },
    ],
  })
  return db
}

test('objective connections: groups, lineage fallback, redaction, dependencies, decisions', async () => {
  const db = world()
  const ctx = makeViewerContext({ id: 'emp', role: 'EMPLOYEE' })
  const payload = await getConnections(ctx, 'OBJECTIVE', 'subj', { db: db as any, now: NOW, packageLoaders: orgLoaders() })
  assert.ok(payload)
  const p = payload!

  assert.equal(p.subject.title, 'Objective subj')
  // Aligns to: parent objective, company KR (link), secret objective (redacted, no title).
  assert.deepEqual(p.alignsTo.map((i) => `${i.type}:${i.id}:${i.via}`), [
    'OBJECTIVE:dept:PARENT',
    'KEY_RESULT:co-kr:CONTRIBUTES_TO',
    'OBJECTIVE:secret:CONTRIBUTES_TO',
  ])
  const secret = p.alignsTo[2]
  assert.equal(secret.redacted, true)
  assert.equal('title' in secret, false)
  assert.equal(secret.linkId, 'l-secret')
  const kr = p.alignsTo[1]
  assert.equal(kr.redacted, false)
  if (!kr.redacted) assert.equal(kr.parentLabel, 'O1')

  // Supported by: live child + private contributor (redacted); deleted child dropped.
  assert.deepEqual(p.supportedBy.map((i) => `${i.id}:${i.redacted}`), ['child:false', 'contrib:true'])

  // rolledFromId fallback with the closed predecessor's final grade.
  assert.equal(p.predecessors.length, 1)
  const prev = p.predecessors[0]
  assert.equal(prev.via, 'ROLLED_FROM')
  assert.equal(prev.redacted, false)
  if (!prev.redacted) assert.deepEqual(prev.final, { closureStatus: 'CLOSED', outcome: 'PARTIAL', finalGrade: 0.6, finalProgress: 62 })

  // Dependencies: subject owner needs DEP14 (late) and provides X03 (due soon).
  assert.deepEqual(p.dependencies.inbound.map((d) => [d.ref, d.late]), [['DEP14', true]])
  assert.deepEqual(p.dependencies.outbound.map((d) => [d.ref, d.dueSoon]), [['X03', true]])
  assert.equal(p.summary.blockedBy, 1)
  assert.deepEqual(p.summary.blockedByRefs, ['DEP14'])
  assert.equal(p.summary.waitingOnThis, 1)
  // The owner is a party to both, so the parties are shown.
  assert.deepEqual(p.dependencies.inbound[0].providers.map((u) => u.id), ['ceo'])
  assert.deepEqual(p.dependencies.outbound[0].needers.map((u) => u.id), ['peer'])

  // Only the OPEN decision, flagged overdue.
  assert.equal(p.decisions.length, 1)
  const d = p.decisions[0]
  assert.equal(d.redacted, false)
  if (!d.redacted) assert.equal(d.overdue, true)

  // Duties attached to the objective (retired one hidden); owner sees them.
  assert.deepEqual(p.duties.map((x) => `${x.id}:${x.redacted}`), ['duty1:false'])

  // The owner may manage links.
  assert.equal(p.permissions.canManageLinks, true)
})

test('a stranger sees the same structure with private items redacted and no link rights', async () => {
  const db = world()
  const ctx = makeViewerContext({ id: 'stranger', role: 'EMPLOYEE' })
  const payload = await getConnections(ctx, 'OBJECTIVE', 'subj', {
    db: db as any,
    now: NOW,
    packageVisibility: async () => () => false,
    packageLoaders: orgLoaders(),
  })
  assert.ok(payload)
  const p = payload!
  assert.equal(p.permissions.canManageLinks, false)
  assert.deepEqual(p.duties.map((x) => x.redacted), [true])
  // The objective is public, but that does not open its decisions: the §8 record rule
  // (resolveDecisionAccess) says no, exactly like GET /api/decisions/[id].
  assert.equal(p.subject.redacted, false)
  assert.deepEqual(p.decisions.map((d) => d.redacted), [true])
  assert.equal('title' in p.decisions[0], false)
  // Dependencies keep their public summary, but the parties are detail.
  assert.deepEqual(p.dependencies.inbound.map((d) => [d.ref, d.title, d.status]), [['DEP14', 'Data feed', 'OPEN']])
  for (const d of [...p.dependencies.inbound, ...p.dependencies.outbound]) {
    assert.deepEqual([d.providers, d.needers, d.decisionId], [[], [], null])
  }
})

test("the subject owner's manager sees linked decisions and dependency parties via §8", async () => {
  const db = world()
  const ctx = makeViewerContext({ id: 'boss', role: 'EMPLOYEE' })
  const payload = await getConnections(ctx, 'OBJECTIVE', 'subj', {
    db: db as any,
    now: NOW,
    packageLoaders: orgLoaders([{ managerId: 'boss', directReportId: 'emp' }]),
  })
  const p = payload!
  // emp requested D46, and boss manages emp.
  assert.deepEqual(p.decisions.map((d) => d.redacted), [false])
  assert.deepEqual(p.dependencies.inbound[0].needers.map((u) => u.id), ['emp'])
  assert.deepEqual(p.dependencies.outbound[0].providers.map((u) => u.id), ['emp'])
})

test('missing or deleted subjects return null', async () => {
  const db = world()
  const ctx = makeViewerContext({ id: 'admin', role: 'ADMIN' })
  assert.equal(await getConnections(ctx, 'OBJECTIVE', 'nope', { db: db as any }), null)
  assert.equal(await getConnections(ctx, 'OBJECTIVE', 'gone', { db: db as any }), null)
})

test('KR connections: own objective aligns, SUCCEEDS successors resolved', async () => {
  const db = world()
  const oldObj = objective('o-old', { timeframe: TF25 })
  const oldKr = keyResult('kr-old', oldObj, { closureStatus: 'CLOSED', finalGrade: 0.4 })
  db.objective.rows.push(oldObj)
  db.keyResult.rows.push(oldKr)
  db.okrLink.rows.push(link('l-succ', ['KEY_RESULT', 'subj-kr'], ['KEY_RESULT', 'kr-old'], 'SUCCEEDS', { isPrimary: true, subKind: 'CARRIED' }))
  const ctx = makeViewerContext({ id: 'emp', role: 'EMPLOYEE' })

  const fromOld = await getConnections(ctx, 'KEY_RESULT', 'kr-old', { db: db as any, now: NOW, packageLoaders: orgLoaders() })
  assert.deepEqual(fromOld!.successors.map((s) => `${s.id}:${s.via}:${s.subKind}`), ['subj-kr:SUCCEEDS:CARRIED'])
  assert.deepEqual(fromOld!.alignsTo.map((s) => `${s.type}:${s.id}`), ['OBJECTIVE:o-old'])

  const fromNew = await getConnections(ctx, 'KEY_RESULT', 'subj-kr', { db: db as any, now: NOW, packageLoaders: orgLoaders() })
  assert.deepEqual(fromNew!.predecessors.map((s) => `${s.id}:${s.isPrimary}`), ['kr-old:true'])
})
