import assert from 'node:assert/strict'
import test from 'node:test'
import type { Prisma } from '@prisma/client'
import {
  SPRINT_VIEW_ALL_ROLES,
  canEditSprint,
  canMoveSprintCards,
  canViewSprint,
  isSprintMember,
  sprintViewVerdict,
  sprintVisibilityWhere,
  type SprintCtx,
  type SprintViewer,
} from '../permissions'
import { cardInvitees, inviteToSprint, type SprintParticipantWriter } from './participants'

/**
 * Invite-only sprint boards (2026-09-25, decision 1b).
 * View: ADMIN/EXECUTIVE all; everyone else — DEPARTMENT_LEAD included — only as
 * owner or SprintParticipant. Department membership grants nothing. Portal: never.
 */

const ROLES = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE'] as const
type Relationship = 'owner' | 'participant' | 'department-member' | 'stranger'

/** A sprint of department d1, owned by `owner`, with `member` invited. */
const SPRINT: SprintCtx = { ownerId: 'owner', departmentId: 'd1', participants: [{ userId: 'member' }] }
const USER_FOR: Record<Relationship, string> = {
  owner: 'owner',
  participant: 'member',
  // In department d1 but neither owner nor participant: must NOT see it any more.
  'department-member': 'dept-colleague',
  stranger: 'someone-else',
}

function expectedView(role: string, rel: Relationship, portal = false): boolean {
  if (portal) return false
  if (role === 'ADMIN' || role === 'EXECUTIVE') return true
  return rel === 'owner' || rel === 'participant'
}

test('view matrix: role × relationship (invite-only)', async () => {
  for (const role of ROLES) {
    for (const rel of Object.keys(USER_FOR) as Relationship[]) {
      const user: SprintViewer = { id: USER_FOR[rel], role }
      assert.equal(sprintViewVerdict(user, SPRINT), expectedView(role, rel), `${role}/${rel}`)
      assert.equal(await canViewSprint(role, user.id, SPRINT), expectedView(role, rel), `canViewSprint ${role}/${rel}`)
    }
  }
  assert.deepEqual([...SPRINT_VIEW_ALL_ROLES].sort(), ['ADMIN', 'EXECUTIVE'])
})

test('a DEPARTMENT_LEAD in the sprint’s department who is NOT invited cannot view it', async () => {
  assert.equal(await canViewSprint('DEPARTMENT_LEAD', 'dept-colleague', SPRINT), false)
  // …and once invited, can.
  const invited = { ...SPRINT, participants: [...SPRINT.participants!, { userId: 'dept-colleague' }] }
  assert.equal(await canViewSprint('DEPARTMENT_LEAD', 'dept-colleague', invited), true)
})

test('client-portal sessions never view a sprint, whatever else holds', async () => {
  for (const role of ROLES) {
    for (const rel of Object.keys(USER_FOR) as Relationship[]) {
      const user: SprintViewer = { id: USER_FOR[rel], role, userType: 'CLIENT_PORTAL' }
      assert.equal(sprintViewVerdict(user, SPRINT), false, `${role}/${rel}`)
      assert.equal(await canViewSprint(role, user.id, SPRINT, { userType: 'CLIENT_PORTAL' }), false)
    }
  }
})

test('missing participants list fails closed (owner still sees it)', () => {
  const bare: SprintCtx = { ownerId: 'owner', departmentId: 'd1' }
  assert.equal(sprintViewVerdict({ id: 'member', role: 'EMPLOYEE' }, bare), false)
  assert.equal(sprintViewVerdict({ id: 'owner', role: 'EMPLOYEE' }, bare), true)
})

// ---------------------------------------------------------------------------
// sprintVisibilityWhere ≡ sprintViewVerdict
// ---------------------------------------------------------------------------

interface Row { id: string; ownerId: string; departmentId: string | null; participants: { userId: string }[] }

/** Evaluates the subset of Prisma.SprintWhereInput the list rule may produce. */
function matches(row: Row, where: Prisma.SprintWhereInput): boolean {
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue
    if (key === 'OR') {
      if (!(value as Prisma.SprintWhereInput[]).some((w) => matches(row, w))) return false
    } else if (key === 'AND') {
      if (!(value as Prisma.SprintWhereInput[]).every((w) => matches(row, w))) return false
    } else if (key === 'ownerId') {
      if (row.ownerId !== value) return false
    } else if (key === 'id') {
      const inList = (value as { in: string[] }).in
      if (!inList.includes(row.id)) return false
    } else if (key === 'participants') {
      const userId = (value as { some: { userId: string } }).some.userId
      if (!row.participants.some((p) => p.userId === userId)) return false
    } else {
      throw new Error(`the interpreter does not understand "${key}" — extend it with the new rule`)
    }
  }
  return true
}

