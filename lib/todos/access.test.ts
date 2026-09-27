import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TODO_READ_ALL_ROLES,
  TODO_WRITE_ROLES,
  canReadTodo,
  canWriteTodo,
  checklistBelongsToTodo,
  checklistItemBelongsToTodo,
  hasTodoParticipantWriteAccess,
  isClosedSprintState,
  legacyTodoWriteVerdict,
  readableTodoWhere,
  todoReadVerdict,
  todoWriteVerdict,
  type TodoReadFacts,
  type TodoWriteFacts,
} from './access'
import { todoVisibilityWhere } from './visibility'
import { canAccessAttachmentScope } from '../attachments/access'

const todo = {
  assigneeId: 'assignee',
  creatorId: 'creator',
  memberIds: ['member-a', 'member-b'],
}

test('allows the todo assignee to write', () => {
  assert.equal(hasTodoParticipantWriteAccess('assignee', todo), true)
})

test('allows the todo creator to write', () => {
  assert.equal(hasTodoParticipantWriteAccess('creator', todo), true)
})

test('allows an explicit todo member to write', () => {
  assert.equal(hasTodoParticipantWriteAccess('member-b', todo), true)
})

test('denies an unrelated user', () => {
  assert.equal(hasTodoParticipantWriteAccess('other-user', todo), false)
})

test('supports unassigned todos with members', () => {
  assert.equal(
    hasTodoParticipantWriteAccess('member-a', { ...todo, assigneeId: null }),
    true,
  )
})

// ---------------------------------------------------------------------------
// canWriteTodo decision (CPM-3) — the rule PATCH /api/todos/[id] enforces.
// ---------------------------------------------------------------------------

const NOBODY: TodoWriteFacts = {
  role: 'EMPLOYEE',
  isParticipant: false,
  managesLinkedKr: false,
  rbacScopedWrite: null,
}

test('CPM-3: an unrelated EMPLOYEE without RBAC cannot write (CPM-AC-2 forged PATCH)', () => {
  assert.equal(todoWriteVerdict(NOBODY), false)
})

test('CPM-3: a participant EMPLOYEE can write', () => {
  assert.equal(todoWriteVerdict({ ...NOBODY, isParticipant: true }), true)
})

test('CPM-3: a manager of the linked KR can write', () => {
  assert.equal(todoWriteVerdict({ ...NOBODY, managesLinkedKr: true }), true)
})

test('CPM-3: ADMIN, EXECUTIVE and DEPARTMENT_LEAD can write any card', () => {
  for (const role of ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD']) {
    assert.equal(todoWriteVerdict({ ...NOBODY, role }), true, role)
  }
  assert.deepEqual([...TODO_WRITE_ROLES].sort(), ['ADMIN', 'DEPARTMENT_LEAD', 'EXECUTIVE'])
})

test('CPM-3: EMPLOYEE and unknown roles get no role-based write', () => {
  for (const role of ['EMPLOYEE', 'CLIENT_PORTAL', '', 'admin']) {
    assert.equal(todoWriteVerdict({ ...NOBODY, role }), false, role)
  }
})

test('CPM-3: DB-RBAC todo:write inside scope expands access', () => {
  assert.equal(todoWriteVerdict({ ...NOBODY, rbacScopedWrite: true }), true)
})

test('CPM-3: DB-RBAC can never revoke legacy access', () => {
  assert.equal(todoWriteVerdict({ ...NOBODY, isParticipant: true, rbacScopedWrite: false }), true)
  assert.equal(todoWriteVerdict({ ...NOBODY, role: 'ADMIN', rbacScopedWrite: false }), true)
})

test('CPM-3: RBAC out of scope or unavailable is not a grant', () => {
  assert.equal(todoWriteVerdict({ ...NOBODY, rbacScopedWrite: false }), false)
  assert.equal(todoWriteVerdict({ ...NOBODY, rbacScopedWrite: null }), false)
})

