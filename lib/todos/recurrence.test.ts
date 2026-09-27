import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  nextOccurrence,
  shouldGenerate,
  occurrencesUpTo,
  isRecurrenceRule,
  recurrenceLabel,
  nthOccurrence,
  previousOccurrence,
  inferAnchorDay,
  needsAnchorEvidence,
  anchorEvidenceFromLogs,
  planSeriesAdvance,
  planHeadRepair,
  shiftItemDates,
  anchorDayForDue,
  anchorDayOnSave,
  storedAnchorDay,
  RECURRENCE_JOB,
  RECURRENCE_RULES,
} from './recurrence'

/** Local-time helper so these tests do not depend on the runner's TZ. */
function d(y: number, m: number, day: number) {
  return new Date(y, m - 1, day)
}
const iso = (x: Date | null) => (x ? `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` : null)

// ── Cadence maths ───────────────────────────────────────────────────────────

test('R-01: simple cadences advance by their interval', () => {
  const wed = d(2026, 9, 16) // Wednesday
  assert.equal(iso(nextOccurrence('DAILY', wed)), '2026-09-17')
  assert.equal(iso(nextOccurrence('WEEKLY', wed)), '2026-09-23')
  assert.equal(iso(nextOccurrence('BIWEEKLY', wed)), '2026-09-30')
  assert.equal(iso(nextOccurrence('MONTHLY', wed)), '2026-10-16')
  assert.equal(iso(nextOccurrence('YEARLY', wed)), '2027-09-16')
})

test('R-02: WEEKDAYS skips the weekend', () => {
  assert.equal(iso(nextOccurrence('WEEKDAYS', d(2026, 9, 18))), '2026-09-21') // Fri → Mon
  assert.equal(iso(nextOccurrence('WEEKDAYS', d(2026, 9, 19))), '2026-09-21') // Sat → Mon
  assert.equal(iso(nextOccurrence('WEEKDAYS', d(2026, 9, 20))), '2026-09-21') // Sun → Mon
  assert.equal(iso(nextOccurrence('WEEKDAYS', d(2026, 9, 17))), '2026-09-18') // Thu → Fri
})

test('R-03: MONTHLY clamps rather than skipping a month', () => {
  // The bug this guards: Jan 31 + 1 month naively rolls into March, so a
  // month-end card silently misses February altogether.
  assert.equal(iso(nextOccurrence('MONTHLY', d(2026, 1, 31))), '2026-02-28')
  assert.equal(iso(nextOccurrence('MONTHLY', d(2028, 1, 31))), '2028-02-29') // leap year
  assert.equal(iso(nextOccurrence('MONTHLY', d(2026, 3, 31))), '2026-04-30')
})

test('R-04: YEARLY clamps Feb 29 into a non-leap year', () => {
  assert.equal(iso(nextOccurrence('YEARLY', d(2028, 2, 29))), '2029-02-28')
})

test('R-05: an unknown or absent rule yields nothing', () => {
  for (const v of [null, undefined, '', 'HOURLY', 'never']) {
    assert.equal(nextOccurrence(v as never, d(2026, 9, 16)), null)
    assert.equal(isRecurrenceRule(v), false)
  }
  assert.equal(nextOccurrence('DAILY', new Date('nonsense')), null)
})

test('R-06: labels exist for every rule and only for real rules', () => {
  assert.equal(recurrenceLabel('WEEKDAYS'), 'Every weekday (Mon–Fri)')
  assert.equal(recurrenceLabel('nope'), null)
  assert.equal(recurrenceLabel(null), null)
})

// ── Generation gate ─────────────────────────────────────────────────────────

const head = (over: Partial<Parameters<typeof shouldGenerate>[0]> = {}) => ({
  recurrenceRule: 'WEEKLY',
  dueDate: d(2026, 9, 16),
  ...over,
})

test('R-07: generates only once the next occurrence is inside the horizon', () => {
  // Next occurrence is 2026-09-23. With a 1-day horizon it arms on the 22nd.
  assert.equal(shouldGenerate(head(), d(2026, 9, 20)), false)
  assert.equal(shouldGenerate(head(), d(2026, 9, 22)), true)
  assert.equal(shouldGenerate(head(), d(2026, 9, 23)), true)
  // A wider horizon arms it earlier.
  assert.equal(shouldGenerate(head(), d(2026, 9, 20), 3), true)
})

