import test from 'node:test'
import assert from 'node:assert/strict'
import { TtlLruCache } from './cache'

/** LPV-8 — server cache. */

test('entries expire after their TTL', () => {
  let now = 1000
  const c = new TtlLruCache<string>(10, () => now)
  c.set('a', 'A', 100)
  assert.equal(c.get('a'), 'A')
  now += 100
  assert.equal(c.get('a'), undefined)
})

test('evicts the least-recently-used entry beyond capacity', () => {
  const c = new TtlLruCache<number>(2)
  c.set('a', 1, 1e6)
  c.set('b', 2, 1e6)
  c.get('a') // a is now most recent
  c.set('c', 3, 1e6)
  assert.equal(c.get('b'), undefined)
  assert.equal(c.get('a'), 1)
  assert.equal(c.get('c'), 3)
  assert.equal(c.size, 2)
})

test('concurrent loads for one key share one request, with TTL chosen per value', async () => {
  let now = 0
  const c = new TtlLruCache<{ ok: boolean }>(10, () => now)
  let calls = 0
  const load = async () => {
    calls++
    await new Promise((r) => setTimeout(r, 5))
    return { ok: false }
  }
  const ttl = (v: { ok: boolean }) => (v.ok ? 1000 : 10)
  const [x, y] = await Promise.all([c.getOrLoad('u', load, ttl), c.getOrLoad('u', load, ttl)])
  assert.equal(calls, 1)
  assert.equal(x, y)
  await c.getOrLoad('u', load, ttl)
  assert.equal(calls, 1, 'served from cache')
  now = 10
  await c.getOrLoad('u', load, ttl)
  assert.equal(calls, 2, 'failure TTL elapsed')
})

test('a rejected load is not cached', async () => {
  const c = new TtlLruCache<number>(10)
  await assert.rejects(c.getOrLoad('k', () => Promise.reject(new Error('boom')), () => 1000))
  assert.equal(await c.getOrLoad('k', () => Promise.resolve(7), () => 1000), 7)
})