test('legacy verdict ignores RBAC entirely', () => {
  assert.equal(legacyTodoWriteVerdict({ role: 'EMPLOYEE', isParticipant: false, managesLinkedKr: false }), false)
  assert.equal(legacyTodoWriteVerdict({ role: 'EMPLOYEE', isParticipant: false, managesLinkedKr: true }), true)
})

// ---------------------------------------------------------------------------
// Closed sprint (CDM-11 / STA-7)
// ---------------------------------------------------------------------------

test('CDM-11: COMPLETED and CANCELLED sprints are closed', () => {
  assert.equal(isClosedSprintState('COMPLETED'), true)
  assert.equal(isClosedSprintState('CANCELLED'), true)
})

test('CDM-11: open sprints and backlog cards are not closed', () => {
  for (const state of ['PLANNING', 'ACTIVE', null, undefined]) {
    assert.equal(isClosedSprintState(state), false, String(state))
  }
})

// ---------------------------------------------------------------------------
// Sub-resource pinning — a checklist/item is only reachable through its card.
// ---------------------------------------------------------------------------

test('a checklist belongs to the card in the URL only when its todoId matches', () => {
  assert.equal(checklistBelongsToTodo({ todoId: 'card-a' }, 'card-a'), true)
  assert.equal(checklistBelongsToTodo({ todoId: 'card-b' }, 'card-a'), false)
})

test('a missing checklist never belongs (404, not a pass-through)', () => {
  assert.equal(checklistBelongsToTodo(null, 'card-a'), false)
  assert.equal(checklistBelongsToTodo(undefined, 'card-a'), false)
})

test('an item belongs only when both its checklist and that checklist’s card match the URL', () => {
  const item = { checklistId: 'cl-1', checklist: { todoId: 'card-a' } }
  assert.equal(checklistItemBelongsToTodo(item, 'card-a', 'cl-1'), true)
  // Right card, wrong checklist in the URL.
  assert.equal(checklistItemBelongsToTodo(item, 'card-a', 'cl-2'), false)
  // Right checklist id, but the URL names a card the user may write to while
  // the item lives on another card — the cross-card write this closes.
  assert.equal(checklistItemBelongsToTodo(item, 'card-b', 'cl-1'), false)
  assert.equal(checklistItemBelongsToTodo(null, 'card-a', 'cl-1'), false)
})

// ---------------------------------------------------------------------------
// canReadTodo decision (CPM-2) — the rule GET /api/todos/[id] and the
// checklist GET enforce. Unreadable cards answer 404 like missing ones.
// ---------------------------------------------------------------------------

const STRANGER: TodoReadFacts = {
  role: 'EMPLOYEE',
  isClientPortal: false,
  isParticipant: false,
  isWatcher: false,
  canViewLinkedSprint: false,
  onVisibilitySurface: false,
  canViewLinkedOkr: false,
  canWrite: false,
}

test('CPM-2: an unrelated EMPLOYEE cannot read a card by id', () => {
  assert.equal(todoReadVerdict(STRANGER), false)
  assert.equal(todoReadVerdict({ ...STRANGER, role: 'DEPARTMENT_LEAD' }), false)
})

test('CPM-2: ADMIN and EXECUTIVE read any card', () => {
  assert.deepEqual([...TODO_READ_ALL_ROLES].sort(), ['ADMIN', 'EXECUTIVE'])
  for (const role of TODO_READ_ALL_ROLES) assert.equal(todoReadVerdict({ ...STRANGER, role }), true, role)
})

test('CPM-2: each legitimate path grants read on its own', () => {
  const paths: (keyof TodoReadFacts)[] = [
    'isParticipant', // assignee / creator / member — notifications, My tasks
    'isWatcher', // watchers receive the card's notifications
    'canViewLinkedSprint', // sprint board ?card= deep links
    'onVisibilitySurface', // /dashboard/todos + /dashboard/work rows (KR / objective owners)
    'canViewLinkedOkr', // OKR pages, explorer and hierarchy open linked initiatives
    'canWrite', // read is never narrower than write
  ]
  for (const key of paths) assert.equal(todoReadVerdict({ ...STRANGER, [key]: true }), true, key)
})

