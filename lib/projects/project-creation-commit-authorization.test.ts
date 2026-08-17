import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  authorizeProjectCreationCommit,
  type AuthorizeProjectCreationCommitInput,
} from './project-creation-authorization'

interface FakeUser {
  id: string
  role: string
  isActive: boolean
  isProjectManager: boolean
}

function authorizationDatabase(
  users: FakeUser[],
  memberships: Array<{ id: string; userId: string; departmentId: string; endedAt: Date | null }>,
) {
  const queries: unknown[] = []
  return {
    queries,
    database: {
      user: {
        async findUnique(args: any) {
          queries.push({ model: 'user', args })
          return users.find((user) => user.id === args.where.id) ?? null
        },
      },
      departmentMembership: {
        async findFirst(args: any) {
          queries.push({ model: 'departmentMembership', args })
          return memberships.find((membership) => (
            membership.userId === args.where.userId
            && membership.departmentId === args.where.departmentId
            && membership.endedAt === args.where.endedAt
          )) ?? null
        },
      },
    },
  }
}

const baseInput: AuthorizeProjectCreationCommitInput = {
  actorUserId: 'lead-1',
  draftOwnerUserId: 'lead-1',
  departmentId: 'dept-a',
}

describe('project creation commit authorization', () => {
  it('rejects a Department Lead outside active membership scope and allows their own department', async () => {
    const fake = authorizationDatabase([
      { id: 'lead-1', role: 'DEPARTMENT_LEAD', isActive: true, isProjectManager: false },
    ], [
      { id: 'membership-1', userId: 'lead-1', departmentId: 'dept-a', endedAt: null },
    ])

    const allowed = await authorizeProjectCreationCommit(baseInput, fake.database)
    assert.equal(allowed.allowed, true)

    const denied = await authorizeProjectCreationCommit({
      ...baseInput,
      departmentId: 'dept-b',
    }, fake.database)
    assert.deepEqual(denied, { allowed: false, code: 'DEPARTMENT_OUT_OF_SCOPE' })

    const membershipQuery = fake.queries.find((query: any) => (
      query.model === 'departmentMembership'
      && query.args.where.departmentId === 'dept-b'
    )) as any
    assert.deepEqual(membershipQuery.args.where, {
      userId: 'lead-1', departmentId: 'dept-b', endedAt: null,
    })
  })

  it('denies commit after capability revocation without changing the draft input', async () => {
    const draft = {
      ownerUserId: 'pm-1',
      departmentId: 'dept-a',
      status: 'READY',
      normalizedData: { project: { name: 'Preserved draft' } },
    }
    const snapshot = structuredClone(draft)
    const fake = authorizationDatabase([
      { id: 'pm-1', role: 'EMPLOYEE', isActive: true, isProjectManager: false },
    ], [
      { id: 'membership-1', userId: 'pm-1', departmentId: 'dept-a', endedAt: null },
    ])

    const denied = await authorizeProjectCreationCommit({
      actorUserId: 'pm-1',
      draftOwnerUserId: draft.ownerUserId,
      departmentId: draft.departmentId,
    }, fake.database)

    assert.deepEqual(denied, { allowed: false, code: 'CREATION_FORBIDDEN' })
    assert.deepEqual(draft, snapshot)
    assert.equal(fake.queries.length, 1, 'revocation is denied before any scope or write path')
  })

  it('requires the creator to own the draft and scoped creators to choose a department', async () => {
    const fake = authorizationDatabase([
      { id: 'pm-1', role: 'EMPLOYEE', isActive: true, isProjectManager: true },
    ], [])

    assert.deepEqual(await authorizeProjectCreationCommit({
      actorUserId: 'pm-1', draftOwnerUserId: 'other-user', departmentId: 'dept-a',
    }, fake.database), { allowed: false, code: 'NOT_DRAFT_OWNER' })

    assert.deepEqual(await authorizeProjectCreationCommit({
      actorUserId: 'pm-1', draftOwnerUserId: 'pm-1', departmentId: null,
    }, fake.database), { allowed: false, code: 'DEPARTMENT_REQUIRED' })

    assert.deepEqual(await authorizeProjectCreationCommit({
      actorUserId: 'pm-1', draftOwnerUserId: 'pm-1', departmentId: 'dept-b',
    }, fake.database), { allowed: false, code: 'DEPARTMENT_OUT_OF_SCOPE' })
  })

  it('allows Administrators and Executives in any department and validates a nominated PM is active', async () => {
    const fake = authorizationDatabase([
      { id: 'admin-1', role: 'ADMIN', isActive: true, isProjectManager: false },
      { id: 'inactive-pm', role: 'EMPLOYEE', isActive: false, isProjectManager: true },
    ], [])

    const unrestricted = await authorizeProjectCreationCommit({
      actorUserId: 'admin-1', draftOwnerUserId: 'admin-1', departmentId: null,
    }, fake.database)
    assert.equal(unrestricted.allowed, true)
    if (unrestricted.allowed) assert.equal(unrestricted.projectManagerId, 'admin-1')

    assert.deepEqual(await authorizeProjectCreationCommit({
      actorUserId: 'admin-1',
      draftOwnerUserId: 'admin-1',
      departmentId: 'any-department',
      projectManagerId: 'inactive-pm',
    }, fake.database), { allowed: false, code: 'PROJECT_MANAGER_INACTIVE' })

    const executive = authorizationDatabase([
      { id: 'exec-1', role: 'EXECUTIVE', isActive: true, isProjectManager: false },
    ], [])
    const executiveResult = await authorizeProjectCreationCommit({
      actorUserId: 'exec-1', draftOwnerUserId: 'exec-1', departmentId: 'any-department',
    }, executive.database)
    assert.equal(executiveResult.allowed, true)
  })
})
