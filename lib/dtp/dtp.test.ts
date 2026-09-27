import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * Daily Trip Planning (lib/dtp): HH:MM time math, the plan state machine,
 * coordinator diffs, the Ethiopian calendar, leg generation, approval routing
 * and plan read access. DB-touching helpers run against a fake Prisma client
 * installed on `globalThis.prisma` before the modules are imported.
 */

const SETTINGS = {
  id: 'default',
  officeLabel: 'HQ',
  officeAnchorLat: 9.0,
  officeAnchorLng: 38.7,
  poolCoordinatorIds: 'pool1, pool2',
  operationsManagerIds: 'ops1',
}
const ROUTING = [
  { id: 'r0', departmentId: null as string | null, primaryCoordinatorId: 'tcDefault', alternateCoordinatorId: null as string | null, failoverHours: 6, managerEndorsementMode: 'ADVISORY' },
  { id: 'r1', departmentId: 'd1', primaryCoordinatorId: 'tc1', alternateCoordinatorId: 'tc1alt', failoverHours: 2, managerEndorsementMode: 'REQUIRED' },
]
const MEMBERSHIPS = [{ id: 'm1', userId: 'lead1', departmentId: 'd1', role: 'HEAD', endedAt: null }]

type Stop = {
  id: string; seq: number; requiresVehicle: boolean; tripMode: 'ONE_WAY' | 'ROUND_TRIP'; plannedStart: string; dwellMinutes: number
  destinationName: string; destinationLat: number | null; destinationLng: number | null; withWhom: string
  pickupBackTo: string | null; pickupBackAddress: string | null; pickupBackLat: number | null; pickupBackLng: number | null
}
let PLAN: { id: string; requesterId: string; stops: Stop[] } | null = null
const planUpdates: any[] = []
const dtpEvents: any[] = []
let transactionCalls = 0

;(globalThis as any).prisma = {
  dtpSettings: {
    async findUnique() { return SETTINGS },
    async create() { return SETTINGS },
  },
  dtpDepartmentApproval: {
    async findMany({ where }: any) {
      if (where.OR && where.OR[0].primaryCoordinatorId !== undefined) {
        const uid = where.OR[0].primaryCoordinatorId
        return ROUTING.filter((r) => r.primaryCoordinatorId === uid || r.alternateCoordinatorId === uid)
      }
      if (where.OR) {
        const dept = where.OR[0].departmentId
        return ROUTING.filter((r) => r.departmentId === dept || r.departmentId === null)
      }
      return ROUTING.filter((r) => r.departmentId === null)
    },
  },
  departmentMembership: {
    async findFirst({ where }: any) {
      return MEMBERSHIPS.find((m) => m.userId === where.userId && m.departmentId === where.departmentId && m.role === where.role) ?? null
    },
  },
  dailyTripPlan: {
    async findUnique() { return PLAN },
    async update(args: any) { planUpdates.push(args); return { id: args.where.id, ...args.data } },
  },
  dtpEvent: {
    async create({ data }: any) { dtpEvents.push(data); return data },
  },
  async $transaction(ops: any) { transactionCalls++; return typeof ops === 'function' ? ops(this) : Promise.all(ops) },
}

// ── time.ts ─────────────────────────────────────────────────────────────────

test('time: parse / format / add / diff / window', async () => {
  const t = await import('./time')
  assert.equal(t.parseHHMM('00:00'), 0)
  assert.equal(t.parseHHMM('23:59'), 1439)
  for (const bad of ['24:00', '9:00', '12:60', '1200', '', '12:5']) {
    assert.throws(() => t.parseHHMM(bad), /Invalid HH:MM/, bad)
    assert.equal(t.isHHMM(bad), false, bad)
  }
  assert.equal(t.formatHHMM(0), '00:00')
  assert.equal(t.formatHHMM(605), '10:05')
  assert.equal(t.formatHHMM(1440 + 30), '00:30') // wraps forward
  assert.equal(t.formatHHMM(-10), '23:50') // wraps backward
  assert.equal(t.addMinutes('09:00', 75), '10:15')
  assert.equal(t.addMinutes('09:00', -10), '08:50')
  assert.equal(t.diffMinutes('10:15', '09:00'), 75)
  assert.equal(t.diffMinutes('09:00', '10:15'), -75)
  assert.equal(t.inWindow('08:00', '08:00', '09:00'), true) // start inclusive
  assert.equal(t.inWindow('09:00', '08:00', '09:00'), false) // end exclusive
  assert.equal(t.inWindow('07:59', '08:00', '09:00'), false)
})

