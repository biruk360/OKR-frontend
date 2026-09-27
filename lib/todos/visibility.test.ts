import test from 'node:test'
import assert from 'node:assert/strict'
import {
  NO_TODO_ROWS,
  TODO_SURFACES,
  baseTodoVisibilityWhere,
  composeTodoVisibilityWhere,
  isTodoSurface,
  TODO_PARTICIPANT_SCOPE_RULE,
  todoParticipantScopeWhere,
  todoVisibilityWhere,
  type ScopeFilterFn,
  type TodoSurface,
  type VisibilityUser,
} from './visibility'

/**
 * CPM-11 role matrix — the pure half. Asserts the exact `where` every role gets on
 * every surface and that the record-scope fragment is always ANDed on top (A6).
 * The DB-backed half (seeded fixtures, ids per role) is
 * `scripts/verify-todo-visibility.ts`, run by hand against the local dev DB.
 */

const U = 'user_1'
const user = (role: string, extra: Partial<VisibilityUser> = {}): VisibilityUser => ({ id: U, role, ...extra })

const TODOS_RULE = {
  OR: [
    { assigneeId: U },
    { creatorId: U },
    { keyResult: { ownerId: U } },
    { keyResult: { objective: { ownerId: U } } },
    { objective: { ownerId: U } },
    { members: { some: { userId: U } } },
    { sprint: { ownerId: U } },
    { sprint: { participants: { some: { userId: U } } } },
  ],
}
const WORK_RULE = {
  OR: [{ assigneeId: U }, { creatorId: U }, { members: { some: { userId: U } } }],
}
const MINE_RULE = {
  OR: [{ assigneeId: U }, { members: { some: { userId: U } } }],
}

const SCOPE = { assigneeId: U }

const noScope: ScopeFilterFn = async () => null
const withScope: ScopeFilterFn = async () => SCOPE

/** Expected base rule per role × surface (null = unrestricted before scope). */
const MATRIX: Record<string, Record<TodoSurface, object | null>> = {
  ADMIN: { todos: null, work: null, mine: MINE_RULE },
  EXECUTIVE: { todos: TODOS_RULE, work: null, mine: MINE_RULE },
  DEPARTMENT_LEAD: { todos: TODOS_RULE, work: WORK_RULE, mine: MINE_RULE },
  EMPLOYEE: { todos: TODOS_RULE, work: WORK_RULE, mine: MINE_RULE },
}

for (const [role, bySurface] of Object.entries(MATRIX)) {
  for (const surface of TODO_SURFACES) {
    const expected = bySurface[surface]

    test(`${role} × ${surface}: base rule`, () => {
      assert.deepEqual(baseTodoVisibilityWhere(user(role), surface), expected)
    })

    test(`${role} × ${surface}: no scope rule → base rule only`, async () => {
      const where = await todoVisibilityWhere(user(role), surface, noScope)
      assert.deepEqual(where, expected ?? {})
    })

    test(`${role} × ${surface}: record scope is ANDed`, async () => {
      const where = await todoVisibilityWhere(user(role), surface, withScope)
      assert.deepEqual(where, { AND: expected ? [expected, SCOPE] : [SCOPE] })
    })
  }
}

test('an unknown role is treated as restricted, never as admin', () => {
  assert.deepEqual(baseTodoVisibilityWhere(user('SOMETHING_NEW'), 'todos'), TODOS_RULE)
  assert.deepEqual(baseTodoVisibilityWhere(user('SOMETHING_NEW'), 'work'), WORK_RULE)
})

test('EXECUTIVE is unrestricted on the work board but not on the to-dos list (current SSR rules)', () => {
  assert.equal(baseTodoVisibilityWhere(user('EXECUTIVE'), 'work'), null)
  assert.notEqual(baseTodoVisibilityWhere(user('EXECUTIVE'), 'todos'), null)
})

test('mine never widens for admins', () => {
  assert.deepEqual(baseTodoVisibilityWhere(user('ADMIN'), 'mine'), MINE_RULE)
})

test('the scope filter is asked for the todo doctype and the caller id', async () => {
  const calls: Array<[string, string]> = []
  await todoVisibilityWhere(user('EMPLOYEE'), 'todos', async (id, key) => {
    calls.push([id, key])
    return null
  })
  assert.deepEqual(calls, [[U, 'todo']])
})

test('an OR-shaped scope (several rule groups) is kept intact inside the AND', async () => {
  const orScope = { OR: [{ assigneeId: U }, { creatorId: U }] }
  const where = await todoVisibilityWhere(user('EMPLOYEE'), 'work', async () => orScope)
  assert.deepEqual(where, { AND: [WORK_RULE, orScope] })
})

for (const role of ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE']) {
  for (const surface of TODO_SURFACES) {
    test(`CLIENT_PORTAL (${role} role claim) × ${surface}: matches nothing, scope never consulted`, async () => {
      const portal = user(role, { userType: 'CLIENT_PORTAL' })
      let consulted = false
      const where = await todoVisibilityWhere(portal, surface, async () => {
        consulted = true
        return null
      })
      assert.deepEqual(where, NO_TODO_ROWS)
      assert.deepEqual(baseTodoVisibilityWhere(portal, surface), NO_TODO_ROWS)
      assert.equal(consulted, false)
    })
  }
}

