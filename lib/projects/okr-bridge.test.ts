/**
 * Unit tests for OKR bridge math. Run: `npm run test:projects`
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recalcKrFromMilestones, recalcKrsAndAncestors } from './okr-bridge'
import type { DbLike } from './okr-bridge'

interface MockKeyResult {
  id: string
  objectiveId: string
  startValue: number
  targetValue: number
  currentValue: number
  progress: number
}

interface MockMilestone {
  id: string
  keyResultId: string
  percentComplete: number
  weight: number
}

interface MockObjective {
  id: string
  parentObjectiveId: string | null
  progress: number
}

function buildMockTx(initial: {
  keyResults?: MockKeyResult[]
  milestones?: MockMilestone[]
  objectives?: MockObjective[]
}): DbLike {
  const krs = new Map(initial.keyResults?.map((k) => [k.id, k]))
  const milestones = new Map(initial.milestones?.map((m) => [m.id, m]))
  const objectives = new Map(initial.objectives?.map((o) => [o.id, o]))

  const tx = {
    keyResult: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        return krs.get(where.id) ?? null
      },
      findMany: async () => {
        return Array.from(krs.values())
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<MockKeyResult> }) => {
        const existing = krs.get(where.id)
        if (!existing) throw new Error('KR not found')
        const updated = { ...existing, ...data }
        krs.set(where.id, updated)
        return updated
      },
    },
    milestone: {
      findMany: async ({ where }: { where: { keyResultId: string } }) => {
        return Array.from(milestones.values()).filter((m) => m.keyResultId === where.keyResultId)
      },
    },
    objective: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        return objectives.get(where.id) ?? null
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<MockObjective> }) => {
        const existing = objectives.get(where.id)
        if (!existing) throw new Error('Objective not found')
        const updated = { ...existing, ...data }
        objectives.set(where.id, updated)
        return updated
      },
      findMany: async () => {
        return Array.from(objectives.values())
      },
    },
  } as unknown as DbLike

  // Attach mutable state so tests can inspect it.
  ;(tx as any).__state = { krs, milestones, objectives }
  return tx
}

test('recalcKrFromMilestones: weighted percent maps to currentValue on 0-100 KR', async () => {
  const tx = buildMockTx({
    keyResults: [{ id: 'kr1', objectiveId: 'obj1', startValue: 0, targetValue: 100, currentValue: 0, progress: 0 }],
    milestones: [
      { id: 'm1', keyResultId: 'kr1', percentComplete: 100, weight: 2 },
      { id: 'm2', keyResultId: 'kr1', percentComplete: 0, weight: 1 },
    ],
  })

  const value = await recalcKrFromMilestones(tx, 'kr1')
  assert.equal(value, 66.7)
  const kr = (tx as any).__state.krs.get('kr1')
  assert.equal(kr.currentValue, 66.7)
  assert.equal(kr.progress, 67)
})

test('recalcKrFromMilestones: maps percent onto non-percent KR unit span', async () => {
  const tx = buildMockTx({
    keyResults: [{ id: 'kr1', objectiveId: 'obj1', startValue: 0, targetValue: 5, currentValue: 0, progress: 0 }],
    milestones: [
      { id: 'm1', keyResultId: 'kr1', percentComplete: 50, weight: 1 },
    ],
  })

  await recalcKrFromMilestones(tx, 'kr1')
  const kr = (tx as any).__state.krs.get('kr1')
  assert.equal(kr.currentValue, 2.5)
  assert.equal(kr.progress, 50)
})

test('recalcKrFromMilestones: clamps to targetValue when milestones over-complete', async () => {
  const tx = buildMockTx({
    keyResults: [{ id: 'kr1', objectiveId: 'obj1', startValue: 0, targetValue: 100, currentValue: 0, progress: 0 }],
    milestones: [{ id: 'm1', keyResultId: 'kr1', percentComplete: 110, weight: 1 }],
  })

  await recalcKrFromMilestones(tx, 'kr1')
  const kr = (tx as any).__state.krs.get('kr1')
  assert.equal(kr.currentValue, 100)
  assert.equal(kr.progress, 100)
})

test('recalcKrFromMilestones: no linked milestones leaves KR unchanged', async () => {
  const tx = buildMockTx({
    keyResults: [{ id: 'kr1', objectiveId: 'obj1', startValue: 0, targetValue: 100, currentValue: 42, progress: 42 }],
    milestones: [],
  })

  const value = await recalcKrFromMilestones(tx, 'kr1')
  assert.equal(value, 42)
  const kr = (tx as any).__state.krs.get('kr1')
  assert.equal(kr.currentValue, 42)
  assert.equal(kr.progress, 42)
})

test('recalcKrFromMilestones: returns null for missing KR', async () => {
  const tx = buildMockTx({ keyResults: [], milestones: [] })
  const value = await recalcKrFromMilestones(tx, 'missing')
  assert.equal(value, null)
})

test('recalcKrsAndAncestors: recomputes KRs and rolls up objective progress', async () => {
  const tx = buildMockTx({
    keyResults: [
      { id: 'kr1', objectiveId: 'obj1', startValue: 0, targetValue: 100, currentValue: 0, progress: 0 },
      { id: 'kr2', objectiveId: 'obj1', startValue: 0, targetValue: 100, currentValue: 0, progress: 0 },
    ],
    milestones: [
      { id: 'm1', keyResultId: 'kr1', percentComplete: 100, weight: 1 },
      { id: 'm2', keyResultId: 'kr2', percentComplete: 0, weight: 1 },
    ],
    objectives: [
      { id: 'obj1', parentObjectiveId: 'obj2', progress: 0 },
      { id: 'obj2', parentObjectiveId: null, progress: 0 },
    ],
  })

  await recalcKrsAndAncestors(tx, ['kr1', 'kr2'])

  const state = (tx as any).__state
  assert.equal(state.krs.get('kr1').progress, 100)
  assert.equal(state.krs.get('kr2').progress, 0)
  // obj1 average of 100 and 0 → 50; obj2 inherits obj1 progress (single child).
  assert.equal(state.objectives.get('obj1').progress, 50)
  assert.equal(state.objectives.get('obj2').progress, 50)
})