test('R-08: recurrenceEndsAt stops the series, inclusively', () => {
  assert.equal(shouldGenerate(head({ recurrenceEndsAt: d(2026, 9, 23) }), d(2026, 9, 23)), true)
  assert.equal(shouldGenerate(head({ recurrenceEndsAt: d(2026, 9, 22) }), d(2026, 9, 23)), false)
})

test('R-09: an archived or ruleless or undated series never generates', () => {
  assert.equal(shouldGenerate(head({ archivedAt: d(2026, 9, 1) }), d(2026, 9, 23)), false)
  assert.equal(shouldGenerate(head({ recurrenceRule: null }), d(2026, 9, 23)), false)
  assert.equal(shouldGenerate(head({ dueDate: null }), d(2026, 9, 23)), false)
})

// ── Catch-up is bounded ─────────────────────────────────────────────────────

test('R-10: a dormant series catches up but does not flood the board', () => {
  // A daily card last due 2026-09-01, first run a month later.
  const dormant = { recurrenceRule: 'DAILY', dueDate: d(2026, 9, 1) }
  const dates = occurrencesUpTo(dormant, d(2026, 10, 1))
  assert.equal(dates.length, 5, 'capped at maxPerRun')
  assert.equal(iso(dates[0]), '2026-09-02')
  assert.equal(iso(dates[4]), '2026-09-06')
  // The cap is a parameter, and the sequence is contiguous.
  assert.equal(occurrencesUpTo(dormant, d(2026, 10, 1), 1, 2).length, 2)
})

test('R-11: a healthy series emits exactly one occurrence per run', () => {
  assert.equal(occurrencesUpTo(head(), d(2026, 9, 22)).length, 1)
  assert.equal(occurrencesUpTo(head(), d(2026, 9, 20)).length, 0)
})

test('R-12: catch-up respects the end date', () => {
  const dates = occurrencesUpTo(
    { recurrenceRule: 'DAILY', dueDate: d(2026, 9, 1), recurrenceEndsAt: d(2026, 9, 3) },
    d(2026, 10, 1),
  )
  assert.deepEqual(dates.map(iso), ['2026-09-02', '2026-09-03'])
})

// ── Monthly/yearly anchor: no drift (generator defect, 2026-09-25) ───────────

test('R-13: nthOccurrence from a Jan 31 anchor never drifts', () => {
  const a = d(2026, 1, 31)
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 12, 13].map((n) => iso(nthOccurrence('MONTHLY', a, n))),
    ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30', '2027-01-31', '2027-02-28'],
  )
  // A 30th series clamps in February and comes straight back.
  assert.deepEqual(
    [1, 2, 3].map((n) => iso(nthOccurrence('MONTHLY', d(2026, 1, 30), n))),
    ['2026-02-28', '2026-03-30', '2026-04-30'],
  )
  assert.equal(nthOccurrence('MONTHLY', a, -1), null)
  assert.equal(nthOccurrence('MONTHLY', a, 1.5), null)
  assert.equal(nthOccurrence('nope', a, 1), null)
})

test('R-14: YEARLY Feb 29 returns to Feb 29 in every leap year', () => {
  const a = d(2028, 2, 29)
  assert.deepEqual(
    [1, 2, 3, 4, 8].map((n) => iso(nthOccurrence('YEARLY', a, n))),
    ['2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29', '2036-02-29'],
  )
})

test('R-15: nthOccurrence matches every simple cadence', () => {
  const wed = d(2026, 9, 16)
  assert.equal(iso(nthOccurrence('DAILY', wed, 3)), '2026-09-19')
  assert.equal(iso(nthOccurrence('WEEKLY', wed, 2)), '2026-09-30')
  assert.equal(iso(nthOccurrence('BIWEEKLY', wed, 2)), '2026-10-14')
  assert.equal(iso(nthOccurrence('WEEKDAYS', wed, 3)), '2026-09-21') // Thu, Fri, Mon
})

