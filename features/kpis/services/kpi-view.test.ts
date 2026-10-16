import test from 'node:test'
import assert from 'node:assert/strict'
import { makePackageViewer, resolvePackageAccessFacts, type PackageAccessFacts } from '@/lib/package/access'
import {
  canSetManualRag,
  canViewKpi,
  currentKpiPeriod,
  enterableKpiPeriods,
  isEnterablePeriod,
  kpiItemPermissions,
  kpiListPermissions,
  toKpiView,
  type KpiReadingRow,
  type KpiRow,
} from './kpi-view'
import { kpiCreateSchema, kpiFormToPayload, kpiReadingFormToPayload, kpiReadingUpsertSchema, EMPTY_KPI_FORM } from './schemas'

const OWNER = 'owner'

function factsFor(
  viewerId: string,
  opts: {
    role?: string
    managed?: string[]
    direct?: string[]
    departments?: string[]
    lead?: string[]
    subjectDepartments?: string[]
    sensitive?: boolean
    hr?: boolean
  } = {},
): PackageAccessFacts {
  const viewer = makePackageViewer(
    { id: viewerId, role: opts.role ?? 'EMPLOYEE' },
    {
      isHr: opts.hr,
      canReadSensitiveKpis: opts.sensitive,
      directReportIds: opts.direct ?? [],
      managedUserIds: opts.managed ?? [],
      departmentIds: opts.departments ?? [],
      leadDepartmentIds: opts.lead ?? [],
    },
  )
  return resolvePackageAccessFacts(viewer, OWNER, opts.subjectDepartments ?? ['d1'])
}

const self = factsFor(OWNER)
const manager = factsFor('mgr', { managed: [OWNER], direct: [OWNER] })
const skipManager = factsFor('vp', { managed: ['mgr', OWNER] })
const peer = factsFor('peer', { departments: ['d1'] })
const lead = factsFor('lead', { departments: ['d1'], lead: ['d1'] })
const finance = factsFor('fin', { sensitive: true })
const stranger = factsFor('x', { departments: ['d9'] })
const admin = factsFor('admin', { role: 'ADMIN' })

test('KPI-7: sensitive KPI hidden from a peer, visible to the manager chain', () => {
  const sensitive = { isSensitive: true }
  assert.equal(canViewKpi(peer, sensitive), false)
  assert.equal(canViewKpi(lead, sensitive), false)
  assert.equal(canViewKpi(stranger, sensitive), false)
  assert.equal(canViewKpi(self, sensitive), true)
  assert.equal(canViewKpi(manager, sensitive), true)
  assert.equal(canViewKpi(skipManager, sensitive), true)
  assert.equal(canViewKpi(admin, sensitive), true)
  // package.kpi.sensitive.read holders see the sensitive one, not the person's other KPIs.
  assert.equal(canViewKpi(finance, sensitive), false)
  // Non-sensitive: department peers and leads read; unrelated viewers do not.
  assert.equal(canViewKpi(peer, { isSensitive: false }), true)
  assert.equal(canViewKpi(stranger, { isSensitive: false }), false)
})

test('§8: definitions by manager chain / lead / admin, never self; sensitive needs the chain', () => {
  const open = { timeframeEnded: false }
  const active = { isSensitive: false, status: 'ACTIVE' }
  const sens = { isSensitive: true, status: 'ACTIVE' }
  assert.equal(kpiItemPermissions(self, active, open).canEdit, false)
  assert.equal(kpiItemPermissions(manager, active, open).canEdit, true)
  assert.equal(kpiItemPermissions(lead, active, open).canEdit, true)
  assert.equal(kpiItemPermissions(peer, active, open).canEdit, false)
  assert.equal(kpiItemPermissions(lead, sens, open).canEdit, false)
  assert.equal(kpiItemPermissions(manager, sens, open).canEdit, true)
  assert.equal(kpiListPermissions(self, open).canCreate, false)
  assert.equal(kpiListPermissions(lead, open).canManageSensitive, false)
  assert.equal(kpiListPermissions(manager, open).canManageSensitive, true)
  // Ended timeframe: read-only except ADMIN / EXEC.
  assert.equal(kpiItemPermissions(manager, active, { timeframeEnded: true }).canEdit, false)
  assert.equal(kpiItemPermissions(admin, active, { timeframeEnded: true }).canEdit, true)
})

