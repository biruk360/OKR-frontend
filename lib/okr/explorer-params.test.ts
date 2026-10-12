/**
 * Explorer `?owner=<userId>` contract (PRF-7): parse / serialise, scope merge,
 * and the `/api/okr-hierarchy` query it produces for the List view.
 *
 * Run: npx tsx --test lib/okr/explorer-params.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EXPLORER_OWNER_PARAM,
  applyExplorerScope,
  explorerHref,
  explorerOwnerFromSearch,
  lockedScopeKeys,
  parseExplorerOwner,
  scopeForLevel,
  withExplorerOwner,
} from './explorer-params'
import { EMPTY_FILTERS, filtersToQuery } from '../../app/dashboard/okrs-all/okrs-all-utils'

test('parseExplorerOwner: keeps a plain id, rejects blank / malformed / injected values', () => {
  assert.equal(parseExplorerOwner('cmabc123xyz'), 'cmabc123xyz')
  assert.equal(parseExplorerOwner('  user_1-a  '), 'user_1-a')
  assert.equal(parseExplorerOwner(['u1', 'u2']), 'u1')
  assert.equal(parseExplorerOwner(undefined), null)
  assert.equal(parseExplorerOwner(null), null)
  assert.equal(parseExplorerOwner(''), null)
  assert.equal(parseExplorerOwner('   '), null)
  assert.equal(parseExplorerOwner('a,b'), null)
  assert.equal(parseExplorerOwner('u1&type=COMPANY'), null)
  assert.equal(parseExplorerOwner('x'.repeat(65)), null)
})

test('explorerOwnerFromSearch reads ?owner= from a query string or URLSearchParams', () => {
  assert.equal(EXPLORER_OWNER_PARAM, 'owner')
  assert.equal(explorerOwnerFromSearch('?view=tree&owner=u42'), 'u42')
  assert.equal(explorerOwnerFromSearch('owner=u42'), 'u42')
  assert.equal(explorerOwnerFromSearch(new URLSearchParams('owner=u7&level=mine')), 'u7')
  assert.equal(explorerOwnerFromSearch('?view=tree'), null)
  assert.equal(explorerOwnerFromSearch('?owner='), null)
  assert.equal(explorerOwnerFromSearch(''), null)
  assert.equal(explorerOwnerFromSearch(null), null)
})

test('explorerHref serialises owner for List/Tree only and leaves defaults out', () => {
  assert.equal(explorerHref({ owner: 'u1' }), '/dashboard/okrs-all?owner=u1')
  assert.equal(explorerHref({ view: 'list', level: 'all', owner: 'u1' }), '/dashboard/okrs-all?owner=u1')
  assert.equal(explorerHref({ view: 'tree', owner: 'u1' }), '/dashboard/okrs-all?view=tree&owner=u1')
  assert.equal(
    explorerHref({ view: 'tree', level: 'team', owner: 'u1' }),
    '/dashboard/okrs-all?view=tree&level=team&owner=u1',
  )
  // Views that don't read /api/okr-hierarchy drop it.
  assert.equal(explorerHref({ view: 'map', owner: 'u1' }), '/dashboard/okrs-all?view=map')
  assert.equal(explorerHref({ view: 'analyze', owner: 'u1' }), '/dashboard/okrs-all?view=analyze')
  // Blank / invalid owners are never written.
  assert.equal(explorerHref({ owner: null }), '/dashboard/okrs-all')
  assert.equal(explorerHref({ owner: 'bad id' }), '/dashboard/okrs-all')
  // Round trip.
  const href = explorerHref({ view: 'tree', owner: 'cm9owner' })
  assert.equal(explorerOwnerFromSearch(href.split('?')[1]), 'cm9owner')
})

test('withExplorerOwner merges into the level preset without touching other keys', () => {
  const viewer = { id: 'me', departmentIds: ['d1'] }
  assert.equal(withExplorerOwner(undefined, null), undefined)
  const company = scopeForLevel('company', viewer)
  assert.equal(withExplorerOwner(company, null), company, 'no owner → same reference')
  assert.equal(withExplorerOwner(company, 'bad id'), company)
  assert.deepEqual(withExplorerOwner(undefined, 'u1'), { owner: ['u1'] })
  assert.deepEqual(withExplorerOwner(company, 'u1'), { type: ['COMPANY'], owner: ['u1'] })
  assert.deepEqual(withExplorerOwner(scopeForLevel('mine', viewer), 'u1'), { collaborator: ['me'], owner: ['u1'] })
  assert.deepEqual(company, { type: ['COMPANY'] }, 'input scope is not mutated')
  const withOwner = { owner: ['u1'] }
  assert.equal(withExplorerOwner(withOwner, 'u1'), withOwner, 'already set → same reference')
  assert.deepEqual(withExplorerOwner(withOwner, 'u2'), { owner: ['u2'] })
})

test('owner is a locked scope key and replaces any user-picked owner on the API query', () => {
  assert.deepEqual(Array.from(lockedScopeKeys({ owner: ['u1'] })), ['owner'])
  assert.deepEqual(Array.from(lockedScopeKeys({ type: ['COMPANY'], owner: ['u1'] })).sort(), ['owner', 'type'])
  assert.equal(lockedScopeKeys({ owner: [] }).size, 0)

  const sp = new URLSearchParams('owner=someone-else&period=p1&type=INDIVIDUAL')
  applyExplorerScope(sp, withExplorerOwner({ type: ['COMPANY'] }, 'u1'))
  assert.deepEqual(sp.getAll('owner'), ['u1'])
  assert.deepEqual(sp.getAll('type'), ['COMPANY'])
  assert.equal(sp.get('period'), 'p1')
})

test('List view query (okrs-all-utils filtersToQuery) passes owner= to /api/okr-hierarchy', () => {
  const f = { ...EMPTY_FILTERS, period: ['p1'] }
  // Explicit owner (the URL value on the client).
  const qs = new URLSearchParams(filtersToQuery(f, false, undefined, 'u1'))
  assert.deepEqual(qs.getAll('owner'), ['u1'])
  assert.equal(qs.get('refs'), '0')
  assert.equal(qs.get('period'), 'p1')
  // Combined with a level preset.
  const both = new URLSearchParams(filtersToQuery(f, true, { team: ['d1'] }, 'u1'))
  assert.deepEqual(both.getAll('team'), ['d1'])
  assert.deepEqual(both.getAll('owner'), ['u1'])
  assert.equal(both.get('refs'), null)
  // An owner already in the scope (set by the page) wins over the URL default.
  const scoped = new URLSearchParams(filtersToQuery(f, true, { owner: ['u9'] }))
  assert.deepEqual(scoped.getAll('owner'), ['u9'])
  // No owner anywhere (no window on the server) → no owner param.
  const none = new URLSearchParams(filtersToQuery(f, true))
  assert.equal(none.has('owner'), false)
})
