import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  STALE_CHUNK_BOOT_SCRIPT,
  clearStaleChunkReloadGuard,
  isStaleChunkRejection,
  reloadOnceForStaleChunks,
} from '../stale-chunk-reload'

/**
 * "Login not working" hotfix (2026-09-27).
 *
 *  1. A submit before hydration (slow network, or a tab whose chunks 404 after
 *     a deploy) ran the browser's native form submit: a GET that put email and
 *     password in the URL and did nothing. Every auth form must declare
 *     method="post" + an explicit action, and gate its submit on hydration.
 *  2. The wrong-password copy read like an account block.
 *  3. A stale chunk anywhere must trigger exactly one hard reload.
 *  4. The CSP blocked Cloudflare's beacon on every page.
 */

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

// ── 1. Auth forms never fall back to a native GET ───────────────────────────

const AUTH_FORMS = [
  'features/auth/components/SignInForm.tsx',
  'features/auth/components/SignUpForm.tsx',
  'features/auth/components/ForgotPasswordForm.tsx',
  'features/auth/components/ResetPasswordForm.tsx',
  'app/portal/signin/page.tsx',
  'app/portal/accept-invite/page.tsx',
]

/** Every `<form …>` opening tag in a source file (attributes may span lines). */
function formTags(src: string): string[] {
  return src.match(/<form\b[^>]*>/g) ?? []
}

test('every auth form declares method="post" and an explicit action', () => {
  for (const file of AUTH_FORMS) {
    const tags = formTags(read(file))
    assert.ok(tags.length > 0, `${file}: expected at least one <form>`)
    for (const tag of tags) {
      assert.match(tag, /\bmethod="post"/, `${file}: <form> must be method="post" — ${tag}`)
      assert.match(tag, /\baction=/, `${file}: <form> must set an explicit action — ${tag}`)
      assert.doesNotMatch(tag, /method="get"/i, `${file}: <form> must never be GET`)
    }
  }
})

test('no <form> under app/auth or features/auth omits method="post"', () => {
  // Catches a new auth form that is not in AUTH_FORMS yet.
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (full.endsWith('.tsx')) files.push(full)
    }
  }
  for (const dir of ['app/auth', 'features/auth', 'app/portal/signin', 'app/portal/accept-invite']) {
    walk(join(ROOT, dir))
  }
  for (const full of files) {
    for (const tag of formTags(readFileSync(full, 'utf8'))) {
      assert.match(tag, /\bmethod="post"/, `${relative(ROOT, full)}: ${tag}`)
    }
  }
})

test('auth submit buttons stay disabled until hydration', () => {
  // AuthCard's AuthSubmitButton gates itself; ForgotPassword/ResetPassword use it.
  assert.match(read('features/auth/components/AuthCard.tsx'), /disabled=\{!hydrated \|\| pending\}/)
  for (const file of [
    'features/auth/components/ForgotPasswordForm.tsx',
    'features/auth/components/ResetPasswordForm.tsx',
  ]) {
    assert.match(read(file), /<AuthSubmitButton\b/, `${file}: must use the hydration-gated AuthSubmitButton`)
  }
  for (const file of [
    'features/auth/components/SignInForm.tsx',
    'features/auth/components/SignUpForm.tsx',
    'app/portal/signin/page.tsx',
  ]) {
    const src = read(file)
    assert.match(src, /useHydrated\(\)/, `${file}: must read useHydrated()`)
    assert.match(src, /disabled=\{!hydrated \|\|/, `${file}: submit must be disabled until hydrated`)
  }
})

// ── 2. Sign-in error copy ───────────────────────────────────────────────────

test('wrong-password copy leads with "Incorrect email or password." and stays non-enumerating', () => {
  const src = read('features/auth/components/SignInForm.tsx')
  assert.match(src, /'Incorrect email or password\.'/)
  // The activation hint is a secondary line, not part of the primary message.
  assert.match(src, /'New accounts need administrator activation before first sign-in\.'/)
  assert.doesNotMatch(src, /couldn.t sign you in/)
  // One branch for every non-rate-limit failure: no per-reason messages.
  assert.match(src, /result\.error === 'RATE_LIMITED'/)
  assert.match(src, /Too many sign-in attempts/)
  assert.doesNotMatch(src, /result\.error === '(?!RATE_LIMITED)/)
})

// ── 3. Stale-chunk recovery ─────────────────────────────────────────────────

function fakeStorage() {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
  }
}

test('isStaleChunkRejection recognises webpack / dynamic-import failures', () => {
  const chunk = new Error('Loading chunk 4521 failed.\n(error: https://okr.360ground.com/_next/static/chunks/4521.js)')
  chunk.name = 'ChunkLoadError'
  assert.equal(isStaleChunkRejection(chunk), true)
  assert.equal(isStaleChunkRejection(new Error('Loading chunk app/auth/signin/page failed.')), true)
  assert.equal(isStaleChunkRejection(new Error('Loading CSS chunk 12 failed.')), true)
  assert.equal(isStaleChunkRejection(new TypeError('Failed to fetch dynamically imported module: /x.js')), true)
  assert.equal(isStaleChunkRejection(new Error('Cannot read properties of undefined')), false)
  assert.equal(isStaleChunkRejection(null), false)
})

test('reloadOnceForStaleChunks reloads exactly once until the guard is re-armed', () => {
  const storage = fakeStorage()
  let reloads = 0
  const deps = { storage, reload: () => void reloads++ }
  assert.equal(reloadOnceForStaleChunks(deps), true)
  assert.equal(reloadOnceForStaleChunks(deps), false)
  assert.equal(reloadOnceForStaleChunks(deps), false)
  assert.equal(reloads, 1, 'a second stale chunk in the same load must not loop')
  storage.map.clear() // what clearStaleChunkReloadGuard() does after a healthy render
  assert.equal(reloadOnceForStaleChunks(deps), true)
  assert.equal(reloads, 2)
})

test('reloadOnceForStaleChunks never reloads when storage throws (no loop without a guard)', () => {
  let reloads = 0
  const storage = {
    getItem: () => {
      throw new Error('SecurityError')
    },
    setItem: () => {
      throw new Error('SecurityError')
    },
  }
  assert.equal(reloadOnceForStaleChunks({ storage, reload: () => void reloads++ }), false)
  assert.equal(reloads, 0)
})

test('guard helpers are no-ops on the server', () => {
  assert.equal(reloadOnceForStaleChunks(), false)
  assert.doesNotThrow(() => clearStaleChunkReloadGuard())
})

/** Run the inline boot script against a fake window; return its hooks. */
function bootScriptHarness() {
  const storage = fakeStorage()
  const listeners: Record<string, ((e: unknown) => void)[]> = {}
  let reloads = 0
  const win = {
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      ;(listeners[type] ??= []).push(fn)
    },
  }
  const location = { reload: () => void reloads++ }
  new Function('window', 'sessionStorage', 'location', STALE_CHUNK_BOOT_SCRIPT)(win, storage, location)
  const fire = (type: string, e: unknown) => (listeners[type] ?? []).forEach((fn) => fn(e))
  return { storage, fire, reloads: () => reloads, listeners }
}