test('time: toLocalIso pins the trip date to Addis Ababa (+03:00)', async () => {
  const t = await import('./time')
  assert.equal(t.toLocalIso(new Date('2026-09-25T00:00:00Z'), '07:05'), '2026-09-25T07:05:00+03:00')
  assert.equal(new Date(t.toLocalIso(new Date('2026-01-01T00:00:00Z'), '02:00')).toISOString(), '2025-12-31T23:00:00.000Z')
})

// ── state-machine.ts ────────────────────────────────────────────────────────

const STATUSES = ['DRAFT', 'SUBMITTED', 'MANAGER_ENDORSED', 'UNDER_REVIEW', 'RETURNED', 'ADJUSTED', 'APPROVED',
  'DRIVER_ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'RECONCILED', 'WITHDRAWN', 'CANCELLED', 'EXPIRED'] as const

test('state machine: key allowed and forbidden transitions', async () => {
  const sm = await import('./state-machine')
  const allowed: Array<[string, string]> = [
    ['DRAFT', 'SUBMITTED'], ['SUBMITTED', 'APPROVED'], ['SUBMITTED', 'RETURNED'], ['RETURNED', 'SUBMITTED'],
    ['ADJUSTED', 'APPROVED'], ['APPROVED', 'DRIVER_ASSIGNED'], ['DRIVER_ASSIGNED', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'COMPLETED'], ['COMPLETED', 'RECONCILED'], ['APPROVED', 'CANCELLED'],
  ]
  const forbidden: Array<[string, string]> = [
    ['DRAFT', 'APPROVED'], ['APPROVED', 'DRAFT'], ['COMPLETED', 'CANCELLED'], ['UNDER_REVIEW', 'WITHDRAWN'],
    ['ADJUSTED', 'WITHDRAWN'], ['IN_PROGRESS', 'APPROVED'], ['DRAFT', 'DRAFT'],
  ]
  for (const [a, b] of allowed) assert.equal(sm.canTransition(a as any, b as any), true, `${a}→${b}`)
  for (const [a, b] of forbidden) assert.equal(sm.canTransition(a as any, b as any), false, `${a}→${b}`)
})

test('state machine: terminal states have no exits; editability windows', async () => {
  const sm = await import('./state-machine')
  for (const s of STATUSES) {
    if (sm.isTerminal(s)) {
      for (const to of STATUSES) assert.equal(sm.canTransition(s, to), false, `${s} is terminal but → ${to}`)
    }
  }
  assert.deepEqual(STATUSES.filter(sm.isTerminal), ['RECONCILED', 'WITHDRAWN', 'CANCELLED', 'EXPIRED'])
  assert.deepEqual(STATUSES.filter(sm.isRequesterEditable), ['DRAFT', 'RETURNED'])
  assert.deepEqual(STATUSES.filter(sm.isCoordinatorEditable), ['SUBMITTED', 'MANAGER_ENDORSED', 'UNDER_REVIEW'])
  // Every non-terminal status can eventually leave (no dead ends).
  for (const s of STATUSES.filter((x) => !sm.isTerminal(x))) {
    assert.ok(STATUSES.some((to) => sm.canTransition(s, to)), `${s} is a dead end`)
  }
})

// ── diff.ts ─────────────────────────────────────────────────────────────────

test('diffStop: only diffable fields that actually changed; null ≈ undefined; deep compare by JSON', async () => {
  const d = await import('./diff')
  const original = { destinationName: 'A', plannedStart: '09:00', dwellMinutes: 60, reason: null, withWhom: '', seq: 1, id: 'x', notDiffable: 1 }
  const edited = { destinationName: 'B', plannedStart: '09:00', dwellMinutes: 90, reason: undefined, withWhom: '', seq: 1, id: 'y', notDiffable: 2 }
  const diff = d.diffStop(original, edited)
  assert.deepEqual(diff, {
    destinationName: { before: 'A', after: 'B' },
    dwellMinutes: { before: 60, after: 90 },
  })
  assert.equal(d.hasMaterialChanges(diff), true)
  assert.equal(d.hasMaterialChanges(d.diffStop(original, { ...original })), false)
})

test('mergeAdjustments: keeps the earliest "before", takes the latest "after"', async () => {
  const d = await import('./diff')
  const first = { dwellMinutes: { before: 60, after: 90 } }
  const second = { dwellMinutes: { before: 90, after: 120 }, plannedStart: { before: '09:00', after: '10:00' } }
  assert.deepEqual(d.mergeAdjustments(first, second), {
    dwellMinutes: { before: 60, after: 120 },
    plannedStart: { before: '09:00', after: '10:00' },
  })
  assert.deepEqual(d.mergeAdjustments(null, first), first)
})

// BUG: lib/dtp/diff.ts:64 — `out[k]?.before ?? v.before` treats an original
// `before: null` (field was empty) as "no prior edit", so a second Coordinator
// edit overwrites it with the first edit's value and the requester's diff shows
// the wrong original.
test('BUG: mergeAdjustments preserves an original null "before"', async () => {
  const d = await import('./diff')
  const merged = d.mergeAdjustments({ reason: { before: null, after: 'X' } }, { reason: { before: 'X', after: 'Y' } })
  assert.deepEqual(merged.reason, { before: null, after: 'Y' })
})

// ── ec-calendar.ts ──────────────────────────────────────────────────────────

test('Ethiopian calendar: new year, Pagume, Genna, Meskel (common-year cycle positions)', async () => {
  const ec = await import('./ec-calendar')
  const cases: Array<[string, number, number, number, string]> = [
    ['2025-09-11', 2018, 1, 1, 'Meskerem'],   // Enkutatash
    ['2025-09-10', 2017, 13, 5, 'Pagume'],
    ['2025-01-07', 2017, 4, 29, 'Tahsas'],    // Genna
    ['2026-09-25', 2019, 1, 15, 'Meskerem'],
    ['2026-09-27', 2019, 1, 17, 'Meskerem'],  // Meskel
  ]
  for (const [iso, year, month, day, monthName] of cases) {
    assert.deepEqual(ec.gregorianToEthiopian(new Date(`${iso}T00:00:00Z`)), { year, month, day, monthName }, iso)
  }
  assert.equal(ec.formatEthiopian(new Date('2025-09-11T12:00:00Z')), '1 Meskerem 2018 EC')
  assert.equal(ec.formatDual(new Date('2025-09-11T00:00:00Z')), '1 Meskerem 2018 EC · 2025-09-11')
})

/** Reference conversion (Dershowitz & Reingold, Calendrical Calculations; ethiopic epoch = R.D. 2796). */
function referenceEthiopian(date: Date): { year: number; month: number; day: number } {
  const rd = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000) + 719_163
  const year = Math.floor((4 * (rd - 2796) + 1463) / 1461)
  const yearStart = 2796 - 1 + 365 * (year - 1) + Math.floor(year / 4)
  const month = Math.floor((rd - yearStart - 1) / 30) + 1
  return { year, month, day: rd - yearStart - 30 * (month - 1) }
}

