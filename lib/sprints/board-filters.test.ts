import test from 'node:test'
import assert from 'node:assert/strict'
import {
  NO_LABEL_FILTER_ID,
  UNASSIGNED_FILTER_ID,
  cardDueBuckets,
  cardLabelIds,
  cardMatchesDue,
  cardMatchesLabels,
  cardMatchesLinked,
  compileBoardFilter,
  countActiveFilters,
  countDueBuckets,
  countUnlabelledCards,
  currentWeekRange,
  deriveBoardLabels,
  emptyBoardFilters,
  isWatchingCard,
  pruneLabelSelection,
  readSavedBoardFilters,
  serializeBoardFilters,
  type BoardFilterCard,
  type BoardFilterState,
  type DueFilter,
} from './board-filters'

// Friday 25 Sep 2026, 15:00 local. Its week runs Mon 21 → Sun 27.
const NOW = new Date(2026, 8, 25, 15, 0, 0)
const day = (d: number, h = 0) => new Date(2026, 8, d, h, 0, 0).toISOString()

const RED = { id: 'red', name: 'Urgent', color: '#f00' }
const BLUE = { id: 'blue', name: 'backend', color: '#00f' }

function card(over: Partial<BoardFilterCard> = {}): BoardFilterCard {
  return { assigneeId: null, status: 'PENDING', dueDate: null, ...over }
}
const withLabels = (...defs: typeof RED[]) => defs.map((labelDef) => ({ labelDef }))
const state = (over: Partial<BoardFilterState>): BoardFilterState => ({ ...emptyBoardFilters(), ...over })

// ─── Labels ────────────────────────────────────────────────────────────────

test('labels: OR within the facet; empty selection matches all', () => {
  const c = card({ labels: withLabels(RED) })
  assert.equal(cardMatchesLabels(c, new Set()), true)
  assert.equal(cardMatchesLabels(c, new Set(['red'])), true)
  assert.equal(cardMatchesLabels(c, new Set(['blue', 'red'])), true)
  assert.equal(cardMatchesLabels(c, new Set(['blue'])), false)
})

test('labels: no-label sentinel matches only unlabelled cards', () => {
  const sel = new Set([NO_LABEL_FILTER_ID])
  assert.equal(cardMatchesLabels(card(), sel), true)
  assert.equal(cardMatchesLabels(card({ labels: [] }), sel), true)
  assert.equal(cardMatchesLabels(card({ labels: withLabels(RED) }), sel), false)
  const both = new Set([NO_LABEL_FILTER_ID, 'red'])
  assert.equal(cardMatchesLabels(card({ labels: withLabels(RED) }), both), true)
  assert.equal(cardMatchesLabels(card({ labels: withLabels(BLUE) }), both), false)
})

test('labels: derive board labels with counts, sorted by name, de-duplicated', () => {
  const columns = [
    { todos: [card({ labels: withLabels(RED, BLUE) }), card({ labels: withLabels(RED) })] },
    { todos: [card(), card({ labels: [{ labelDef: null }] })] },
  ]
  const labels = deriveBoardLabels(columns)
  assert.deepEqual(labels.map((l) => [l.id, l.cardCount]), [['blue', 1], ['red', 2]])
  assert.equal(countUnlabelledCards(columns), 2)
  assert.deepEqual(cardLabelIds(card({ labels: withLabels(RED, RED) })), ['red'])
})

test('labels: prune drops stale ids, keeps sentinel, same ref when unchanged', () => {
  const keep = ['red', NO_LABEL_FILTER_ID]
  assert.equal(pruneLabelSelection(keep, [{ id: 'red' }]), keep)
  assert.deepEqual(pruneLabelSelection(['red', 'gone'], [{ id: 'red' }]), ['red'])
})

// ─── Due ───────────────────────────────────────────────────────────────────

test('due: week range is Monday to next Monday (local)', () => {
  const { start, end } = currentWeekRange(NOW)
  assert.equal(start.getDate(), 21)
  assert.equal(start.getDay(), 1)
  assert.equal(end.getDate(), 28)
  // Sunday belongs to the week that started the previous Monday.
  const sunday = currentWeekRange(new Date(2026, 8, 27, 12))
  assert.equal(sunday.start.getDate(), 21)
})

test('due: buckets', () => {
  const b = (c: BoardFilterCard) => Array.from(cardDueBuckets(c, NOW)).sort()
  assert.deepEqual(b(card()), ['none'])
  assert.deepEqual(b(card({ dueDate: 'not a date' })), ['none'])
  // All-day card due today is NOT overdue (due at end of day, as the chip says).
  assert.deepEqual(b(card({ dueDate: day(25) })), ['today', 'week'])
  // Timed card due today at 09:00 — past at 15:00, so overdue as well.
  assert.deepEqual(b(card({ dueDate: day(25), endTime: '09:00' })), ['overdue', 'today', 'week'])
  // Earlier this week and not done → overdue + week.
  assert.deepEqual(b(card({ dueDate: day(22) })), ['overdue', 'week'])
  // Done cards are never overdue.
  assert.deepEqual(b(card({ dueDate: day(22), status: 'COMPLETED' })), ['week'])
  assert.deepEqual(b(card({ dueDate: day(22), status: 'CANCELLED' })), ['week'])
  // Last week → overdue only; next week → nothing.
  assert.deepEqual(b(card({ dueDate: day(18) })), ['overdue'])
  assert.deepEqual(b(card({ dueDate: day(28) })), [])
  assert.deepEqual(b(card({ dueDate: day(27, 23) })), ['week'])
})

