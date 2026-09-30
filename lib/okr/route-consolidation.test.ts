import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { RETIRED_ROUTE_REDIRECTS } from '../retired-routes'
import {
  applyExplorerScope,
  explorerHref,
  insightsHref,
  lockedScopeKeys,
  NO_TEAM_SENTINEL,
  parseExplorerLevel,
  parseExplorerView,
  parseInsightsTab,
  parseProgressView,
  scopeForLevel,
} from './explorer-params'

/**
 * OKR page consolidation (2026-09-25): My OKRs + OKR Explorer + Insights.
 *  - every retired route has a permanent redirect in next.config.js,
 *  - no retired route still has a page, every destination is a real page,
 *  - no source file links to a retired route (they would work, via a 308,
 *    but links should point at the new home),
 *  - the Explorer / Insights URL contract (lib/okr/explorer-params.ts).
 */

const ROOT = path.resolve(__dirname, '..', '..')
const APP_DIR = path.join(ROOT, 'app')

const EXPECTED_RETIRED = [
  '/dashboard/okrs',
  '/dashboard/objectives',
  '/dashboard/company-okrs',
  '/dashboard/department-okrs',
  '/dashboard/goals',
  '/dashboard/plans',
  '/dashboard/timeline',
  '/dashboard/okr-hierarchy',
  '/dashboard/alignment-map',
  '/dashboard/filters',
  '/dashboard/analytics',
  '/dashboard/progress-report',
  '/dashboard/progress',
  '/dashboard/reports',
  '/dashboard/initiative-report',
]

// ─── app/ router resolution (same rules as lib/email/templates/template-routes.test.ts) ──

function isDir(p: string): boolean {
  return existsSync(p) && statSync(p).isDirectory()
}

function hasPage(dir: string): boolean {
  return ['page.tsx', 'page.ts', 'page.jsx', 'page.js'].some((f) => existsSync(path.join(dir, f)))
}

function childDirs(dir: string): Array<{ name: string; full: string }> {
  const out: Array<{ name: string; full: string }> = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (!isDir(full)) continue
    if (/^\(.+\)$/.test(name)) out.push(...childDirs(full))
    else out.push({ name, full })
  }
  return out
}

/** Static path → true when a page renders it (exact folders first, then `[param]` folders). */
function resolves(dir: string, segments: string[]): boolean {
  if (segments.length === 0) return hasPage(dir)
  const [head, ...rest] = segments
  for (const child of childDirs(dir)) {
    if (/^\[{1,2}\.\.\..+\]{1,2}$/.test(child.name) && hasPage(child.full)) return true
    if (child.name === head || /^\[[^.\]]+\]$/.test(child.name)) {
      if (resolves(child.full, rest)) return true
    }
  }
  return false
}

