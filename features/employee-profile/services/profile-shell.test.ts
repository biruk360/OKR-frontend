import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseProfileTimeframeParam,
  profileShellHref,
  profileTabLinks,
  resolveActiveProfileTab,
  visibleProfileTabs,
} from './profile-shell'

const ALL = {
  okr: true,
  role: true,
  duties: true,
  kpis: true,
  kpis_sensitive: true,
  development: true,
  dependencies: true,
  decisions: true,
  package: true,
  weights: true,
}

test('every tab is visible with full access, in display order', () => {
  assert.deepEqual(visibleProfileTabs({ view: ALL, packageModule: true, okrAllowed: true }), [
    'overview',
    'okrs',
    'role',
    'kpis',
    'development',
    'links',
    'decisions',
  ])
})

test('package module off hides every package tab but keeps OKRs', () => {
  assert.deepEqual(visibleProfileTabs({ view: ALL, packageModule: false, okrAllowed: true }), ['overview', 'okrs'])
})

test('client portal sessions see only the overview', () => {
  assert.deepEqual(visibleProfileTabs({ view: ALL, packageModule: false, okrAllowed: false }), ['overview'])
})

test('§8 view verdicts hide tabs (peer without development/package access)', () => {
  const peer = { ...ALL, development: false, package: false, weights: false, kpis_sensitive: false }
  assert.deepEqual(visibleProfileTabs({ view: peer, packageModule: true, okrAllowed: true }), [
    'overview',
    'okrs',
    'role',
    'kpis',
    'links',
    'decisions',
  ])
})

test('role tab shows when either role or duties is visible', () => {
  const onlyDuties = { okr: true, duties: true }
  assert.ok(visibleProfileTabs({ view: onlyDuties, packageModule: true, okrAllowed: true }).includes('role'))
  const neither = { okr: true }
  assert.ok(!visibleProfileTabs({ view: neither, packageModule: true, okrAllowed: true }).includes('role'))
})

test('resolveActiveProfileTab falls back to overview for hidden, unknown or missing tabs', () => {
  const visible = ['overview', 'okrs', 'kpis'] as const
  assert.equal(resolveActiveProfileTab('kpis', visible), 'kpis')
  assert.equal(resolveActiveProfileTab(['okrs', 'kpis'], visible), 'okrs')
  assert.equal(resolveActiveProfileTab('development', visible), 'overview')
  assert.equal(resolveActiveProfileTab('nope', visible), 'overview')
  assert.equal(resolveActiveProfileTab(undefined, visible), 'overview')
})

test('parseProfileTimeframeParam accepts id-shaped values only', () => {
  assert.equal(parseProfileTimeframeParam('cmabc_123-x'), 'cmabc_123-x')
  assert.equal(parseProfileTimeframeParam(['tf1', 'tf2']), 'tf1')
  assert.equal(parseProfileTimeframeParam('  '), null)
  assert.equal(parseProfileTimeframeParam('a b'), null)
  assert.equal(parseProfileTimeframeParam('x'.repeat(65)), null)
  assert.equal(parseProfileTimeframeParam(undefined), null)
})

test('profileShellHref keeps tf unless it is the default', () => {
  assert.equal(profileShellHref('u1'), '/dashboard/org/users/u1')
  assert.equal(profileShellHref('u1', 'kpis'), '/dashboard/org/users/u1?tab=kpis')
  assert.equal(profileShellHref('u1', 'kpis', 'tf2', 'tf1'), '/dashboard/org/users/u1?tab=kpis&tf=tf2')
  assert.equal(profileShellHref('u1', 'overview', 'tf2', 'tf1'), '/dashboard/org/users/u1?tf=tf2')
  assert.equal(profileShellHref('u1', 'kpis', 'tf1', 'tf1'), '/dashboard/org/users/u1?tab=kpis')
})

test('profileTabLinks labels and links each visible tab', () => {
  const links = profileTabLinks('u1', ['overview', 'role'], 'tf2', 'tf1')
  assert.deepEqual(links, [
    { key: 'overview', label: 'Overview', href: '/dashboard/org/users/u1?tf=tf2' },
    { key: 'role', label: 'Role & duties', href: '/dashboard/org/users/u1?tab=role&tf=tf2' },
  ])
})
