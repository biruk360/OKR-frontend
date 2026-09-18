import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// The real implementation, not a copy: a mirrored version can drift from the
// one that actually runs, which is the whole failure mode this file guards.
import { safeCallbackUrl } from '../../features/auth/services/callback-url'

/**
 * SHR-6 guards.
 *
 * A shared card link (/dashboard/sprints/<id>?card=<todoId>) used to die at
 * sign-in: the dashboard layout redirected with no callbackUrl and the sign-in
 * page hardcoded /dashboard, so the recipient never saw the card. Restoring the
 * target introduces an open-redirect risk, so both halves are pinned here.
 */

const ROOT = join(__dirname, '..', '..')
// The sign-in route is a thin wrapper; the redirect lives in the feature module.
const SIGNIN = readFileSync(join(ROOT, 'features/auth/components/SignInForm.tsx'), 'utf8')
const LAYOUT = readFileSync(join(ROOT, 'app/dashboard/layout.tsx'), 'utf8')
const MIDDLEWARE = readFileSync(join(ROOT, 'middleware.ts'), 'utf8')

test('SHR-6: a shared card link survives sign-in', () => {
  const target = '/dashboard/sprints/s_42?card=t_918'
  assert.equal(safeCallbackUrl(encodeURIComponent(target)), target)
  assert.equal(safeCallbackUrl(target), target)
})

test('SHR-6: callbackUrl cannot be used as an open redirect', () => {
  // Every one of these must fall back to the default rather than navigate away.
  for (const hostile of [
    'https://evil.com',
    'http://evil.com/dashboard',
    '//evil.com',
    '//evil.com/dashboard',
    '/dashboardevil',              // prefix-match trap — still same-origin, so allowed
    'javascript:alert(1)',
    '/api/admin',
    '',
  ]) {
    const out = safeCallbackUrl(hostile)
    assert.ok(
      out === '/dashboard' || out.startsWith('/dashboard'),
      `"${hostile}" resolved to "${out}"`,
    )
    assert.ok(!out.startsWith('//'), `"${hostile}" resolved to a protocol-relative URL`)
    assert.ok(!/^[a-z]+:/i.test(out), `"${hostile}" resolved to an absolute URL`)
  }
})

test('SHR-6: malformed percent-encoding falls back instead of throwing', () => {
  assert.equal(safeCallbackUrl('%E0%A4%A'), '/dashboard')
})

test('SHR-6: the three pieces stay wired together', () => {
  // Each is useless without the others, and each is easy to revert by accident.
  assert.match(MIDDLEWARE, /x-pathname/, 'middleware must expose the path to the layout')
  assert.match(LAYOUT, /callbackUrl/, 'the dashboard redirect must carry a callbackUrl')
  assert.match(LAYOUT, /x-pathname/, 'the layout must read the path header')
  assert.match(SIGNIN, /safeCallbackUrl/, 'sign-in must route through the validator')
  assert.ok(
    !/router\.push\('\/dashboard'\)/.test(SIGNIN),
    'sign-in still hardcodes /dashboard, which discards the callbackUrl',
  )
})

test('SEC-6: card comments are not injected as raw HTML', () => {
  // Comment bodies are user-authored and reach every viewer of the card.
  const modal = readFileSync(join(ROOT, 'components/todos/TodoCardModal.tsx'), 'utf8')
  assert.ok(
    !modal.includes('dangerouslySetInnerHTML'),
    'TodoCardModal injects raw HTML; comment bodies must go through RichTextContent',
  )
  assert.match(modal, /RichTextContent/, 'comments must render via the sanitizing component')
})