test('Ethiopian reference converter sanity (used by the BUG test below)', () => {
  assert.deepEqual(referenceEthiopian(new Date('2023-09-12T00:00:00Z')), { year: 2016, month: 1, day: 1 })
  assert.deepEqual(referenceEthiopian(new Date('2023-09-11T00:00:00Z')), { year: 2015, month: 13, day: 6 })
  assert.deepEqual(referenceEthiopian(new Date('2024-01-07T00:00:00Z')), { year: 2016, month: 4, day: 28 })
})

// BUG: lib/dtp/ec-calendar.ts:34-39 — jdnToEthiopian puts the leap day at the end
// of the 4-year cycle (`yearInCycle === 4`), but the Ethiopian leap year is the
// 3rd of the cycle (year % 4 === 3, e.g. 2015 EC has Pagume 6). Every date in the
// Ethiopian year that follows a leap year is off by one day — 986 of 4,018 days
// between 2020 and 2030 (all of 2012, 2016, 2020 EC); e.g. 2023-09-12 renders as
// "2 Meskerem 2016" instead of 1 Meskerem, and 5 Pagume 2016 is followed by
// "5 Meskerem". The header's "verified against tables for 2020-2030" is wrong.
test('BUG: gregorianToEthiopian matches the reference conversion for 2020-2030', async () => {
  const ec = await import('./ec-calendar')
  const wrong: string[] = []
  for (let t = Date.UTC(2020, 0, 1); t <= Date.UTC(2030, 11, 31); t += 86_400_000) {
    const d = new Date(t)
    const { year, month, day } = ec.gregorianToEthiopian(d)
    const ref = referenceEthiopian(d)
    if (year !== ref.year || month !== ref.month || day !== ref.day) wrong.push(d.toISOString().slice(0, 10))
  }
  assert.deepEqual(wrong, [])
})

