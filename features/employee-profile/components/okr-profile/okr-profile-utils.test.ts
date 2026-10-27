import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ConnectionItem } from '@/lib/connections/types'
import {
  activeFilterCount,
  applyOkrProfileFilters,
  canEditKeyResultInMemory,
  canEditObjectiveInMemory,
  canOpenCloseFlow,
  canWorkOnKeyResult,
  computeHeader,
  filterSupportingInitiatives,
  groupSuccessorsByRelation,
  isDueWithinDays,
  keyResultStatusKey,
  levelBucket,
  nextPendingCheckpoint,
  objectiveStatusKey,
  pastDisposition,
  sortObjectives,
  sortTodos,
  splitKeyResultTodos,
  successorLabel,
  successorRelationLabel,
  todoVisibleInProfile,
  type OkrEditViewer,
} from './okr-profile-utils'
import { createProfileInitiativeSchema, parseDateOnly } from './schemas'
import type { OkrProfileKeyResult, OkrProfileObjective, OkrProfileTodo } from './types'

const NOW = new Date('2026-10-12T09:00:00.000Z')

function kr(overrides: Partial<OkrProfileKeyResult> = {}): OkrProfileKeyResult {
  return {
    id: 'kr1',
    redacted: false,
    title: 'Win rate',
    ref: 'KR1.1',
    owner: { id: 'u1', name: 'Eden', avatar: null },
    ownedBySubject: true,
    progress: 50,
    confidence: 'ON_TRACK',
    statusKey: 'on_track',
    closureStatus: 'OPEN',
    outcome: null,
    finalGrade: null,
    closureNote: null,
    isLocked: false,
    commitment: 'COMMITTED',
    unit: '%',
    startValue: 0,
    currentValue: 50,
    targetValue: 100,
    direction: 'INCREASE',
    nextCheckpoint: null,
    checkpointCounts: { total: 0, met: 0, missed: 0 },
    lastCheckInAt: null,
    blocked: false,
    initiatives: [],
    milestones: [],
    tasks: [],
    duties: [],
    actions: { canCheckIn: true, canAddInitiative: true, canClose: false },
    ...overrides,
  }
}

function obj(overrides: Partial<OkrProfileObjective> = {}): OkrProfileObjective {
  return {
    id: 'o1',
    redacted: false,
    title: 'Grow bids',
    ref: 'O1',
    level: 'INDIVIDUAL',
    involvement: 'OWNED',
    levelBucket: 'individual',
    owner: { id: 'u1', name: 'Eden', avatar: null },
    progress: 40,
    goalStatus: 'ON_TRACK',
    statusKey: 'on_track',
    closureStatus: 'OPEN',
    outcome: null,
    finalGrade: null,
    closureNote: null,
    isLocked: false,
    blocked: false,
    keyResults: [kr()],
    initiatives: [],
    actions: { canClose: false, openKeyResults: 1 },
    ...overrides,
  }
}

function todo(overrides: Partial<OkrProfileTodo> = {}): OkrProfileTodo {
  return {
    id: 't1',
    cardNumber: 1,
    title: 'Card',
    kind: 'TASK',
    externalRef: null,
    initiativeRef: null,
    initiative: null,
    status: 'PENDING',
    dueDate: null,
    completedAt: null,
    assignee: null,
    sprint: null,
    blocked: false,
    steps: [],
    ...overrides,
  }
}

const viewer = (overrides: Partial<OkrEditViewer> = {}): OkrEditViewer => ({
  id: 'v1',
  role: 'EMPLOYEE',
  departmentIds: new Set(),
  directReportIds: new Set(),
  ...overrides,
})

test('levelBucket: owned objectives by level, others contributed', () => {
  assert.equal(levelBucket('OWNED', 'COMPANY'), 'company')
  assert.equal(levelBucket('OWNED', 'DEPARTMENT'), 'department')
  assert.equal(levelBucket('OWNED', 'INDIVIDUAL'), 'individual')
  assert.equal(levelBucket('CONTRIBUTED', 'COMPANY'), 'contributed')
})

test('status keys: CLOSED closure wins over goalStatus / confidence', () => {
  assert.equal(objectiveStatusKey('AT_RISK', 'OPEN'), 'at_risk')
  assert.equal(objectiveStatusKey('ON_TRACK', 'CLOSED'), 'closed')
  assert.equal(objectiveStatusKey('CLOSED', 'OPEN'), 'closed')
  assert.equal(keyResultStatusKey('OFF_TRACK', 'CLOSING'), 'off_track')
  assert.equal(keyResultStatusKey(undefined, 'OPEN'), 'on_track')
})

