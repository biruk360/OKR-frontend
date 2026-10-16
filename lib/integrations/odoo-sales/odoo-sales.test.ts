import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregateDeals,
  buildSalesTargetsPayload,
  classifyLead,
  computeStanding,
  creditSplit,
  coverageRag,
  dueStatus,
  expectedBy,
  fiscalYearName,
  fromEtb,
  parsePace,
  quotaRag,
  rankOkrItems,
  syncedReadingRag,
  toEtb,
  truncateTitle,
  type OkrActionItem,
  type SalesLead,
  type SalesStage,
} from './index'
import { normalizeLead, odooDateTimeKey } from './odoo'
import { pushSalesTargets } from './webhook'

const FY = { startKey: '2026-07-08', endKey: '2027-07-06' }
const M = 1e6

const EDN = 'ETB 25M by 31 Dec · 60M by 31 Mar · 100M by 6 Jul'
const CEO = 'ETB 100M: 50M by 31 Mar · 100M by 6 Jul'
const YAR = 'ETB 8M by 31 Dec · 25M by 31 Mar · 60M by 6 Jul (C); 75M (A — his own top line, D72)'

// ---------------------------------------------------------------------------
// Pace
// ---------------------------------------------------------------------------

test('parsePace: checkpoints with years from the fiscal year', () => {
  assert.deepEqual(parsePace(EDN, 'ETB', FY), [
    { date: '2026-12-31', cumulative: 25 * M },
    { date: '2027-03-31', cumulative: 60 * M },
    { date: '2027-07-06', cumulative: 100 * M },
  ])
})

test('parsePace: a leading "ETB 100M:" total is the target, not a checkpoint', () => {
  assert.deepEqual(parsePace(CEO, 'ETB', FY), [
    { date: '2027-03-31', cumulative: 50 * M },
    { date: '2027-07-06', cumulative: 100 * M },
  ])
})

test('parsePace: committed (C) figures only — the aspirational part after ";" is ignored', () => {
  assert.deepEqual(parsePace(YAR, 'ETB', FY), [
    { date: '2026-12-31', cumulative: 8 * M },
    { date: '2027-03-31', cumulative: 25 * M },
    { date: '2027-07-06', cumulative: 60 * M },
  ])
})

test('parsePace: a total no checkpoint reaches is added at the FY end', () => {
  assert.deepEqual(parsePace('ETB 100M: 50M by 31 Mar', 'ETB', FY), [
    { date: '2027-03-31', cumulative: 50 * M },
    { date: '2027-07-06', cumulative: 100 * M },
  ])
})

test('parsePace: a day before the FY start month/day belongs to the end year', () => {
  // FY starts 8 Jul: "6 Jul" is 6 Jul 2027, "10 Jul" is 10 Jul 2026.
  const pace = parsePace('ETB 1M by 10 Jul · 9M by 6 Jul', 'ETB', FY)
  assert.deepEqual(pace.map((p) => p.date), ['2026-07-10', '2027-07-06'])
})

test('parsePace: bare numbers take the unit scale; K suffix; full month names', () => {
  assert.deepEqual(parsePace('25 by 31 December · 100 by 6 July', 'ETB M', FY), [
    { date: '2026-12-31', cumulative: 25 * M },
    { date: '2027-07-06', cumulative: 100 * M },
  ])
  assert.deepEqual(parsePace('500K by 31 Dec', 'ETB', FY), [{ date: '2026-12-31', cumulative: 500_000 }])
})

test('parsePace: [] when nothing parses', () => {
  assert.deepEqual(parsePace('≥8x', 'x', FY), [])
  assert.deepEqual(parsePace('', 'ETB', FY), [])
  assert.deepEqual(parsePace(null, 'ETB', FY), [])
})

test('toEtb / fromEtb normalise ETB units; unknown units throw', () => {
  assert.equal(toEtb(5, 'ETB'), 5)
  assert.equal(toEtb(5, 'ETB M'), 5 * M)
  assert.equal(toEtb(5, 'M ETB'), 5 * M)
  assert.equal(toEtb(5, 'ETB (M)'), 5 * M)
  assert.equal(toEtb(5, 'etb million'), 5 * M)
  assert.equal(toEtb(5, 'ETB K'), 5000)
  assert.equal(toEtb(80, '%'), 80)
  assert.equal(toEtb(8, 'x'), 8)
  assert.equal(fromEtb(25 * M, 'ETB M'), 25)
  assert.throws(() => toEtb(1, 'USD'), /Unknown KPI unit "USD"/)
  assert.throws(() => toEtb(1, 'deals'), /Unknown KPI unit/)
})

