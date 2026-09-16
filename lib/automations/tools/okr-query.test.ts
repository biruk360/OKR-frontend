/**
 * okr.query — scope clamp + per-entity WHERE builders.
 *
 * These assertions are the module's §3.4 invariant ("a run sees only what its
 * owner can already see") expressed as code. Everything here is pure: no
 * network, no database, no credentials. The `execute` tests swap a stub client
 * in through `__setOkrQueryDb` and assert on the `where` Prisma would have been
 * handed.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import type { PrismaClient } from '@prisma/client'
import {
  SCOPE_WHERE_BUILDERS,
  __setOkrQueryDb,
  effectiveLimit,
  effectiveScope,
  keyResultScopeWhere,
  objectiveScopeWhere,
  okrQueryTool,
  projectScopeWhere,
  riskScopeWhere,
  scopeWhereFor,
  sprintScopeWhere,
  todoScopeWhere,
  type ScopeActor,
} from './okr-query'
import { OKR_QUERY_ENTITIES, OKR_QUERY_SCOPES, type OkrQueryEntity, type OkrQueryScope } from '@/types/automations'
import type { ToolContext } from './types'

const ROLES = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD', 'EMPLOYEE'] as const

function actor(role: string, departmentIds: string[] = ['d1']): ScopeActor {
  return { userId: 'u1', role, departmentIds }
}

/** Every leaf value in the predicate, flattened — used for "does this mention me / my dept". */
function leaves(value: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    value.forEach((v) => leaves(v, out))
  } else if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((v) => leaves(v, out))
  } else {
    out.push(value)
  }
  return out
}

function mentions(where: unknown, needle: unknown): boolean {
  return leaves(where).includes(needle)
}

// ---------------------------------------------------------------------------
// The clamp
// ---------------------------------------------------------------------------

test('effectiveScope clamps a requested scope to the role ceiling', () => {
  assert.equal(effectiveScope('ORG', 'EMPLOYEE'), 'OWNER')
  assert.equal(effectiveScope('DEPARTMENT', 'EMPLOYEE'), 'OWNER')
  assert.equal(effectiveScope('ORG', 'DEPARTMENT_LEAD'), 'DEPARTMENT')
  assert.equal(effectiveScope('DEPARTMENT', 'DEPARTMENT_LEAD'), 'DEPARTMENT')
  assert.equal(effectiveScope('ORG', 'ADMIN'), 'ORG')
  assert.equal(effectiveScope('ORG', 'EXECUTIVE'), 'ORG')
})

test('effectiveScope never widens: a narrower request is honoured as asked', () => {
  assert.equal(effectiveScope('OWNER', 'ADMIN'), 'OWNER')
  assert.equal(effectiveScope('DEPARTMENT', 'ADMIN'), 'DEPARTMENT')
  assert.equal(effectiveScope(undefined, 'ADMIN'), 'OWNER')
})

test('an unknown or spoofed role falls to the OWNER ceiling', () => {
  assert.equal(effectiveScope('ORG', 'SUPERUSER'), 'OWNER')
  assert.equal(effectiveScope('DEPARTMENT', ''), 'OWNER')
})

// ---------------------------------------------------------------------------
// The invariant: no entity, at any scope, for any role, reads the whole table
// unless the role already sees the whole table interactively.
// ---------------------------------------------------------------------------

test('every entity in OKR_QUERY_ENTITIES has a scope predicate builder', () => {
  for (const entity of OKR_QUERY_ENTITIES) {
    assert.equal(typeof SCOPE_WHERE_BUILDERS[entity], 'function', `${entity} has no builder`)
  }
  assert.equal(Object.keys(SCOPE_WHERE_BUILDERS).length, OKR_QUERY_ENTITIES.length)
})