test('edit mirrors: owner, ADMIN/EXEC, department lead rules', () => {
  const o = { level: 'INDIVIDUAL', ownerId: 'u1', departmentId: 'd1' }
  assert.equal(canEditObjectiveInMemory(viewer(), o), false)
  assert.equal(canEditObjectiveInMemory(viewer({ id: 'u1' }), o), true)
  assert.equal(canEditObjectiveInMemory(viewer({ role: 'EXECUTIVE' }), o), true)
  assert.equal(canEditObjectiveInMemory(viewer({ role: 'DEPARTMENT_LEAD', directReportIds: new Set(['u1']) }), o), true)
  assert.equal(canEditObjectiveInMemory(viewer({ role: 'EMPLOYEE', directReportIds: new Set(['u1']) }), o), false)
  const dept = { level: 'DEPARTMENT', ownerId: 'u9', departmentId: 'd1' }
  assert.equal(canEditObjectiveInMemory(viewer({ role: 'DEPARTMENT_LEAD', departmentIds: new Set(['d1']) }), dept), true)
  assert.equal(canEditObjectiveInMemory(viewer({ role: 'DEPARTMENT_LEAD', departmentIds: new Set(['d2']) }), dept), false)

  // KR: owner, lead of KR owner, objective owner.
  assert.equal(canEditKeyResultInMemory(viewer({ id: 'u5' }), { ownerId: 'u5' }, o), true)
  assert.equal(canEditKeyResultInMemory(viewer({ role: 'DEPARTMENT_LEAD', directReportIds: new Set(['u5']) }), { ownerId: 'u5' }, { ...o, level: 'COMPANY' }), true)
  assert.equal(canEditKeyResultInMemory(viewer({ id: 'u1' }), { ownerId: 'u5' }, o), true)
  assert.equal(canEditKeyResultInMemory(viewer(), { ownerId: 'u5' }, o), false)
})

test('close flow: edit rule + timeframe ended, or ADMIN/EXEC early; never redacted / closed / parent locked', () => {
  const base = { canEdit: true, redacted: false, closureStatus: 'OPEN', timeframeEnded: true, canCloseEarly: false }
  assert.equal(canOpenCloseFlow(base), true)
  assert.equal(canOpenCloseFlow({ ...base, timeframeEnded: false }), false)
  assert.equal(canOpenCloseFlow({ ...base, timeframeEnded: false, canCloseEarly: true }), true)
  assert.equal(canOpenCloseFlow({ ...base, canEdit: false }), false)
  assert.equal(canOpenCloseFlow({ ...base, redacted: true }), false)
  assert.equal(canOpenCloseFlow({ ...base, closureStatus: 'CLOSED' }), false)
  assert.equal(canOpenCloseFlow({ ...base, closureStatus: 'CLOSING' }), true)
  assert.equal(canOpenCloseFlow({ ...base, parentLocked: true }), false)
})

test('check-in / add work: open, unlocked, live timeframe and edit rights', () => {
  const base = { canEdit: true, redacted: false, closureStatus: 'OPEN', krLocked: false, objectiveLocked: false, timeframeEnded: false }
  assert.equal(canWorkOnKeyResult(base), true)
  assert.equal(canWorkOnKeyResult({ ...base, timeframeEnded: true }), false)
  assert.equal(canWorkOnKeyResult({ ...base, objectiveLocked: true }), false)
  assert.equal(canWorkOnKeyResult({ ...base, closureStatus: 'CLOSING' }), false)
  assert.equal(canWorkOnKeyResult({ ...base, canEdit: false }), false)
})

test('todo visibility: participants and editors always; sprint cards need the board; others need a full KR', () => {
  const base = { seesAll: false, isParticipant: false, canEditParent: false, inSprint: false, canViewSprint: false, parentFullyVisible: true }
  assert.equal(todoVisibleInProfile(base), true)
  assert.equal(todoVisibleInProfile({ ...base, parentFullyVisible: false }), false)
  assert.equal(todoVisibleInProfile({ ...base, parentFullyVisible: false, isParticipant: true }), true)
  assert.equal(todoVisibleInProfile({ ...base, inSprint: true }), false)
  assert.equal(todoVisibleInProfile({ ...base, inSprint: true, canViewSprint: true }), true)
  assert.equal(todoVisibleInProfile({ ...base, inSprint: true, canEditParent: true }), true)
  assert.equal(todoVisibleInProfile({ ...base, inSprint: true, seesAll: true }), true)
})