test('readings: self enters, manager overrides RAG, retired KPIs take none', () => {
  const open = { timeframeEnded: false }
  const s = kpiItemPermissions(self, { isSensitive: false, status: 'ACTIVE' }, open)
  assert.deepEqual([s.canEnterReading, s.canOverrideRag], [true, false])
  const m = kpiItemPermissions(manager, { isSensitive: true, status: 'ACTIVE' }, open)
  assert.deepEqual([m.canEnterReading, m.canOverrideRag], [true, true])
  assert.equal(kpiItemPermissions(lead, { isSensitive: true, status: 'ACTIVE' }, open).canEnterReading, false)
  assert.equal(kpiItemPermissions(peer, { isSensitive: false, status: 'ACTIVE' }, open).canEnterReading, false)
  assert.equal(kpiItemPermissions(self, { isSensitive: false, status: 'RETIRED' }, open).canEnterReading, false)
  // Manual RAG: owner only for text-only KPIs (KPI-6); manager for numeric overrides.
  assert.equal(canSetManualRag(s, true), false)
  assert.equal(canSetManualRag(s, false), true)
  assert.equal(canSetManualRag(m, true), true)
})

const window = { fiscalStartMonth: 6, startKey: '2026-07-01', endKey: '2027-06-30' }

function kpiRow(overrides: Partial<KpiRow> = {}): KpiRow {
  return {
    id: 'k1',
    externalRef: 'EDN-K03',
    ownerId: OWNER,
    timeframeId: 'tf',
    packageId: null,
    name: 'Win rate',
    kpiType: 'LAGGING',
    definition: 'Won / submitted bids',
    formula: null,
    dataSource: null,
    unit: '%',
    direction: 'INCREASE',
    baselineText: null,
    baselineValue: null,
    targetText: '≥ 30%',
    targetValue: 30,
    targetMin: null,
    targetMax: null,
    thresholdAmber: 0.9,
    frequency: 'MONTHLY',
    scoredFrom: null,
    keyResultId: null,
    isSensitive: false,
    status: 'ACTIVE',
    note: null,
    externalSource: null,
    coverageOfKpiId: null,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  }
}

function reading(startKey: string, endKey: string, value: number | null, rag: string | null): KpiReadingRow {
  return {
    id: `r-${startKey}`,
    kpiId: 'k1',
    periodStart: new Date(`${startKey}T00:00:00.000Z`),
    periodEnd: new Date(`${endKey}T23:59:59.999Z`),
    value,
    valueText: null,
    rag,
    ragOverridden: false,
    note: null,
    source: 'MANUAL',
    enteredBy: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
  }
}

test('toKpiView: latest, sparkline, QTD, current period, overdue, not-scored readings', () => {
  const view = toKpiView({
    kpi: kpiRow({ scoredFrom: new Date('2026-09-01T00:00:00Z') }),
    readings: [
      reading('2026-10-01', '2026-10-31', 29, 'AMBER'),
      reading('2026-07-01', '2026-07-31', 20, null),
      reading('2026-09-01', '2026-09-30', 31, 'GREEN'),
    ],
    window,
    calendar: { todayKey: '2026-10-12', timeZone: 'UTC', holidays: new Set() },
    permissions: kpiItemPermissions(self, { isSensitive: false, status: 'ACTIVE' }, { timeframeEnded: false }),
    keyResult: null,
  })
  assert.equal(view.latest?.period.startKey, '2026-10-01')
  assert.equal(view.latest?.computedRag, 'AMBER')
  assert.deepEqual(view.sparkline, [20, 31, 29])
  assert.equal(view.qtd?.average, 29)
  assert.equal(view.qtd?.quarterLabel, 'Q2 FY26/27')
  assert.equal(view.currentPeriod.startKey, '2026-10-01')
  assert.equal(view.currentReading?.value, 29)
  // August missing and ended long ago → overdue; July / Sep have readings.
  assert.deepEqual(view.overduePeriods.map((p) => p.startKey), ['2026-08-01'])
  // July is before scoredFrom → not scored, no RAG.
  const july = toKpiView({
    kpi: kpiRow({ scoredFrom: new Date('2026-09-01T00:00:00Z') }),
    readings: [reading('2026-07-01', '2026-07-31', 20, 'RED')],
    window,
    calendar: { todayKey: '2026-10-12', timeZone: 'UTC', holidays: new Set() },
    permissions: kpiItemPermissions(self, { isSensitive: false, status: 'ACTIVE' }, { timeframeEnded: false }),
    keyResult: null,
  }).latest
  assert.equal(july?.scored, false)
  assert.equal(july?.rag, null)
  assert.equal(view.numericTarget, true)
})

