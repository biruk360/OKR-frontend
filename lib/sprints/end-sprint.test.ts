import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeDispositions,
  buildCarryoverPatch,
  computeWarnings,
  carriedPosition,
  backlogSortOrder,
  isComplete,
  findColumnMismatch,
  completionRate,
  canReopen,
  buildBringBackPatch,
  REOPEN_WINDOW_DAYS,
  type IncompleteTodo,
} from './end-sprint'

function todo(overrides: Partial<IncompleteTodo> = {}): IncompleteTodo {
  return {
    id: 't1',
    title: 'Task 1',
    status: 'IN_PROGRESS',
    assigneeId: 'u1',
    sprintPosition: 1000,
    carryoverCount: 0,
    originalSprintId: null,
    ...overrides,
  }
}

// T-01 · AC-BR02-1 — computeDispositions modes + per-task fallback
test('T-01: bulk handling modes apply to every incomplete todo', () => {
  const todos = [todo({ id: 'a' }), todo({ id: 'b' })]
  for (const mode of ['next', 'backlog', 'cancel'] as const) {
    const d = computeDispositions(todos, mode, [], 's2')
    assert.equal(d.length, 2)
    assert.ok(d.every(x => x.action === mode))
    assert.ok(d.every(x => x.toSprintId === (mode === 'next' ? 's2' : null)))
  }
})

test('T-01: per-task mode uses the map and falls back to backlog for missing entries', () => {
  const todos = [todo({ id: 'a' }), todo({ id: 'b' }), todo({ id: 'c' })]
  const d = computeDispositions(todos, 'per-task', [
    { todoId: 'a', action: 'next' },
    { todoId: 'b', action: 'cancel' },
  ], 's2')
  assert.equal(d.find(x => x.todoId === 'a')!.action, 'next')
  assert.equal(d.find(x => x.todoId === 'b')!.action, 'cancel')
  assert.equal(d.find(x => x.todoId === 'c')!.action, 'backlog') // fallback
})

// T-02 · AC-BR03-1/2 — lineage increments + originalSprintId stickiness
test('T-02: first carry sets count=1, originalSprintId, lastCarriedAt, disposition', () => {
  const now = new Date('2026-08-03T12:00:00Z')
  const patch = buildCarryoverPatch(todo(), 'sprint-1', now)
  assert.equal(patch.carryoverCount, 1)
  assert.equal(patch.originalSprintId, 'sprint-1')
  assert.equal(patch.lastCarriedAt, now)
  assert.equal(patch.carryoverDisposition, 'CARRY')
})

test('T-02: second carry keeps the ORIGINAL originalSprintId', () => {
  const now = new Date()
  const existing = todo({ carryoverCount: 1, originalSprintId: 'sprint-1' })
  const patch = buildCarryoverPatch(existing, 'sprint-2', now)
  assert.equal(patch.carryoverCount, 2)
  assert.equal(patch.originalSprintId, 'sprint-1') // sticky
})

// T-03 · AC-BR03-3 — CARRIED_3_PLUS warning on 3rd+ carry
test('T-03: warning emitted when a task is carried into its 3rd sprint', () => {
  const todos = [
    todo({ id: 'a', carryoverCount: 2 }), // becomes 3 → warn
    todo({ id: 'b', carryoverCount: 1 }), // becomes 2 → no warn
    todo({ id: 'c', carryoverCount: 5 }), // backlog action → no warn
  ]
  const d = computeDispositions(todos, 'per-task', [
    { todoId: 'a', action: 'next' },
    { todoId: 'b', action: 'next' },
    { todoId: 'c', action: 'backlog' },
  ], 's2')
  const w = computeWarnings(todos, d)
  assert.deepEqual(w, [{ todoId: 'a', code: 'CARRIED_3_PLUS' }])
})

// T-04 · AC-BR04-1/2 — position normalization math
test('T-04: carried positions append below lane max, preserving batch order', () => {
  assert.equal(carriedPosition(3000, 0), 4000)
  assert.equal(carriedPosition(3000, 1), 5000)
  assert.equal(carriedPosition(0, 0), 1000) // empty lane
})

test('T-04: backlog sortOrder appends below column max', () => {
  assert.equal(backlogSortOrder(7000, 0), 8000)
  assert.equal(backlogSortOrder(0, 2), 3000)
})

// T-05 · AC-BR07-1 — completion counting: only status COMPLETED
test('T-05: only status COMPLETED counts as complete, regardless of anything else', () => {
  assert.equal(isComplete('COMPLETED'), true)
  for (const s of ['PENDING', 'IN_PROGRESS', 'IN_REVIEW', 'STUCK', 'CANCELLED']) {
    assert.equal(isComplete(s), false)
  }
})

test('T-05: column mismatch finds only non-completed rows', () => {
  const rows = [
    { id: 'a', title: 'A', status: 'COMPLETED' },
    { id: 'b', title: 'B', status: 'IN_REVIEW' },
  ]
  assert.deepEqual(findColumnMismatch(rows).map(r => r.id), ['b'])
})

// T-06 · AC-BR09-2 — completionRate math
test('T-06: completionRate is 2dp ratio; null when total is zero', () => {
  assert.equal(completionRate(8, 13), 0.62)
  assert.equal(completionRate(1, 3), 0.33)
  assert.equal(completionRate(0, 0), null)
  assert.equal(completionRate(5, 5), 1)
})

// T-07 · AC-BR08-3 — bring-back decrements with floor 0
test('T-07: bring-back decrements carryoverCount, never below 0', () => {
  const p1 = buildBringBackPatch(todo({ carryoverCount: 2 }), 's1')
  assert.equal(p1.carryoverCount, 1)
  assert.equal(p1.sprintId, 's1')
  assert.equal(p1.carryoverDisposition, 'CARRY')

  const p2 = buildBringBackPatch(todo({ carryoverCount: 1 }), 's1')
  assert.equal(p2.carryoverCount, 0)
  assert.equal(p2.carryoverDisposition, null) // lineage reset at 0

  const p3 = buildBringBackPatch(todo({ carryoverCount: 0 }), 's1')
  assert.equal(p3.carryoverCount, 0) // floor
})

// T-08 · AC-BR08-2 — reopen window check
test('T-08: reopen allowed inside window, rejected after', () => {
  const ended = new Date('2026-08-01T10:00:00Z')
  const day6 = new Date('2026-08-07T09:59:59Z')
  const day8 = new Date('2026-08-09T10:00:01Z')
  assert.equal(canReopen(ended, day6), true)
  assert.equal(canReopen(ended, day8), false)
  assert.equal(canReopen(null, day6), false)

  const boundary = new Date(ended.getTime() + REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  assert.equal(canReopen(ended, boundary), true) // exactly at the boundary: allowed
})