test('Ethiopian calendar: leap-cycle anchors (Pagume 6 in year % 4 === 3; new year on Sept 12 before a Gregorian leap year)', async () => {
  const ec = await import('./ec-calendar')
  const cases: Array<[string, number, number, number]> = [
    ['2023-09-12', 2016, 1, 1],   // 2016 EC Meskerem 1 (2024 is a Gregorian leap year)
    ['2023-09-11', 2015, 13, 6],  // 2015 EC is leap → Pagume 6
    ['2024-09-11', 2017, 1, 1],   // 2017 EC Meskerem 1
    ['2024-09-10', 2016, 13, 5],  // 2016 EC is common → Pagume 5 is the last day
    ['2020-09-10', 2012, 13, 5],  // 2012 EC is common (2012 % 4 === 0) → Pagume 5 is its last day
    ['2019-09-11', 2011, 13, 6],  // 2011 EC is leap → Pagume 6
    ['2020-09-11', 2013, 1, 1],
    ['2019-09-12', 2012, 1, 1],
    ['2027-09-12', 2020, 1, 1],   // 2019 EC is leap → 2020 EC starts Sept 12
    ['2027-09-11', 2019, 13, 6],
  ]
  for (const [iso, year, month, day] of cases) {
    const got = ec.gregorianToEthiopian(new Date(`${iso}T00:00:00Z`))
    assert.deepEqual({ year: got.year, month: got.month, day: got.day }, { year, month, day }, iso)
  }
  assert.equal(ec.formatEthiopian(new Date('2019-09-11T00:00:00Z')), '6 Pagume 2011 EC')
})

// ── api-helpers / settings pure helpers ─────────────────────────────────────

test('trimOrNull / parsePathDate / parseCsvIds / startOfUtcDay', async () => {
  const h = await import('./api-helpers')
  const s = await import('./settings')
  const sheets = await import('./sheets')
  assert.equal(h.trimOrNull('  hi '), 'hi')
  assert.equal(h.trimOrNull('   '), null)
  assert.equal(h.trimOrNull(5), null)
  assert.equal(h.parsePathDate('2026-09-25')!.toISOString(), '2026-09-25T00:00:00.000Z')
  for (const bad of ['2026-9-25', '25-09-2026', '2026-13-01', 'x']) assert.equal(h.parsePathDate(bad), null, bad)
  assert.deepEqual(s.parseCsvIds(' a, b,,c ,'), ['a', 'b', 'c'])
  assert.deepEqual(s.parseCsvIds(null), [])
  assert.equal(sheets.startOfUtcDay(new Date('2026-09-25T21:45:10.123Z')).toISOString(), '2026-09-25T00:00:00.000Z')
})