test('checkpoints: next pending on or after today (UTC day), 30-day window inclusive', () => {
  const cps = [
    { id: 'a', dueDate: '2026-10-11T00:00:00.000Z', status: 'PENDING' },
    { id: 'b', dueDate: '2026-12-31T00:00:00.000Z', status: 'PENDING' },
    { id: 'c', dueDate: '2026-10-12T00:00:00.000Z', status: 'MET' },
    { id: 'd', dueDate: '2026-10-12T00:00:00.000Z', status: 'PENDING' },
  ]
  assert.equal(nextPendingCheckpoint(cps, NOW)?.id, 'd')
  assert.equal(nextPendingCheckpoint([cps[0], cps[2]], NOW), null)
  assert.equal(isDueWithinDays('2026-10-12T00:00:00.000Z', 30, NOW), true)
  assert.equal(isDueWithinDays('2026-11-11T00:00:00.000Z', 30, NOW), true)
  assert.equal(isDueWithinDays('2026-11-12T00:00:00.000Z', 30, NOW), false)
  assert.equal(isDueWithinDays('2026-10-11T00:00:00.000Z', 30, NOW), false)
  assert.equal(isDueWithinDays(null, 30, NOW), false)
})

test('computeHeader: own KRs drive progress and C/A split; next checkpoint across KRs', () => {
  const objectives = [
    obj({
      keyResults: [
        kr({ id: 'a', progress: 20, commitment: 'COMMITTED', nextCheckpoint: { id: 'c1', label: 'Q3', dueDate: '2026-12-31T00:00:00.000Z', status: 'PENDING', targetText: 't' } }),
        kr({ id: 'b', progress: 80, commitment: 'ASPIRATIONAL', nextCheckpoint: { id: 'c2', label: 'Q2', dueDate: '2026-11-01T00:00:00.000Z', status: 'PENDING', targetText: 't' } }),
        kr({ id: 'c', progress: 100, commitment: null, ownedBySubject: false }),
      ],
    }),
    obj({ id: 'o2', involvement: 'CONTRIBUTED', levelBucket: 'contributed', keyResults: [kr({ id: 'd', progress: 50, commitment: 'MIXED' })] }),
  ]
  const h = computeHeader(objectives, '2026-10-10T08:00:00.000Z', NOW)
  assert.equal(h.objectives, 2)
  assert.equal(h.ownedObjectives, 1)
  assert.equal(h.keyResults, 3)
  assert.equal(h.averageProgress, 50)
  assert.deepEqual(h.commitment, { committed: 1, aspirational: 1, mixed: 1, unset: 0 })
  assert.equal(h.nextCheckpoint?.label, 'Q2')
  assert.equal(h.nextCheckpoint?.keyResultId, 'b')
  assert.equal(h.lastCheckInAt, '2026-10-10T08:00:00.000Z')

  const empty = computeHeader([], null, NOW)
  assert.equal(empty.averageProgress, null)
  assert.equal(empty.nextCheckpoint, null)
})

test('filters: level drops whole objectives; KR filters narrow KRs; status / blocked keep a matching objective', () => {
  const objectives = [
    obj({
      id: 'o1',
      levelBucket: 'company',
      keyResults: [
        kr({ id: 'a', commitment: 'COMMITTED', statusKey: 'at_risk' }),
        kr({ id: 'b', commitment: 'ASPIRATIONAL', tasks: [todo({ blocked: true })] }),
        kr({ id: 'c', commitment: 'ASPIRATIONAL', nextCheckpoint: { id: 'x', label: 'Q2', dueDate: '2026-10-20T00:00:00.000Z', status: 'PENDING', targetText: '' } }),
      ],
    }),
    obj({ id: 'o2', levelBucket: 'contributed', statusKey: 'at_risk', keyResults: [kr({ id: 'd', commitment: 'MIXED' })] }),
    obj({ id: 'o3', levelBucket: 'individual', blocked: true, keyResults: [kr({ id: 'e', redacted: true, commitment: null })] }),
  ]
  assert.deepEqual(applyOkrProfileFilters(objectives, {}, NOW).map((o) => o.id), ['o1', 'o2', 'o3'])
  assert.deepEqual(applyOkrProfileFilters(objectives, { level: 'contributed' }, NOW).map((o) => o.id), ['o2'])

  const aspirational = applyOkrProfileFilters(objectives, { commitment: 'ASPIRATIONAL' }, NOW)
  assert.deepEqual(aspirational.map((o) => o.id), ['o1'])
  assert.deepEqual(aspirational[0].keyResults.map((k) => k.id), ['b', 'c'])

  const atRisk = applyOkrProfileFilters(objectives, { status: 'at_risk' }, NOW)
  assert.deepEqual(atRisk.map((o) => o.id), ['o1', 'o2'])
  assert.deepEqual(atRisk[0].keyResults.map((k) => k.id), ['a'])
  assert.deepEqual(atRisk[1].keyResults.map((k) => k.id), [])

  const blocked = applyOkrProfileFilters(objectives, { blockedOnly: true }, NOW)
  assert.deepEqual(blocked.map((o) => o.id), ['o1', 'o3'])
  assert.deepEqual(blocked[0].keyResults.map((k) => k.id), ['b'])

  const due = applyOkrProfileFilters(objectives, { checkpointDue30: true }, NOW)
  assert.deepEqual(due.map((o) => o.id), ['o1'])
  assert.deepEqual(due[0].keyResults.map((k) => k.id), ['c'])

  assert.equal(activeFilterCount({}), 0)
  assert.equal(activeFilterCount({ level: 'company', blockedOnly: true, checkpointDue30: true }), 3)
})

