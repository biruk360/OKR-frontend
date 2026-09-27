import test from 'node:test'
import assert from 'node:assert/strict'
import {
  contributionPercents,
  getDescendantObjectiveIds,
  isAncestorOf,
  recalcKrFromInitiatives,
  recalcNodeAndAncestors,
  recalcObjectiveStoredProgress,
  weightedAverage,
  wouldCreateAlignmentCycle,
  type DbLike,
} from './objectiveProgress'

/**
 * OKR roll-up math (lib/objectiveProgress.ts) against an in-memory fake
 * transaction client: LOOSE (KR average) vs STRICT_DEPENDENCY (children roll-up)
 * objectives, weights with 0 = auto, locked nodes, the ancestor walk and its
 * cycle guard.
 */

type Obj = {
  id: string
  parentObjectiveId: string | null
  status: string
  progress: number
  weight: number
  isLocked: boolean
  alignmentType: string | null
  rollupCalculation: string | null
}
type Kr = { id: string; objectiveId: string; status: string; currentValue: number; targetValue: number; startValue: number; progress: number; weight: number }
type Todo = { keyResultId: string; status: string; progressValue: number | null }

function makeDb(objs: Partial<Obj>[], krs: Partial<Kr>[] = [], todos: Todo[] = []) {
  const objectives = new Map<string, Obj>()
  for (const o of objs) {
    objectives.set(o.id!, {
      parentObjectiveId: null, status: 'ACTIVE', progress: 0, weight: 0, isLocked: false,
      alignmentType: 'LOOSE', rollupCalculation: null, ...o,
    } as Obj)
  }
  const keyResults = krs.map((k) => ({ status: 'ACTIVE', startValue: 0, progress: 0, weight: 0, ...k }) as Kr)
  const calls = { objectiveFindUnique: 0, objectiveUpdates: [] as string[] }
  const db = {
    objective: {
      async findUnique({ where }: any) {
        calls.objectiveFindUnique++
        const o = objectives.get(where.id)
        return o ? { ...o } : null
      },
      async findMany({ where }: any) {
        const parents: string[] = typeof where.parentObjectiveId === 'object' && where.parentObjectiveId !== null
          ? where.parentObjectiveId.in
          : [where.parentObjectiveId]
        return Array.from(objectives.values())
          .filter((o) => o.parentObjectiveId !== null && parents.includes(o.parentObjectiveId))
          .filter((o) => (where.status ? o.status === where.status : true))
          .map((o) => ({ ...o }))
      },
      async update({ where, data }: any) {
        calls.objectiveUpdates.push(where.id)
        Object.assign(objectives.get(where.id)!, data)
        return objectives.get(where.id)
      },
    },
    keyResult: {
      async findMany({ where }: any) {
        return keyResults.filter((k) => k.objectiveId === where.objectiveId && (where.status ? k.status === where.status : true))
      },
      async findUnique({ where }: any) {
        return keyResults.find((k) => k.id === where.id) ?? null
      },
      async update({ where, data }: any) {
        Object.assign(keyResults.find((k) => k.id === where.id)!, data)
      },
    },
    todo: {
      async findMany({ where }: any) {
        return todos.filter((t) => t.keyResultId === where.keyResultId && t.status === where.status)
      },
    },
  }
  return { db: db as unknown as DbLike, objectives, keyResults, calls }
}

// ── pure helpers ────────────────────────────────────────────────────────────

test('weightedAverage: 0 = auto weight equal to the mean explicit weight', () => {
  assert.equal(weightedAverage([]), 0)
  assert.equal(weightedAverage([{ value: 100, weight: 0 }, { value: 0, weight: 0 }]), 50)
  // Explicit 3 & 1 → auto gets 2: (100*3 + 0*1 + 50*2) / 6
  assert.equal(weightedAverage([{ value: 100, weight: 3 }, { value: 0, weight: 1 }, { value: 50, weight: 0 }]), 400 / 6)
  assert.equal(weightedAverage([{ value: 80, weight: 5 }]), 80)
})

