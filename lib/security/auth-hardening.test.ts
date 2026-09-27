import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  AUTH_RATE_LIMITS,
  clientIp,
  hitRateLimit,
  peekRateLimit,
  rateLimitedResponse,
  resetRateLimits,
} from './rate-limit'
import {
  HASHED_TOKEN_PREFIX,
  authTimeFromClaims,
  authTokenLookupValues,
  generateAuthToken,
  hashAuthToken,
  isAuthTimeStale,
} from './auth-tokens'
import { registerSchema, signUpFormSchema } from '../../features/auth/services/signup-schema'

/**
 * Auth hardening (remediation 2026-09-25, agent S1): self-registration role
 * escalation, passwordless "demo" login, predictable reset tokens, sessions that
 * survive a password change, missing rate limits, forgot-password enumeration.
 * Behaviour tests for the pure helpers + source invariants for the routes.
 */

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

// ── rate limiter ────────────────────────────────────────────────────────────

test('rate-limit: allows up to the limit, then blocks with a retry-after', () => {
  resetRateLimits()
  const rule = { limit: 3, windowMs: 1000 }
  const t0 = 1_000_000
  assert.equal(hitRateLimit('k', rule, t0).allowed, true)
  assert.equal(hitRateLimit('k', rule, t0 + 10).allowed, true)
  const third = hitRateLimit('k', rule, t0 + 20)
  assert.equal(third.allowed, true)
  assert.equal(third.remaining, 0)
  const blocked = hitRateLimit('k', rule, t0 + 30)
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.retryAfterMs, 970) // oldest hit (t0) leaves at t0+1000
  // A blocked hit is not recorded, so the window still slides from t0.
  assert.equal(hitRateLimit('k', rule, t0 + 1001).allowed, true)
})

test('rate-limit: the window slides and keys are independent', () => {
  resetRateLimits()
  const rule = { limit: 1, windowMs: 500 }
  assert.equal(hitRateLimit('a', rule, 0).allowed, true)
  assert.equal(hitRateLimit('a', rule, 499).allowed, false)
  assert.equal(hitRateLimit('b', rule, 499).allowed, true)
  assert.equal(hitRateLimit('a', rule, 501).allowed, true)
})

test('rate-limit: peek does not consume', () => {
  resetRateLimits()
  const rule = { limit: 1, windowMs: 1000 }
  for (let i = 0; i < 5; i++) assert.equal(peekRateLimit('p', rule, i).allowed, true)
  hitRateLimit('p', rule, 10)
  assert.equal(peekRateLimit('p', rule, 11).allowed, false)
})

test('rate-limit: 429 uses the standard envelope and Retry-After', async () => {
  const res = rateLimitedResponse({ retryAfterMs: 1500 })
  assert.equal(res.status, 429)
  assert.equal(res.headers.get('Retry-After'), '2')
  const body = await res.json()
  assert.equal(body.success, false)
  assert.equal(body.code, 'RATE_LIMITED')
  assert.equal(typeof body.error, 'string')
})

test('rate-limit: client IP from x-forwarded-for first hop, then x-real-ip', () => {
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })), '203.0.113.7')
  assert.equal(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' })), '198.51.100.2')
  assert.equal(clientIp({ 'x-forwarded-for': '192.0.2.1' }), '192.0.2.1') // NextAuth req.headers record
  assert.equal(clientIp(new Headers()), 'unknown')
  assert.equal(clientIp(undefined), 'unknown')
})

test('rate-limit: auth limits are sane', () => {
  for (const [name, rule] of Object.entries(AUTH_RATE_LIMITS)) {
    assert.ok(rule.limit >= 3 && rule.limit <= 50, `${name} limit ${rule.limit}`)
    assert.ok(rule.windowMs >= 60_000, `${name} window too short`)
  }
})

// ── tokens & session epoch ──────────────────────────────────────────────────

test('tokens: CSPRNG hex, 256 bits, unique', () => {
  const a = generateAuthToken()
  const b = generateAuthToken()
  assert.match(a, /^[0-9a-f]{64}$/)
  assert.notEqual(a, b)
})

test('tokens: only a prefixed hash is stored, and a stored hash is not a usable token', () => {
  const raw = generateAuthToken()
  const stored = hashAuthToken(raw)
  assert.ok(stored.startsWith(HASHED_TOKEN_PREFIX))
  assert.ok(!stored.includes(raw))
  assert.deepEqual(authTokenLookupValues(raw), [stored, raw]) // raw = legacy links still work
  assert.deepEqual(authTokenLookupValues(stored), [], 'a leaked DB value must not redeem')
  assert.deepEqual(authTokenLookupValues(''), [])
  assert.deepEqual(authTokenLookupValues('x'.repeat(300)), [])
})

test('session epoch: tokens minted before passwordChangedAt are stale', () => {
  const changed = new Date(1_700_000_000_000)
  assert.equal(isAuthTimeStale(changed.getTime() - 1, changed), true)
  assert.equal(isAuthTimeStale(changed.getTime(), changed), false) // re-minted at change time
  assert.equal(isAuthTimeStale(changed.getTime() + 1, changed), false)
  assert.equal(isAuthTimeStale(undefined, changed), true)
  assert.equal(isAuthTimeStale(undefined, null), false) // never changed → nothing to revoke
  assert.equal(authTimeFromClaims({ authTime: 5 }), 5)
  assert.equal(authTimeFromClaims({ iat: 7 }), 7000) // legacy tokens: iat seconds
  assert.equal(authTimeFromClaims({}), null)
})

