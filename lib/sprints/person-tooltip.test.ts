// docs/user_name_hover_REQUIREMENTS.md — pure helpers behind PersonTooltip /
// PeopleTooltip (components/shared/UserAvatar.tsx). Lives in the sprints glob
// because the sprint board is the primary consumer (UNH-2, UNH-5).
import test from 'node:test'
import assert from 'node:assert/strict'
import { overflowPeople, personDetail, personDisplayName, userInitials } from '../user-color'

test('personDisplayName: name, then email, then a non-blank fallback', () => {
  assert.equal(personDisplayName({ name: '  Abebe Kebede ', email: 'a@x.com' }), 'Abebe Kebede')
  assert.equal(personDisplayName({ name: '   ', email: 'a@x.com' }), 'a@x.com')
  assert.equal(personDisplayName({ name: null, email: null }), 'Unknown user')
  assert.equal(personDisplayName(null), 'Unknown user')
})

test('personDetail: joins truthy parts with a middle dot', () => {
  assert.equal(personDetail(['You', 'Assignee']), 'You · Assignee')
  assert.equal(personDetail([false, null, undefined, '  ']), undefined)
  assert.equal(personDetail([]), undefined)
})

test('personDetail: de-duplicates case-insensitively and drops the display name', () => {
  assert.equal(personDetail(['Member', 'member', 'Admin']), 'Member · Admin')
  // A person with no name displays their email — do not repeat it underneath.
  assert.equal(personDetail(['a@x.com', 'Member'], 'a@x.com'), 'Member')
})

test('overflowPeople: caps the list and reports the remainder', () => {
  const ppl = ['a', 'b', 'c', 'd', 'e']
  assert.deepEqual(overflowPeople(ppl, 3), { shown: ['a', 'b', 'c'], more: 2 })
  assert.deepEqual(overflowPeople(ppl, 8), { shown: ppl, more: 0 })
  assert.deepEqual(overflowPeople([], 8), { shown: [], more: 0 })
  // A nonsensical limit still shows at least one person.
  assert.deepEqual(overflowPeople(ppl, 0), { shown: ['a'], more: 4 })
})

test('userInitials: unchanged contract the tooltip trigger relies on', () => {
  assert.equal(userInitials('Abebe Kebede Tesfaye'), 'AK')
  assert.equal(userInitials('madonna'), 'M')
  assert.equal(userInitials(''), '?')
  assert.equal(userInitials(null), '?')
})
