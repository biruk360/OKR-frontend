import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkReportingLine,
  countVacantSeats,
  groupItemsBySection,
  normalizeSeatTitle,
  pickCurrentDefinition,
  resolveDirectReportSeats,
  seatTitlesMatch,
  splitSeatText,
  topAccountabilities,
  versionsToSupersede,
  withPositions,
} from './rules'
import {
  approveRoleDefinitionSchema,
  createRoleDefinitionSchema,
  updateRoleDefinitionSchema,
} from './schemas'

const v = (id: string, timeframeId: string | null, status: string, createdAt: string) => ({
  id,
  userId: 'u1',
  timeframeId,
  status,
  createdAt,
})

describe('pickCurrentDefinition (ROL-1)', () => {
  it('prefers the APPROVED version in the timeframe and reports a newer draft', () => {
    const versions = [
      v('a1', 'tf', 'SUPERSEDED', '2026-01-01'),
      v('a2', 'tf', 'APPROVED', '2026-02-01'),
      v('d1', 'tf', 'DRAFT', '2026-03-01'),
    ]
    const { current, pendingDraft } = pickCurrentDefinition(versions, 'tf')
    assert.equal(current?.id, 'a2')
    assert.equal(pendingDraft?.id, 'd1')
  })

  it('falls back to the latest draft, then evergreen versions', () => {
    assert.equal(pickCurrentDefinition([v('d1', 'tf', 'DRAFT', '2026-03-01')], 'tf').current?.id, 'd1')
    const evergreen = [v('e1', null, 'APPROVED', '2025-01-01'), v('x', 'other', 'APPROVED', '2026-01-01')]
    assert.equal(pickCurrentDefinition(evergreen, 'tf').current?.id, 'e1')
  })

  it('keeps an approved evergreen version current while a timeframe draft is pending', () => {
    const versions = [v('e1', null, 'APPROVED', '2025-01-01'), v('d1', 'tf', 'DRAFT', '2026-03-01')]
    const { current, pendingDraft } = pickCurrentDefinition(versions, 'tf')
    assert.equal(current?.id, 'e1')
    assert.equal(pendingDraft?.id, 'd1')
  })

  it('ignores other timeframes when one is given', () => {
    assert.equal(pickCurrentDefinition([v('x', 'other', 'APPROVED', '2026-01-01')], 'tf').current, null)
  })

  it('with no timeframe falls back to the newest approved of any timeframe', () => {
    const versions = [v('x', 'old', 'APPROVED', '2025-01-01'), v('y', 'new', 'APPROVED', '2026-01-01')]
    assert.equal(pickCurrentDefinition(versions, null).current?.id, 'y')
  })

  it('supersedes only APPROVED versions of the same user + timeframe', () => {
    const versions = [
      v('a', 'tf', 'APPROVED', '2026-01-01'),
      v('b', 'tf', 'SUPERSEDED', '2025-01-01'),
      v('c', 'other', 'APPROVED', '2026-01-01'),
      { ...v('d', 'tf', 'APPROVED', '2026-01-01'), userId: 'u2' },
      v('target', 'tf', 'DRAFT', '2026-05-01'),
    ]
    assert.deepEqual(versionsToSupersede(versions, { id: 'target', userId: 'u1', timeframeId: 'tf' }), ['a'])
  })
})

describe('checkReportingLine (ROL-3)', () => {
  const manager = { id: 'm1', name: 'Manager', avatar: null, designation: null }
  it('matches when reportsToId is an org-chart manager', () => {
    assert.equal(checkReportingLine('m1', [manager]).state, 'MATCH')
  })
  it('flags a mismatch, including when the org chart has no manager', () => {
    assert.equal(checkReportingLine('m2', [manager]).state, 'MISMATCH')
    assert.equal(checkReportingLine('m2', []).state, 'MISMATCH')
  })
  it('is unknown without a reportsToId (manager is a seat)', () => {
    assert.equal(checkReportingLine(null, [manager]).state, 'UNKNOWN')
  })
})

