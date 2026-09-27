import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildKrForCalc,
  computeKrConfidence,
  currentPeriodStart,
  ENDED_GRACE_DAYS,
  inScopeKrWhere,
  worstOfConfidences,
  type KrForCalc,
} from './confidence-calc'

const NOW = new Date('2026-09-25T12:00:00Z')
const DAY = 86400_000
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY)

function baseKr(overrides: Partial<KrForCalc> = {}): KrForCalc {
  return {
    id: 'kr1',
    title: 'Ship it',
    startValue: 0,
    targetValue: 100,
    currentValue: 40,
    progress: 40,
    confidence: 'ON_TRACK',
    ownerId: 'u1',
    objectiveId: 'o1',
    createdAt: daysAgo(80),
    objective: {
      id: 'o1',
      title: 'Obj',
      ownerId: 'u1',
      startDate: null,
      endDate: null,
      departmentId: null,
      timeframe: { startDate: new Date('2026-07-01T00:00:00Z'), endDate: new Date('2026-09-30T23:59:59Z') },
    },
    todos: [],
    checkIns: [],
    ...overrides,
  }
}

/**
 * The old cron loaded `todos` + the newest 30 check-ins per KR. The batched path
 * loads todo counts, in-window check-ins and the latest check-in date. Simulate
 * both from the same raw data and require identical scores.
 */
function viaOldShape(kr: KrForCalc, todos: { status: string }[], allCheckIns: { asOfDate: Date; value: number }[]) {
  const newest30 = [...allCheckIns].sort((a, b) => b.asOfDate.getTime() - a.asOfDate.getTime()).slice(0, 30)
  return computeKrConfidence({ ...kr, todos, checkIns: newest30 }, NOW)
}

function viaBatchedShape(kr: KrForCalc, todos: { status: string }[], allCheckIns: { asOfDate: Date; value: number }[]) {
  const windowStart = NOW.getTime() - 14 * DAY
  const recent = allCheckIns
    .filter((c) => c.asOfDate.getTime() >= windowStart)
    .sort((a, b) => b.asOfDate.getTime() - a.asOfDate.getTime())
  const last = allCheckIns.length
    ? new Date(Math.max(...allCheckIns.map((c) => c.asOfDate.getTime())))
    : null
  const stats = { total: todos.length, completed: todos.filter((t) => t.status === 'COMPLETED').length }
  return computeKrConfidence(buildKrForCalc({ ...kr, todos: undefined }, stats, recent, last), NOW)
}

test('batched scoring input matches the legacy include shape across varied data', () => {
  let seed = 7
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31
    return seed / 2 ** 31
  }
  const statuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
  for (let i = 0; i < 300; i++) {
    const todos = Array.from({ length: Math.floor(rand() * 8) }, () => ({ status: statuses[Math.floor(rand() * 4)] }))
    // Mix of: no check-ins, only old ones, only recent ones, >30 recent ones.
    const n = Math.floor(rand() * 45)
    const spreadDays = rand() < 0.3 ? 60 : rand() < 0.5 ? 13 : 120
    const offset = rand() < 0.2 ? 20 : 0
    const checkIns = Array.from({ length: n }, () => ({
      asOfDate: daysAgo(offset + rand() * spreadDays),
      value: Math.round(rand() * 100),
    }))
    const kr = baseKr({ currentValue: Math.round(rand() * 100) })
    assert.deepEqual(viaBatchedShape(kr, todos, checkIns), viaOldShape(kr, todos, checkIns), `case ${i}`)
  }
})

test('no check-ins at all → moderate staleness penalty, initiative default 50', () => {
  const r = computeKrConfidence(buildKrForCalc(baseKr(), { total: 0, completed: 0 }, [], null), NOW)
  assert.equal(r.factors.daysSinceLastCheckIn, null)
  assert.equal(r.factors.stalenessPenalty, 10)
  assert.equal(r.factors.initiativeCompletionPct, 50)
})

test('only an old check-in: staleness uses it, velocity stays 0', () => {
  const r = computeKrConfidence(buildKrForCalc(baseKr(), { total: 2, completed: 1 }, [], daysAgo(30)), NOW)
  assert.equal(r.factors.daysSinceLastCheckIn, 30)
  assert.equal(r.factors.stalenessPenalty, 20)
  assert.equal(r.factors.velocity, 0)
  assert.equal(r.factors.initiativeCompletionPct, 50)
})

test('todoStats and todos arrays score identically', () => {
  const todos = [{ status: 'COMPLETED' }, { status: 'COMPLETED' }, { status: 'PENDING' }]
  const a = computeKrConfidence(baseKr({ todos }), NOW)
  const b = computeKrConfidence(baseKr({ todos: undefined, todoStats: { total: 3, completed: 2 } }), NOW)
  assert.deepEqual(a, b)
})

test('100% progress is always ON_TRACK with score 100', () => {
  const r = computeKrConfidence(baseKr({ currentValue: 100 }), NOW)
  assert.equal(r.score, 100)
  assert.equal(r.confidence, 'ON_TRACK')
})

test('worstOfConfidences', () => {
  assert.equal(worstOfConfidences([]), 'ON_TRACK')
  assert.equal(worstOfConfidences(['ON_TRACK', 'AT_RISK']), 'AT_RISK')
  assert.equal(worstOfConfidences(['AT_RISK', 'OFF_TRACK', 'ON_TRACK']), 'OFF_TRACK')
})

test('inScopeKrWhere keeps not-yet-ended objectives with a grace window', () => {
  const where = inScopeKrWhere(NOW) as {
    status: string
    objective: { OR: Array<Record<string, unknown>> }
  }
  assert.equal(where.status, 'ACTIVE')
  const cutoff = new Date(NOW.getTime() - ENDED_GRACE_DAYS * DAY)
  assert.deepEqual(where.objective.OR, [
    { endDate: { gte: cutoff } },
    { endDate: null, timeframe: { endDate: { gte: cutoff } } },
  ])
})

test('currentPeriodStart splits the month at the 15th', () => {
  assert.equal(currentPeriodStart(new Date(2026, 8, 3, 12)).slice(8), currentPeriodStart(new Date(2026, 8, 14, 12)).slice(8))
  assert.notEqual(currentPeriodStart(new Date(2026, 8, 14, 12)), currentPeriodStart(new Date(2026, 8, 15, 12)))
})