test('R-16: stepping the cursor with the anchor day equals nthOccurrence (24 months, every day 28–31)', () => {
  for (const day of [28, 29, 30, 31]) {
    const anchor = d(2026, 1, day)
    let cursor = anchor
    for (let n = 1; n <= 24; n++) {
      cursor = nextOccurrence('MONTHLY', cursor, day) as Date
      assert.equal(iso(cursor), iso(nthOccurrence('MONTHLY', anchor, n)), `day ${day}, n ${n}`)
    }
  }
  let y = d(2028, 2, 29)
  for (let n = 1; n <= 8; n++) {
    y = nextOccurrence('YEARLY', y, 29) as Date
    assert.equal(iso(y), iso(nthOccurrence('YEARLY', d(2028, 2, 29), n)))
  }
})

test('R-17: without an anchor day the old drift is reproduced (documents the defect)', () => {
  const feb = nextOccurrence('MONTHLY', d(2026, 1, 31)) as Date
  assert.equal(iso(nextOccurrence('MONTHLY', feb)), '2026-03-28')
  assert.equal(iso(nextOccurrence('MONTHLY', feb, 31)), '2026-03-31')
})

test('R-18: a catch-up run crossing February keeps the anchor within the run', () => {
  const dates = occurrencesUpTo({ recurrenceRule: 'MONTHLY', dueDate: d(2026, 1, 31) }, d(2026, 5, 30), 1, 5)
  assert.deepEqual(dates.map(iso), ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
})

test('R-19: inferAnchorDay — unclamped head is its own anchor; clamped head reads evidence', () => {
  // Not the last day of the month → cannot be clamped → authoritative.
  assert.equal(inferAnchorDay('MONTHLY', d(2026, 3, 28), [d(2026, 1, 31)]), 28)
  assert.equal(needsAnchorEvidence('MONTHLY', d(2026, 3, 28)), false)
  // Feb 28 head with the previous cursor Jan 31 → 31.
  assert.equal(needsAnchorEvidence('MONTHLY', d(2026, 2, 28)), true)
  assert.equal(inferAnchorDay('MONTHLY', d(2026, 2, 28), [d(2026, 1, 31)]), 31)
  assert.equal(inferAnchorDay('MONTHLY', d(2026, 2, 28), [d(2026, 1, 30)]), 30)
  // No evidence → the head's own day.
  assert.equal(inferAnchorDay('MONTHLY', d(2026, 4, 30), []), 30)
  // Evidence outside the 12-month window, or in the future, is ignored.
  assert.equal(inferAnchorDay('MONTHLY', d(2026, 2, 28), [d(2024, 12, 31), d(2026, 3, 31)]), 28)
  // Smaller days never lower the anchor.
  assert.equal(inferAnchorDay('MONTHLY', d(2026, 4, 30), [d(2026, 3, 15)]), 30)
  // YEARLY looks at the same month in the 4 previous years.
  assert.equal(inferAnchorDay('YEARLY', d(2031, 2, 28), [d(2028, 2, 29), d(2029, 2, 28)]), 29)
  assert.equal(inferAnchorDay('YEARLY', d(2033, 2, 28), [d(2028, 2, 29)]), 28)
  assert.equal(inferAnchorDay('YEARLY', d(2031, 2, 28), [d(2030, 3, 31)]), 28)
  // Non-month rules have no anchor.
  assert.equal(inferAnchorDay('WEEKLY', d(2026, 2, 28), [d(2026, 1, 31)]), null)
  assert.equal(needsAnchorEvidence('WEEKLY', d(2026, 2, 28)), false)
})

test('R-20: anchorEvidenceFromLogs reads generator advances and stops at a user edit', () => {
  const gen = (from: string, to: string, at: Date) => ({
    changes: { dueDate: { from, to } },
    metadata: { source: 'cron', job: RECURRENCE_JOB },
    createdAt: at,
  })
  const user = (from: string, to: string, at: Date) => ({ changes: { dueDate: { from, to } }, metadata: null, createdAt: at })
  const other = { changes: { title: { from: 'a', to: 'b' } }, metadata: null, createdAt: d(2026, 3, 1) }
  const rows = [
    gen(d(2026, 2, 28).toISOString(), d(2026, 3, 31).toISOString(), d(2026, 3, 30)),
    other,
    gen(d(2026, 1, 31).toISOString(), d(2026, 2, 28).toISOString(), d(2026, 2, 27)),
    user(d(2025, 12, 15).toISOString(), d(2026, 1, 31).toISOString(), d(2026, 1, 10)),
    gen(d(2025, 11, 15).toISOString(), d(2025, 12, 15).toISOString(), d(2025, 12, 14)),
  ]
  const ev = anchorEvidenceFromLogs(rows)
  assert.deepEqual(ev.dates.map(iso), ['2026-02-28', '2026-01-31', '2026-01-31'])
  assert.equal(iso(ev.reanchoredAt), '2026-01-10')
  assert.deepEqual(anchorEvidenceFromLogs([]), { dates: [], reanchoredAt: null })
})

test('R-21: the two-run month-end scenario the generator sees (Jan 31 → Feb 28 → Mar 31 → Apr 30)', () => {
  // Simulates runTodoRecurrence: each run infers the anchor from the head plus
  // the previous advance log's `from`, then plans one occurrence.
  let headDue = d(2026, 1, 31)
  const logFroms: Date[] = []
  const seen: string[] = []
  for (const now of [d(2026, 2, 27), d(2026, 3, 30), d(2026, 4, 29), d(2026, 5, 30)]) {
    const anchorDay = inferAnchorDay('MONTHLY', headDue, logFroms)
    const plan = planSeriesAdvance({ recurrenceRule: 'MONTHLY', dueDate: headDue, anchorDay }, now)
    assert.ok(plan)
    assert.equal(plan.occurrences.length, 1)
    seen.push(iso(plan.occurrences[0].dueDate) as string)
    logFroms.unshift(headDue)
    headDue = plan.head.dueDate
  }
  assert.deepEqual(seen, ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
})

// ── Stored anchor day (Todo.recurrenceAnchorDay) ────────────────────────────

test('ANC-01: anchor is the due day for MONTHLY/YEARLY and null for every other rule', () => {
  assert.equal(anchorDayForDue('MONTHLY', d(2026, 1, 31)), 31)
  assert.equal(anchorDayForDue('MONTHLY', d(2026, 3, 15)), 15)
  assert.equal(anchorDayForDue('YEARLY', d(2028, 2, 29)), 29)
  for (const rule of ['DAILY', 'WEEKDAYS', 'WEEKLY', 'BIWEEKLY', null, 'nope']) {
    assert.equal(anchorDayForDue(rule, d(2026, 1, 31)), null, String(rule))
  }
  assert.equal(anchorDayForDue('MONTHLY', null), null)
  assert.equal(anchorDayForDue('MONTHLY', new Date('nonsense')), null)
})

test('ANC-02: anchorDayOnSave sets on a new/changed rule or due day, clears for other rules', () => {
  const none = { recurrenceRule: null, dueDate: d(2026, 1, 31) }
  // Turning MONTHLY / YEARLY on sets the anchor from the due date.
  assert.equal(anchorDayOnSave(none, { recurrenceRule: 'MONTHLY', dueDate: d(2026, 1, 31) }), 31)
  assert.equal(anchorDayOnSave(none, { recurrenceRule: 'YEARLY', dueDate: d(2028, 2, 29) }), 29)
  // Switching to a non-month rule, dropping the rule, or dropping the due date clears it.
  const monthly = { recurrenceRule: 'MONTHLY', dueDate: d(2026, 1, 31) }
  assert.equal(anchorDayOnSave(monthly, { recurrenceRule: 'WEEKLY', dueDate: d(2026, 1, 31) }), null)
  assert.equal(anchorDayOnSave(monthly, { recurrenceRule: null, dueDate: d(2026, 1, 31) }), null)
  assert.equal(anchorDayOnSave(monthly, { recurrenceRule: 'MONTHLY', dueDate: null }), null)
  assert.equal(anchorDayOnSave(none, { recurrenceRule: 'DAILY', dueDate: d(2026, 1, 31) }), null)
  // Moving the due date re-anchors (MONTHLY → YEARLY also counts as a new series).
  assert.equal(anchorDayOnSave(monthly, { recurrenceRule: 'MONTHLY', dueDate: d(2026, 2, 15) }), 15)
  assert.equal(anchorDayOnSave(monthly, { recurrenceRule: 'YEARLY', dueDate: d(2026, 1, 31) }), 31)
})

test('ANC-03: re-saving a clamped head unchanged keeps its anchor (modal re-sends due + rule)', () => {
  // Head sits on Feb 28 of a "31st" series; the user only changes the reminder.
  const head = { recurrenceRule: 'MONTHLY', dueDate: d(2026, 2, 28) }
  assert.equal(anchorDayOnSave(head, { recurrenceRule: 'MONTHLY', dueDate: d(2026, 2, 28) }), undefined)
  // Same calendar day with a different time of day (UTC midnight vs 03:00 EAT) is unchanged too.
  assert.equal(
    anchorDayOnSave({ recurrenceRule: 'MONTHLY', dueDate: new Date(2026, 1, 28, 3) }, { recurrenceRule: 'MONTHLY', dueDate: d(2026, 2, 28) }),
    undefined,
  )
})

test('ANC-04: storedAnchorDay accepts only 1–31 on a MONTHLY/YEARLY head', () => {
  assert.equal(storedAnchorDay('MONTHLY', 31), 31)
  assert.equal(storedAnchorDay('YEARLY', 29), 29)
  assert.equal(storedAnchorDay('MONTHLY', null), null)
  assert.equal(storedAnchorDay('MONTHLY', 0), null)
  assert.equal(storedAnchorDay('MONTHLY', 32), null)
  assert.equal(storedAnchorDay('MONTHLY', 15.5), null)
  assert.equal(storedAnchorDay('WEEKLY', 31), null, 'a stale anchor on a non-month rule is ignored')
})

/**
 * One generator run, composed exactly as runTodoRecurrence composes it:
 * stored anchor first (resolveAnchorDay), else inferAnchorDay over `evidence`.
 * Returns the occurrence dates and the new head due; the stored anchor is not
 * part of the head update and so cannot change.
 */
function genRun(rule: string, headDue: Date, stored: number | null, evidence: Date[], now: Date) {
  const anchorDay = storedAnchorDay(rule, stored) ?? inferAnchorDay(rule, headDue, evidence)
  const plan = planSeriesAdvance({ recurrenceRule: rule, dueDate: headDue, anchorDay }, now)
  assert.ok(plan)
  assert.deepEqual(Object.keys(plan.head), ['dueDate'], 'head update carries only the cursor')
  return { dates: plan.occurrences.map((o) => iso(o.dueDate)), headDue: plan.head.dueDate }
}

test('ANC-05: generator honours a stored 31 across Jan 31 → Feb 28 → Mar 31 with NO history', () => {
  let headDue = d(2026, 1, 31)
  const stored = anchorDayForDue('MONTHLY', headDue) // set on save
  const seen: string[] = []
  for (const now of [d(2026, 2, 27), d(2026, 3, 30), d(2026, 4, 29), d(2026, 5, 30)]) {
    const r = genRun('MONTHLY', headDue, stored, [], now) // logs pruned: no evidence at all
    seen.push(...(r.dates as string[]))
    headDue = r.headDue
  }
  assert.deepEqual(seen, ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
  // Without the stored anchor and without history the old drift comes back.
  const legacy = genRun('MONTHLY', d(2026, 2, 28), null, [], d(2026, 3, 30))
  assert.deepEqual(legacy.dates, ['2026-03-28'])
})

test('ANC-06: YEARLY anchored on Feb 29 clamps to Feb 28 and returns in the next leap year', () => {
  let headDue = d(2028, 2, 29)
  const stored = anchorDayForDue('YEARLY', headDue)
  assert.equal(stored, 29)
  const seen: string[] = []
  for (const now of [d(2029, 2, 27), d(2030, 2, 27), d(2031, 2, 27), d(2032, 2, 28)]) {
    const r = genRun('YEARLY', headDue, stored, [], now)
    seen.push(...(r.dates as string[]))
    headDue = r.headDue
  }
  assert.deepEqual(seen, ['2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29'])
})

test('ANC-07: a legacy head with a null anchor still infers it from history', () => {
  // Clamped Feb 28 head, previous cursor Jan 31 in the advance log.
  const r = genRun('MONTHLY', d(2026, 2, 28), null, [d(2026, 1, 31)], d(2026, 3, 30))
  assert.deepEqual(r.dates, ['2026-03-31'])
  // A stored anchor wins over (stale) history evidence.
  const s = genRun('MONTHLY', d(2026, 2, 28), 28, [d(2026, 1, 31)], d(2026, 3, 27))
  assert.deepEqual(s.dates, ['2026-03-28'])
})

test('ANC-08: a catch-up run crossing February keeps the stored anchor', () => {
  const r = genRun('MONTHLY', d(2026, 1, 31), 31, [], d(2026, 5, 30))
  assert.deepEqual(r.dates, ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
})

// ── REC-FIX-1 / REC-FIX-2: per-run plan ─────────────────────────────────────

interface SimItem { startDate: Date | null; dueDate: Date | null }
interface SimHead { startDate: Date | null; dueDate: Date; items: SimItem[] }

/** Apply one generator run to an in-memory head, as runTodoRecurrence writes it. */
function run(head: SimHead, now: Date, rule = 'WEEKLY') {
  const plan = planSeriesAdvance({ recurrenceRule: rule, dueDate: head.dueDate, startDate: head.startDate }, now)
  if (!plan) return { head, occurrences: [] as Array<{ startDate: Date | null; dueDate: Date; items: SimItem[] }> }
  const occurrences = plan.occurrences.map((o) => ({
    startDate: o.startDate,
    dueDate: o.dueDate,
    items: head.items.map((i) => shiftItemDates(i, o.itemOffsetDays)),
  }))
  const next: SimHead = {
    dueDate: plan.head.dueDate,
    startDate: plan.head.startDate ?? head.startDate,
    items: head.items.map((i) => shiftItemDates(i, plan.headItemShiftDays)),
  }
  return { head: next, occurrences }
}
const span = (s: Date | null, e: Date) => `${iso(s)}..${iso(e)}`

test('REC-FIX-AC-1: weekly Mon 14 → Wed 16 Sep, three runs → 21–23, 28–30 Sep, 5–7 Oct; head 5–7 Oct', () => {
  let h: SimHead = { startDate: d(2026, 9, 14), dueDate: d(2026, 9, 16), items: [] }
  const got: string[] = []
  for (const now of [d(2026, 9, 22), d(2026, 9, 29), d(2026, 10, 6)]) {
    const r = run(h, now)
    assert.equal(r.occurrences.length, 1)
    got.push(span(r.occurrences[0].startDate, r.occurrences[0].dueDate))
    h = r.head
  }
  assert.deepEqual(got, ['2026-09-21..2026-09-23', '2026-09-28..2026-09-30', '2026-10-05..2026-10-07'])
  assert.equal(span(h.startDate, h.dueDate), '2026-10-05..2026-10-07')
})

test('REC-FIX-AC-1b: a catch-up run of several occurrences keeps the span on each', () => {
  const r = run({ startDate: d(2026, 9, 14), dueDate: d(2026, 9, 16), items: [] }, d(2026, 10, 6))
  assert.deepEqual(
    r.occurrences.map((o) => span(o.startDate, o.dueDate)),
    ['2026-09-21..2026-09-23', '2026-09-28..2026-09-30', '2026-10-05..2026-10-07'],
  )
  assert.equal(span(r.head.startDate, r.head.dueDate), '2026-10-05..2026-10-07')
})

test('REC-FIX-AC-2: a head without a start date changes nothing about start dates', () => {
  const plan = planSeriesAdvance({ recurrenceRule: 'WEEKLY', dueDate: d(2026, 9, 16), startDate: null }, d(2026, 9, 22))
  assert.ok(plan)
  assert.equal(plan.spanDays, null)
  assert.equal(plan.occurrences[0].startDate, null)
  assert.equal('startDate' in plan.head, false, 'head update must not carry startDate')
  const plan2 = planSeriesAdvance({ recurrenceRule: 'WEEKLY', dueDate: d(2026, 9, 16) }, d(2026, 9, 22))
  assert.equal('startDate' in (plan2 as NonNullable<typeof plan2>).head, false)
})

test('REC-FIX-AC-3: items shift with each occurrence; undated stays undated; head item follows', () => {
  let h: SimHead = {
    startDate: null,
    dueDate: d(2026, 9, 16),
    items: [{ startDate: null, dueDate: d(2026, 9, 15) }, { startDate: null, dueDate: null }],
  }
  const occItems: SimItem[][] = []
  for (const now of [d(2026, 9, 22), d(2026, 9, 29)]) {
    const r = run(h, now)
    occItems.push(r.occurrences[0].items)
    h = r.head
  }
  assert.equal(iso(occItems[0][0].dueDate), '2026-09-22')
  assert.equal(iso(occItems[1][0].dueDate), '2026-09-29')
  assert.equal(occItems[0][1].dueDate, null)
  assert.equal(occItems[0][1].startDate, null)
  assert.equal(occItems[1][1].dueDate, null)
  assert.equal(iso(h.items[0].dueDate), '2026-09-29', 'head item moved with the head')
  assert.equal(h.items[1].dueDate, null)
})

test('REC-FIX-2: item start dates shift too, and a multi-occurrence run offsets each copy', () => {
  const h: SimHead = {
    startDate: null,
    dueDate: d(2026, 9, 16),
    items: [{ startDate: d(2026, 9, 14), dueDate: d(2026, 9, 15) }],
  }
  const r = run(h, d(2026, 9, 29))
  assert.deepEqual(
    r.occurrences.map((o) => span(o.items[0].startDate, o.items[0].dueDate as Date)),
    ['2026-09-21..2026-09-22', '2026-09-28..2026-09-29'],
  )
  assert.equal(span(r.head.items[0].startDate, r.head.items[0].dueDate as Date), '2026-09-28..2026-09-29')
})

test('REC-FIX-1: §1.2 table — the old ms/re-derived span inflated; the plan does not', () => {
  // The defect: head start stays 14 Sep while due moves; span re-read each run.
  let oldHead = { startDate: d(2026, 9, 14), dueDate: d(2026, 9, 16) }
  const oldSpans: number[] = []
  for (const now of [d(2026, 9, 22), d(2026, 9, 29), d(2026, 10, 6)]) {
    const due = occurrencesUpTo({ recurrenceRule: 'WEEKLY', dueDate: oldHead.dueDate }, now)[0]
    oldSpans.push(Math.round((oldHead.dueDate.getTime() - oldHead.startDate.getTime()) / 86400000))
    oldHead = { ...oldHead, dueDate: due }
  }
  assert.deepEqual(oldSpans, [2, 9, 16], 'reproduces §1.2')
  let h: SimHead = { startDate: d(2026, 9, 14), dueDate: d(2026, 9, 16), items: [] }
  for (const now of [d(2026, 9, 22), d(2026, 9, 29), d(2026, 10, 6)]) {
    const plan = planSeriesAdvance({ recurrenceRule: 'WEEKLY', dueDate: h.dueDate, startDate: h.startDate }, now)
    assert.equal(plan?.spanDays, 2)
    h = run(h, now).head
  }
})

test('REC-FIX-1: a head whose dates carry a time of day still spans whole calendar days', () => {
  // Stored as e.g. 03:00 local (UTC midnight in EAT); the span is still 2 days.
  const plan = planSeriesAdvance(
    { recurrenceRule: 'WEEKLY', dueDate: new Date(2026, 8, 16, 3), startDate: new Date(2026, 8, 14, 3) },
    d(2026, 9, 22),
  )
  assert.equal(plan?.spanDays, 2)
  assert.equal(span(plan?.occurrences[0].startDate ?? null, plan?.occurrences[0].dueDate as Date), '2026-09-21..2026-09-23')
})

test('planSeriesAdvance returns null when nothing is due, and for an undated head', () => {
  assert.equal(planSeriesAdvance({ recurrenceRule: 'WEEKLY', dueDate: d(2026, 9, 16) }, d(2026, 9, 20)), null)
  assert.equal(planSeriesAdvance({ recurrenceRule: 'WEEKLY', dueDate: null }, d(2026, 9, 20)), null)
})

// ── REC-FIX-2r: previousOccurrence + repair plan ────────────────────────────

test('R-22: previousOccurrence inverts nextOccurrence for every rule', () => {
  const starts = [d(2026, 9, 14), d(2026, 9, 16), d(2026, 9, 18), d(2026, 1, 15), d(2026, 12, 31)]
  for (const { value: rule } of RECURRENCE_RULES) {
    for (const s of starts) {
      // WEEKDAYS: the inverse is exact for weekday dates only.
      if (rule === 'WEEKDAYS' && (s.getDay() === 0 || s.getDay() === 6)) continue
      const n = nextOccurrence(rule, s) as Date
      assert.equal(iso(previousOccurrence(rule, n)), iso(s), `${rule} from ${iso(s)}`)
    }
  }
  assert.equal(iso(previousOccurrence('WEEKDAYS', d(2026, 9, 21))), '2026-09-18') // Mon → Fri
  assert.equal(iso(previousOccurrence('WEEKDAYS', d(2026, 9, 20))), '2026-09-18') // Sun → Fri
  assert.equal(iso(previousOccurrence('MONTHLY', d(2026, 3, 31))), '2026-02-28') // clamps
  assert.equal(iso(previousOccurrence('MONTHLY', d(2026, 2, 28), 31)), '2026-01-31') // with anchor
  assert.equal(iso(previousOccurrence('YEARLY', d(2029, 2, 28), 29)), '2028-02-29')
  assert.equal(previousOccurrence('nope', d(2026, 1, 1)), null)
})

test('REC-FIX-1r: repair restores the head span from the first occurrence', () => {
  // §1.2 after three old runs: head 14 Sep → 7 Oct, first occurrence 21 → 23 Sep.
  const p = planHeadRepair({
    rule: 'WEEKLY',
    head: { startDate: d(2026, 9, 14), dueDate: d(2026, 10, 7) },
    first: { startDate: d(2026, 9, 21), dueDate: d(2026, 9, 23) },
  })
  assert.equal(iso(p.startDate), '2026-10-05')
  assert.equal(p.spanDays, 2)
  // REC-FIX-2r: original head due = one week before the first occurrence.
  assert.equal(iso(p.originalHeadDue), '2026-09-16')
  assert.equal(p.itemDeltaDays, 21)
})

test('REC-FIX-1r: nothing to do for an aligned head, or one without a start date', () => {
  const aligned = planHeadRepair({
    rule: 'WEEKLY',
    head: { startDate: d(2026, 10, 5), dueDate: d(2026, 10, 7) },
    first: { startDate: d(2026, 9, 21), dueDate: d(2026, 9, 23) },
  })
  assert.equal(aligned.startDate, null)
  assert.equal(aligned.startSkipReason, 'already aligned')
  const noStart = planHeadRepair({
    rule: 'WEEKLY',
    head: { startDate: null, dueDate: d(2026, 10, 7) },
    first: { startDate: null, dueDate: d(2026, 9, 23) },
  })
  assert.equal(noStart.startDate, null)
  assert.equal(noStart.startSkipReason, 'head has no start date')
  assert.equal(noStart.itemDeltaDays, 21, 'items are realigned even without a start date')
  const firstUndated = planHeadRepair({
    rule: 'WEEKLY',
    head: { startDate: d(2026, 9, 14), dueDate: d(2026, 10, 7) },
    first: { startDate: null, dueDate: d(2026, 9, 23) },
  })
  assert.equal(firstUndated.startDate, null)
  assert.match(firstUndated.startSkipReason ?? '', /first occurrence/)
})

test('REC-FIX-2r: item delta stops where the fixed generator took over', () => {
  // Fixed generator first advanced the head from 30 Sep; items drifted only until then.
  const p = planHeadRepair({
    rule: 'WEEKLY',
    head: { startDate: null, dueDate: d(2026, 10, 7) },
    first: { startDate: null, dueDate: d(2026, 9, 23) },
    itemsAlignedFromDue: d(2026, 9, 30),
  })
  assert.equal(p.itemDeltaDays, 14)
})

test('shiftItemDates leaves undated fields null', () => {
  assert.deepEqual(shiftItemDates({ startDate: null, dueDate: null }, 7), { startDate: null, dueDate: null })
  assert.equal(iso(shiftItemDates({ startDate: d(2026, 9, 1), dueDate: null }, -3).startDate), '2026-08-29')
})