test('no (entity, role, requested scope) triple ever produces an unfiltered read for a non-admin', () => {
  const nonAdmin = ['DEPARTMENT_LEAD', 'EMPLOYEE', 'SUPERUSER']
  for (const entity of OKR_QUERY_ENTITIES) {
    for (const role of nonAdmin) {
      for (const requested of [...OKR_QUERY_SCOPES, undefined]) {
        for (const depts of [[], ['d1', 'd2']]) {
          const a = actor(role, depts)
          const where = scopeWhereFor(entity, a, requested as OkrQueryScope | undefined)
          assert.notDeepEqual(where, {}, `${entity}/${role}/${requested}/depts=${depts.length} was unfiltered`)
          assert.ok(
            mentions(where, 'u1') || mentions(where, 'd1'),
            `${entity}/${role}/${requested} does not constrain to the actor or their departments`
          )
        }
      }
    }
  }
})

test('an actor with no department membership never gets a department-wide read', () => {
  for (const entity of OKR_QUERY_ENTITIES) {
    const where = scopeWhereFor(entity, actor('DEPARTMENT_LEAD', []), 'DEPARTMENT')
    assert.notDeepEqual(where, {}, `${entity} degraded to an unfiltered read`)
    // With no departments there is nothing to widen to — the predicate must be
    // exactly the OWNER one.
    assert.deepEqual(where, SCOPE_WHERE_BUILDERS[entity](actor('DEPARTMENT_LEAD', []), 'OWNER'))
  }
})

test('scopeWhereFor fails closed to OWNER when a builder returns {} at a wider scope', () => {
  const rogue: OkrQueryEntity = 'todos'
  const original = SCOPE_WHERE_BUILDERS[rogue]
  // A future edit that forgets the DEPARTMENT branch must not read the org.
  SCOPE_WHERE_BUILDERS[rogue] = (a, requested) =>
    effectiveScope(requested, a.role) === 'OWNER' ? { creatorId: a.userId } : {}
  try {
    assert.deepEqual(scopeWhereFor(rogue, actor('DEPARTMENT_LEAD'), 'DEPARTMENT'), { creatorId: 'u1' })
  } finally {
    SCOPE_WHERE_BUILDERS[rogue] = original
  }
})

test('scopeWhereFor refuses the query outright when no predicate can be built at all', () => {
  const rogue: OkrQueryEntity = 'risks'
  const original = SCOPE_WHERE_BUILDERS[rogue]
  SCOPE_WHERE_BUILDERS[rogue] = () => ({})
  try {
    assert.throws(
      () => scopeWhereFor(rogue, actor('DEPARTMENT_LEAD'), 'DEPARTMENT'),
      /refusing to read risks without an ownership predicate/
    )
    // ADMIN at ORG is the one legitimate unfiltered read and is not refused.
    assert.deepEqual(scopeWhereFor(rogue, actor('ADMIN'), 'ORG'), {})
  } finally {
    SCOPE_WHERE_BUILDERS[rogue] = original
  }
})

// ---------------------------------------------------------------------------
// Objectives / key results
// ---------------------------------------------------------------------------

test('objectives: OWNER is strictly own rows', () => {
  assert.deepEqual(objectiveScopeWhere(actor('ADMIN'), 'OWNER'), { ownerId: 'u1' })
})

test('objectives: DEPARTMENT is own rows plus non-private rows of the actor departments', () => {
  assert.deepEqual(objectiveScopeWhere(actor('DEPARTMENT_LEAD', ['d1', 'd2']), 'DEPARTMENT'), {
    OR: [{ ownerId: 'u1' }, { departmentId: { in: ['d1', 'd2'] }, isPrivate: false }],
  })
})

test('objectives: ORG still excludes other people private objectives', () => {
  assert.deepEqual(objectiveScopeWhere(actor('ADMIN'), 'ORG'), {
    OR: [{ ownerId: 'u1' }, { isPrivate: false }],
  })
})

