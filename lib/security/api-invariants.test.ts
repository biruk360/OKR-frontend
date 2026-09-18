import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Static security invariants over the API surface.
 *
 * These exist because the sprint work added routes and a card-sharing flow, and
 * the cheapest way for that to go wrong later is a new route shipped without an
 * auth wrapper. A unit test cannot prove a handler is safe, but it can prove no
 * route silently escapes the project's auth conventions.
 *
 * Spec: docs/trello_parity_sprint_board_REQUIREMENTS.md SEC-1, SEC-4, SHR-AC-5.
 */

const ROOT = join(__dirname, '..', '..')
const API_DIR = join(ROOT, 'app', 'api')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry === 'route.ts') out.push(full)
  }
  return out
}

const ROUTES = walk(API_DIR).map((f) => relative(ROOT, f).split(sep).join('/'))

/** Wrappers that establish an authenticated app session. */
const AUTH_WRAPPERS = /withAuth|withRole|withFeature|withRoleOrFeature/

/**
 * Routes allowed to skip the app-session wrappers, each with the guard it must
 * prove instead. Adding a route here is a deliberate act that shows up in review.
 */
const EXEMPT: { prefix: string; reason: string; mustMatch: RegExp }[] = [
  { prefix: 'app/api/auth/', reason: 'NextAuth itself and the password-reset flow are pre-login by definition', mustMatch: /.*/ },
  { prefix: 'app/api/portal/auth/', reason: 'the client portal has its own NextAuth instance', mustMatch: /.*/ },
  { prefix: 'app/api/portal/', reason: 'client-portal routes authenticate with withPortalAuth', mustMatch: /withPortalAuth/ },
  { prefix: 'app/api/cron/', reason: 'cron routes authenticate with a CRON_SECRET bearer token', mustMatch: /CRON_SECRET/ },
  { prefix: 'app/api/telegram/webhook/', reason: 'webhook authenticates with TELEGRAM_WEBHOOK_SECRET', mustMatch: /TELEGRAM_WEBHOOK_SECRET/ },
  { prefix: 'app/api/health/', reason: 'liveness probe exposes no data', mustMatch: /.*/ },
  { prefix: 'app/api/wallpaper/', reason: 'it feeds the sign-in screen, which is pre-login by definition, and returns only public photo metadata', mustMatch: /Deliberately unauthenticated/ },
]

function exemptionFor(route: string) {
  return EXEMPT.find((e) => route.startsWith(e.prefix)) ?? null
}

test('SEC-1: every API route is wrapped in an auth guard, or explicitly exempt', () => {
  assert.ok(ROUTES.length > 100, `expected to find the API surface, found ${ROUTES.length} routes`)

  const unguarded: string[] = []
  for (const route of ROUTES) {
    const src = readFileSync(join(ROOT, route), 'utf8')
    if (AUTH_WRAPPERS.test(src)) continue
    if (exemptionFor(route)) continue
    unguarded.push(route)
  }

  assert.deepEqual(
    unguarded, [],
    `these routes use no auth wrapper and are not exempt:\n  ${unguarded.join('\n  ')}`,
  )
})

test('SEC-1: every exempt route proves the guard its exemption claims', () => {
  const failures: string[] = []
  for (const route of ROUTES) {
    const exemption = exemptionFor(route)
    if (!exemption) continue
    const src = readFileSync(join(ROOT, route), 'utf8')
    // A route may satisfy either its own guard or a normal auth wrapper.
    if (exemption.mustMatch.test(src) || AUTH_WRAPPERS.test(src)) continue
    failures.push(`${route} — exempt because ${exemption.reason}, but no ${exemption.mustMatch} found`)
  }
  assert.deepEqual(failures, [], `exempt routes missing their guard:\n  ${failures.join('\n  ')}`)
})

test('SEC-1: the sprint and card routes this work touched are all wrapped', () => {
  // Narrower and louder than the sweep above: these are the specific routes the
  // Trello-parity work added or changed.
  const touched = ROUTES.filter((r) =>
    r.startsWith('app/api/sprints/') ||
    r.startsWith('app/api/todos/') ||
    r === 'app/api/watchers/route.ts' ||
    r === 'app/api/todo-labels/route.ts' ||
    r === 'app/api/user-preferences/route.ts',
  )
  assert.ok(touched.length >= 20, `expected the sprint/todo surface, found ${touched.length}`)
  for (const route of touched) {
    const src = readFileSync(join(ROOT, route), 'utf8')
    assert.match(src, AUTH_WRAPPERS, `${route} is missing an auth wrapper`)
  }
})

test('SHR-AC-5: card sharing added no token column and no public route', () => {
  // D3 was "in-app deep link only". These assertions are what stops that
  // decision from quietly eroding into a public-link feature later.
  const schema = readFileSync(join(ROOT, 'prisma', 'schema.prisma'), 'utf8')
  for (const forbidden of ['shareToken', 'publicToken', 'shareSlug', 'publicSlug']) {
    assert.ok(
      !schema.includes(forbidden),
      `schema gained "${forbidden}" — card sharing is supposed to mint no tokens (decision D3)`,
    )
  }

  const shareRoute = join(ROOT, 'app/api/todos/[id]/share/route.ts')
  const src = readFileSync(shareRoute, 'utf8')
  assert.match(src, AUTH_WRAPPERS, 'the share route must require an authenticated session')
  assert.match(src, /canViewSprint/, 'the share route must re-check sprint visibility')
})

test('SHR-AC-5: the card deep link stays under /dashboard', () => {
  // A link that resolved outside /dashboard would escape the layout's session
  // guard, which is the single thing making "logged-in users only" true.
  const src = readFileSync(join(ROOT, 'app/api/todos/[id]/share/route.ts'), 'utf8')
  const paths = [...src.matchAll(/`(\/[^`$]*)\$\{/g)].map((m) => m[1])
  assert.ok(paths.length > 0, 'expected the share route to build a path')
  for (const p of paths) {
    assert.ok(p.startsWith('/dashboard/'), `share route builds "${p}", which is outside /dashboard`)
  }
})