test('resolveApprovalRouting: department row beats the org default; defaults when none', async () => {
  const s = await import('./settings')
  assert.deepEqual(await s.resolveApprovalRouting('d1'), {
    primaryCoordinatorId: 'tc1', alternateCoordinatorId: 'tc1alt', failoverHours: 2, managerEndorsementMode: 'REQUIRED',
  })
  assert.deepEqual(await s.resolveApprovalRouting('d-unknown'), {
    primaryCoordinatorId: 'tcDefault', alternateCoordinatorId: null, failoverHours: 6, managerEndorsementMode: 'ADVISORY',
  })
  assert.deepEqual(await s.resolveApprovalRouting(null), {
    primaryCoordinatorId: 'tcDefault', alternateCoordinatorId: null, failoverHours: 6, managerEndorsementMode: 'ADVISORY',
  })
})

// ── permissions.ts ──────────────────────────────────────────────────────────

test('canReadPlan: requester, admin roles, ops manager, dept coordinators, dept HEAD lead, pool coordinator', async () => {
  const p = await import('./permissions')
  const sess = (id: string, role = 'EMPLOYEE') => ({ user: { id, role } }) as any
  const plan = { requesterId: 'emp1', departmentId: 'd1' }
  const table: Array<[any, boolean, string]> = [
    [null, false, 'no session'],
    [sess('emp1'), true, 'requester'],
    [sess('admin', 'ADMIN'), true, 'ADMIN'],
    [sess('exec', 'EXECUTIVE'), true, 'EXECUTIVE'],
    [sess('ops1'), true, 'operations manager'],
    [sess('tc1'), true, 'primary coordinator'],
    [sess('tc1alt'), true, 'alternate coordinator'],
    [sess('lead1', 'DEPARTMENT_LEAD'), true, 'department HEAD'],
    [sess('lead2', 'DEPARTMENT_LEAD'), false, 'lead of another department'],
    [sess('pool2'), true, 'pool coordinator'],
    [sess('emp2'), false, 'unrelated employee'],
    [sess('tcDefault'), false, 'org-default coordinator is not the d1 coordinator'],
  ]
  for (const [session, want, label] of table) assert.equal(await p.canReadPlan(session, plan), want, label)
  assert.equal(await p.canActAsCoordinator(sess('tc1'), 'd1'), true)
  assert.equal(await p.canActAsCoordinator(sess('tc1'), null), false)
  assert.equal(await p.canActAsCoordinator(sess('ops1'), 'd9'), true)
  assert.equal(await p.canActAsCoordinator(sess('emp1'), 'd1'), false)
  assert.equal(await p.isAnyTravelCoordinator('tc1alt'), true)
  assert.equal(await p.isAnyTravelCoordinator('emp1'), false)
})

// ── legs.ts ─────────────────────────────────────────────────────────────────

function stop(o: Partial<Stop> & { id: string; seq: number }): Stop {
  return {
    requiresVehicle: true, tripMode: 'ONE_WAY', plannedStart: '09:00', dwellMinutes: 60,
    destinationName: `Dest ${o.id}`, destinationLat: o.seq, destinationLng: o.seq, withWhom: '',
    pickupBackTo: null, pickupBackAddress: null, pickupBackLat: null, pickupBackLng: null,
    ...o,
  }
}