test('expectedBy on 16 Oct 2026 for EDN-K01 ≈ ETB 14.2M (25M × 100/176 days)', () => {
  const pace = parsePace(EDN, 'ETB', FY)
  const expected = expectedBy(pace, FY.startKey, '2026-10-16')
  assert.ok(Math.abs(expected - (25 * M * 100) / 176) < 1e-6, String(expected))
  assert.equal(Math.round(expected), 14_204_545)
})

test('expectedBy: 0 at the FY start, exact at checkpoints, target after the last', () => {
  const pace = parsePace(EDN, 'ETB', FY)
  assert.equal(expectedBy(pace, FY.startKey, '2026-07-08'), 0)
  assert.equal(expectedBy(pace, FY.startKey, '2026-07-01'), 0)
  assert.equal(expectedBy(pace, FY.startKey, '2026-12-31'), 25 * M)
  assert.equal(expectedBy(pace, FY.startKey, '2027-03-31'), 60 * M)
  assert.equal(expectedBy(pace, FY.startKey, '2027-08-01'), 100 * M)
  // Straight line between checkpoints: halfway through Jan–Mar (90 days) → 25M + 35M/2.
  const mid = expectedBy(pace, FY.startKey, '2027-02-15')
  assert.ok(mid > 25 * M && mid < 60 * M)
  assert.equal(expectedBy([], FY.startKey, '2026-10-16'), 0)
})

// ---------------------------------------------------------------------------
// Credit
// ---------------------------------------------------------------------------

const A = 1
const B = 2
const C = 3
const STAGES = new Map<number, SalesStage>([
  [1, { name: 'New', isWon: false }],
  [2, { name: 'Qualified', isWon: false }],
  [4, { name: 'Won', isWon: true }],
  [6, { name: 'Lost', isWon: false }],
  [7, { name: 'Unknown (90 days & older)', isWon: false }],
  [8, { name: 'On Hold', isWon: false }],
  [9, { name: 'Canceled', isWon: false }],
])

function lead(over: Partial<SalesLead> = {}): SalesLead {
  return {
    id: 1,
    name: 'Deal',
    active: true,
    userId: A,
    coOwnerIds: [],
    supportIds: [],
    expectedRevenue: 10 * M,
    stageId: 4,
    closedKey: '2026-09-01',
    isRotting: false,
    ...over,
  }
}

test('a deal with Salesperson A and Co-owner B, worth 10M → 5M each', () => {
  const split = creditSplit(lead({ userId: A, coOwnerIds: [B] }))
  assert.deepEqual([...split.entries()], [[A, 5 * M], [B, 5 * M]])
})

test('a deal with Support C → C gets 0', () => {
  const split = creditSplit(lead({ userId: A, coOwnerIds: [B], supportIds: [C] }))
  assert.equal(split.get(C) ?? 0, 0)
  assert.equal(split.has(C), false)
  assert.equal(split.get(A), 5 * M)
  const agg = aggregateDeals([lead({ userId: A, supportIds: [C] })], STAGES, FY)
  assert.equal(agg.byUser.get(C), undefined)
  assert.equal(agg.byUser.get(A)?.won, 10 * M)
})

test('a won deal with no amount → 0, counted in missingAmountCount', () => {
  const agg = aggregateDeals([lead({ expectedRevenue: 0, coOwnerIds: [B] })], STAGES, FY)
  assert.equal(agg.byUser.get(A)?.won, 0)
  assert.equal(agg.byUser.get(A)?.missingAmountCount, 1)
  assert.equal(agg.byUser.get(B)?.missingAmountCount, 1)
  assert.equal(agg.byUser.get(A)?.wonDeals.length, 1)
  assert.equal(agg.companyMissingAmountCount, 1)
})

test('creditSplit: owners are deduplicated; a Salesperson also listed as support keeps credit', () => {
  const split = creditSplit(lead({ userId: A, coOwnerIds: [A, B], supportIds: [A] }))
  assert.deepEqual([...split.entries()], [[A, 5 * M], [B, 5 * M]])
  assert.equal(creditSplit(lead({ userId: null, coOwnerIds: [] })).size, 0)
  assert.deepEqual([...creditSplit(lead({ userId: null, coOwnerIds: [B] }))], [[B, 10 * M]])
})

