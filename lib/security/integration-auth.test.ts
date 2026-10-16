import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkIntegrationKey, MIN_INTEGRATION_KEY_LENGTH } from '../integration-auth'

const KEY = 'k'.repeat(MIN_INTEGRATION_KEY_LENGTH)

function headers(values: Record<string, string>) {
  const map = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]))
  return { get: (name: string) => map.get(name.toLowerCase()) ?? null }
}

test('integration key: unset or short key fails closed with 503', () => {
  for (const key of [undefined, '', 'short']) {
    const r = checkIntegrationKey(headers({ 'x-integration-key': 'anything' }), key)
    assert.deepEqual(r.ok ? null : [r.status, r.code], [503, 'INTEGRATION_NOT_CONFIGURED'])
  }
})

test('integration key: missing or wrong header → 401; correct header → ok', () => {
  const missing = checkIntegrationKey(headers({}), KEY)
  assert.equal(missing.ok ? 0 : missing.status, 401)
  const wrong = checkIntegrationKey(headers({ 'x-integration-key': `${KEY}x` }), KEY)
  assert.equal(wrong.ok ? 0 : wrong.status, 401)
  // Bearer / other headers are not accepted.
  const bearer = checkIntegrationKey(headers({ authorization: `Bearer ${KEY}` }), KEY)
  assert.equal(bearer.ok ? 0 : bearer.status, 401)
  assert.deepEqual(checkIntegrationKey(headers({ 'x-integration-key': KEY }), KEY), { ok: true })
})

test('integration key: never read from the query string', () => {
  const src = readFileSync(join(__dirname, '..', 'integration-auth.ts'), 'utf8')
  assert.doesNotMatch(src, /searchParams/)
})

test('the sales-targets route is GET-only and guarded by withIntegrationKey', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'app', 'api', 'integrations', 'odoo', 'sales-targets', 'route.ts'), 'utf8')
  assert.match(src, /export const GET = withIntegrationKey\(/)
  assert.doesNotMatch(src, /export const (POST|PUT|PATCH|DELETE)/)
  assert.doesNotMatch(src, /console\.(log|info|warn|error)/)
})
