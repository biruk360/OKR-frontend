import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dueTone, dueInstant, isOverdue, DUE_TONE_STYLE, dueTonePrefix } from './due-tone'

/** Local-time date helper, so these tests do not depend on the runner's TZ. */
function at(y: number, m: number, d: number, h = 0, min = 0) {
  return new Date(y, m - 1, d, h, min, 0, 0)
}

const NOW = at(2026, 5, 20, 14, 0) // Wed 20 May 2026, 14:00 local

// ── The bug this module exists to fix ───────────────────────────────────────

test('an all-day task due TODAY is not overdue, at any hour', () => {
  const dueToday = at(2026, 5, 20) // midnight — how a date-only value parses
  assert.equal(dueTone({ dueDate: dueToday, now: NOW }), 'today')
  // The old `new Date(dueDate) < Date.now()` test called this overdue from
  // 00:01 onward. Check the far edge of the day too.
  assert.equal(dueTone({ dueDate: dueToday, now: at(2026, 5, 20, 23, 58) }), 'today')
})

test('an all-day task due YESTERDAY is overdue', () => {
  assert.equal(dueTone({ dueDate: at(2026, 5, 19), now: NOW }), 'overdue')
})

test('a timed task is overdue only after its time', () => {
  const due = at(2026, 5, 20)
  assert.equal(dueTone({ dueDate: due, endTime: '17:00', now: NOW }), 'today')
  assert.equal(dueTone({ dueDate: due, endTime: '13:00', now: NOW }), 'overdue')
})

test('dueInstant follows the due-reminders convention', () => {
  // All-day → end of day, so a "1 day before" reminder lands the evening prior
  // rather than at midnight. Must match reminderFireAt's assumption.
  assert.equal(dueInstant(at(2026, 5, 20)).getHours(), 23)
  assert.equal(dueInstant(at(2026, 5, 20)).getMinutes(), 59)
  // A valid HH:mm wins.
  assert.equal(dueInstant(at(2026, 5, 20), '09:30').getHours(), 9)
  // Malformed times are ignored rather than throwing.
  assert.equal(dueInstant(at(2026, 5, 20), '25:99').getHours(), 23)
  assert.equal(dueInstant(at(2026, 5, 20), '').getHours(), 23)
})

// ── The "soon" window, which used to be 2 days in one file and 7 in another ──

test('soonWithinDays defaults to 2 and is a parameter', () => {
  const inFive = at(2026, 5, 25)
  assert.equal(dueTone({ dueDate: inFive, now: NOW }), 'upcoming')
  assert.equal(dueTone({ dueDate: inFive, now: NOW, soonWithinDays: 7 }), 'soon')
})

test('soon counts calendar days, not elapsed hours', () => {
  // 10 hours away, but tomorrow — "soon", not "today".
  assert.equal(dueTone({ dueDate: at(2026, 5, 21), now: at(2026, 5, 20, 23, 0) }), 'soon')
  // 47 hours away but 2 calendar days out, so still inside the default window.
  assert.equal(dueTone({ dueDate: at(2026, 5, 22), now: at(2026, 5, 20, 1, 0) }), 'soon')
})

test('the boundary day is inclusive', () => {
  assert.equal(dueTone({ dueDate: at(2026, 5, 22), now: NOW }), 'soon')
  assert.equal(dueTone({ dueDate: at(2026, 5, 23), now: NOW }), 'upcoming')
})

// ── done beats everything; green is reserved for it ─────────────────────────

test('done wins over an overdue date', () => {
  assert.equal(dueTone({ dueDate: at(2026, 1, 1), done: true, now: NOW }), 'done')
})

test('done is the only tone that renders green', () => {
  const green = DUE_TONE_STYLE.done.background
  const others = (['none', 'overdue', 'today', 'soon', 'upcoming'] as const)
    .map((t) => DUE_TONE_STYLE[t].background)
  assert.ok(!others.includes(green), 'only `done` may use the success token')
  assert.equal(green, 'var(--ap-ok-bg)')
})

// ── Absent / malformed input ────────────────────────────────────────────────

test('missing or unparseable dates are neutral, never overdue', () => {
  for (const v of [null, undefined, '', 'not-a-date']) {
    assert.equal(dueTone({ dueDate: v as never, now: NOW }), 'none')
    assert.equal(isOverdue(v as never, { now: NOW }), false)
  }
})

test('isOverdue agrees with dueTone', () => {
  assert.equal(isOverdue(at(2026, 5, 19), { now: NOW }), true)
  assert.equal(isOverdue(at(2026, 5, 20), { now: NOW }), false)
  assert.equal(isOverdue(at(2026, 5, 19), { done: true, now: NOW }), false)
})

// ── Every tone must be styleable, or a call site renders unstyled ───────────

test('every tone has a token pair and no raw colour leaks in', () => {
  for (const tone of ['none', 'done', 'overdue', 'today', 'soon', 'upcoming'] as const) {
    const s = DUE_TONE_STYLE[tone]
    assert.ok(s, `${tone} has no style`)
    for (const v of [s.background, s.color]) {
      assert.match(v, /^var\(--ap-[a-z-]+\)$/, `${tone} must use a token, got ${v}`)
    }
  }
})

test('prefixes exist only where they add information', () => {
  assert.equal(dueTonePrefix('overdue'), 'Overdue')
  assert.equal(dueTonePrefix('today'), 'Today')
  assert.equal(dueTonePrefix('soon'), null)
  assert.equal(dueTonePrefix('upcoming'), null)
  assert.equal(dueTonePrefix('none'), null)
})

test('accepts ISO strings as well as Date objects', () => {
  const iso = at(2026, 5, 19).toISOString()
  assert.equal(dueTone({ dueDate: iso, now: NOW }), 'overdue')
})
