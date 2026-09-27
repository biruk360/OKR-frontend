import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createRateLimiter,
  isAskAllowed,
  parseAllowedChatIds,
  webhookSecretMatches,
} from '../telegram/access'

/**
 * Platform hardening from the 2026-09-25 audit (remediation plan, S6):
 * feature-permission wrappers fail closed, integration secrets are ADMIN-only
 * and masked, the Telegram bot is allowlisted + rate limited, and every page
 * ships security headers.
 */

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

// ── withFeature / withRoleOrFeature ─────────────────────────────────────────

test('withFeature and withRoleOrFeature deny when the permission lookup throws', () => {
  const src = read('lib/api/withAuth.ts')
  // Every catch block in the file must end in a denial or the shared error
  // handler — never in `return handler(req, ctx)`.
  const catches = src.match(/catch\s*(\([^)]*\))?\s*\{[\s\S]*?\n\s{4}\}/g) ?? []
  assert.ok(catches.length >= 2, 'expected the two permission-lookup catch blocks')
  for (const block of catches) {
    assert.doesNotMatch(block, /return handler\(/, `fail-open catch block:\n${block}`)
  }
  assert.match(src, /apiForbidden\('Unable to verify permissions'\)/)
})

// ── Integration credentials ─────────────────────────────────────────────────

test('integration settings are ADMIN-only and never returned unmasked', () => {
  const src = read('app/api/settings/integrations/route.ts')
  assert.match(src, /export const GET = withRole\('ADMIN'/)
  assert.match(src, /export const POST = withRole\('ADMIN'/)
  assert.doesNotMatch(src, /canAccessSettings/, 'canAccessSettings admits EXECUTIVE')
  // GET must go through mask(); a raw `.value` in the response is the old leak.
  assert.match(src, /data\[field\] = mask\(value\)/)
  assert.doesNotMatch(src, /emailApiKey:\s*emailApiKey\?\.value/)
  // POST ignores the masked placeholder.
  assert.match(src, /startsWith\(MASK_PREFIX\)/)
})

// ── Telegram ────────────────────────────────────────────────────────────────

test('webhook secret comparison is constant-time and fails on missing values', () => {
  assert.equal(webhookSecretMatches('s3cret-value', 's3cret-value'), true)
  assert.equal(webhookSecretMatches('s3cret-valuX', 's3cret-value'), false)
  assert.equal(webhookSecretMatches('s3cret', 's3cret-value'), false)
  assert.equal(webhookSecretMatches(null, 's3cret-value'), false)
  assert.equal(webhookSecretMatches('', ''), false)
  assert.equal(webhookSecretMatches('x', undefined), false)

  const route = read('app/api/telegram/webhook/route.ts')
  assert.match(route, /webhookSecretMatches\(got, expected\)/)
  assert.doesNotMatch(route, /got !== expected/)
})

test('TELEGRAM_ALLOWED_CHAT_IDS parsing keeps negative and >2^53 ids exactly', () => {
  const ids = parseAllowedChatIds(' -1001234567890123, 42 ;junk, 9007199254740993\n-5 ')
  assert.deepEqual([...ids].sort(), ['-1001234567890123', '-5', '42', '9007199254740993'].sort())
  assert.equal(parseAllowedChatIds(undefined).size, 0)
  assert.equal(parseAllowedChatIds('').size, 0)
})

test('/ask is fail-closed: no allowlist → nobody; DB flags only narrow it', () => {
  const allow = parseAllowedChatIds('-1001234567890123')
  assert.equal(isAskAllowed({ chatId: BigInt('-1001234567890123') }, new Set()), false)
  assert.equal(isAskAllowed({ chatId: BigInt('-1001234567890123') }, allow), true)
  assert.equal(isAskAllowed({ chatId: BigInt('-1001234567890124') }, allow), false)
  assert.equal(isAskAllowed({ chatId: BigInt('-1001234567890123'), askEnabled: false }, allow), false)
  assert.equal(isAskAllowed({ chatId: BigInt('-1001234567890123'), isActive: false }, allow), false)

  const route = read('app/api/telegram/webhook/route.ts')
  const askAt = route.indexOf("cmd === '/ask'")
  const gateAt = route.indexOf('isAskAllowed(', askAt)
  const limitAt = route.indexOf('checkAskRateLimit(', askAt)
  const answerAt = route.indexOf('answerAskCommand(', askAt)
  assert.ok(askAt > 0 && gateAt > askAt && limitAt > gateAt && answerAt > limitAt, 'allowlist and rate limit must run before the AI call')
})

test('rate limiter: sliding window, one "first denial" per window', () => {
  const rl = createRateLimiter({ limit: 2, windowMs: 1000 })
  assert.equal(rl.check('k', 0).allowed, true)
  assert.equal(rl.check('k', 100).allowed, true)
  const d1 = rl.check('k', 200)
  assert.equal(d1.allowed, false)
  assert.equal(d1.firstDenial, true)
  assert.equal(d1.retryAfterMs, 800)
  assert.equal(rl.check('k', 300).firstDenial, false)
  assert.equal(rl.check('other', 300).allowed, true, 'keys are independent')
  assert.equal(rl.check('k', 1001).allowed, true, 'oldest hit expired')
  assert.equal(rl.check('k', 2200).allowed, true)
})

// ── Security headers ────────────────────────────────────────────────────────

type HeaderRule = { source: string; headers: { key: string; value: string }[] }

async function loadHeaderRules(): Promise<HeaderRule[]> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const config = require(join(ROOT, 'next.config.js'))
  assert.equal(typeof config.headers, 'function', 'next.config.js must define headers()')
  return config.headers()
}

function headerMap(rule: HeaderRule) {
  return new Map(rule.headers.map((h) => [h.key.toLowerCase(), h.value]))
}

test('pages ship a CSP, frame denial, nosniff, referrer and permissions policy', async () => {
  const rules = await loadHeaderRules()
  const pages = rules.find((r) => r.source.includes('(?!api/)'))
  assert.ok(pages, 'expected a rule for non-API paths')
  const h = headerMap(pages!)
  const csp = h.get('content-security-policy') ?? ''
  for (const directive of [
    "default-src 'self'",
    "object-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ]) {
    assert.ok(csp.includes(directive), `CSP missing ${directive}`)
  }
  assert.match(csp, /connect-src [^;]*wss:\/\/\*\.pusher\.com/)
  assert.match(csp, /font-src [^;]*https:\/\/fonts\.gstatic\.com/)
  if (process.env.NODE_ENV !== 'development') {
    assert.doesNotMatch(csp, /unsafe-eval/, 'unsafe-eval is dev-only')
  }
  assert.equal(h.get('x-frame-options'), 'DENY')
  assert.equal(h.get('x-content-type-options'), 'nosniff')
  assert.equal(h.get('referrer-policy'), 'strict-origin-when-cross-origin')
  assert.ok(h.get('permissions-policy'))
})

test('API responses may be framed same-origin only (letter preview iframe)', async () => {
  const rules = await loadHeaderRules()
  const api = rules.find((r) => r.source.startsWith('/api/'))
  assert.ok(api)
  const h = headerMap(api!)
  assert.equal(h.get('x-frame-options'), 'SAMEORIGIN')
  assert.equal(h.get('x-content-type-options'), 'nosniff')
})

test('next/image has no wildcard remote host', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const config = require(join(ROOT, 'next.config.js'))
  const patterns: { hostname?: string }[] = config.images?.remotePatterns ?? []
  for (const p of patterns) assert.notEqual(p.hostname, '**')
})
