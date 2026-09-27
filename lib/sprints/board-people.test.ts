import test from 'node:test'
import assert from 'node:assert/strict'
import {
  UNASSIGNED_FILTER_ID,
  cardMatchesPeople,
  cardPeopleIds,
  countUnassignedCards,
  deriveBoardPeople,
  pruneSelection,
  readSavedAssignees,
  type BoardPeopleCard,
  type BoardPersonUser,
} from './board-people'

const u = (id: string, name: string): BoardPersonUser => ({ id, name, avatar: null })
const A = u('a', 'Alice')
const B = u('b', 'bob')
const C = u('c', 'Carol')
const ME = u('me', 'Zed')
const OWNER = u('o', 'Owen')

function card(assignee: BoardPersonUser | null, members: BoardPersonUser[] = []): BoardPeopleCard {
  return { assigneeId: assignee?.id ?? null, assignee, members: members.map((user) => ({ user })) }
}

test('AFL-AC-1: members with no participants are listed with counts', () => {
  const people = deriveBoardPeople({
    columns: [{ todos: [card(null, [A, B]), card(null, [A])] }],
    participants: [],
    owner: null,
  })
  assert.deepEqual(
    people.map((p) => [p.id, p.cardCount]),
    [['a', 2], ['b', 1]],
  )
})

test('union of assignees, members, participants and owner, de-duplicated', () => {
  const people = deriveBoardPeople({
    columns: [
      { todos: [card(A, [A, B])] },          // A as assignee AND member counts once
      { todos: [card(null, [B]), card(null)] },
    ],
    participants: [C, A],
    owner: OWNER,
    currentUserId: 'me',
  })
  assert.deepEqual(people.map((p) => p.id), ['a', 'b', 'c', 'o'])
  assert.deepEqual(people.map((p) => p.cardCount), [1, 2, 0, 0])
})

test('current user first, then by name case-insensitively', () => {
  const people = deriveBoardPeople({
    columns: [{ todos: [card(C), card(B), card(ME), card(A)] }],
    currentUserId: 'me',
  })
  assert.deepEqual(people.map((p) => p.name), ['Zed', 'Alice', 'bob', 'Carol'])
})

test('current user not on the board is not invented', () => {
  const people = deriveBoardPeople({ columns: [{ todos: [card(A)] }], currentUserId: 'me' })
  assert.deepEqual(people.map((p) => p.id), ['a'])
})

test('cardPeopleIds de-duplicates assignee and members', () => {
  assert.deepEqual(cardPeopleIds(card(A, [A, B])).sort(), ['a', 'b'])
  assert.deepEqual(cardPeopleIds({ assigneeId: null }), [])
})

test('AFL-AC-2: OR semantics over assignee and members', () => {
  const sel = new Set(['a', 'b'])
  assert.equal(cardMatchesPeople(card(A), sel), true)
  assert.equal(cardMatchesPeople(card(null, [B]), sel), true)
  assert.equal(cardMatchesPeople(card(C, [B]), sel), true)
  assert.equal(cardMatchesPeople(card(C), sel), false)
  assert.equal(cardMatchesPeople(card(null), sel), false)
})

test('empty selection matches everything', () => {
  assert.equal(cardMatchesPeople(card(null), new Set()), true)
  assert.equal(cardMatchesPeople(card(C), new Set()), true)
})

test('AFL-2: unassigned sentinel matches cards with nobody on them', () => {
  const sel = new Set([UNASSIGNED_FILTER_ID])
  assert.equal(cardMatchesPeople(card(null), sel), true)
  assert.equal(cardMatchesPeople({ assigneeId: null, members: [] }, sel), true)
  assert.equal(cardMatchesPeople(card(null, [A]), sel), false)
  assert.equal(cardMatchesPeople(card(A), sel), false)
  // Combined with a person: either kind matches.
  const both = new Set([UNASSIGNED_FILTER_ID, 'a'])
  assert.equal(cardMatchesPeople(card(null), both), true)
  assert.equal(cardMatchesPeople(card(A), both), true)
  assert.equal(cardMatchesPeople(card(B), both), false)
})

test('countUnassignedCards', () => {
  assert.equal(countUnassignedCards([{ todos: [card(null), card(A), card(null, [B])] }, { todos: [card(null)] }]), 2)
})

test('AFL-AC-4: pruneSelection drops unknown ids, keeps sentinel, returns same ref when unchanged', () => {
  const people = [{ id: 'a' }, { id: 'b' }]
  const unchanged = ['a', UNASSIGNED_FILTER_ID]
  assert.equal(pruneSelection(unchanged, people), unchanged)
  assert.deepEqual(pruneSelection(['a', 'gone', UNASSIGNED_FILTER_ID], people), ['a', UNASSIGNED_FILTER_ID])
  assert.deepEqual(pruneSelection(['gone'], []), [])
})

test('AFL-6 / AFL-AC-3: readSavedAssignees reads new and legacy shapes', () => {
  assert.deepEqual(readSavedAssignees({ assignees: ['a', 'b', 'a'] }), ['a', 'b'])
  assert.deepEqual(readSavedAssignees({ assignee: 'a', linked: 'all' }), ['a'])
  assert.deepEqual(readSavedAssignees({ assignee: null }), [])
  assert.deepEqual(readSavedAssignees({ assignees: [1, '', 'c'] }), ['c'])
  // New shape wins over legacy when both exist.
  assert.deepEqual(readSavedAssignees({ assignees: [], assignee: 'a' }), [])
  assert.deepEqual(readSavedAssignees(null), [])
  assert.deepEqual(readSavedAssignees('x'), [])
})