describe('direct-report seats (ROL-4)', () => {
  const item = (id: string, text: string, label: string | null = null, position = 0) => ({
    id,
    section: 'DIRECT_REPORT_SEAT' as const,
    label,
    text,
    position,
  })
  const person = (id: string, designation: string | null, seatTitle: string | null = null) => ({
    id,
    name: id,
    avatar: null,
    designation,
    seatTitle,
  })

  it('splits a trailing planned date', () => {
    assert.deepEqual(splitSeatText('Presales Lead (30 Nov 2026)'), { title: 'Presales Lead', note: '30 Nov 2026' })
    assert.deepEqual(splitSeatText('Presales Lead'), { title: 'Presales Lead', note: null })
  })

  it('normalises and matches titles as whole words', () => {
    assert.equal(normalizeSeatTitle('Bid Lead, Strategic Pursuits & SE'), 'bid lead strategic pursuits and se')
    assert.ok(seatTitlesMatch('Presales Lead', 'presales lead (30 Nov 2026)'))
    assert.ok(seatTitlesMatch('Sales Engineer', 'Senior Sales Engineer'))
    assert.ok(!seatTitlesMatch('Lead', 'Leader'))
    assert.ok(!seatTitlesMatch('', 'Anything'))
  })

  it('is Vacant until a direct report holds the title', () => {
    const items = [item('s1', 'Presales Lead (30 Nov 2026)'), item('s2', 'Solutions Architect', null, 1)]
    const seats = resolveDirectReportSeats(items, [person('p1', 'Solutions Architect')])
    assert.equal(seats[0].filledBy, null)
    assert.equal(seats[0].plannedNote, '30 Nov 2026')
    assert.equal(seats[1].filledBy?.id, 'p1')
    assert.equal(countVacantSeats(seats), 1)
    assert.ok(!('seatTitle' in (seats[1].filledBy ?? {})))
  })

  it('assigns exact matches before containment and uses each report once', () => {
    const items = [item('s1', 'Sales Engineer'), item('s2', 'Senior Sales Engineer', null, 1)]
    const seats = resolveDirectReportSeats(items, [person('a', 'Senior Sales Engineer'), person('b', 'Sales Engineer')])
    assert.equal(seats[0].filledBy?.id, 'b')
    assert.equal(seats[1].filledBy?.id, 'a')
  })

  it('uses the label as the seat title and a role definition seat title as the match', () => {
    const seats = resolveDirectReportSeats(
      [item('s1', 'Hire by Q3 (30 Sep 2026)', 'Bid Manager')],
      [person('p', null, 'Bid Manager')],
    )
    assert.equal(seats[0].title, 'Bid Manager')
    assert.equal(seats[0].plannedNote, '30 Sep 2026')
    assert.equal(seats[0].filledBy?.id, 'p')
  })
})

describe('items', () => {
  it('groups by canonical section order and sorts by position', () => {
    const groups = groupItemsBySection([
      { section: 'INTERFACE' as const, position: 0 },
      { section: 'ACCOUNTABILITY' as const, position: 2 },
      { section: 'ACCOUNTABILITY' as const, position: 1 },
    ])
    assert.deepEqual(
      groups.map((g) => [g.section, g.items.map((i) => i.position)]),
      [
        ['ACCOUNTABILITY', [1, 2]],
        ['INTERFACE', [0]],
      ],
    )
  })

  it('returns the first three accountabilities with labels', () => {
    const items = [0, 1, 2, 3].map((i) => ({ section: 'ACCOUNTABILITY' as const, position: i, label: i === 0 ? 'Win' : null, text: `t${i}` }))
    assert.deepEqual(topAccountabilities(items), ['Win: t0', 't1', 't2'])
  })

  it('assigns positions in list order', () => {
    assert.deepEqual(withPositions([{ a: 1 }, { a: 2 }]), [{ a: 1, position: 0 }, { a: 2, position: 1 }])
  })
})

describe('schemas', () => {
  it('creates with trimmed values and default items', () => {
    const parsed = createRoleDefinitionSchema.parse({ userId: 'u1', seatTitle: '  Bid Lead ', purpose: 'Win bids', effectiveFrom: '2026-10-12' })
    assert.equal(parsed.seatTitle, 'Bid Lead')
    assert.deepEqual(parsed.items, [])
    assert.equal(parsed.effectiveFrom?.toISOString(), '2026-10-12T00:00:00.000Z')
  })

  it('rejects an unknown section and an empty seat title', () => {
    assert.equal(createRoleDefinitionSchema.safeParse({ userId: 'u', seatTitle: ' ', purpose: 'p' }).success, false)
    assert.equal(
      createRoleDefinitionSchema.safeParse({ userId: 'u', seatTitle: 's', purpose: 'p', items: [{ section: 'NOPE', text: 'x' }] }).success,
      false,
    )
  })

  it('PATCH leaves omitted fields undefined and clears with null', () => {
    const parsed = updateRoleDefinitionSchema.parse({ purpose: 'New' })
    assert.equal(parsed.reportsToText, undefined)
    assert.equal(parsed.reportsToId, undefined)
    assert.equal(parsed.effectiveFrom, undefined)
    const cleared = updateRoleDefinitionSchema.parse({ reportsToId: null, reportsToText: '', effectiveFrom: '' })
    assert.equal(cleared.reportsToId, null)
    assert.equal(cleared.reportsToText, null)
    assert.equal(cleared.effectiveFrom, null)
    assert.equal(updateRoleDefinitionSchema.safeParse({}).success, false)
  })

  it('approve defaults updateDesignation to false (ROL-2 is an offer)', () => {
    assert.equal(approveRoleDefinitionSchema.parse({}).updateDesignation, false)
  })
})
