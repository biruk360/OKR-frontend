import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MetricActualUnavailableError, resolveMetricActual } from '@/lib/performance/metric-resolver'

/**
 * Manual metric-actual fallback (D3): when automatic resolution fails the
 * resolver falls back to a manually entered actual; when automatic resolution
 * succeeds the manual row is ignored. These tests stub the Prisma client, so
 * they run without a live database.
 */

const PERIOD = { periodStart: new Date('2025-01-01'), periodEnd: new Date('2025-06-30') }

function makeDb(overrides: {
  metricSources?: unknown[]
  checkIn?: { value: number; asOfDate: Date } | null
  manual?: { actual: number; note: string | null; enteredById: string; enteredAt: Date } | null
}) {
  return {
    evaluation: {
      findUnique: async () => ({
        employeeId: 'emp-1',
        cycle: PERIOD,
        metricSources: overrides.metricSources ?? [],
      }),
    },
    keyResultCheckIn: { findFirst: async () => overrides.checkIn ?? null },
    evaluationMetricManualActual: { findUnique: async () => overrides.manual ?? null },
  } as never
}

const MANUAL_ROW = { actual: 42, note: 'Reported by department', enteredById: 'lead-1', enteredAt: new Date('2025-07-01') }

test('falls back to the manual actual when no source is mapped', async () => {
  const resolved = await resolveMetricActual(makeDb({ manual: MANUAL_ROW }), 'eval-1', 'crit-1', null)
  assert.equal(resolved.actual, 42)
  assert.equal(resolved.sources.length, 1)
  assert.deepEqual(resolved.sources[0], {
    sourceType: 'MANUAL',
    title: 'Manual entry',
    value: 42,
    asOfDate: MANUAL_ROW.enteredAt.toISOString(),
    fallbackToCurrentValue: false,
    note: 'Reported by department',
    enteredById: 'lead-1',
  })
})

test('rethrows MetricActualUnavailableError when no manual fallback exists', async () => {
  await assert.rejects(
    () => resolveMetricActual(makeDb({}), 'eval-1', 'crit-1', null),
    (error: unknown) => error instanceof MetricActualUnavailableError,
  )
})

test('automatic resolution wins over an existing manual row', async () => {
  const db = makeDb({
    metricSources: [{
      sourceType: 'KEY_RESULT',
      keyResultId: 'kr-1',
      keyResultTitleSnapshot: 'Ship features',
      scrumMetricKey: null,
      scrumMetricLabelSnapshot: null,
      keyResult: { id: 'kr-1', title: 'Ship features', status: 'ACTIVE', currentValue: 7 },
    }],
    checkIn: { value: 9, asOfDate: new Date('2025-05-01') },
    manual: MANUAL_ROW,
  })
  const resolved = await resolveMetricActual(db, 'eval-1', 'crit-1', null)
  assert.equal(resolved.actual, 9)
  assert.equal(resolved.sources[0].sourceType, 'KEY_RESULT')
})