test('contributionPercents: sums to 100 and uses the same auto-fill rule', () => {
  assert.deepEqual(contributionPercents([]), {})
  const p = contributionPercents([{ id: 'a', weight: 3 }, { id: 'b', weight: 1 }, { id: 'c', weight: 0 }])
  assert.equal(p.a, 50)
  assert.ok(Math.abs(p.b - 100 / 6) < 1e-9)
  assert.ok(Math.abs(p.c - 100 / 3) < 1e-9)
  const eq = contributionPercents([{ id: 'x', weight: 0 }, { id: 'y', weight: 0 }])
  assert.deepEqual(eq, { x: 50, y: 50 })
})

// ── recalcObjectiveStoredProgress ───────────────────────────────────────────

test('LOOSE: progress = weighted average of ACTIVE KRs, each capped at 100, rounded', async () => {
  const { db, objectives } = makeDb(
    [{ id: 'o' }],
    [
      { id: 'k1', objectiveId: 'o', currentValue: 50, targetValue: 100, weight: 1 },   // 50%
      { id: 'k2', objectiveId: 'o', currentValue: 300, targetValue: 100, weight: 1 },  // capped 100%
      { id: 'k3', objectiveId: 'o', currentValue: 0, targetValue: 0, progress: 33, weight: 2 }, // target 0 → stored progress
      { id: 'k4', objectiveId: 'o', currentValue: 0, targetValue: 100, status: 'ARCHIVED', weight: 9 }, // ignored
    ],
  )
  const got = await recalcObjectiveStoredProgress(db, 'o')
  // (50*1 + 100*1 + 33*2) / 4 = 54
  assert.equal(got, 54)
  assert.equal(objectives.get('o')!.progress, 54)
})

test('LOOSE: no active KRs → 0; missing objective → 0 and no write', async () => {
  const { db, calls } = makeDb([{ id: 'o', progress: 70 }])
  assert.equal(await recalcObjectiveStoredProgress(db, 'o'), 0)
  assert.equal(await recalcObjectiveStoredProgress(db, 'nope'), 0)
  assert.deepEqual(calls.objectiveUpdates, ['o'])
})

test('LOOSE objective ignores children even when it has some', async () => {
  const { db } = makeDb(
    [{ id: 'p' }, { id: 'c', parentObjectiveId: 'p', progress: 100 }],
    [{ id: 'k', objectiveId: 'p', currentValue: 10, targetValue: 100 }],
  )
  assert.equal(await recalcObjectiveStoredProgress(db, 'p'), 10)
})

test('STRICT_DEPENDENCY + AVERAGE: weighted average of ACTIVE children', async () => {
  const { db } = makeDb([
    { id: 'p', alignmentType: 'STRICT_DEPENDENCY', rollupCalculation: 'AVERAGE' },
    { id: 'c1', parentObjectiveId: 'p', progress: 90, weight: 3 },
    { id: 'c2', parentObjectiveId: 'p', progress: 30, weight: 1 },
    { id: 'c3', parentObjectiveId: 'p', progress: 0, weight: 50, status: 'ARCHIVED' },
  ])
  // (90*3 + 30*1) / 4 = 75
  assert.equal(await recalcObjectiveStoredProgress(db, 'p'), 75)
})

test('STRICT_DEPENDENCY + SUM (any non-AVERAGE, non-NONE): children summed, capped at 100', async () => {
  const { db } = makeDb([
    { id: 'p', alignmentType: 'STRICT_DEPENDENCY', rollupCalculation: 'SUM' },
    { id: 'c1', parentObjectiveId: 'p', progress: 40 },
    { id: 'c2', parentObjectiveId: 'p', progress: 35 },
  ])
  assert.equal(await recalcObjectiveStoredProgress(db, 'p'), 75)
  const { db: db2 } = makeDb([
    { id: 'p', alignmentType: 'STRICT_DEPENDENCY', rollupCalculation: 'SUM' },
    { id: 'c1', parentObjectiveId: 'p', progress: 80 },
    { id: 'c2', parentObjectiveId: 'p', progress: 70 },
  ])
  assert.equal(await recalcObjectiveStoredProgress(db2, 'p'), 100)
})