test('due: OR within the facet', () => {
  const sel = new Set<DueFilter>(['overdue', 'none'])
  assert.equal(cardMatchesDue(card(), sel, NOW), true)
  assert.equal(cardMatchesDue(card({ dueDate: day(18) }), sel, NOW), true)
  assert.equal(cardMatchesDue(card({ dueDate: day(26) }), sel, NOW), false)
  assert.equal(cardMatchesDue(card({ dueDate: day(26) }), new Set(), NOW), true)
})

test('due: counts per bucket over the whole board', () => {
  const counts = countDueBuckets(
    [{ todos: [card(), card({ dueDate: day(25) }), card({ dueDate: day(18) })] }],
    NOW,
  )
  assert.deepEqual(counts, { overdue: 1, today: 1, week: 1, none: 1 })
})

// ─── Watching / linked ─────────────────────────────────────────────────────

test('watching: only when the viewer is a watcher', () => {
  assert.equal(isWatchingCard(card({ watchers: [{ userId: 'me' }] }), 'me'), true)
  assert.equal(isWatchingCard(card({ watchers: [{ userId: 'other' }] }), 'me'), false)
  assert.equal(isWatchingCard(card(), 'me'), false)
  assert.equal(isWatchingCard(card({ watchers: [{ userId: 'me' }] }), null), false)
})

test('linked facet', () => {
  const linked = card({ keyResult: { id: 'kr' } })
  assert.equal(cardMatchesLinked(linked, 'linked'), true)
  assert.equal(cardMatchesLinked(linked, 'unlinked'), false)
  assert.equal(cardMatchesLinked(card(), 'unlinked'), true)
  assert.equal(cardMatchesLinked(card(), 'all'), true)
})

// ─── Combined ──────────────────────────────────────────────────────────────

test('AND across facets', () => {
  const A = { id: 'a', name: 'A', avatar: null }
  const match = card({
    assigneeId: 'a', assignee: A, labels: withLabels(RED), dueDate: day(25),
    watchers: [{ userId: 'me' }], keyResult: { id: 'kr' },
  })
  const f = compileBoardFilter(
    state({ assignees: ['a'], labels: ['red'], due: ['today'], watching: true, linked: 'linked' }),
    { currentUserId: 'me', now: NOW },
  )
  assert.equal(f(match), true)
  // Failing any single facet excludes the card.
  assert.equal(f({ ...match, assigneeId: 'b', assignee: null }), false)
  assert.equal(f({ ...match, labels: withLabels(BLUE) }), false)
  assert.equal(f({ ...match, dueDate: day(26) }), false)
  assert.equal(f({ ...match, watchers: [] }), false)
  assert.equal(f({ ...match, keyResult: null }), false)
})

test('no filters match every card', () => {
  const f = compileBoardFilter(emptyBoardFilters(), { currentUserId: 'me', now: NOW })
  assert.equal(f(card()), true)
  assert.equal(f(card({ dueDate: day(1), labels: withLabels(RED) })), true)
})

test('unassigned sentinel still works through the combined filter', () => {
  const f = compileBoardFilter(state({ assignees: [UNASSIGNED_FILTER_ID] }), { now: NOW })
  assert.equal(f(card()), true)
  assert.equal(f(card({ assigneeId: 'a' })), false)
})

test('active filter count: each facet counts once', () => {
  assert.equal(countActiveFilters(emptyBoardFilters()), 0)
  assert.equal(countActiveFilters(state({ assignees: ['a', 'b'], labels: ['x', 'y'] })), 2)
  assert.equal(
    countActiveFilters(state({ assignees: ['a'], labels: ['x'], due: ['none', 'today'], watching: true, linked: 'unlinked' })),
    5,
  )
})

// ─── Persistence ───────────────────────────────────────────────────────────

test('persistence: legacy single-assignee shape', () => {
  assert.deepEqual(readSavedBoardFilters({ assignee: 'a', linked: 'linked' }), state({ assignees: ['a'], linked: 'linked' }))
})

test('persistence: AFL shape', () => {
  assert.deepEqual(readSavedBoardFilters({ assignees: ['a', 'b'], linked: 'all' }), state({ assignees: ['a', 'b'] }))
})

test('persistence: full shape round-trips', () => {
  const s = state({ assignees: ['a'], labels: ['red', NO_LABEL_FILTER_ID], due: ['overdue', 'week'], watching: true, linked: 'unlinked' })
  assert.deepEqual(readSavedBoardFilters(JSON.parse(JSON.stringify(serializeBoardFilters(s)))), s)
})

test('persistence: malformed values read as no filter', () => {
  assert.deepEqual(readSavedBoardFilters(null), emptyBoardFilters())
  assert.deepEqual(readSavedBoardFilters('x'), emptyBoardFilters())
  assert.deepEqual(
    readSavedBoardFilters({ labels: 'red', due: ['soon', 'today', 'today', 3], watching: 'yes', linked: 'maybe' }),
    state({ due: ['today'] }),
  )
})
