import test from 'node:test'
import assert from 'node:assert/strict'

// Point Prisma at a port nothing listens on BEFORE anything imports it, so the
// dispatcher test below can prove a real delivery failure is logged — and so
// no test in this file can ever write to a real database. Prisma does not let
// .env override an already-set variable.
process.env.DATABASE_URL = 'postgresql://nobody:nothing@127.0.0.1:1/none?connect_timeout=2'

import {
  createEmitter, createKeyedSerializer, createLimiter, mapWithConcurrency,
} from './fanout'
import {
  flushBackgroundWork, pendingBackgroundWork, runAfterResponse, setBackgroundScheduler,
} from '@/lib/background'

/**
 * PERF-2 — notification fan-out must not run inside the caller's request.
 * These pin the contract: emit() resolves once recipients are planned, before
 * delivery starts; delivery failures are logged, never thrown; emitNow() waits.
 */

/** A scheduler that queues jobs until the test releases them. */
function fakeScheduler() {
  const jobs: Array<{ label: string; work: () => Promise<unknown> }> = []
  return {
    jobs,
    schedule: (label: string, work: () => Promise<unknown>) => { jobs.push({ label, work }) },
    async runAll() {
      while (jobs.length) await jobs.shift()!.work()
    },
  }
}

function deferred<T = void>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

test('emit resolves after planning and before delivery runs', async () => {
  const sched = fakeScheduler()
  const delivered: string[] = []
  const e = createEmitter<[string], string>({
    name: 't',
    plan: async (x) => `planned:${x}`,
    deliver: async (p) => { delivered.push(p) },
    schedule: sched.schedule,
    limiter: createLimiter(2),
  })

  await e.emit('a')
  assert.equal(sched.jobs.length, 1, 'delivery was scheduled')
  assert.deepEqual(delivered, [], 'but has not run by the time emit resolved')

  await sched.runAll()
  assert.deepEqual(delivered, ['planned:a'])
})

test('emit does not wait for a slow delivery even with the real scheduler', async () => {
  const gate = deferred()
  let finished = false
  const e = createEmitter<[], number>({
    name: 't',
    plan: async () => 1,
    deliver: async () => { await gate.promise; finished = true },
    limiter: createLimiter(1),
  })
  await e.emit()
  assert.equal(finished, false)
  assert.ok(pendingBackgroundWork() >= 1, 'the delivery is tracked as background work')
  gate.resolve()
  const r = await flushBackgroundWork(2_000)
  assert.equal(r.drained, true)
  assert.equal(finished, true)
})

test('a delivery error is logged, never thrown or left as an unhandled rejection', async () => {
  const sched = fakeScheduler()
  const logged: unknown[][] = []
  const e = createEmitter<[], number>({
    name: 't',
    plan: async () => 1,
    deliver: async () => { throw new Error('smtp down') },
    schedule: sched.schedule,
    limiter: createLimiter(1),
    log: (...a) => { logged.push(a) },
  })
  await e.emit()
  await assert.doesNotReject(sched.runAll())
  assert.equal(logged.length, 1)
  assert.match(String(logged[0][0]), /delivery failed/)
  assert.match(String((logged[0][2] as Error).message), /smtp down/)
})

test('a planning error is logged and nothing is scheduled', async () => {
  const sched = fakeScheduler()
  const logged: unknown[][] = []
  const e = createEmitter<[], number>({
    name: 't',
    plan: async () => { throw new Error('db gone') },
    deliver: async () => { assert.fail('must not deliver') },
    schedule: sched.schedule,
    limiter: createLimiter(1),
    log: (...a) => { logged.push(a) },
  })
  await assert.doesNotReject(e.emit())
  assert.equal(sched.jobs.length, 0)
  assert.match(String(logged[0][0]), /plan failed/)
})

test('a null plan (no recipients) schedules nothing', async () => {
  const sched = fakeScheduler()
  const e = createEmitter<[], number>({
    name: 't', plan: async () => null, deliver: async () => {}, schedule: sched.schedule, limiter: createLimiter(1),
  })
  await e.emit()
  assert.equal(sched.jobs.length, 0)
})

test('emitNow awaits delivery and still swallows its errors', async () => {
  const sched = fakeScheduler()
  const delivered: number[] = []
  const logged: unknown[][] = []
  const e = createEmitter<[number], number>({
    name: 't',
    plan: async (n) => n,
    deliver: async (n) => { if (n < 0) throw new Error('boom'); delivered.push(n) },
    schedule: sched.schedule,
    limiter: createLimiter(1),
    log: (...a) => { logged.push(a) },
  })
  await e.emitNow(7)
  assert.deepEqual(delivered, [7])
  assert.equal(sched.jobs.length, 0, 'emitNow never goes through the scheduler')
  await assert.doesNotReject(e.emitNow(-1))
  assert.equal(logged.length, 1)
})