test('STRICT_DEPENDENCY falls back to KRs when rollup is NONE or there are no active children', async () => {
  const { db } = makeDb(
    [
      { id: 'p', alignmentType: 'STRICT_DEPENDENCY', rollupCalculation: 'NONE' },
      { id: 'c', parentObjectiveId: 'p', progress: 100 },
      { id: 'q', alignmentType: 'STRICT_DEPENDENCY', rollupCalculation: 'AVERAGE' },
    ],
    [
      { id: 'k', objectiveId: 'p', currentValue: 20, targetValue: 100 },
      { id: 'kq', objectiveId: 'q', currentValue: 60, targetValue: 100 },
    ],
  )
  assert.equal(await recalcObjectiveStoredProgress(db, 'p'), 20)
  assert.equal(await recalcObjectiveStoredProgress(db, 'q'), 60)
})

// ── recalcNodeAndAncestors ──────────────────────────────────────────────────

test('recalcNodeAndAncestors: recomputes the node then each ancestor with fresh child values', async () => {
  const { db, objectives, calls } = makeDb(
    [
      { id: 'root', alignmentType: 'STRICT_DEPENDENCY', rollupCalculation: 'AVERAGE' },
      { id: 'mid', parentObjectiveId: 'root', alignmentType: 'STRICT_DEPENDENCY', rollupCalculation: 'AVERAGE' },
      { id: 'sib', parentObjectiveId: 'root', progress: 20 },
      { id: 'leaf', parentObjectiveId: 'mid' },
    ],
    [{ id: 'k', objectiveId: 'leaf', currentValue: 80, targetValue: 100 }],
  )
  await recalcNodeAndAncestors(db, 'leaf')
  assert.equal(objectives.get('leaf')!.progress, 80)
  assert.equal(objectives.get('mid')!.progress, 80)
  assert.equal(objectives.get('root')!.progress, 50) // avg(80, 20)
  assert.deepEqual(calls.objectiveUpdates, ['leaf', 'mid', 'root'])
})

test('recalcNodeAndAncestors: a locked node keeps its frozen progress but still rolls up', async () => {
  const { db, objectives, calls } = makeDb(
    [
      { id: 'root', alignmentType: 'STRICT_DEPENDENCY', rollupCalculation: 'AVERAGE' },
      { id: 'locked', parentObjectiveId: 'root', isLocked: true, progress: 40 },
    ],
    [{ id: 'k', objectiveId: 'locked', currentValue: 100, targetValue: 100 }],
  )
  await recalcNodeAndAncestors(db, 'locked')
  assert.equal(objectives.get('locked')!.progress, 40)
  assert.equal(objectives.get('root')!.progress, 40)
  assert.deepEqual(calls.objectiveUpdates, ['root'])
})

test('recalcNodeAndAncestors: terminates on a corrupt parent cycle, visiting each node once', async () => {
  const { db, calls } = makeDb([
    { id: 'a', parentObjectiveId: 'b' },
    { id: 'b', parentObjectiveId: 'c' },
    { id: 'c', parentObjectiveId: 'a' },
  ])
  await recalcNodeAndAncestors(db, 'a')
  assert.deepEqual(calls.objectiveUpdates, ['a', 'b', 'c'])
  assert.equal(calls.objectiveFindUnique, 3)
})

test('recalcNodeAndAncestors: stops quietly at a missing node', async () => {
  const { db, calls } = makeDb([{ id: 'a', parentObjectiveId: 'ghost' }])
  await recalcNodeAndAncestors(db, 'a')
  assert.deepEqual(calls.objectiveUpdates, ['a'])
})

// ── recalcKrFromInitiatives ─────────────────────────────────────────────────