test('periods: current clamps to the timeframe; enterable = started periods in the timeframe', () => {
  const kpi = kpiRow({ frequency: 'QUARTERLY' })
  assert.equal(currentKpiPeriod(kpi, window, '2026-10-12').startKey, '2026-10-01')
  assert.equal(currentKpiPeriod(kpi, window, '2027-09-01').startKey, '2027-04-01')
  assert.deepEqual(enterableKpiPeriods(kpi, window, '2026-10-12').map((p) => p.startKey), ['2026-10-01', '2026-07-01'])
  assert.equal(isEnterablePeriod(kpi, window, '2026-10-12', '2026-10-01'), true)
  assert.equal(isEnterablePeriod(kpi, window, '2026-10-12', '2027-01-01'), false) // future
  assert.equal(isEnterablePeriod(kpi, window, '2026-10-12', '2026-04-01'), false) // before the timeframe
})

test('schemas: create defaults, range validation, reading needs a value', () => {
  const parsed = kpiCreateSchema.safeParse({
    ownerId: 'u',
    timeframeId: 'tf',
    name: 'Win rate',
    definition: 'x',
    targetText: '≥ 30%',
  })
  assert.ok(parsed.success)
  if (parsed.success) {
    assert.equal(parsed.data.frequency, 'MONTHLY')
    assert.equal(parsed.data.thresholdAmber, 0.9)
    assert.equal(parsed.data.keyResultId, null)
  }
  assert.equal(
    kpiCreateSchema.safeParse({ ownerId: 'u', timeframeId: 'tf', name: 'n', definition: 'd', targetText: 't', direction: 'RANGE', targetMin: 10, targetMax: 5 }).success,
    false,
  )
  assert.equal(kpiReadingUpsertSchema.safeParse({ period: '2026-10-01' }).success, false)
  const r = kpiReadingUpsertSchema.safeParse({ period: '2026-10-01', value: 3 })
  assert.ok(r.success)
  if (r.success) assert.equal(r.data.rag, undefined) // omitted → keep current override
  assert.equal(kpiReadingUpsertSchema.safeParse({ period: '2026-10-01', valueText: '100%; ≥30' }).success, true)

  const payload = kpiFormToPayload({ ...EMPTY_KPI_FORM, name: 'n', definition: 'd', targetText: '≥ 1,000', targetValue: '1,000', thresholdAmberPercent: '80' })
  assert.equal(payload.targetValue, 1000)
  assert.equal(payload.thresholdAmber, 0.8)
  assert.equal(payload.targetMin, null)
  assert.ok(!('rag' in kpiReadingFormToPayload({ period: '2026-10-01', value: '3', valueText: '', rag: 'GREEN', note: '' }, { includeRag: false })))
})

test('synced KPIs (Odoo): no manual reading; a manager may still override the RAG', () => {
  const open = { timeframeEnded: false }
  const synced = { isSensitive: true, status: 'ACTIVE', externalSource: 'ODOO_WON' }
  const s = kpiItemPermissions(self, synced, open)
  assert.deepEqual([s.canEnterReading, s.canOverrideRag], [false, false])
  const m = kpiItemPermissions(manager, synced, open)
  assert.deepEqual([m.canEnterReading, m.canOverrideRag], [false, true])
  const a = kpiItemPermissions(admin, synced, open)
  assert.deepEqual([a.canEnterReading, a.canOverrideRag], [false, true])
  assert.equal(kpiItemPermissions(manager, { ...synced, status: 'RETIRED' }, open).canOverrideRag, false)
})

test('toKpiView: synced KPI exposes externalSource + syncedAt, keeps the synced RAG, never overdue', () => {
  const odoo = { ...reading('2026-10-01', '2026-10-31', 0, 'RED'), source: 'ODOO', updatedAt: new Date('2026-10-16T03:30:05Z') }
  const view = toKpiView({
    kpi: kpiRow({ externalSource: 'ODOO_WON', targetValue: null, unit: 'ETB', createdAt: new Date('2026-07-01T00:00:00Z') }),
    readings: [odoo],
    window,
    calendar: { todayKey: '2026-12-12', timeZone: 'UTC', holidays: new Set() },
    permissions: kpiItemPermissions(self, { isSensitive: true, status: 'ACTIVE', externalSource: 'ODOO_WON' }, { timeframeEnded: false }),
    keyResult: null,
  })
  assert.equal(view.externalSource, 'ODOO_WON')
  assert.equal(view.syncedAt, '2026-10-16T03:30:05.000Z')
  assert.equal(view.latest?.source, 'ODOO')
  assert.equal(view.latest?.computedRag, 'RED')
  assert.deepEqual(view.overduePeriods, [])
  assert.equal(view.permissions.canEnterReading, false)
})
