import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addCalendarDays,
  assertNoDependencyCycle,
  criticalPath,
  shiftSuccessors,
  taskDurationDays,
  wouldCreateDependencyCycle,
  type ScheduleDependency,
  type ScheduleTask,
} from './scheduling'

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

const tasks: ScheduleTask[] = [
  { id: 'A', currentStart: d('2026-08-03'), currentEnd: d('2026-08-07') },
  { id: 'B', currentStart: d('2026-08-10'), currentEnd: d('2026-08-14') },
  { id: 'C', currentStart: d('2026-08-17'), currentEnd: d('2026-08-21') },
  { id: 'D', currentStart: d('2026-08-10'), currentEnd: d('2026-08-11') },
]

test('addCalendarDays: preserves null and shifts dates', () => {
  assert.equal(addCalendarDays(null, 5), null)
  assert.equal(addCalendarDays(d('2026-08-03'), 5)?.toISOString(), '2026-08-08T00:00:00.000Z')
})

test('taskDurationDays: inclusive duration, undated fallback = 1', () => {
  assert.equal(taskDurationDays(tasks[0]), 5)
  assert.equal(taskDurationDays({ id: 'x', currentStart: null, currentEnd: null }), 1)
})

test('shiftSuccessors: shifts direct FS successor by the same delta', () => {
  const shifts = shiftSuccessors(tasks, [{ predecessorId: 'A', successorId: 'B', type: 'FS' }], 'A', 5)
  assert.deepEqual(shifts, [{ activityId: 'B', currentStart: d('2026-08-15'), currentEnd: d('2026-08-19') }])
})

test('shiftSuccessors: cascades transitively through a dependency chain', () => {
  const deps: ScheduleDependency[] = [
    { predecessorId: 'A', successorId: 'B', type: 'FS' },
    { predecessorId: 'B', successorId: 'C', type: 'FS' },
  ]
  const shifts = shiftSuccessors(tasks, deps, 'A', 3)
  assert.deepEqual(shifts.map((s) => s.activityId), ['B', 'C'])
  assert.equal(shifts[0].currentStart?.toISOString(), '2026-08-13T00:00:00.000Z')
  assert.equal(shifts[1].currentEnd?.toISOString(), '2026-08-24T00:00:00.000Z')
})

test('cycle detection blocks circular dependencies', () => {
  const deps: ScheduleDependency[] = [
    { predecessorId: 'A', successorId: 'B', type: 'FS' },
    { predecessorId: 'B', successorId: 'C', type: 'FS' },
  ]
  assert.equal(wouldCreateDependencyCycle(deps, { predecessorId: 'C', successorId: 'A' }), true)
  assert.equal(wouldCreateDependencyCycle(deps, { predecessorId: 'C', successorId: 'D' }), false)
  assert.throws(() => assertNoDependencyCycle([...deps, { predecessorId: 'C', successorId: 'A' }]), /circular dependency/i)
})

test('criticalPath: returns the longest dependency path', () => {
  const deps: ScheduleDependency[] = [
    { predecessorId: 'A', successorId: 'B', type: 'FS' },
    { predecessorId: 'B', successorId: 'C', type: 'FS' },
    { predecessorId: 'A', successorId: 'D', type: 'FS' },
  ]
  const cp = criticalPath(tasks, deps)
  assert.deepEqual(cp.taskIds, ['A', 'B', 'C'])
  assert.equal(cp.durationDays, 15)
})