test('classifyLead: won in FY, open pipeline, and the excluded stages', () => {
  assert.equal(classifyLead(lead(), STAGES, FY), 'WON')
  assert.equal(classifyLead(lead({ closedKey: '2026-07-07' }), STAGES, FY), 'OTHER') // before FY
  assert.equal(classifyLead(lead({ closedKey: '2027-07-06' }), STAGES, FY), 'WON')
  assert.equal(classifyLead(lead({ closedKey: null }), STAGES, FY), 'OTHER')
  assert.equal(classifyLead(lead({ active: false }), STAGES, FY), 'OTHER') // archived won
  assert.equal(classifyLead(lead({ stageId: 2 }), STAGES, FY), 'OPEN')
  assert.equal(classifyLead(lead({ stageId: 2, active: false }), STAGES, FY), 'OTHER')
  for (const stageId of [6, 7, 8, 9]) assert.equal(classifyLead(lead({ stageId }), STAGES, FY), 'OTHER')
})

test('aggregateDeals: credited won/open per owner, stale count, company won at full amounts', () => {
  const agg = aggregateDeals(
    [
      lead({ id: 1, userId: A, coOwnerIds: [B], expectedRevenue: 10 * M }), // won 5M + 5M
      lead({ id: 2, userId: A, expectedRevenue: 2 * M }), // won 2M to A
      lead({ id: 3, userId: B, stageId: 2, expectedRevenue: 30 * M, isRotting: true }), // open
      lead({ id: 4, userId: A, stageId: 6, active: false, expectedRevenue: 99 * M }), // lost
      lead({ id: 5, userId: B, closedKey: '2026-06-30', expectedRevenue: 7 * M }), // won last FY
    ],
    STAGES,
    FY,
  )
  assert.equal(agg.byUser.get(A)?.won, 7 * M)
  assert.equal(agg.byUser.get(B)?.won, 5 * M)
  assert.equal(agg.byUser.get(B)?.openPipeline, 30 * M)
  assert.equal(agg.byUser.get(B)?.staleCount, 1)
  assert.equal(agg.companyWon, 12 * M)
  assert.equal(agg.companyWonCount, 2)
})

// ---------------------------------------------------------------------------
// Standing
// ---------------------------------------------------------------------------

test('computeStanding: RAG on won ÷ expected and coverage ÷ coverage target', () => {
  const pace = parsePace(EDN, 'ETB', FY)
  const base = { pace, fyStartKey: FY.startKey, fyEndKey: FY.endKey, coverageTarget: 8, todayKey: '2026-10-16' }
  const zero = computeStanding({ ...base, won: 0, openPipeline: 0 })
  assert.equal(zero.target, 100 * M)
  assert.equal(Math.round(zero.expected), 14_204_545)
  assert.equal(zero.ragQuota, 'RED')
  assert.equal(zero.remaining, 100 * M)
  assert.equal(zero.coverage, 0)
  assert.equal(zero.ragCoverage, 'RED')
  assert.deepEqual(zero.nextCheckpoint, { date: '2026-12-31', cumulative: 25 * M, gap: 25 * M })

  const amber = computeStanding({ ...base, won: zero.expected * 0.95, openPipeline: 0 })
  assert.equal(amber.ragQuota, 'AMBER')
  const green = computeStanding({ ...base, won: 20 * M, openPipeline: 8 * 80 * M })
  assert.equal(green.ragQuota, 'GREEN')
  assert.equal(green.coverage, 8)
  assert.equal(green.ragCoverage, 'GREEN')
  assert.ok(green.gap > 0)

  const met = computeStanding({ ...base, won: 120 * M, openPipeline: 0 })
  assert.equal(met.remaining, 0)
  assert.equal(met.coverage, null)
  assert.equal(met.ragCoverage, 'GREEN')
  assert.equal(met.perMonthNeeded, 0)
})

test('quotaRag / coverageRag honour the KPI thresholdAmber', () => {
  assert.equal(quotaRag(85, 100, 0.8), 'AMBER')
  assert.equal(quotaRag(85, 100, 0.9), 'RED')
  assert.equal(coverageRag(7.5, 8, 0.9), 'AMBER')
  assert.equal(coverageRag(5, 5), 'GREEN')
  assert.equal(coverageRag(1, null), null)
})