// ── sign-up contract ────────────────────────────────────────────────────────

test('register schema: strips role, normalises email, enforces lengths', () => {
  const ok = registerSchema.safeParse({ name: ' Jane ', email: ' Jane@Example.COM ', password: 'longenough', role: 'ADMIN' })
  assert.ok(ok.success)
  assert.equal(ok.data.email, 'jane@example.com')
  assert.equal(ok.data.name, 'Jane')
  assert.ok(!('role' in ok.data), 'role must never pass through the sign-up schema')
  assert.equal(registerSchema.safeParse({ name: 'J', email: 'nope', password: 'longenough' }).success, false)
  assert.equal(registerSchema.safeParse({ name: 'J', email: 'j@x.io', password: 'short' }).success, false)
  assert.equal(registerSchema.safeParse({ name: '', email: 'j@x.io', password: 'longenough' }).success, false)
  assert.equal(
    signUpFormSchema.safeParse({ name: 'J', email: 'j@x.io', password: 'longenough', confirmPassword: 'different' }).success,
    false,
  )
})

// ── source invariants ───────────────────────────────────────────────────────

test('register: body role is ignored, accounts are EMPLOYEE, pending activation, rate-limited', () => {
  const src = read('app/api/auth/register/route.ts')
  assert.doesNotMatch(src, /\brole\b[^\n]*=\s*await request\.json\(\)|as UserRole/, 'register must not read role from the body')
  assert.match(src, /role: 'EMPLOYEE'/)
  assert.match(src, /registerSchema\.safeParse/)
  assert.match(src, /SIGNUP_REQUIRES_ACTIVATION = true/)
  assert.match(src, /isActive: !SIGNUP_REQUIRES_ACTIVATION/)
  assert.match(src, /hitRateLimit\(/)
  assert.doesNotMatch(src, /apiConflict/, 'an existing email must get the same answer as a new one')
})

test('signup UI: no role picker', () => {
  const form = read('features/auth/components/SignUpForm.tsx')
  const page = read('app/auth/signup/page.tsx')
  for (const src of [form, page]) {
    assert.doesNotMatch(src, /<select|ADMIN|DEPARTMENT_LEAD|EXECUTIVE/)
    assert.doesNotMatch(src, /role:/)
  }
})

test('login: no passwordless branch; both entry points share verifyCredentials', () => {
  const auth = read('lib/auth.ts')
  assert.doesNotMatch(auth, /allow login with any password|allow empty passwords/i)
  assert.match(auth, /if \(user\?\.password\)/)
  assert.match(auth, /await verifyCredentials\(/)
  const login = read('app/api/auth/login/route.ts')
  assert.match(login, /verifyCredentials\(/)
  assert.doesNotMatch(login, /bcrypt/, 'desktop login must not re-implement the password check')
  assert.match(login, /authTime:/)
})

test('sessions: authTime claim is stamped and checked against passwordChangedAt', () => {
  const auth = read('lib/auth.ts')
  assert.match(auth, /token\.authTime = Date\.now\(\)/)
  assert.equal((auth.match(/isAuthTimeStale\(/g) ?? []).length, 2, 'cookie AND bearer paths must check')
  assert.equal((auth.match(/passwordChangedAt: true/g) ?? []).length, 2)
  assert.match(read('prisma/schema.prisma'), /passwordChangedAt\s+DateTime\?/)
  for (const route of [
    'app/api/auth/change-password/route.ts',
    'app/api/auth/reset-password/route.ts',
    'app/api/users/[id]/reset-password/route.ts',
  ]) {
    assert.match(read(route), /passwordChangedAt: (new Date\(\)|changedAt)/, `${route} must bump passwordChangedAt`)
  }
})

test('tokens: invite/reset tokens never come from Math.random and are stored hashed', () => {
  for (const route of [
    'app/api/users/route.ts',
    'app/api/users/[id]/reset-password/route.ts',
    'app/api/auth/forgot-password/route.ts',
  ]) {
    const src = read(route)
    assert.doesNotMatch(src, /Math\.random/, route)
    assert.match(src, /activationToken: hashAuthToken\(/, `${route} must store the hash`)
  }
  assert.match(read('app/api/auth/reset-password/route.ts'), /authTokenLookupValues\(/)
})

test('forgot-password: lookup, write and email run after the response; rate-limited', () => {
  const src = read('app/api/auth/forgot-password/route.ts')
  assert.match(src, /runAfterResponse\('forgot-password'/)
  const handler = src.slice(src.indexOf('export async function POST'), src.indexOf('async function issueResetToken'))
  assert.doesNotMatch(handler, /prisma\./, 'no DB work on the request path (timing oracle)')
  assert.match(handler, /hitRateLimit\(/)
})

test('rate limiting is applied to every public auth entry point', () => {
  assert.match(read('lib/auth.ts'), /hitRateLimit\(`login:ip:/)
  for (const route of [
    'app/api/auth/register/route.ts',
    'app/api/auth/forgot-password/route.ts',
    'app/api/auth/reset-password/route.ts',
  ]) {
    assert.match(read(route), /rateLimitedResponse\(/, route)
  }
  assert.match(read('app/api/auth/login/route.ts'), /status: 429/)
})