test('generateLegsForPlan: DROPOFF per vehicle stop, RETURN_PICKUP for round trips, cursor follows the route', async () => {
  const legs = await import('./legs')
  PLAN = {
    id: 'plan1',
    requesterId: 'req',
    stops: [
      stop({ id: 's1', seq: 1, tripMode: 'ROUND_TRIP', plannedStart: '09:00', dwellMinutes: 45, pickupBackTo: 'NEXT_STOP', withWhom: 'u2,u3' }),
      stop({ id: 's2', seq: 2, requiresVehicle: false, plannedStart: '10:30' }),
      stop({ id: 's3', seq: 3, tripMode: 'ONE_WAY', plannedStart: '13:00' }),
      stop({ id: 's4', seq: 4, tripMode: 'ROUND_TRIP', plannedStart: '14:00', dwellMinutes: 30, pickupBackTo: 'CUSTOM', pickupBackAddress: 'Bole', pickupBackLat: 1, pickupBackLng: 2 }),
      stop({ id: 's5', seq: 5, tripMode: 'ROUND_TRIP', plannedStart: '16:00', dwellMinutes: 20, pickupBackTo: 'NEXT_STOP' }), // last → office
    ],
  }
  const out = await legs.generateLegsForPlan('plan1')
  const summary = out.map((l) => `${l.tripStopId} ${l.legType} ${l.scheduledTime} ${l.fromLabel}→${l.toLabel}`)
  assert.deepEqual(summary, [
    's1 DROPOFF 08:50 HQ→Dest s1',
    's1 RETURN_PICKUP 09:45 Dest s1→Dest s2',
    's3 DROPOFF 12:50 Dest s2→Dest s3',
    's4 DROPOFF 13:50 Dest s3→Dest s4',
    's4 RETURN_PICKUP 14:30 Dest s4→Bole',
    's5 DROPOFF 15:50 Bole→Dest s5',
    's5 RETURN_PICKUP 16:20 Dest s5→HQ',
  ])
  assert.equal(out[0].passengerIds, 'req,u2,u3')
  assert.equal(out[2].passengerIds, 'req')
  assert.deepEqual([out[0].fromLat, out[0].fromLng], [9.0, 38.7])
  assert.deepEqual([out[4].toLat, out[4].toLng], [1, 2])
  assert.ok(out.every((l) => l.planId === 'plan1' && l.estimatedTrafficMin === 10))
})

test('generateLegsForPlan: missing plan → no legs; no vehicle stops → no legs', async () => {
  const legs = await import('./legs')
  PLAN = null
  assert.deepEqual(await legs.generateLegsForPlan('none'), [])
  PLAN = { id: 'p', requesterId: 'r', stops: [stop({ id: 'w', seq: 1, requiresVehicle: false })] }
  assert.deepEqual(await legs.generateLegsForPlan('p'), [])
})

// BUG: lib/dtp/legs.ts:74 + time.ts:22 — formatHHMM wraps modulo 24h, so a stop
// planned at 00:05 gets its DROPOFF scheduled at "23:55" on the same trip date
// (i.e. after the stop), and a late round trip's pickup lands at "00:xx", which
// the Run Sheet (orderBy scheduledTime asc) sorts to the top of the day.
test('BUG: leg times never wrap past midnight', async () => {
  const legs = await import('./legs')
  PLAN = { id: 'p', requesterId: 'r', stops: [stop({ id: 'x', seq: 1, plannedStart: '00:05' })] }
  const [drop] = await legs.generateLegsForPlan('p')
  assert.ok(drop.scheduledTime <= '00:05', drop.scheduledTime)
})

test('leg times carry past midnight into the next day ("24:30") and render as "00:30 (+1)"', async () => {
  const legs = await import('./legs')
  const t = await import('./time')
  PLAN = { id: 'p', requesterId: 'r', stops: [stop({ id: 'x', seq: 1, tripMode: 'ROUND_TRIP', plannedStart: '23:30', dwellMinutes: 60, pickupBackTo: 'OFFICE' })] }
  const out = await legs.generateLegsForPlan('p')
  assert.deepEqual(out.map((l) => l.scheduledTime), ['23:20', '24:30'])
  assert.ok(out[0].scheduledTime < out[1].scheduledTime, 'string order must match time order')
  assert.equal(t.displayLegTime('24:30'), '00:30 (+1)')
  assert.equal(t.displayLegTime('09:15'), '09:15')
  assert.equal(t.formatLegTime(-5), '00:00')
})