test('past: dispositions and successor labels ("Carried → C5 · company O4")', () => {
  assert.equal(pastDisposition(2, 'MISSED'), 'CONTINUED')
  assert.equal(pastDisposition(0, 'ACHIEVED'), 'COMPLETED')
  assert.equal(pastDisposition(0, 'ABANDONED'), 'RETIRED')
  assert.equal(pastDisposition(0, null), 'RETIRED')

  assert.equal(successorRelationLabel('SUCCEEDS', 'CARRIED'), 'Carried')
  assert.equal(successorRelationLabel('ROLLED_FROM', null), 'Rolled forward')
  assert.equal(successorRelationLabel('SUCCEEDS', null), 'Continued')

  const visible = (ref: string | null, level: string, title = 'Some objective'): ConnectionItem => ({
    type: 'OBJECTIVE',
    id: ref ?? title,
    via: 'SUCCEEDS',
    redacted: false,
    title,
    ref,
    href: '/x',
    status: null,
    progress: null,
    owner: null,
    level,
  })
  assert.equal(successorLabel(visible('C5', 'INDIVIDUAL')), 'C5')
  assert.equal(successorLabel(visible('O4', 'COMPANY')), 'company O4')
  assert.equal(successorLabel(visible(null, 'INDIVIDUAL', 'x'.repeat(50)), 10), `${'x'.repeat(9)}…`)
  assert.equal(successorLabel({ type: 'OBJECTIVE', id: 'p', via: 'SUCCEEDS', redacted: true }), 'Private item')

  const groups = groupSuccessorsByRelation([
    { relationLabel: 'Carried', label: 'C5' },
    { relationLabel: 'Reframed', label: 'C7' },
    { relationLabel: 'Carried', label: 'company O4' },
  ])
  assert.deepEqual(
    groups.map((g) => [g.relationLabel, g.items.map((i) => i.label)]),
    [
      ['Carried', ['C5', 'company O4']],
      ['Reframed', ['C7']],
    ],
  )
})

test('sorting: objectives by level bucket then ref; todos open-first then due date', () => {
  const sorted = sortObjectives([
    { levelBucket: 'contributed', ref: 'A1', title: 'a' },
    { levelBucket: 'individual', ref: 'O10', title: 'b' },
    { levelBucket: 'individual', ref: 'O2', title: 'c' },
    { levelBucket: 'company', ref: null, title: 'd' },
  ] as Array<Pick<OkrProfileObjective, 'levelBucket' | 'ref' | 'title'>>)
  assert.deepEqual(sorted.map((o) => o.title), ['d', 'c', 'b', 'a'])

  const todos = sortTodos([
    todo({ id: 'done', status: 'COMPLETED', cardNumber: 1 }),
    todo({ id: 'late', status: 'PENDING', dueDate: '2026-10-01T00:00:00.000Z', cardNumber: 5 }),
    todo({ id: 'undated', status: 'PENDING', cardNumber: 2 }),
    todo({ id: 'stuck', status: 'STUCK', cardNumber: 9 }),
  ])
  assert.deepEqual(todos.map((t) => t.id), ['stuck', 'late', 'undated', 'done'])
})

