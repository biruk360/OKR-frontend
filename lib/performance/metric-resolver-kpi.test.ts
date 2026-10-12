import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MetricActualUnavailableError,
  averageKpiReadingsForPeriod,
  kpiDirectionMixIssue,
  kpiSourceRuleIssue,
  resolveMetricActual,
} from '@/lib/performance/metric-resolver'

/**
 * KPI-9: a package KPI as a performance metric source. The criterion actual is
 * the evaluation period's average of the KPI's numeric, scored readings. The
 * Prisma client is stubbed, so these run without a database.
 */

const Q3 = { periodStart: new Date('2026-07-01T00:00:00.000Z'), periodEnd: new Date('2026-09-30T00:00:00.000Z') }

function reading(start: string, end: string, value: number | null, kpiId = 'kpi-1') {
  return { kpiId, periodStart: new Date(`${start}T00:00:00.000Z`), periodEnd: new Date(`${end}T23:59:59.999Z`), value }
}

const MONTHLY = [
  reading('2026-06-01', '2026-06-30', 1000), // before the period
  reading('2026-07-01', '2026-07-31', 10),
  reading('2026-08-01', '2026-08-31', 20),
  reading('2026-09-01', '2026-09-30', 30),
  reading('2026-10-01', '2026-10-31', 1000), // after the period
]

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test('averages readings whose period starts inside the evaluation period', () => {
  const avg = averageKpiReadingsForPeriod(MONTHLY, Q3)
  assert.ok(avg)
  assert.equal(avg.average, 20)
  assert.equal(avg.count, 3)
  assert.equal(new Date(avg.asOf).toISOString().slice(0, 10), '2026-09-30')
})

test('skips text-only readings (value null) and non-finite values', () => {
  const avg = averageKpiReadingsForPeriod(
    [reading('2026-07-01', '2026-07-31', null), reading('2026-08-01', '2026-08-31', 8), { ...reading('2026-09-01', '2026-09-30', 0), value: Number.NaN }],
    Q3,
  )
  assert.deepEqual(avg && { average: avg.average, count: avg.count }, { average: 8, count: 1 })
})

test('excludes readings for periods that end before scoredFrom (KPI-2)', () => {
  const avg = averageKpiReadingsForPeriod(MONTHLY, Q3, new Date('2026-08-15T00:00:00.000Z'))
  assert.ok(avg)
  assert.equal(avg.average, 25) // Aug (contains scoredFrom) + Sep
  assert.equal(avg.count, 2)
})

test('falls back to overlapping readings when none starts inside the period', () => {
  // A QUARTERLY KPI on a fiscal quarter offset from the cycle.
  const avg = averageKpiReadingsForPeriod(
    [reading('2026-06-01', '2026-08-31', 40), reading('2026-09-01', '2026-11-30', 60)].map((r, i) => (i === 1 ? { ...r, periodStart: new Date('2026-10-01T00:00:00.000Z') } : r)),
    Q3,
  )
  assert.ok(avg)
  assert.equal(avg.average, 40)
  assert.equal(avg.count, 1)
})

test('returns null when no reading qualifies', () => {
  assert.equal(averageKpiReadingsForPeriod([], Q3), null)
  assert.equal(averageKpiReadingsForPeriod([reading('2025-01-01', '2025-01-31', 5)], Q3), null)
})

test('accepts date-key strings', () => {
  const avg = averageKpiReadingsForPeriod(
    [{ periodStart: '2026-07-01', periodEnd: '2026-07-31', value: 4 }],
    { periodStart: '2026-07-01', periodEnd: '2026-09-30' },
  )
  assert.equal(avg?.average, 4)
})

test('kpiSourceRuleIssue: a linear rule only fits higher-is-better KPIs', () => {
  assert.equal(kpiSourceRuleIssue('INCREASE', 'LINEAR_CAPPED'), null)
  assert.match(String(kpiSourceRuleIssue('DECREASE', 'LINEAR_CAPPED')), /Lower is better/)
  assert.match(String(kpiSourceRuleIssue('RANGE', 'LINEAR_CAPPED')), /Within range/)
  for (const direction of ['INCREASE', 'DECREASE', 'RANGE']) {
    assert.equal(kpiSourceRuleIssue(direction, 'INVERSE_BANDS'), null)
    assert.equal(kpiSourceRuleIssue(direction, 'MANUAL'), null)
    assert.equal(kpiSourceRuleIssue(direction, null), null)
  }
  // Unknown directions read as INCREASE.
  assert.equal(kpiSourceRuleIssue('SIDEWAYS', 'LINEAR_CAPPED'), null)
})