// ── transitionPlan ──────────────────────────────────────────────────────────

test('transitionPlan: invalid transitions write nothing; valid ones update + audit', async () => {
  const h = await import('./api-helpers')
  planUpdates.length = 0
  dtpEvents.length = 0
  assert.equal(await h.transitionPlan({ planId: 'p', from: 'DRAFT', to: 'APPROVED', action: 'APPROVE' as any, actorId: 'u' }), null)
  assert.equal(planUpdates.length + dtpEvents.length, 0)
  const updated = await h.transitionPlan({ planId: 'p', from: 'SUBMITTED', to: 'APPROVED', action: 'APPROVE' as any, actorId: 'u', patch: { decidedById: 'u' }, payload: { note: 'ok' } })
  assert.deepEqual(updated, { id: 'p', status: 'APPROVED', decidedById: 'u' })
  assert.equal(dtpEvents.length, 1)
  assert.deepEqual(
    { ...dtpEvents[0] },
    { planId: 'p', actorId: 'u', action: 'APPROVE', fromStatus: 'SUBMITTED', toStatus: 'APPROVED', payload: '{"note":"ok"}', ip: null, userAgent: null },
  )
})

// BUG: lib/dtp/api-helpers.ts:66-89 — documented as "in one DB transaction", but
// the status update and the audit row are two independent writes (no
// $transaction), and the update is `where: { id }` only — no `status: from`
// compare-and-set — so two concurrent approvers can both "transition" the same
// plan, and a failed audit write is silently swallowed (audit.ts).
test('BUG: transitionPlan is atomic and guards on the current status', async () => {
  const h = await import('./api-helpers')
  planUpdates.length = 0
  transactionCalls = 0
  await h.transitionPlan({ planId: 'p', from: 'SUBMITTED', to: 'APPROVED', action: 'APPROVE' as any, actorId: 'u' })
  assert.equal(transactionCalls, 1)
  assert.equal(planUpdates[0].where.status, 'SUBMITTED')
})

test('transitionPlan: a lost race (no row matches id+status) is a CONFLICT with no audit row', async () => {
  const h = await import('./api-helpers')
  const fake = (globalThis as any).prisma
  const realUpdate = fake.dailyTripPlan.update
  const realTx = fake.$transaction
  let committedEvents = 0
  fake.dailyTripPlan.update = async () => { throw Object.assign(new Error('No record was found for an update.'), { code: 'P2025' }) }
  fake.$transaction = async function (fn: any) {
    const before = dtpEvents.length
    try { return await fn(this) } catch (e) { dtpEvents.length = before; throw e } finally { committedEvents = dtpEvents.length - before }
  }
  try {
    dtpEvents.length = 0
    const r = await h.tryTransitionPlan({ planId: 'p', from: 'SUBMITTED', to: 'APPROVED', action: 'APPROVE' as any, actorId: 'u' })
    assert.deepEqual(r, { ok: false, reason: 'CONFLICT' })
    assert.equal(committedEvents, 0)
    assert.equal(await h.transitionPlan({ planId: 'p', from: 'SUBMITTED', to: 'APPROVED', action: 'APPROVE' as any, actorId: 'u' }), null)
    assert.equal(h.transitionFailure('CONFLICT').status, 409)
    assert.equal(h.transitionFailure('INVALID_TRANSITION').status, 400)
  } finally {
    fake.dailyTripPlan.update = realUpdate
    fake.$transaction = realTx
  }
})

test('optimizer stub returns no suggestions', async () => {
  const o = await import('./optimizer')
  assert.deepEqual(await o.suggestRouteGroups(new Date(), null), [])
})