test('key results resolve department through the parent objective, both sides non-private', () => {
  assert.deepEqual(keyResultScopeWhere(actor('DEPARTMENT_LEAD', ['d1']), 'DEPARTMENT'), {
    OR: [
      { ownerId: 'u1' },
      { isPrivate: false, objective: { departmentId: { in: ['d1'] }, isPrivate: false } },
    ],
  })
  assert.deepEqual(keyResultScopeWhere(actor('ADMIN'), 'ORG'), {
    OR: [{ ownerId: 'u1' }, { isPrivate: false, objective: { isPrivate: false } }],
  })
})

// ---------------------------------------------------------------------------
// Todos — the regression the audit found
// ---------------------------------------------------------------------------

test('todos: OWNER mirrors the interactive list (assignee OR creator)', () => {
  assert.deepEqual(todoScopeWhere(actor('EMPLOYEE'), 'OWNER'), {
    OR: [{ assigneeId: 'u1' }, { creatorId: 'u1' }],
  })
})

test('todos: DEPARTMENT is scoped to the actor departments, not the whole org', () => {
  const where = todoScopeWhere(actor('DEPARTMENT_LEAD', ['d1']), 'DEPARTMENT')
  assert.deepEqual(where, {
    OR: [
      { assigneeId: 'u1' },
      { creatorId: 'u1' },
      { objective: { departmentId: { in: ['d1'] }, isPrivate: false } },
      { keyResult: { isPrivate: false, objective: { departmentId: { in: ['d1'] }, isPrivate: false } } },
      { sprint: { departmentId: { in: ['d1'] } } },
    ],
  })
})

test('todos: an unlinked personal todo of a colleague is unreachable at every scope', () => {
  // Every non-owner arm requires a link (objective / keyResult / sprint), so a
  // todo with none of them only matches the assignee/creator arms.
  for (const role of ROLES) {
    for (const scope of OKR_QUERY_SCOPES) {
      const where = todoScopeWhere(actor(role), scope) as { OR: Record<string, unknown>[] }
      for (const arm of where.OR) {
        const key = Object.keys(arm)[0]
        const linked = ['objective', 'keyResult', 'sprint', 'sprintId'].includes(key)
        const own = arm.assigneeId === 'u1' || arm.creatorId === 'u1'
        assert.ok(linked || own, `${role}/${scope}: arm ${key} is neither ownership nor a visible parent`)
      }
    }
  }
})

// ---------------------------------------------------------------------------
// Risks
// ---------------------------------------------------------------------------

test('risks: OWNER covers what you filed and what hangs off your own OKRs', () => {
  assert.deepEqual(riskScopeWhere(actor('EMPLOYEE'), 'OWNER'), {
    OR: [{ reporterId: 'u1' }, { objective: { ownerId: 'u1' } }, { keyResult: { ownerId: 'u1' } }],
  })
})

test('risks: DEPARTMENT inherits visibility from the parent objective / key result', () => {
  assert.deepEqual(riskScopeWhere(actor('DEPARTMENT_LEAD', ['d1']), 'DEPARTMENT'), {
    OR: [
      { reporterId: 'u1' },
      { objective: { ownerId: 'u1' } },
      { keyResult: { ownerId: 'u1' } },
      { objective: { departmentId: { in: ['d1'] }, isPrivate: false } },
      { keyResult: { isPrivate: false, objective: { departmentId: { in: ['d1'] }, isPrivate: false } } },
    ],
  })
})

test('risks: an orphan risk (no objective, no key result) is visible only to its reporter', () => {
  for (const scope of OKR_QUERY_SCOPES) {
    const where = riskScopeWhere(actor('ADMIN'), scope) as { OR: Record<string, unknown>[] }
    const orphanArms = where.OR.filter((arm) => !('objective' in arm) && !('keyResult' in arm))
    assert.deepEqual(orphanArms, [{ reporterId: 'u1' }])
  }
})

// ---------------------------------------------------------------------------
// Projects / sprints
// ---------------------------------------------------------------------------