test('recalcKrFromInitiatives: start + completed contributions, clamped to target, progress over the span', async () => {
  const { db, keyResults } = makeDb(
    [{ id: 'o' }],
    [{ id: 'k', objectiveId: 'o', startValue: 100, targetValue: 300, currentValue: 100 }],
    [
      { keyResultId: 'k', status: 'COMPLETED', progressValue: 50 },
      { keyResultId: 'k', status: 'COMPLETED', progressValue: null },
      { keyResultId: 'k', status: 'PENDING', progressValue: 999 },
    ],
  )
  assert.equal(await recalcKrFromInitiatives(db, 'k'), 150)
  assert.equal(keyResults[0].progress, 25)

  const over = makeDb(
    [{ id: 'o' }],
    [{ id: 'k', objectiveId: 'o', startValue: 0, targetValue: 10, currentValue: 0 }],
    [{ keyResultId: 'k', status: 'COMPLETED', progressValue: 25 }],
  )
  assert.equal(await recalcKrFromInitiatives(over.db, 'k'), 10)
  assert.equal(over.keyResults[0].progress, 100)
  assert.equal(await recalcKrFromInitiatives(over.db, 'missing'), null)
})

test('recalcKrFromInitiatives: a zero span yields progress 0 (no divide-by-zero)', async () => {
  const { db, keyResults } = makeDb([{ id: 'o' }], [{ id: 'k', objectiveId: 'o', startValue: 5, targetValue: 5, currentValue: 5 }], [])
  assert.equal(await recalcKrFromInitiatives(db, 'k'), 5)
  assert.equal(keyResults[0].progress, 0)
})

// ── alignment graph helpers ─────────────────────────────────────────────────

test('isAncestorOf / wouldCreateAlignmentCycle', async () => {
  const { db } = makeDb([
    { id: 'root' },
    { id: 'mid', parentObjectiveId: 'root' },
    { id: 'leaf', parentObjectiveId: 'mid' },
  ])
  assert.equal(await isAncestorOf(db, 'root', 'leaf'), true)
  assert.equal(await isAncestorOf(db, 'leaf', 'root'), false)
  assert.equal(await wouldCreateAlignmentCycle(db, 'root', 'leaf'), true) // root under its own grandchild
  assert.equal(await wouldCreateAlignmentCycle(db, 'leaf', 'root'), false)
  assert.equal(await wouldCreateAlignmentCycle(db, 'x', 'x'), true)
  assert.equal(await wouldCreateAlignmentCycle(db, null, 'root'), false)
})

test('isAncestorOf: an existing cycle is reported as a cycle (terminates)', async () => {
  const { db } = makeDb([{ id: 'a', parentObjectiveId: 'b' }, { id: 'b', parentObjectiveId: 'a' }])
  assert.equal(await isAncestorOf(db, 'zzz', 'a'), true)
})

test('getDescendantObjectiveIds: breadth-first subtree, root excluded', async () => {
  const { db } = makeDb([
    { id: 'root' },
    { id: 'a', parentObjectiveId: 'root' },
    { id: 'b', parentObjectiveId: 'root' },
    { id: 'a1', parentObjectiveId: 'a' },
  ])
  assert.deepEqual((await getDescendantObjectiveIds(db, 'root')).sort(), ['a', 'a1', 'b'])
  assert.deepEqual(await getDescendantObjectiveIds(db, 'a1'), [])
})

// BUG: lib/objectiveProgress.ts:235-247 — getDescendantObjectiveIds has no `seen`
// guard (unlike recalcNodeAndAncestors / isAncestorOf), so a corrupt parent cycle
// (a → b → a) loops forever and grows `out` without bound. Fixed: visited set.
test('BUG: getDescendantObjectiveIds terminates on a corrupt parent cycle', async () => {
  const { db } = makeDb([{ id: 'a', parentObjectiveId: 'b' }, { id: 'b', parentObjectiveId: 'a' }])
  assert.deepEqual((await getDescendantObjectiveIds(db, 'a')).sort(), ['a', 'b'])
})