test('INTERNAL userType behaves like an unset userType', () => {
  assert.equal(baseTodoVisibilityWhere(user('ADMIN', { userType: 'INTERNAL' }), 'todos'), null)
})

test('composeTodoVisibilityWhere covers every combination', () => {
  assert.deepEqual(composeTodoVisibilityWhere(null, null), {})
  assert.deepEqual(composeTodoVisibilityWhere(WORK_RULE, null), WORK_RULE)
  assert.deepEqual(composeTodoVisibilityWhere(null, SCOPE), { AND: [SCOPE] })
  assert.deepEqual(composeTodoVisibilityWhere(WORK_RULE, SCOPE), { AND: [WORK_RULE, SCOPE] })
})

test('isTodoSurface accepts only the three surfaces', () => {
  for (const s of TODO_SURFACES) assert.equal(isTodoSurface(s), true)
  for (const s of ['', 'all', 'TODOS', 'calendar', null, undefined, 1]) assert.equal(isTodoSurface(s), false)
})

// ---------------------------------------------------------------------------
// EMPLOYEE participant scope (user decision 2026-09-25)
// ---------------------------------------------------------------------------

const PARTICIPANT_CORE = [
  { assigneeId: U },
  { creatorId: U },
  { members: { some: { userId: U } } },
  { sprint: { ownerId: U } },
  { sprint: { participants: { some: { userId: U } } } },
]

test('participant scope (read): own cards + sprint cards + watched cards', async () => {
  const asked: string[] = []
  const where = await todoParticipantScopeWhere(U, undefined, async (id) => {
    asked.push(id)
    return ['w1', 'w2']
  })
  assert.deepEqual(where, { OR: [...PARTICIPANT_CORE, { id: { in: ['w1', 'w2'] } }] })
  assert.deepEqual(asked, [U])
  assert.deepEqual(await todoParticipantScopeWhere(U, 'read', async () => ['w1']), {
    OR: [...PARTICIPANT_CORE, { id: { in: ['w1'] } }],
  })
})

test('participant scope: no watched cards → no empty id-list clause', async () => {
  assert.deepEqual(await todoParticipantScopeWhere(U, undefined, async () => []), { OR: PARTICIPANT_CORE })
})

for (const action of ['write', 'delete', 'create', 'share', 'export']) {
  test(`participant scope (${action}): watching never widens a non-read action, watch lookup skipped`, async () => {
    let looked = false
    const where = await todoParticipantScopeWhere(U, action, async () => {
      looked = true
      return ['w1']
    })
    assert.deepEqual(where, { OR: PARTICIPANT_CORE })
    assert.equal(looked, false)
  })
}

test('participant scope never includes KR / objective ownership (decision: those rows stay hidden)', async () => {
  const where = JSON.stringify(await todoParticipantScopeWhere(U, undefined, async () => ['w1']))
  assert.equal(where.includes('keyResult'), false)
  assert.equal(where.includes('objective'), false)
})

test('participant scope is a superset of the work and mine surface rules (employees lose nothing there)', () => {
  const core = JSON.stringify(PARTICIPANT_CORE)
  for (const clause of [...WORK_RULE.OR, ...MINE_RULE.OR]) {
    assert.ok(core.includes(JSON.stringify(clause)), `participant scope misses ${JSON.stringify(clause)}`)
  }
})

test('EMPLOYEE × work with the participant scope ANDed keeps the whole surface rule', async () => {
  const participant = await todoParticipantScopeWhere(U, undefined, async () => [])
  const where = await todoVisibilityWhere(user('EMPLOYEE'), 'work', async () => participant)
  assert.deepEqual(where, { AND: [WORK_RULE, participant] })
})

test('the seeded rule definition is the participant operator on the todo doctype', () => {
  assert.deepEqual(TODO_PARTICIPANT_SCOPE_RULE, {
    doctypeKey: 'todo',
    fieldName: 'participant',
    operator: 'is_participant',
    valueType: 'user_id',
  })
})

// Regression (browser smoke test 2026-09-25): the to-dos surface rule is ANDed
// with the participant scope, so any relationship the scope grants but the
// surface rule omits is silently dropped — members and invited-sprint cards
// never showed on an employee's to-dos page.
test('the to-dos surface rule covers every non-watch relationship the participant scope grants', () => {
  const rule = JSON.stringify(baseTodoVisibilityWhere(user('EMPLOYEE'), 'todos'))
  for (const clause of [
    { assigneeId: U },
    { creatorId: U },
    { members: { some: { userId: U } } },
    { sprint: { ownerId: U } },
    { sprint: { participants: { some: { userId: U } } } },
  ]) {
    assert.ok(rule.includes(JSON.stringify(clause)), `missing ${JSON.stringify(clause)}`)
  }
})