test('schemas: initiative body and date-only parsing', () => {
  assert.equal(parseDateOnly('2026-02-30'), null)
  assert.equal(parseDateOnly('2026-10-12')?.toISOString(), '2026-10-12T00:00:00.000Z')
  const ok = createProfileInitiativeSchema.safeParse({ keyResultId: 'kr1', kind: 'MILESTONE', title: '  Ship  ', dueDate: '' })
  assert.equal(ok.success, true)
  if (ok.success) {
    assert.equal(ok.data.title, 'Ship')
    assert.equal(ok.data.dueDate, null)
    assert.equal(ok.data.assigneeId, undefined)
  }
  assert.equal(createProfileInitiativeSchema.safeParse({ keyResultId: 'kr1', kind: 'DUTY', title: 'x' }).success, false)
  assert.equal(createProfileInitiativeSchema.safeParse({ keyResultId: 'kr1', kind: 'TASK', title: ' ' }).success, false)
  assert.equal(createProfileInitiativeSchema.safeParse({ keyResultId: 'kr1', kind: 'TASK', title: 'x', dueDate: '12/10/2026' }).success, false)
})

function initiative(id: string, ref: string, overrides: Partial<OkrProfileTodo> = {}): OkrProfileTodo {
  return todo({
    id,
    kind: 'INITIATIVE',
    externalRef: ref,
    initiative: {
      group: null,
      commitment: 'COMMITTED',
      baseline: null,
      target: '12 MoUs',
      due: null,
      measuredBy: null,
      supports: null,
      dependencies: null,
    },
    ...overrides,
  })
}

test('splitKeyResultTodos: initiatives first, milestones grouped by their initiative ref, tasks apart', () => {
  const split = splitKeyResultTodos([
    todo({ id: 'task', kind: 'TASK', cardNumber: 1 }),
    todo({ id: 'dep', kind: 'DEPENDENCY', cardNumber: 2 }),
    todo({ id: 'm-a', kind: 'MILESTONE', initiativeRef: 'EDN-IN1.1', cardNumber: 3 }),
    todo({ id: 'm-orphan', kind: 'MILESTONE', initiativeRef: 'EDN-IN9.9', cardNumber: 4 }),
    todo({ id: 'm-plain', kind: 'MILESTONE', cardNumber: 5 }),
    initiative('i2', 'EDN-IN1.2', { cardNumber: 7 }),
    initiative('i1', 'EDN-IN1.1', { cardNumber: 6 }),
    todo({ id: 'm-b', kind: 'MILESTONE', initiativeRef: 'edn-in1.1', cardNumber: 8, status: 'COMPLETED' }),
  ])
  assert.deepEqual(split.initiatives.map((g) => g.initiative.id), ['i1', 'i2'])
  assert.deepEqual(split.initiatives[0].milestones.map((m) => m.id), ['m-a', 'm-b'])
  assert.deepEqual(split.initiatives[1].milestones, [])
  assert.deepEqual(split.milestones.map((m) => m.id), ['m-orphan', 'm-plain'])
  assert.deepEqual(split.tasks.map((t) => t.id), ['task', 'dep'])
})

test('blocked filter sees blocked initiatives and their grouped milestones', () => {
  const blockedMilestone = todo({ id: 'm', kind: 'MILESTONE', blocked: true })
  const withGrouped = kr({ id: 'g', initiatives: [{ initiative: initiative('i', 'IN1'), milestones: [blockedMilestone] }] })
  const withInitiative = kr({ id: 'i', initiatives: [{ initiative: initiative('i2', 'IN2', { blocked: true }), milestones: [] }] })
  const clear = kr({ id: 'c' })
  const out = applyOkrProfileFilters([obj({ keyResults: [withGrouped, withInitiative, clear] })], { blockedOnly: true }, NOW)
  assert.deepEqual(out[0].keyResults.map((k) => k.id), ['g', 'i'])
})

test('filterSupportingInitiatives: level/status/checkpoint hide them; commitment and blocked narrow', () => {
  const items = [
    initiative('c', 'IN1'),
    initiative('a', 'IN2', {
      blocked: true,
      initiative: { group: null, commitment: 'ASPIRATIONAL', baseline: null, target: null, due: null, measuredBy: null, supports: 'KPI-3', dependencies: null },
    }),
  ]
  assert.equal(filterSupportingInitiatives(items, {}).length, 2)
  assert.deepEqual(filterSupportingInitiatives(items, { level: 'individual' }), [])
  assert.deepEqual(filterSupportingInitiatives(items, { status: 'on_track' }), [])
  assert.deepEqual(filterSupportingInitiatives(items, { checkpointDue30: true }), [])
  assert.deepEqual(filterSupportingInitiatives(items, { commitment: 'ASPIRATIONAL' }).map((t) => t.id), ['a'])
  assert.deepEqual(filterSupportingInitiatives(items, { blockedOnly: true }).map((t) => t.id), ['a'])
})