test('projects: mirrors app/api/projects — manager, member, or department', () => {
  assert.deepEqual(projectScopeWhere(actor('EMPLOYEE'), 'OWNER'), {
    OR: [{ projectManagerId: 'u1' }, { members: { some: { userId: 'u1' } } }],
  })
  assert.deepEqual(projectScopeWhere(actor('DEPARTMENT_LEAD', ['d1']), 'DEPARTMENT'), {
    OR: [
      { projectManagerId: 'u1' },
      { members: { some: { userId: 'u1' } } },
      { departmentId: { in: ['d1'] } },
    ],
  })
})

test('projects: only ADMIN/EXECUTIVE reach the unfiltered portfolio, and only at ORG', () => {
  assert.deepEqual(projectScopeWhere(actor('ADMIN'), 'ORG'), {})
  assert.deepEqual(projectScopeWhere(actor('EXECUTIVE'), 'ORG'), {})
  // A DEPARTMENT_LEAD asking for ORG is clamped to DEPARTMENT and still filtered.
  assert.notDeepEqual(projectScopeWhere(actor('DEPARTMENT_LEAD'), 'ORG'), {})
  assert.notDeepEqual(projectScopeWhere(actor('EMPLOYEE'), 'ORG'), {})
})

test('sprints: mirrors canViewSprint — owner, participant, or department sprint', () => {
  assert.deepEqual(sprintScopeWhere(actor('EMPLOYEE'), 'OWNER'), {
    OR: [{ ownerId: 'u1' }, { participants: { some: { userId: 'u1' } } }],
  })
  assert.deepEqual(sprintScopeWhere(actor('DEPARTMENT_LEAD', ['d1']), 'DEPARTMENT'), {
    OR: [
      { ownerId: 'u1' },
      { participants: { some: { userId: 'u1' } } },
      { departmentId: { in: ['d1'] } },
    ],
  })
  assert.deepEqual(sprintScopeWhere(actor('ADMIN'), 'ORG'), {})
  assert.notDeepEqual(sprintScopeWhere(actor('DEPARTMENT_LEAD'), 'ORG'), {})
})

test('a builder cannot be tricked by an unclamped scope argument — it re-clamps itself', () => {
  // Even if a caller forgets effectiveScope, an EMPLOYEE asking for ORG gets OWNER.
  for (const build of Object.values(SCOPE_WHERE_BUILDERS)) {
    assert.deepEqual(build(actor('EMPLOYEE'), 'ORG'), build(actor('EMPLOYEE'), 'OWNER'))
    assert.deepEqual(build(actor('DEPARTMENT_LEAD'), 'ORG'), build(actor('DEPARTMENT_LEAD'), 'DEPARTMENT'))
  }
})

// ---------------------------------------------------------------------------
// Limit
// ---------------------------------------------------------------------------

test('effectiveLimit clamps to 1..500 and defaults to 100', () => {
  assert.equal(effectiveLimit(undefined), 100)
  assert.equal(effectiveLimit(50), 50)
  assert.equal(effectiveLimit(9999), 500)
  assert.equal(effectiveLimit(0), 1)
  assert.equal(effectiveLimit(-5), 1) // never a negative `take` (Prisma reverse cursor)
  assert.equal(effectiveLimit(Number.NaN), 100)
  assert.equal(effectiveLimit(12.7), 12)
})

// ---------------------------------------------------------------------------
// End to end through okrQueryTool.execute with a stub client
// ---------------------------------------------------------------------------

type Captured = Record<string, unknown>

function stubDb(captured: Record<string, Captured>): PrismaClient {
  const model = (name: string) => ({
    findMany: async (args: { where: Captured }) => {
      captured[name] = args.where
      return []
    },
  })
  return {
    objective: model('objective'),
    keyResult: model('keyResult'),
    todo: model('todo'),
    project: model('project'),
    risk: model('risk'),
    sprint: model('sprint'),
  } as unknown as PrismaClient
}