test('deliveries sharing a key run in order; different keys overlap', async () => {
  const order: string[] = []
  const slow = deferred()
  const e = createEmitter<[string, string], { key: string; id: string }>({
    name: 't',
    plan: async (key, id) => ({ key, id }),
    deliver: async ({ id }) => {
      order.push(`start:${id}`)
      if (id === 'a1') await slow.promise
      order.push(`end:${id}`)
    },
    keyOf: (p) => p.key,
    limiter: createLimiter(4),
    schedule: (_l, work) => { void work() },
  })
  await e.emit('A', 'a1')
  await e.emit('A', 'a2')
  await e.emit('B', 'b1')
  await new Promise((r) => setImmediate(r))
  assert.ok(order.includes('end:b1'), 'another key is not blocked')
  assert.ok(!order.includes('start:a2'), 'same key waits for the earlier delivery')
  slow.resolve()
  await new Promise((r) => setImmediate(r))
  await new Promise((r) => setImmediate(r))
  assert.ok(order.indexOf('end:a1') < order.indexOf('start:a2'))
})

test('keyed serializer keeps going after a failed task', async () => {
  const serialize = createKeyedSerializer()
  await assert.rejects(serialize('k', async () => { throw new Error('x') }))
  assert.equal(await serialize('k', async () => 42), 42)
})

test('mapWithConcurrency bounds in-flight work and settles every item', async () => {
  let inFlight = 0
  let peak = 0
  const items = Array.from({ length: 12 }, (_, i) => i)
  const results = await mapWithConcurrency(items, 5, async (i) => {
    inFlight++
    peak = Math.max(peak, inFlight)
    await new Promise((r) => setTimeout(r, 2))
    inFlight--
    if (i === 3) throw new Error('recipient 3 failed')
    return i * 2
  })
  assert.equal(peak, 5)
  assert.equal(results.length, 12)
  assert.equal(results[3].status, 'rejected')
  assert.deepEqual(results.filter((r) => r.status === 'fulfilled').length, 11)
  assert.deepEqual(await mapWithConcurrency([], 5, async () => 1), [])
})

test('createLimiter never runs more than max tasks at once', async () => {
  const limit = createLimiter(2)
  let inFlight = 0
  let peak = 0
  await Promise.all(Array.from({ length: 7 }, () => limit(async () => {
    inFlight++
    peak = Math.max(peak, inFlight)
    await new Promise((r) => setTimeout(r, 2))
    inFlight--
  })))
  assert.equal(peak, 2)
  assert.equal(limit.active, 0)
})

test('runAfterResponse defers work and logs a synchronous throw', async () => {
  const jobs: Array<() => void> = []
  const restore = setBackgroundScheduler((run) => { jobs.push(run) })
  const origError = console.error
  const logged: unknown[][] = []
  console.error = (...a: unknown[]) => { logged.push(a) }
  try {
    let ran = false
    runAfterResponse('ok', async () => { ran = true })
    runAfterResponse('sync-throw', (() => { throw new Error('sync') }) as () => Promise<unknown>)
    assert.equal(ran, false, 'nothing runs until the scheduler fires')
    assert.equal(pendingBackgroundWork(), 2)
    for (const j of jobs.splice(0)) j()
    const r = await flushBackgroundWork(1_000)
    assert.equal(r.drained, true)
    assert.equal(ran, true)
    assert.equal(logged.length, 1)
    assert.match(String(logged[0][0]), /\[background:sync-throw\]/)
  } finally {
    console.error = origError
    restore()
  }
})

test('dispatcher emit() returns before delivery; a failing delivery is logged', async () => {
  const jobs: Array<() => void> = []
  const restore = setBackgroundScheduler((run) => { jobs.push(run) })
  const origError = console.error
  const logged: unknown[][] = []
  console.error = (...a: unknown[]) => { logged.push(a) }
  try {
    const { emit } = await import('./dispatcher')
    // USER_MENTIONED with explicit recipients and a non-private entity plans
    // without touching the database; delivery then needs it and fails.
    await emit('USER_MENTIONED', {
      entityType: 'TODO', entityId: 'todo_1', entityTitle: 't',
      explicitRecipients: ['usr_1'], actorId: 'usr_2',
    })
    assert.equal(jobs.length, 1, 'delivery was scheduled, not run')
    assert.equal(logged.length, 0)

    for (const j of jobs.splice(0)) j()
    const r = await flushBackgroundWork(20_000)
    assert.equal(r.drained, true)
    assert.ok(
      logged.some((a) => /\[notifications\] delivery failed/.test(String(a[0]))),
      'the DB failure was logged by the emitter',
    )
  } finally {
    console.error = origError
    restore()
    const { prisma } = await import('@/lib/prisma')
    await prisma.$disconnect().catch(() => {})
  }
})