test('CPM-2: client-portal sessions never read internal cards, whatever else holds', () => {
  assert.equal(
    todoReadVerdict({
      ...STRANGER, role: 'ADMIN', isClientPortal: true, isParticipant: true, canWrite: true,
    }),
    false,
  )
})

test('CPM-2: the single-card read evaluates the unified surface rule for that id only', async () => {
  const user = { id: 'u1', role: 'EMPLOYEE' }
  const noScope = async () => null
  const wheres = await Promise.all([
    todoVisibilityWhere(user, 'todos', noScope),
    todoVisibilityWhere(user, 'work', noScope),
  ])
  const where = readableTodoWhere('card-1', wheres) as { AND: [{ id: string }, { OR: unknown[] }] }
  assert.deepEqual(where.AND[0], { id: 'card-1' })
  assert.equal(where.AND[1].OR.length, 2)
  const json = JSON.stringify(where)
  // KR owner / objective owner come from the `todos` surface, members from `work`.
  assert.match(json, /"keyResult":\{"ownerId":"u1"\}/)
  assert.match(json, /"objective":\{"ownerId":"u1"\}/)
  assert.match(json, /"members":\{"some":\{"userId":"u1"\}\}/)
})

test('CPM-2: record scope still narrows the surface rule on a single-card read', async () => {
  const scoped = async () => ({ departmentId: 'd1' })
  const where = readableTodoWhere('card-1', [
    await todoVisibilityWhere({ id: 'u1', role: 'EMPLOYEE' }, 'todos', scoped),
  ])
  assert.match(JSON.stringify(where), /"departmentId":"d1"/)
})

// ---------------------------------------------------------------------------
// 2026-09-25 decisions: invite-only sprints (1b), card-by-link (3), sprint
// participants edit every card in their sprint (4).
// ---------------------------------------------------------------------------

test('decision 4: the sprint owner/participants may write every card in the sprint', () => {
  assert.equal(todoWriteVerdict({ ...NOBODY, isSprintMember: true }), true)
  assert.equal(legacyTodoWriteVerdict({ role: 'EMPLOYEE', isParticipant: false, managesLinkedKr: false, isSprintMember: true }), true)
  // Not on the board and not on the card: still no write.
  assert.equal(todoWriteVerdict({ ...NOBODY, isSprintMember: false }), false)
})

test('decision 4: a participant may PATCH any card in the sprint (canWriteTodo, no DB needed)', async () => {
  const card = {
    id: 'card-1',
    assigneeId: 'someone',
    creatorId: 'someone',
    members: [],
    keyResult: null,
    sprintId: 's1',
    sprint: { ownerId: 'owner', participants: [{ userId: 'teammate' }] },
  }
  assert.equal(await canWriteTodo({ id: 'teammate', role: 'EMPLOYEE' }, card), true)
  assert.equal(await canWriteTodo({ id: 'owner', role: 'EMPLOYEE' }, card), true)
})

test('watchers are readers, never writers', () => {
  assert.equal(todoReadVerdict({ ...STRANGER, isWatcher: true }), true)
  // TodoWriteFacts has no watcher fact at all — the write rule cannot see one.
  const writeFacts: (keyof TodoWriteFacts)[] = ['role', 'isClientPortal', 'isParticipant', 'isSprintMember', 'managesLinkedKr', 'rbacScopedWrite']
  assert.ok(!writeFacts.some((k) => /watch/i.test(k)))
})