test('sprintVisibilityWhere lists exactly the sprints sprintViewVerdict opens', () => {
  const rows: Row[] = [
    { id: 's1', ownerId: 'u1', departmentId: 'd1', participants: [] },
    { id: 's2', ownerId: 'x', departmentId: 'd1', participants: [{ userId: 'u1' }] },
    { id: 's3', ownerId: 'x', departmentId: 'd1', participants: [{ userId: 'y' }] }, // u1's department, not invited
    { id: 's4', ownerId: 'x', departmentId: null, participants: [] },
    { id: 's5', ownerId: 'u1', departmentId: null, participants: [{ userId: 'u1' }] }, // owner + participant row
  ]
  for (const role of ROLES) {
    for (const userType of [null, 'INTERNAL', 'CLIENT_PORTAL']) {
      const user: SprintViewer = { id: 'u1', role, userType }
      const where = sprintVisibilityWhere(user)
      for (const row of rows) {
        assert.equal(matches(row, where), sprintViewVerdict(user, row), `${role}/${userType}/${row.id}`)
      }
    }
  }
  // The shapes the routes rely on.
  assert.deepEqual(sprintVisibilityWhere({ id: 'u1', role: 'ADMIN' }), {})
  assert.deepEqual(sprintVisibilityWhere({ id: 'u1', role: 'DEPARTMENT_LEAD' }), {
    OR: [{ ownerId: 'u1' }, { participants: { some: { userId: 'u1' } } }],
  })
  assert.deepEqual(sprintVisibilityWhere({ id: 'u1', role: 'ADMIN', userType: 'CLIENT_PORTAL' }), { id: { in: [] } })
})

// ---------------------------------------------------------------------------
// Edit never exceeds view
// ---------------------------------------------------------------------------

test('edit: ADMIN/EXECUTIVE and the owner; an uninvited lead may not edit (or self-invite)', async () => {
  assert.equal(await canEditSprint('ADMIN', 'x', SPRINT), true)
  assert.equal(await canEditSprint('EXECUTIVE', 'x', SPRINT), true)
  assert.equal(await canEditSprint('EMPLOYEE', 'owner', SPRINT), true)
  // No DB lookup happens for an uninvited lead: invitation is checked first.
  assert.equal(await canEditSprint('DEPARTMENT_LEAD', 'dept-colleague', SPRINT), false)
  // Participants edit cards (canWriteTodo), not the sprint's settings.
  assert.equal(await canEditSprint('EMPLOYEE', 'member', SPRINT), false)
})

test('board reorder: participants may move the cards of their sprint', async () => {
  assert.equal(await canMoveSprintCards('EMPLOYEE', 'member', SPRINT), true)
  assert.equal(await canMoveSprintCards('EMPLOYEE', 'owner', SPRINT), true)
  assert.equal(await canMoveSprintCards('EMPLOYEE', 'someone-else', SPRINT), false)
  assert.equal(await canMoveSprintCards('DEPARTMENT_LEAD', 'dept-colleague', SPRINT), false)
})

test('isSprintMember is owner-or-participant', () => {
  assert.equal(isSprintMember('owner', SPRINT), true)
  assert.equal(isSprintMember('member', SPRINT), true)
  assert.equal(isSprintMember('dept-colleague', SPRINT), false)
})

// ---------------------------------------------------------------------------
// Being put on a card is an invitation
// ---------------------------------------------------------------------------

function fakeTx() {
  const calls: { op: string; args: unknown }[] = []
  const tx = {
    sprintParticipant: {
      createMany: async (args: unknown) => {
        calls.push({ op: 'createMany', args })
        return { count: ((args as { data: unknown[] }).data).length }
      },
      deleteMany: async (args: unknown) => {
        calls.push({ op: 'deleteMany', args })
        return { count: 0 }
      },
    },
  } as unknown as SprintParticipantWriter
  return { tx, calls }
}

test('cardInvitees: assignee + members, de-duplicated, blanks dropped', () => {
  assert.deepEqual(cardInvitees({ assigneeId: 'a', memberIds: ['b', 'a', null, '', undefined, 'c'] }), ['a', 'b', 'c'])
  assert.deepEqual(cardInvitees({ assigneeId: null }), [])
})

test('inviteToSprint upserts MEMBER participants idempotently and never removes anyone', async () => {
  const { tx, calls } = fakeTx()
  await inviteToSprint(tx, 's1', ['a', 'b', 'a', null])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].op, 'createMany')
  assert.deepEqual(calls[0].args, {
    data: [
      { sprintId: 's1', userId: 'a', role: 'MEMBER' },
      { sprintId: 's1', userId: 'b', role: 'MEMBER' },
    ],
    skipDuplicates: true,
  })
  assert.ok(!calls.some((c) => c.op === 'deleteMany'))
})

test('inviteToSprint is a no-op for a card outside a sprint or with nobody on it', async () => {
  const { tx, calls } = fakeTx()
  assert.equal(await inviteToSprint(tx, null, ['a']), 0)
  assert.equal(await inviteToSprint(tx, undefined, ['a']), 0)
  assert.equal(await inviteToSprint(tx, 's1', [null, undefined]), 0)
  assert.equal(calls.length, 0)
})

test('being added as a card member grants view of the sprint', async () => {
  // Before: a colleague is not on the board.
  const sprint: SprintCtx = { ownerId: 'owner', departmentId: 'd1', participants: [] }
  assert.equal(await canViewSprint('EMPLOYEE', 'new-member', sprint), false)
  // POST /api/todos/[id]/members → inviteToSprint in the same transaction.
  const participants: { userId: string }[] = []
  const tx = {
    sprintParticipant: {
      createMany: async ({ data }: { data: { userId: string }[] }) => {
        for (const d of data) if (!participants.some((p) => p.userId === d.userId)) participants.push({ userId: d.userId })
        return { count: data.length }
      },
    },
  } as unknown as SprintParticipantWriter
  await inviteToSprint(tx, 's1', cardInvitees({ assigneeId: null, memberIds: ['new-member'] }))
  assert.equal(await canViewSprint('EMPLOYEE', 'new-member', { ...sprint, participants }), true)
})
