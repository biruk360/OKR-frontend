import test from 'node:test'
import assert from 'node:assert/strict'
import {
  auditForeignKeys,
  checkDeleteOrder,
  chunk,
  classifyTodos,
  defaultSnapshotName,
  DELETE_STEPS,
  fkDisposition,
  manifestFingerprint,
  metadataRefs,
  type ForeignKey,
  type TodoCandidate,
} from './plan'

const todo = (id: string, over: Partial<TodoCandidate> = {}): TodoCandidate => ({
  id,
  externalRef: null,
  dutyId: null,
  recurrenceParentId: null,
  keyResultId: null,
  objectiveId: null,
  ...over,
})

test('classifyTodos: importer keys are deleted, person-made to-dos on doomed KRs are preserved', () => {
  const res = classifyTodos({
    candidates: [
      todo('ms', { externalRef: 'M1.1.1', keyResultId: 'kr1' }),
      todo('task-no-kr', {}),
      todo('head', { dutyId: 'd1' }),
      todo('occ1', { dutyId: 'd1', recurrenceParentId: 'head' }),
      todo('yared', { keyResultId: 'kr1' }),
      todo('obj-linked', { objectiveId: 'o1' }),
      todo('other', { keyResultId: 'kr-old' }),
    ],
    doomedKeyResultIds: new Set(['kr1']),
    doomedObjectiveIds: new Set(['o1']),
    doomedDutyIds: new Set(['d1']),
    importerTodoIds: new Set(['task-no-kr']),
    dutyHeadIds: new Set(['head']),
  })
  assert.equal(res.doomed.get('ms'), 'externalRef')
  assert.equal(res.doomed.get('task-no-kr'), 'import-activity')
  assert.equal(res.doomed.get('head'), 'duty')
  assert.equal(res.doomed.get('occ1'), 'duty')
  assert.deepEqual(res.preserved.map((t) => t.id).sort(), ['obj-linked', 'yared'])
  assert.deepEqual(res.untouched.map((t) => t.id), ['other'])
})

test('classifyTodos: occurrences follow an importer-made recurrence root transitively', () => {
  const res = classifyTodos({
    candidates: [
      todo('occ2', { recurrenceParentId: 'occ1', keyResultId: 'kr1' }),
      todo('occ1', { recurrenceParentId: 'root', keyResultId: 'kr1' }),
      todo('root', { externalRef: 'T01', keyResultId: 'kr1' }),
      // A person's own recurring to-do on a doomed KR: root and occurrences are all preserved.
      todo('mine', { keyResultId: 'kr1' }),
      todo('mine-occ', { keyResultId: 'kr1', recurrenceParentId: 'mine' }),
    ],
    doomedKeyResultIds: new Set(['kr1']),
    doomedObjectiveIds: new Set(),
    doomedDutyIds: new Set(),
    importerTodoIds: new Set(),
    dutyHeadIds: new Set(),
  })
  assert.equal(res.doomed.get('occ1'), 'occurrence')
  assert.equal(res.doomed.get('occ2'), 'occurrence')
  assert.deepEqual(res.preserved.map((t) => t.id).sort(), ['mine', 'mine-occ'])
})

test('classifyTodos: a duty from another timeframe does not doom the to-do', () => {
  const res = classifyTodos({
    candidates: [todo('t', { dutyId: 'old-duty', keyResultId: 'kr1' })],
    doomedKeyResultIds: new Set(['kr1']),
    doomedObjectiveIds: new Set(),
    doomedDutyIds: new Set(['d1']),
    importerTodoIds: new Set(),
    dutyHeadIds: new Set(),
  })
  assert.equal(res.doomed.size, 0)
  assert.deepEqual(res.preserved.map((t) => t.id), ['t'])
})

test('metadataRefs finds doomed ids in string or object metadata', () => {
  const doomed = new Set(['p1', 'k1'])
  assert.deepEqual(metadataRefs(JSON.stringify({ userId: 'u', packageId: 'p1', source: 'import' }), doomed), ['packageId'])
  assert.deepEqual(metadataRefs({ entityType: 'KPI', entityId: 'k1' }, doomed), ['entityId'])
  assert.deepEqual(metadataRefs({ ids: ['x', 'k1'] }, doomed), ['ids'])
  assert.deepEqual(metadataRefs('{not json', doomed), [])
  assert.deepEqual(metadataRefs(null, doomed), [])
  assert.deepEqual(metadataRefs(JSON.stringify(['p1']), doomed), [])
  assert.deepEqual(metadataRefs({ entityId: 'other' }, doomed), [])
})