test('syncedReadingRag: quota against pace; coverage against its x target', () => {
  const quota = { externalSource: 'ODOO_WON', direction: 'INCREASE', targetValue: null, thresholdAmber: 0.9, targetText: EDN, unit: 'ETB' }
  assert.equal(syncedReadingRag(quota, 0, FY, '2026-10-16'), 'RED')
  assert.equal(syncedReadingRag(quota, 15 * M, FY, '2026-10-16'), 'GREEN')
  assert.equal(syncedReadingRag(quota, null, FY, '2026-10-16'), null)
  const coverage = { externalSource: 'ODOO_COVERAGE', direction: 'INCREASE', targetValue: 8, thresholdAmber: 0.9, targetText: '≥8x', unit: 'x' }
  assert.equal(syncedReadingRag(coverage, 7.4, FY, '2026-10-16'), 'AMBER')
})

// ---------------------------------------------------------------------------
// OKR items
// ---------------------------------------------------------------------------

function item(over: Partial<OkrActionItem>): OkrActionItem {
  return { type: 'TASK', title: 't', dueDate: null, status: 'DUE_SOON', url: 'https://okr.example/x', ...over }
}

test('rankOkrItems: overdue first, then by due date, undated last; at most 8', () => {
  const ranked = rankOkrItems([
    item({ title: 'kr', type: 'KR_AT_RISK', status: 'AT_RISK' }),
    item({ title: 'kr2', type: 'KR_AT_RISK', status: 'OFF_TRACK' }),
    item({ title: 'soon', dueDate: '2026-10-20', status: 'DUE_SOON' }),
    item({ title: 'late2', dueDate: '2026-10-10', status: 'OVERDUE' }),
    item({ title: 'cp', type: 'CHECKPOINT', dueDate: '2026-10-18', status: 'DUE_SOON' }),
    item({ title: 'late1', dueDate: '2026-09-01', status: 'OVERDUE' }),
  ])
  assert.deepEqual(ranked.map((i) => i.title), ['late1', 'late2', 'cp', 'soon', 'kr2', 'kr'])
  const many = Array.from({ length: 12 }, (_, i) => item({ title: `t${i}`, dueDate: `2026-10-${String(10 + i).padStart(2, '0')}` }))
  assert.equal(rankOkrItems(many).length, 8)
})

test('truncateTitle caps at 120 characters; dueStatus splits on today', () => {
  const long = 'x'.repeat(200)
  assert.equal(truncateTitle(long).length, 120)
  assert.ok(truncateTitle(long).endsWith('…'))
  assert.equal(truncateTitle('  a   b  '), 'a b')
  assert.equal(dueStatus('2026-10-15', '2026-10-16'), 'OVERDUE')
  assert.equal(dueStatus('2026-10-16', '2026-10-16'), 'DUE_SOON')
})

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

test('buildSalesTargetsPayload: contract shape, rounding, secret only when given', () => {
  const input = {
    sentAt: new Date('2026-10-17T03:30:05.123Z'),
    fiscalYear: { name: fiscalYearName('FY 2026/27'), ...FY },
    company: { kpiRef: 'CEO-K01', target: 300 * M, pace: [{ date: '2027-07-06', cumulative: 300 * M }] },
    targets: [
      {
        email: 'yared@360ground.com',
        kpiRef: 'YAR-K01',
        kpiName: 'Team quota',
        target: 60 * M,
        unit: 'ETB' as const,
        pace: parsePace(YAR, 'ETB', FY),
        coverageTarget: 8,
        coverageKpiRef: 'YAR-K02',
        okr: { won: 6_575_490.664, expected: 4_204_545.45, rag: 'GREEN' as const, coverage: 3.14159, items: [] },
        okrUrl: 'https://okr.360ground.com/dashboard',
      },
      {
        email: 'eden@360ground.com',
        kpiRef: 'EDN-K01',
        kpiName: 'Quota',
        target: 100 * M,
        unit: 'ETB' as const,
        pace: parsePace(EDN, 'ETB', FY),
        coverageTarget: 8,
        coverageKpiRef: 'EDN-K02',
        okr: { won: 0, expected: 14_204_545.45, rag: 'RED' as const, coverage: 0, items: [] },
        okrUrl: 'https://okr.360ground.com/dashboard',
      },
    ],
  }
  const withoutSecret = buildSalesTargetsPayload(input)
  assert.equal('secret' in withoutSecret, false)
  assert.equal(withoutSecret.schema, 'okr-sales-targets/v1')
  assert.equal(withoutSecret.sentAt, '2026-10-17T03:30:05Z')
  assert.deepEqual(withoutSecret.fiscalYear, { name: 'FY2026/27', start: '2026-07-08', end: '2027-07-06' })
  assert.deepEqual(withoutSecret.targets.map((t) => t.email), ['eden@360ground.com', 'yared@360ground.com'])
  assert.equal(withoutSecret.targets[0].okr.expected, 14_204_545)
  assert.equal(withoutSecret.targets[1].okr.won, 6_575_490.66)
  assert.equal(withoutSecret.targets[1].okr.coverage, 3.14)
  assert.equal(buildSalesTargetsPayload(input, 's3cret').secret, 's3cret')
})