test('boot script: a 404ing /_next/static script reloads once, before hydration', () => {
  const h = bootScriptHarness()
  assert.ok(h.listeners.error?.length, 'listens for resource errors')
  assert.ok(h.listeners.unhandledrejection?.length, 'listens for chunk rejections')
  const scriptError = { target: { tagName: 'SCRIPT', src: 'https://okr.360ground.com/_next/static/chunks/app/auth/signin/page-abc.js' } }
  h.fire('error', scriptError)
  h.fire('error', scriptError)
  assert.equal(h.reloads(), 1)
})

test('boot script: ChunkLoadError rejections reload once; unrelated errors do not', () => {
  const h = bootScriptHarness()
  h.fire('error', { target: { tagName: 'IMG', src: '/_next/static/media/x.png' } })
  h.fire('error', { target: { tagName: 'SCRIPT', src: 'https://static.cloudflareinsights.com/beacon.min.js' } })
  h.fire('unhandledrejection', { reason: new Error('Network request failed') })
  assert.equal(h.reloads(), 0)
  h.fire('unhandledrejection', { reason: { name: 'ChunkLoadError', message: 'Loading chunk 7 failed.' } })
  h.fire('unhandledrejection', { reason: new Error('Loading chunk 8 failed.') })
  assert.equal(h.reloads(), 1)
})

test('the root layout ships the boot script', () => {
  const layout = read('app/layout.tsx')
  assert.match(layout, /STALE_CHUNK_BOOT_SCRIPT/)
  assert.match(layout, /dangerouslySetInnerHTML=\{\{ __html: STALE_CHUNK_BOOT_SCRIPT \}\}/)
})

test('every app error boundary recovers from a stale chunk', () => {
  const boundaries: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (name === 'error.tsx' || name === 'global-error.tsx') boundaries.push(full)
    }
  }
  walk(join(ROOT, 'app'))
  assert.ok(boundaries.length > 3)
  const SHARED = [
    // Shared boundary bodies that already call reloadOnceForStaleChunks.
    { name: 'SectionError', file: 'components/dashboard/SectionError.tsx' },
    { name: 'ProjectRouteError', file: 'features/projects/components/RouteStates.tsx' },
  ]
  for (const { file } of SHARED) assert.match(read(file), /reloadOnceForStaleChunks\(\)/, file)
  for (const full of boundaries) {
    const src = readFileSync(full, 'utf8')
    const ok =
      /reloadOnceForStaleChunks\(\)/.test(src) ||
      /export \{ default \} from '(\.\.\/)+error'/.test(src) ||
      SHARED.some(({ name }) => new RegExp(`<${name}\\b`).test(src))
    assert.ok(ok, `${relative(ROOT, full)} must reload once on a stale chunk`)
  }
})

// ── 4. CSP allows Cloudflare's beacon, and nothing broader ──────────────────

test('CSP allows the Cloudflare Insights beacon without loosening script-src', async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const config = require(join(ROOT, 'next.config.js'))
  const rules: { source: string; headers: { key: string; value: string }[] }[] = await config.headers()
  const pages = rules.find((r) => r.source.includes('(?!api/)'))
  assert.ok(pages)
  const csp = pages!.headers.find((h) => h.key === 'Content-Security-Policy')?.value ?? ''
  const directive = (name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? ''
  const scriptSrc = directive('script-src').split(/\s+/)
  const connectSrc = directive('connect-src').split(/\s+/)
  assert.ok(scriptSrc.includes('https://static.cloudflareinsights.com'))
  assert.ok(connectSrc.includes('https://cloudflareinsights.com'))
  // No wildcard / scheme-wide source slipped in with it.
  for (const src of scriptSrc) {
    assert.ok(!['https:', 'http:', '*', 'data:', 'blob:'].includes(src), `script-src must not allow ${src}`)
    assert.ok(!src.includes('*'), `script-src must not use a wildcard host (${src})`)
  }
})