test('decision 3: a non-participant cannot read a sprint card by link — not even via its OKR', () => {
  const sprintCard: TodoReadFacts = { ...STRANGER, inSprint: true }
  assert.equal(todoReadVerdict(sprintCard), false)
  // Seeing the linked KR/objective does not open a card on a board you are not on.
  assert.equal(todoReadVerdict({ ...sprintCard, canViewLinkedOkr: true }), false)
  assert.equal(todoReadVerdict({ ...sprintCard, role: 'DEPARTMENT_LEAD', canViewLinkedOkr: true }), false)
  // Being able to view the sprint (owner / participant / ADMIN / EXECUTIVE) does.
  assert.equal(todoReadVerdict({ ...sprintCard, canViewLinkedSprint: true }), true)
})

test('decision 3: a card outside any sprint opens to viewers of its linked OKR', () => {
  const backlogCard: TodoReadFacts = { ...STRANGER, inSprint: false }
  assert.equal(todoReadVerdict(backlogCard), false)
  assert.equal(todoReadVerdict({ ...backlogCard, canViewLinkedOkr: true }), true)
  // A stray sprint fact on a non-sprint card grants nothing.
  assert.equal(todoReadVerdict({ ...backlogCard, canViewLinkedSprint: true }), false)
})

test('decision 3: read matrix — role × relationship × (sprint | backlog)', () => {
  type Rel = 'participant' | 'watcher' | 'sprintViewer' | 'okrViewer' | 'writer' | 'none'
  const rels: Rel[] = ['participant', 'watcher', 'sprintViewer', 'okrViewer', 'writer', 'none']
  for (const role of ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE']) {
    for (const inSprint of [true, false]) {
      for (const rel of rels) {
        const facts: TodoReadFacts = {
          ...STRANGER,
          role,
          inSprint,
          isParticipant: rel === 'participant',
          isWatcher: rel === 'watcher',
          canViewLinkedSprint: rel === 'sprintViewer' && inSprint,
          canViewLinkedOkr: rel === 'okrViewer',
          canWrite: rel === 'writer',
        }
        const expected =
          role === 'ADMIN' || role === 'EXECUTIVE' ||
          rel === 'participant' || rel === 'watcher' || rel === 'writer' ||
          (rel === 'sprintViewer' && inSprint) ||
          (rel === 'okrViewer' && !inSprint)
        assert.equal(todoReadVerdict(facts), expected, `${role}/${inSprint ? 'sprint' : 'backlog'}/${rel}`)
        // Portal overrides every row.
        assert.equal(todoReadVerdict({ ...facts, isClientPortal: true }), false)
      }
    }
  }
})

test('portal users get nothing: read, write and the loaders refuse before touching the DB', async () => {
  const portal = { id: 'client-1', role: 'EMPLOYEE', userType: 'CLIENT_PORTAL' }
  assert.equal(todoWriteVerdict({ ...NOBODY, isClientPortal: true, isParticipant: true, isSprintMember: true }), false)
  assert.equal(todoWriteVerdict({ ...NOBODY, role: 'ADMIN', isClientPortal: true, rbacScopedWrite: true }), false)
  assert.equal(await canReadTodo(portal, 'any-card'), false)
  assert.equal(await canWriteTodo(portal, 'any-card'), false)
  assert.equal(await canAccessAttachmentScope('TODO', 'any-card', { ...portal, role: 'EMPLOYEE' }), false)
  assert.equal(await canAccessAttachmentScope('TODO', 'any-card', { ...portal, role: 'EMPLOYEE' }, 'write'), false)
})

test('closed sprint state is a separate 409, not part of the read/write rule', () => {
  // The write rule grants the participant; the guard (todoWriteGuard) then
  // answers 409 SPRINT_CLOSED for COMPLETED/CANCELLED sprints.
  assert.equal(todoWriteVerdict({ ...NOBODY, isSprintMember: true }), true)
  for (const state of ['COMPLETED', 'CANCELLED']) assert.equal(isClosedSprintState(state), true)
  for (const state of ['PLANNING', 'ACTIVE']) assert.equal(isClosedSprintState(state), false)
})