test('kpiDirectionMixIssue: KPIs on one criterion must share a direction', () => {
  assert.equal(kpiDirectionMixIssue([]), null)
  assert.equal(kpiDirectionMixIssue(['DECREASE', 'DECREASE']), null)
  assert.equal(kpiDirectionMixIssue(['INCREASE', null]), null)
  assert.ok(kpiDirectionMixIssue(['INCREASE', 'DECREASE']))
})

// ---------------------------------------------------------------------------
// resolveMetricActual with KPI mappings
// ---------------------------------------------------------------------------

type KpiRow = { id: string; name: string; ownerId: string; direction: string; scoredFrom: Date | null; unit: string }

function makeDb(opts: {
  snapshot?: unknown[]
  kpiMappings?: Array<{ position: number; kpi: KpiRow | null; kpiId?: string }>
  readings?: ReturnType<typeof reading>[]
  rule?: Record<string, unknown> | null
  checkIn?: { value: number; asOfDate: Date } | null
  manual?: { actual: number; note: string | null; enteredById: string; enteredAt: Date } | null
}) {
  const calls: Record<string, unknown[]> = { metricSourceMapping: [], kpiReading: [] }
  const db = {
    evaluation: {
      findUnique: async () => ({ employeeId: 'emp-1', cycle: Q3, metricSources: opts.snapshot ?? [] }),
    },
    keyResultCheckIn: { findFirst: async () => opts.checkIn ?? null },
    evaluationMetricManualActual: { findUnique: async () => opts.manual ?? null },
    metricSourceMapping: {
      findMany: async (args: unknown) => {
        calls.metricSourceMapping.push(args)
        return (opts.kpiMappings ?? []).map((m) => ({ position: m.position, kpiId: m.kpiId ?? m.kpi?.id ?? null, kpi: m.kpi }))
      },
    },
    scorecardCriterion: { findUnique: async () => ({ scoringRuleJson: opts.rule ?? { type: 'LINEAR_CAPPED' } }) },
    kpiReading: {
      findMany: async (args: { where: { kpiId: { in: string[] } } }) => {
        calls.kpiReading.push(args)
        return (opts.readings ?? []).filter((r) => args.where.kpiId.in.includes(r.kpiId))
      },
    },
  }
  return { db: db as never, calls }
}

const KPI_UP: KpiRow = { id: 'kpi-1', name: 'Qualified leads', ownerId: 'emp-1', direction: 'INCREASE', scoredFrom: null, unit: '' }
const KPI_DOWN: KpiRow = { id: 'kpi-2', name: 'Defect escape rate', ownerId: 'emp-1', direction: 'DECREASE', scoredFrom: null, unit: '%' }

test('a KPI mapping resolves to the period average of its readings', async () => {
  const { db, calls } = makeDb({ kpiMappings: [{ position: 0, kpi: KPI_UP }], readings: MONTHLY })
  const resolved = await resolveMetricActual(db, 'eval-1', 'crit-1', null)
  assert.equal(resolved.actual, 20)
  assert.equal(resolved.sources.length, 1)
  const [source] = resolved.sources
  assert.equal(source.sourceType, 'KPI')
  assert.equal(source.kpiId, 'kpi-1')
  assert.equal(source.title, 'Qualified leads')
  assert.equal(source.readingCount, 3)
  assert.equal(source.direction, 'INCREASE')
  assert.equal(source.fallbackToCurrentValue, false)
  assert.equal(source.asOfDate?.slice(0, 10), '2026-09-30')
  // Live mappings are filtered to the employee, criterion and KPI type.
  const where = (calls.metricSourceMapping[0] as { where: Record<string, unknown> }).where
  assert.deepEqual(where, { criterionId: 'crit-1', employeeId: 'emp-1', sourceType: 'KPI', kpiId: { not: null } })
})

test('KPI rows in the evaluation snapshot are ignored (they carry no kpiId)', async () => {
  const { db } = makeDb({
    snapshot: [{ sourceType: 'KPI', keyResultId: null, keyResult: null, scrumMetricKey: null, position: 0 }],
    kpiMappings: [{ position: 0, kpi: KPI_UP }],
    readings: MONTHLY,
  })
  const resolved = await resolveMetricActual(db, 'eval-1', 'crit-1', null)
  assert.equal(resolved.sources.length, 1)
  assert.equal(resolved.actual, 20)
})

test('a lower-is-better KPI on a banded rule passes through its raw average', async () => {
  const { db } = makeDb({
    kpiMappings: [{ position: 0, kpi: KPI_DOWN }],
    readings: [reading('2026-07-01', '2026-07-31', 4, 'kpi-2'), reading('2026-08-01', '2026-08-31', 2, 'kpi-2')],
    rule: { type: 'INVERSE_BANDS', bands: [{ maxActual: 3, score: 10 }, { maxActual: null, score: 5 }] },
  })
  const resolved = await resolveMetricActual(db, 'eval-1', 'crit-1', null)
  assert.equal(resolved.actual, 3)
  assert.equal(resolved.sources[0].direction, 'DECREASE')
})