function segmentsOf(url: string): string[] {
  return url.split(/[?#]/)[0].split('/').filter(Boolean)
}

// ─── Redirect table ─────────────────────────────────────────────────────────

test('every retired route has exactly one redirect', () => {
  const sources = RETIRED_ROUTE_REDIRECTS.map((r) => r.source)
  assert.deepEqual([...sources].sort(), [...EXPECTED_RETIRED].sort())
  assert.equal(new Set(sources).size, sources.length, 'duplicate redirect source')
})

test('next.config.js serves the retired-route redirects as permanent redirects', async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nextConfig = require(path.join(ROOT, 'next.config.js'))
  assert.equal(typeof nextConfig.redirects, 'function', 'next.config.js must define redirects()')
  assert.equal(typeof nextConfig.headers, 'function', 'next.config.js headers() must stay in place')
  const redirects: Array<{ source: string; destination: string; permanent: boolean }> = await nextConfig.redirects()
  for (const retired of EXPECTED_RETIRED) {
    const hit = redirects.filter((r) => r.source === retired)
    assert.equal(hit.length, 1, `${retired}: expected one redirect, found ${hit.length}`)
    assert.equal(hit[0].permanent, true, `${retired}: redirect must be permanent`)
  }
})

test('retired routes no longer have a page; detail routes are kept', () => {
  for (const retired of EXPECTED_RETIRED) {
    assert.equal(resolves(APP_DIR, segmentsOf(retired)), false, `${retired} still has a page under app/`)
  }
  assert.ok(existsSync(path.join(APP_DIR, 'dashboard', 'objectives', '[id]', 'page.tsx')), 'objectives/[id] must stay')
  assert.ok(
    existsSync(path.join(APP_DIR, 'dashboard', 'okrs-all', 'period-report', '[timeframeId]', 'page.tsx')),
    'okrs-all/period-report/[timeframeId] must stay',
  )
})

test('every redirect lands on a real page with a known view/tab', () => {
  for (const { source, destination } of RETIRED_ROUTE_REDIRECTS) {
    assert.ok(resolves(APP_DIR, segmentsOf(destination)), `${source} → ${destination}: no page`)
    const qs = new URLSearchParams(destination.split('?')[1] ?? '')
    if (destination.startsWith('/dashboard/okrs-all')) {
      if (qs.has('view')) assert.equal(parseExplorerView(qs.get('view')), qs.get('view'), `${source}: unknown view`)
      if (qs.has('level')) assert.equal(parseExplorerLevel(qs.get('level')), qs.get('level'), `${source}: unknown level`)
    } else if (destination.startsWith('/dashboard/insights')) {
      assert.equal(parseInsightsTab(qs.get('tab')), qs.get('tab'), `${source}: unknown tab`)
      if (qs.has('view')) assert.equal(parseProgressView(qs.get('view')), qs.get('view'), `${source}: unknown view`)
    } else if (destination === '/dashboard/my-okrs') {
      assert.equal(source, '/dashboard/okrs')
    } else {
      assert.fail(`${source} → ${destination}: expected the Explorer or Insights`)
    }
  }
})

// ─── Source scan: no links to retired routes ────────────────────────────────

const SCAN_DIRS = ['app', 'components', 'features', 'lib', 'hooks', 'scripts', 'types']
const SKIP_FILES = new Set([
  path.join('lib', 'retired-routes.js'),
  path.join('lib', 'okr', 'route-consolidation.test.ts'),
])
/**
 * `'/dashboard/objectives'` as a base the caller appends `/${id}` to — a detail
 * link, not the retired list page.
 */
const ALLOWED: Array<{ file: string; literal: string }> = [
  { file: path.join('components', 'shared', 'EntityLink.tsx'), literal: '/dashboard/objectives' },
]

function sourceFiles(dir: string, out: string[] = []): string[] {
  if (!isDir(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = path.join(dir, name)
    if (isDir(full)) sourceFiles(full, out)
    else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(name)) out.push(full)
  }
  return out
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('no source file links to a retired route', () => {
  // A quoted literal that IS the retired path, optionally followed by ?query / #hash —
  // `/dashboard/objectives/${id}` (a detail route) does not match.
  const alternation = EXPECTED_RETIRED.map(escapeRe).join('|')
  const re = new RegExp(`(['"\`])(${alternation})(?=['"\`?#])`, 'g')
  const offenders: string[] = []
  for (const top of SCAN_DIRS) {
    for (const file of sourceFiles(path.join(ROOT, top))) {
      const rel = path.relative(ROOT, file)
      if (SKIP_FILES.has(rel)) continue
      const src = readFileSync(file, 'utf8')
      for (const m of Array.from(src.matchAll(re))) {
        if (ALLOWED.some((a) => a.file === rel && a.literal === m[2])) continue
        const line = src.slice(0, m.index).split('\n').length
        offenders.push(`${rel}:${line} ${m[2]}`)
      }
    }
  }
  assert.deepEqual(offenders, [], 'link these to the OKR Explorer / Insights instead (see lib/retired-routes.js)')
})

test('sidebar navigation points at the consolidated pages', async () => {
  const { getFlatNavItems } = await import('../dashboard-navigation')
  const hrefs = getFlatNavItems().map((i) => i.href)
  for (const retired of EXPECTED_RETIRED) {
    assert.ok(!hrefs.includes(retired), `nav still links ${retired}`)
  }
  for (const kept of ['/dashboard/my-okrs', '/dashboard/okrs-all', '/dashboard/insights']) {
    assert.ok(hrefs.includes(kept), `nav is missing ${kept}`)
  }
})

// ─── Explorer / Insights URL contract ───────────────────────────────────────

test('explorer params: unknown values fall back to the defaults', () => {
  assert.equal(parseExplorerView(undefined), 'list')
  assert.equal(parseExplorerView('nope'), 'list')
  assert.equal(parseExplorerView(['map', 'tree']), 'map')
  assert.equal(parseExplorerLevel(''), 'all')
  assert.equal(parseExplorerLevel('team'), 'team')
  assert.equal(parseInsightsTab(null), 'overview')
  assert.equal(parseInsightsTab('period-close'), 'period-close')
  assert.equal(parseProgressView('x'), 'dashboard')
})

test('explorer / insights hrefs leave defaults out', () => {
  assert.equal(explorerHref(), '/dashboard/okrs-all')
  assert.equal(explorerHref({ view: 'list', level: 'all' }), '/dashboard/okrs-all')
  assert.equal(explorerHref({ view: 'tree', level: 'company' }), '/dashboard/okrs-all?view=tree&level=company')
  assert.equal(insightsHref({ tab: 'overview' }), '/dashboard/insights')
  assert.equal(insightsHref({ tab: 'progress', view: 'tracking' }), '/dashboard/insights?tab=progress&view=tracking')
  assert.equal(insightsHref({ tab: 'reports', view: 'tracking' }), '/dashboard/insights?tab=reports')
})

test('level presets map to /api/okr-hierarchy filters and override the user pick', () => {
  const viewer = { id: 'u1', departmentIds: ['d1', 'd2'] }
  assert.deepEqual(scopeForLevel('all', viewer), {})
  assert.deepEqual(scopeForLevel('company', viewer), { type: ['COMPANY'] })
  assert.deepEqual(scopeForLevel('department', viewer), { type: ['DEPARTMENT'] })
  assert.deepEqual(scopeForLevel('mine', viewer), { collaborator: ['u1'] })
  assert.deepEqual(scopeForLevel('team', viewer), { team: ['d1', 'd2'] })
  // No department → a sentinel that matches nothing, never "no filter".
  assert.deepEqual(scopeForLevel('team', { id: 'u1', departmentIds: [] }), { team: [NO_TEAM_SENTINEL] })

  const sp = new URLSearchParams('type=INDIVIDUAL&q=x&period=p1')
  applyExplorerScope(sp, { type: ['COMPANY'] })
  assert.deepEqual(sp.getAll('type'), ['COMPANY'])
  assert.equal(sp.get('q'), 'x')
  assert.equal(sp.get('period'), 'p1')
  assert.deepEqual(Array.from(lockedScopeKeys({ team: ['d1'] })), ['team'])
  assert.equal(lockedScopeKeys(undefined).size, 0)
})