function ctxFor(role: string, departmentIds: string[] = ['d1']): ToolContext {
  return {
    actor: { userId: 'u1', role: role as ToolContext['actor']['role'], departmentIds, name: 'Owner' },
    now: new Date('2026-09-16T06:00:00.000Z'),
  }
}

test('execute: a DEPARTMENT_LEAD asking for DEPARTMENT never issues an unfiltered query', async () => {
  const captured: Record<string, Captured> = {}
  __setOkrQueryDb(stubDb(captured))
  try {
    const result = await okrQueryTool.execute(
      { entities: [...OKR_QUERY_ENTITIES], scope: 'DEPARTMENT', limit: 500 },
      ctxFor('DEPARTMENT_LEAD')
    )
    assert.equal(result.summary, 'no rows (scope: DEPARTMENT)')
    for (const model of ['objective', 'keyResult', 'todo', 'project', 'risk', 'sprint']) {
      const where = captured[model]
      assert.ok(where, `${model} was never queried`)
      assert.ok(
        mentions(where, 'u1') || mentions(where, 'd1'),
        `${model} where has no ownership/department constraint: ${JSON.stringify(where)}`
      )
    }
  } finally {
    __setOkrQueryDb(null)
  }
})

test('execute: an EMPLOYEE asking for ORG is clamped to their own rows on every entity', async () => {
  const captured: Record<string, Captured> = {}
  __setOkrQueryDb(stubDb(captured))
  try {
    const result = await okrQueryTool.execute(
      { entities: [...OKR_QUERY_ENTITIES], scope: 'ORG' },
      ctxFor('EMPLOYEE', ['d1'])
    )
    assert.match(result.summary, /scope: OWNER/)
    assert.deepEqual(captured.todo, {
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
      OR: [{ assigneeId: 'u1' }, { creatorId: 'u1' }],
    })
    assert.deepEqual(captured.risk, {
      status: { in: ['OPEN', 'MITIGATING'] },
      OR: [{ reporterId: 'u1' }, { objective: { ownerId: 'u1' } }, { keyResult: { ownerId: 'u1' } }],
    })
    // No department arm leaked in despite the actor having a membership.
    assert.ok(!mentions(captured.todo, 'd1'))
    assert.ok(!mentions(captured.risk, 'd1'))
  } finally {
    __setOkrQueryDb(null)
  }
})

test('execute: the scope clamp is reported in the summary, not silently applied', async () => {
  const captured: Record<string, Captured> = {}
  __setOkrQueryDb(stubDb(captured))
  try {
    const org = await okrQueryTool.execute({ entities: ['todos'], scope: 'ORG' }, ctxFor('ADMIN'))
    assert.match(org.summary, /scope: ORG/)
    const dept = await okrQueryTool.execute({ entities: ['todos'], scope: 'ORG' }, ctxFor('DEPARTMENT_LEAD'))
    assert.match(dept.summary, /scope: DEPARTMENT/)
  } finally {
    __setOkrQueryDb(null)
  }
})

test('execute: caller-supplied filters compose with the scope predicate rather than replacing it', async () => {
  const captured: Record<string, Captured> = {}
  __setOkrQueryDb(stubDb(captured))
  try {
    await okrQueryTool.execute(
      { entities: ['todos'], scope: 'DEPARTMENT', statuses: ['IN_PROGRESS'], updatedWithinDays: 7 },
      ctxFor('DEPARTMENT_LEAD')
    )
    const where = captured.todo as { status: unknown; updatedAt: { gte: Date }; OR: unknown[] }
    assert.deepEqual(where.status, { in: ['IN_PROGRESS'] })
    assert.equal(where.updatedAt.gte.toISOString(), '2026-09-09T06:00:00.000Z')
    assert.ok(Array.isArray(where.OR) && where.OR.length > 2)
  } finally {
    __setOkrQueryDb(null)
  }
})