test('a lower-is-better KPI on a linear rule is unavailable and falls back to manual', async () => {
  const manual = { actual: 7, note: null, enteredById: 'lead-1', enteredAt: new Date('2026-10-02') }
  const blocked = makeDb({ kpiMappings: [{ position: 0, kpi: KPI_DOWN }], readings: [reading('2026-07-01', '2026-07-31', 4, 'kpi-2')] })
  await assert.rejects(
    () => resolveMetricActual(blocked.db, 'eval-1', 'crit-1', null),
    (error: unknown) => error instanceof MetricActualUnavailableError && /banded scoring rule/.test(error.message),
  )
  const withManual = makeDb({ kpiMappings: [{ position: 0, kpi: KPI_DOWN }], readings: [], manual })
  const resolved = await resolveMetricActual(withManual.db, 'eval-1', 'crit-1', null)
  assert.equal(resolved.sources[0].sourceType, 'MANUAL')
  assert.equal(resolved.actual, 7)
})

test('a KPI without a scored reading in the period is unavailable', async () => {
  const { db } = makeDb({ kpiMappings: [{ position: 0, kpi: KPI_UP }], readings: [reading('2026-05-01', '2026-05-31', 9)] })
  await assert.rejects(
    () => resolveMetricActual(db, 'eval-1', 'crit-1', null),
    (error: unknown) => error instanceof MetricActualUnavailableError && /no scored reading/.test(error.message),
  )
})

test('a KPI owned by someone else is unavailable', async () => {
  const { db } = makeDb({ kpiMappings: [{ position: 0, kpi: { ...KPI_UP, ownerId: 'other' } }], readings: MONTHLY })
  await assert.rejects(
    () => resolveMetricActual(db, 'eval-1', 'crit-1', null),
    (error: unknown) => error instanceof MetricActualUnavailableError,
  )
})

test('a deleted KPI (mapping without kpi) is unavailable', async () => {
  const { db } = makeDb({ kpiMappings: [{ position: 0, kpi: null, kpiId: 'gone' }] })
  await assert.rejects(
    () => resolveMetricActual(db, 'eval-1', 'crit-1', null),
    (error: unknown) => error instanceof MetricActualUnavailableError && /KPI source is missing/.test(error.message),
  )
})

test('KPIs with mixed directions on one criterion are unavailable', async () => {
  const { db } = makeDb({
    kpiMappings: [{ position: 0, kpi: KPI_UP }, { position: 1, kpi: KPI_DOWN }],
    readings: [...MONTHLY, reading('2026-07-01', '2026-07-31', 4, 'kpi-2')],
    rule: { type: 'INVERSE_BANDS', bands: [{ maxActual: null, score: 5 }] },
  })
  await assert.rejects(
    () => resolveMetricActual(db, 'eval-1', 'crit-1', null),
    (error: unknown) => error instanceof MetricActualUnavailableError && /share a direction/.test(error.message),
  )
})

test('KPI and Key Result sources aggregate together in mapping order', async () => {
  const { db } = makeDb({
    snapshot: [{
      sourceType: 'KEY_RESULT',
      keyResultId: 'kr-1',
      keyResultTitleSnapshot: 'Ship features',
      scrumMetricKey: null,
      scrumMetricLabelSnapshot: null,
      position: 1,
      keyResult: { id: 'kr-1', title: 'Ship features', status: 'ACTIVE', currentValue: 7 },
    }],
    checkIn: { value: 40, asOfDate: new Date('2026-08-15T00:00:00.000Z') },
    kpiMappings: [{ position: 0, kpi: KPI_UP }],
    readings: MONTHLY,
  })
  const avg = await resolveMetricActual(db, 'eval-1', 'crit-1', 'AVERAGE')
  assert.deepEqual(avg.sources.map((s) => s.sourceType), ['KPI', 'KEY_RESULT'])
  assert.equal(avg.actual, 30) // (20 + 40) / 2
  const sum = await resolveMetricActual(db, 'eval-1', 'crit-1', 'SUM')
  assert.equal(sum.actual, 60)
  const latest = await resolveMetricActual(db, 'eval-1', 'crit-1', 'LATEST')
  assert.equal(latest.actual, 20) // KPI as of 30 Sep is newer than the 15 Aug check-in
})

test('no KPI mappings → no criterion or reading queries', async () => {
  let touched = false
  const { db } = makeDb({})
  const guarded = new Proxy(db as object, {
    get(target, prop) {
      if (prop === 'kpiReading' || prop === 'scorecardCriterion') touched = true
      return (target as Record<string | symbol, unknown>)[prop]
    },
  })
  await assert.rejects(() => resolveMetricActual(guarded as never, 'eval-1', 'crit-1', null))
  assert.equal(touched, false)
})
