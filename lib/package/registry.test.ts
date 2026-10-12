import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * Employee Operating Package registries: §9 events (category, deep links,
 * templates), types/package.ts label maps, and the §8 feature keys.
 */

const BASE = 'https://okr.example.test'
process.env.NEXTAUTH_URL = BASE

async function load() {
  const events = await import('@/lib/notifications/events')
  const deepLink = await import('@/lib/notifications/deep-link')
  const { renderTemplate } = await import('@/lib/email/templates')
  const types = await import('@/types/package')
  return { events, deepLink, renderTemplate, types }
}

const SPEC_EVENTS = [
  'KPI_READING_DUE', 'DEPENDENCY_DUE_SOON', 'DEPENDENCY_LATE', 'DEPENDENCY_DONE', 'DECISION_REQUESTED',
  'DECISION_DECIDED', 'DEV_ITEM_DUE', 'PACKAGE_SENT_FOR_REVIEW', 'PACKAGE_ITEM_DISPUTED', 'PACKAGE_APPROVED',
  'KR_CHECKPOINT_DUE',
]

test('every §9 event is registered under the PACKAGE ("Operating package") category', async () => {
  const { events } = await load()
  assert.equal(events.CATEGORY_LABEL.PACKAGE, 'Operating package')
  assert.ok(events.ALL_CATEGORIES.includes('PACKAGE'))
  assert.deepEqual([...events.PACKAGE_EVENT_KEYS].sort(), [...SPEC_EVENTS].sort())
  for (const key of SPEC_EVENTS) {
    const meta = events.EVENT_META[key as keyof typeof events.EVENT_META]
    assert.ok(meta, key)
    assert.equal(meta.category, 'PACKAGE', key)
  }
  // Spec table: redactable = KPI_READING_DUE, DEV_ITEM_DUE, KR_CHECKPOINT_DUE.
  const redactable = SPEC_EVENTS.filter((k) => events.EVENT_META[k as keyof typeof events.EVENT_META].redactable)
  assert.deepEqual(redactable.sort(), ['DEV_ITEM_DUE', 'KPI_READING_DUE', 'KR_CHECKPOINT_DUE'])
  // Digest vs immediate.
  assert.equal(events.EVENT_META.DEPENDENCY_DONE.defaultCadence, 'IMMEDIATE')
  assert.equal(events.EVENT_META.DECISION_REQUESTED.defaultCadence, 'DAILY')
})

test('package deep links land on the owner tab, the dependency map, decisions or the KR', async () => {
  const { deepLink } = await load()
  const path = (eventKey: string, entityType: string | undefined, entityId: string | undefined, data: Record<string, unknown> = {}) =>
    deepLink.buildDeepLinkPath({ eventKey: eventKey as never, entityType: entityType as never, entityId, data })
  assert.equal(path('KPI_READING_DUE', 'KPI', 'k1', { ownerId: 'u1' }), '/dashboard/org/users/u1?tab=kpis')
  assert.equal(path('DEV_ITEM_DUE', 'DEVELOPMENT_ITEM', 'd1', { ownerId: 'u1' }), '/dashboard/org/users/u1?tab=development')
  assert.equal(path('DEPENDENCY_LATE', 'WORK_DEPENDENCY', 'dep1'), '/dashboard/okrs-all/dependencies?dependency=dep1')
  assert.equal(path('DECISION_DECIDED', 'DECISION', 'dec1'), '/dashboard/decisions?decision=dec1')
  assert.equal(path('PACKAGE_APPROVED', 'OPERATING_PACKAGE', 'p1', { userId: 'u1' }), '/dashboard/org/users/u1')
  assert.equal(path('KR_CHECKPOINT_DUE', 'KEY_RESULT', 'kr1'), '/dashboard/key-results/kr1')
  assert.equal(path('KR_CHECKPOINT_DUE', 'KR_CHECKPOINT', 'cp1', { keyResultId: 'kr1' }), '/dashboard/key-results/kr1')
  // Caller-supplied relative deep link wins; absolute URLs are ignored.
  assert.equal(path('DEPENDENCY_DONE', 'WORK_DEPENDENCY', 'dep1', { deepLink: '/dashboard/org/users/u1?tab=links' }), '/dashboard/org/users/u1?tab=links')
  assert.equal(path('DEPENDENCY_DONE', 'WORK_DEPENDENCY', 'dep1', { deepLink: 'https://evil.example' }), '/dashboard/okrs-all/dependencies?dependency=dep1')
  assert.equal(deepLink.buildDeepLink({ eventKey: 'DECISION_REQUESTED', entityType: 'DECISION', entityId: 'x' }), `${BASE}/dashboard/decisions?decision=x`)
})