// ---------------------------------------------------------------------------
// Odoo reader normalisation + webhook
// ---------------------------------------------------------------------------

test('odooDateTimeKey reads Odoo UTC datetimes as Addis Ababa dates', () => {
  assert.equal(odooDateTimeKey('2026-10-15 22:30:00', 'Africa/Addis_Ababa'), '2026-10-16')
  assert.equal(odooDateTimeKey('2026-10-15 08:00:00', 'Africa/Addis_Ababa'), '2026-10-15')
  assert.equal(odooDateTimeKey(false, 'Africa/Addis_Ababa'), null)
})

test('normalizeLead maps XML-RPC values; missing x_support_ids is empty', () => {
  const l = normalizeLead(
    {
      id: 9,
      name: false,
      active: true,
      user_id: [5, 'Yared'],
      x_coassignee_ids: [10],
      expected_revenue: false,
      stage_id: [4, 'Won'],
      date_closed: '2026-09-01 10:00:00',
      is_rotting: true,
    },
    'Africa/Addis_Ababa',
  )
  assert.deepEqual(l, {
    id: 9,
    name: 'Opportunity 9',
    active: true,
    userId: 5,
    coOwnerIds: [10],
    supportIds: [],
    expectedRevenue: 0,
    stageId: 4,
    closedKey: '2026-09-01',
    isRotting: true,
  })
})

function fakeFetch(statuses: Array<number | Error>) {
  const calls: RequestInit[] = []
  const impl = (async (_url: string, init: RequestInit) => {
    calls.push(init)
    const next = statuses.shift()
    if (next instanceof Error) throw next
    return new Response('{}', { status: next ?? 200 })
  }) as unknown as typeof fetch
  return { impl, calls }
}

const PAYLOAD = buildSalesTargetsPayload({ sentAt: new Date(), fiscalYear: { name: 'FY2026/27', ...FY }, company: null, targets: [] }, 'secret')

test('pushSalesTargets: one retry on 5xx, then success', async () => {
  const f = fakeFetch([502, 200])
  const r = await pushSalesTargets(PAYLOAD, { url: 'https://odoo.example/hook', fetchImpl: f.impl })
  assert.deepEqual(r, { ok: true, status: 200, attempts: 2 })
  assert.equal(JSON.parse(String(f.calls[0].body)).secret, 'secret')
})

test('pushSalesTargets: network error twice → failure without the URL in the message', async () => {
  const f = fakeFetch([new TypeError('fetch failed'), new TypeError('fetch failed')])
  const r = await pushSalesTargets(PAYLOAD, { url: 'https://odoo.example/web/hook/abc123', fetchImpl: f.impl })
  assert.equal(r.ok, false)
  assert.equal(f.calls.length, 2)
  assert.ok(!r.ok && !r.error.includes('abc123'))
})

test('pushSalesTargets: 4xx is not retried', async () => {
  const f = fakeFetch([403, 200])
  const r = await pushSalesTargets(PAYLOAD, { url: 'https://odoo.example/hook', fetchImpl: f.impl })
  assert.deepEqual(r, { ok: false, error: 'Odoo webhook answered HTTP 403', attempts: 1 })
  assert.equal(f.calls.length, 1)
})
