import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { checkCronAuth, presentedCronToken, safeEqual, MIN_SECRET_LENGTH, verifyCronRequest } from '../cron-auth'

/**
 * Cron authentication (lib/cron-auth.ts) and the invariant that every
 * app/api/cron route goes through it.
 *
 * Before 2026-09-25, 14 of 28 cron routes skipped auth entirely when
 * CRON_SECRET was unset, permission-cleanup accepted a literal
 * `Bearer undefined`, and every route accepted the secret in `?key=`.
 */

const ROOT = join(__dirname, '..', '..')
const SECRET = 'a'.repeat(MIN_SECRET_LENGTH) + '-cron-secret'

function headers(init: Record<string, string | undefined>) {
  const clean: Record<string, string> = {}
  for (const [k, v] of Object.entries(init)) if (v !== undefined) clean[k] = v
  return new Headers(clean)
}

test('fails closed when CRON_SECRET is unset (503), even for an empty or "undefined" bearer', () => {
  for (const h of [{}, { authorization: 'Bearer ' }, { authorization: 'Bearer undefined' }, { 'x-cron-secret': 'undefined' }]) {
    const r = checkCronAuth(headers(h), undefined)
    assert.equal(r.ok, false)
    if (!r.ok) {
      assert.equal(r.status, 503)
      assert.equal(r.code, 'CRON_NOT_CONFIGURED')
    }
  }
  const empty = checkCronAuth(headers({ authorization: 'Bearer ' }), '')
  assert.equal(empty.ok, false)
})

test('a secret shorter than the minimum is treated as unset', () => {
  const short = 'short-secret'
  assert.ok(short.length < MIN_SECRET_LENGTH)
  const r = checkCronAuth(headers({ authorization: `Bearer ${short}` }), short)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.status, 503)
})

test('accepts the secret as a Bearer header or x-cron-secret header', () => {
  assert.deepEqual(checkCronAuth(headers({ authorization: `Bearer ${SECRET}` }), SECRET), { ok: true })
  assert.deepEqual(checkCronAuth(headers({ authorization: `bearer   ${SECRET}` }), SECRET), { ok: true })
  assert.deepEqual(checkCronAuth(headers({ 'x-cron-secret': SECRET }), SECRET), { ok: true })
})

test('rejects a wrong, missing, or literal-undefined token with 401', () => {
  for (const h of [
    {},
    { authorization: `Bearer ${SECRET}x` },
    { authorization: SECRET }, // no Bearer scheme
    { authorization: 'Bearer undefined' },
    { authorization: 'Basic ' + SECRET },
    { 'x-cron-secret': SECRET.slice(0, -1) },
  ]) {
    const r = checkCronAuth(headers(h), SECRET)
    assert.equal(r.ok, false, JSON.stringify(h))
    if (!r.ok) assert.equal(r.status, 401)
  }
})

test('never reads the secret from the ?key= query parameter', async () => {
  const req = new Request(`http://localhost/api/cron/sprint-tick?key=${SECRET}`)
  const prev = process.env.CRON_SECRET
  process.env.CRON_SECRET = SECRET
  const origWarn = console.warn
  console.warn = () => {}
  try {
    const res = verifyCronRequest(req)
    assert.ok(res, 'a ?key= request must be refused')
    assert.equal(res!.status, 401)
    const body = await res!.json()
    assert.equal(body.success, false)
    assert.equal(body.code, 'UNAUTHORIZED')

    const ok = verifyCronRequest(new Request('http://localhost/api/cron/sprint-tick', { headers: { authorization: `Bearer ${SECRET}` } }))
    assert.equal(ok, null)
  } finally {
    console.warn = origWarn
    if (prev === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = prev
  }
})

test('presentedCronToken only looks at headers', () => {
  assert.equal(presentedCronToken(headers({})), null)
  assert.equal(presentedCronToken(headers({ authorization: 'Bearer abc' })), 'abc')
  assert.equal(presentedCronToken(headers({ 'x-cron-secret': ' abc ' })), 'abc')
})

test('safeEqual compares by value, independent of length', () => {
  assert.equal(safeEqual('abc', 'abc'), true)
  assert.equal(safeEqual('abc', 'abcd'), false)
  assert.equal(safeEqual('', 'a'), false)
})

// ── Source invariants ───────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry === 'route.ts') out.push(full)
  }
  return out
}

const CRON_ROUTES = walk(join(ROOT, 'app', 'api', 'cron')).map((f) => relative(ROOT, f).split(sep).join('/'))

test('every app/api/cron route authenticates through lib/cron-auth', () => {
  assert.ok(CRON_ROUTES.length >= 28, `expected the cron surface, found ${CRON_ROUTES.length} routes`)
  const offenders: string[] = []
  for (const route of CRON_ROUTES) {
    const src = readFileSync(join(ROOT, route), 'utf8')
    const usesHelper = /from '@\/lib\/cron-auth'/.test(src) && /(withCronAuth|verifyCronRequest)\(/.test(src)
    // Every exported HTTP handler must be the wrapped one (or an alias of it).
    const unwrappedHandler = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/.test(src)
    if (!usesHelper || unwrappedHandler) offenders.push(route)
  }
  assert.deepEqual(offenders, [], `cron routes not using withCronAuth/verifyCronRequest:\n${offenders.join('\n')}`)
})

test('no cron route reads CRON_SECRET or a ?key= parameter itself', () => {
  const offenders: string[] = []
  for (const route of CRON_ROUTES) {
    const src = readFileSync(join(ROOT, route), 'utf8')
    if (/process\.env\.CRON_SECRET/.test(src) || /searchParams\.get\(\s*['"]key['"]\s*\)/.test(src)) offenders.push(route)
  }
  assert.deepEqual(offenders, [], `cron routes with their own secret check:\n${offenders.join('\n')}`)
})

test('install-crontab.sh sends the secret as a header, never as ?key=', () => {
  const script = readFileSync(join(ROOT, 'scripts', 'install-crontab.sh'), 'utf8')
  assert.match(script, /-H \\"Authorization: Bearer \\\$CRON_SECRET\\"/)
  const addLines = script.split('\n').filter((l) => /^add\s/.test(l))
  assert.ok(addLines.length > 10)
  for (const line of addLines) assert.doesNotMatch(line, /[?&]key=/, line)
})