test('package templates carry the facts and the deep link', async () => {
  const { renderTemplate } = await load()
  const late = renderTemplate('DEPENDENCY_LATE', {
    recipientName: 'Abebe', entityTitle: 'World Bank project map', externalRef: 'DEP14', neededByDate: '2026-10-01',
    daysLate: 3, providerNames: 'Meklit', neederNames: 'Eyoel', recipientRole: ['PROVIDER'],
    deepLink: `${BASE}/dashboard/okrs-all/dependencies?dependency=d1`,
  })
  assert.equal(late.subject, 'Late dependency: DEP14 · World Bank project map')
  assert.ok(late.text.includes('3 days ago'), late.text)
  assert.ok(late.text.includes('Owner (delivers): Meklit'), late.text)
  assert.ok(late.html!.includes(`${BASE}/dashboard/okrs-all/dependencies?dependency=d1`))

  const disputed = renderTemplate('PACKAGE_ITEM_DISPUTED', { employeeName: 'Eyoel', itemTitle: 'Win rate', disputeComment: 'Target too high' })
  assert.equal(disputed.subject, 'Eyoel disputed a package item')
  assert.ok(disputed.text.includes('Comment: Target too high'))

  const checkpoint = renderTemplate('KR_CHECKPOINT_DUE', { entityTitle: 'Win rate ≥ 45%', checkpointLabel: 'Q2', daysLeft: 7, targetValue: '40%' })
  assert.equal(checkpoint.subject, 'Q2 checkpoint due soon: Win rate ≥ 45%')
  assert.ok(checkpoint.text.includes('in 7 days'))

  const empty = renderTemplate('KPI_READING_DUE', {})
  assert.equal(empty.subject, 'A KPI reading is overdue')
  assert.equal(/undefined|NaN/.test(empty.text), false)
})

test('types/package.ts: every value set has a complete label map', async () => {
  const { types } = await load()
  const pairs: Array<[readonly string[], Record<string, string>]> = [
    [types.OKR_LINK_KINDS, types.OKR_LINK_KIND_LABELS],
    [types.OKR_LINK_SUB_KINDS, types.OKR_LINK_SUB_KIND_LABELS],
    [types.KR_COMMITMENTS, types.KR_COMMITMENT_LABELS],
    [types.KR_DIRECTIONS, types.KR_DIRECTION_LABELS],
    [types.CHECKPOINT_STATUSES, types.CHECKPOINT_STATUS_LABELS],
    [types.TODO_KINDS, types.TODO_KIND_LABELS],
    [types.DUTY_CADENCES, types.DUTY_CADENCE_LABELS],
    [types.DUTY_STATUSES, types.DUTY_STATUS_LABELS],
    [types.ROLE_DEFINITION_STATUSES, types.ROLE_DEFINITION_STATUS_LABELS],
    [types.ROLE_ITEM_SECTIONS, types.ROLE_ITEM_SECTION_LABELS],
    [types.KPI_TYPES, types.KPI_TYPE_LABELS],
    [types.KPI_DIRECTIONS, types.KPI_DIRECTION_LABELS],
    [types.KPI_FREQUENCIES, types.KPI_FREQUENCY_LABELS],
    [types.KPI_RAGS, types.KPI_RAG_LABELS],
    [types.KPI_STATUSES, types.KPI_STATUS_LABELS],
    [types.KPI_READING_SOURCES, types.KPI_READING_SOURCE_LABELS],
    [types.DEVELOPMENT_KINDS, types.DEVELOPMENT_KIND_LABELS],
    [types.DEVELOPMENT_STATUSES, types.DEVELOPMENT_STATUS_LABELS],
    [types.DEPENDENCY_TYPES, types.DEPENDENCY_TYPE_LABELS],
    [types.DEPENDENCY_STATUSES, types.DEPENDENCY_STATUS_LABELS],
    [types.DEPENDENCY_PARTY_ROLES, types.DEPENDENCY_PARTY_ROLE_LABELS],
    [types.DECISION_STATUSES, types.DECISION_STATUS_LABELS],
    [types.PACKAGE_STATUSES, types.PACKAGE_STATUS_LABELS],
    [types.REVIEW_VERDICTS, types.REVIEW_VERDICT_LABELS],
    [types.PROFILE_TABS, types.PROFILE_TAB_LABELS],
  ]
  for (const [values, labels] of pairs) {
    assert.deepEqual(Object.keys(labels).sort(), [...values].sort())
    for (const v of values) assert.ok(labels[v].trim().length > 0, v)
  }
  assert.equal(types.isDutyCadence('QUARTERLY'), true)
  assert.equal(types.isDutyCadence('HOURLY'), false)
  assert.equal(types.profileTabHref('u 1', 'kpis'), '/dashboard/org/users/u%201?tab=kpis')
  assert.equal(types.profileTabHref('u1'), '/dashboard/org/users/u1')
})

test('§8 feature keys match the spec list', async () => {
  const { types } = await load()
  assert.deepEqual(Object.values(types.PACKAGE_FEATURE_KEYS).sort(), [
    'button.decision.decide', 'button.package.approve', 'button.package.duty.create', 'button.package.kpi.create',
    'button.package.role.approve', 'module.package', 'package.hr', 'package.kpi.sensitive.read',
    'page.okr.decisions', 'page.okr.dependency-map', 'page.people.package',
  ])
  assert.equal(types.PACKAGE_DOCTYPES.length, 11)
})