test('fkDisposition maps pg confdeltype', () => {
  assert.equal(fkDisposition('c'), 'CASCADE')
  assert.equal(fkDisposition('n'), 'SET_NULL')
  assert.equal(fkDisposition('d'), 'SET_DEFAULT')
  assert.equal(fkDisposition('a'), 'BLOCK')
  assert.equal(fkDisposition('r'), 'BLOCK')
})

test('auditForeignKeys: unhandled blocking references are blockers', () => {
  const { rows, blockers } = auditForeignKeys(
    [
      { table: 'evaluation_metric_sources', column: 'keyResultId', refTable: 'key_results', confdeltype: 'r', rows: 2 },
      { table: 'projects', column: 'objectiveId', refTable: 'objectives', confdeltype: 'n', rows: 1 },
      { table: 'initiatives', column: 'keyResultId', refTable: 'key_results', confdeltype: 'c', rows: 1 },
      { table: 'comments', column: 'parentId', refTable: 'comments', confdeltype: 'a', rows: 0 },
      { table: 'foo', column: 'krId', refTable: 'key_results', confdeltype: 'a', rows: 3 },
    ],
    new Map([['foo.krId', 'detach foo']]),
  )
  assert.equal(blockers.length, 1)
  assert.match(blockers[0], /evaluation_metric_sources\.keyResultId/)
  assert.equal(rows.find((r) => r.table === 'foo')?.handledBy, 'detach foo')
  assert.equal(rows.find((r) => r.table === 'projects')?.disposition, 'SET_NULL')
})

test('checkDeleteOrder: default order satisfies the schema FKs between doomed tables', () => {
  // Every FK between the deleted tables, as declared in prisma/schema.prisma (Prisma's default for an
  // optional relation without onDelete is SET NULL).
  const schemaFks: ForeignKey[] = [
    { table: 'initiatives', column: 'keyResultId', refTable: 'key_results', confdeltype: 'c' },
    { table: 'initiatives', column: 'objectiveId', refTable: 'objectives', confdeltype: 'n' },
    { table: 'initiatives', column: 'dutyId', refTable: 'recurring_duties', confdeltype: 'n' },
    { table: 'recurring_duties', column: 'packageId', refTable: 'operating_packages', confdeltype: 'n' },
    { table: 'recurring_duties', column: 'keyResultId', refTable: 'key_results', confdeltype: 'n' },
    { table: 'recurring_duties', column: 'objectiveId', refTable: 'objectives', confdeltype: 'n' },
    { table: 'kpis', column: 'packageId', refTable: 'operating_packages', confdeltype: 'n' },
    { table: 'kpis', column: 'keyResultId', refTable: 'key_results', confdeltype: 'n' },
    { table: 'development_items', column: 'packageId', refTable: 'operating_packages', confdeltype: 'n' },
    { table: 'development_items', column: 'keyResultId', refTable: 'key_results', confdeltype: 'n' },
    { table: 'role_definitions', column: 'packageId', refTable: 'operating_packages', confdeltype: 'n' },
    { table: 'work_dependencies', column: 'decisionId', refTable: 'decisions', confdeltype: 'n' },
    { table: 'key_results', column: 'objectiveId', refTable: 'objectives', confdeltype: 'c' },
    { table: 'key_results', column: 'rolledFromId', refTable: 'key_results', confdeltype: 'n' },
    { table: 'objectives', column: 'parentObjectiveId', refTable: 'objectives', confdeltype: 'n' },
  ]
  assert.deepEqual(checkDeleteOrder(DELETE_STEPS, schemaFks), [])
  // Even if every one of them were RESTRICT, children still go first.
  assert.deepEqual(checkDeleteOrder(DELETE_STEPS, schemaFks.map((f) => ({ ...f, confdeltype: 'r' }))), [])
})

test('checkDeleteOrder flags a parent deleted before a blocking child', () => {
  const out = checkDeleteOrder(['objectives', 'key_results'], [{ table: 'key_results', column: 'objectiveId', refTable: 'objectives', confdeltype: 'a' }])
  assert.equal(out.length, 1)
})

test('chunk, manifestFingerprint, defaultSnapshotName', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(chunk([], 3), [])
  assert.throws(() => chunk([1], 0))
  assert.equal(manifestFingerprint({ b: ['2', '1'], a: ['x'] }), manifestFingerprint({ a: ['x'], b: ['1', '2'] }))
  assert.notEqual(manifestFingerprint({ a: ['x'] }), manifestFingerprint({ a: ['y'] }))
  assert.equal(defaultSnapshotName(new Date(Date.UTC(2026, 9, 27, 8, 5, 9))), 'operating-package-revert-snapshot-20261027-080509.json')
})
