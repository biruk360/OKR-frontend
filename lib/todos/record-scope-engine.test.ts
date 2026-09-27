import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MATCH_NO_ROWS,
  PARTICIPANT_SCOPE_DOCTYPES,
  scopeRuleToFragment,
  type ScopeContext,
  type ScopeLoaders,
  type ScopeRule,
} from '../apply-scope'
import { TODO_PARTICIPANT_SCOPE_RULE } from './visibility'

/**
 * Record-scope engine (lib/apply-scope.ts) — the per-rule fragment builder, with
 * the DB lookups injected. Covers the `is_participant` operator that backs the
 * seeded EMPLOYEE to-do scope, and pins the legacy operators so the extension
 * cannot change them.
 */

const ctx: ScopeContext = { userId: 'u1', primaryDeptId: 'd1', deptIds: ['d1', 'd2'] }

function loaders(watched: string[] = []): ScopeLoaders & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    getDeptAndDescendants: async (id) => {
      calls.push(`dept:${id}`)
      return [id, `${id}-child`]
    },
    getWatchedIds: async (userId, entityType) => {
      calls.push(`watch:${userId}:${entityType}`)
      return watched
    },
  }
}

const rule = (over: Partial<ScopeRule>): ScopeRule => ({
  targetType: 'role',
  targetId: 'role_emp',
  doctypeKey: 'todo',
  fieldName: 'assigneeId',
  operator: 'equals',
  valueType: 'user_id',
  staticValue: null,
  ...over,
})

const participantRule = rule({ ...TODO_PARTICIPANT_SCOPE_RULE })

const CORE = [
  { assigneeId: 'u1' },
  { creatorId: 'u1' },
  { members: { some: { userId: 'u1' } } },
  { sprint: { ownerId: 'u1' } },
  { sprint: { participants: { some: { userId: 'u1' } } } },
]

test('is_participant on todo (list read): OR of own, sprint and watched cards', async () => {
  const l = loaders(['t9'])
  assert.deepEqual(await scopeRuleToFragment(participantRule, ctx, undefined, l), {
    OR: [...CORE, { id: { in: ['t9'] } }],
  })
  assert.deepEqual(l.calls, ['watch:u1:TODO'])
})

test('is_participant on todo (write): no watched clause, no watch lookup', async () => {
  const l = loaders(['t9'])
  assert.deepEqual(await scopeRuleToFragment(participantRule, ctx, 'write', l), { OR: CORE })
  assert.deepEqual(l.calls, [])
})

test('is_participant fails closed on an unregistered doctype or a non user_id value', async () => {
  assert.deepEqual(await scopeRuleToFragment(rule({ ...TODO_PARTICIPANT_SCOPE_RULE, doctypeKey: 'objective' }), ctx, undefined, loaders()), MATCH_NO_ROWS)
  assert.deepEqual(await scopeRuleToFragment(rule({ ...TODO_PARTICIPANT_SCOPE_RULE, valueType: 'user_department' }), ctx, undefined, loaders()), MATCH_NO_ROWS)
})

test('only todo accepts is_participant', () => {
  assert.deepEqual([...PARTICIPANT_SCOPE_DOCTYPES], ['todo'])
})

test('legacy operators are unchanged', async () => {
  const l = loaders()
  assert.deepEqual(await scopeRuleToFragment(rule({}), ctx, undefined, l), { assigneeId: 'u1' })
  assert.deepEqual(await scopeRuleToFragment(rule({ operator: 'is_owner', fieldName: 'ownerId', valueType: 'static' }), ctx, undefined, l), { ownerId: 'u1' })
  assert.deepEqual(await scopeRuleToFragment(rule({ fieldName: 'departmentId', valueType: 'user_department' }), ctx, undefined, l), { departmentId: { in: ['d1', 'd2'] } })
  assert.deepEqual(await scopeRuleToFragment(rule({ fieldName: 'departmentId', valueType: 'user_primary_dept' }), ctx, undefined, l), { departmentId: 'd1' })
  assert.deepEqual(await scopeRuleToFragment(rule({ fieldName: 'departmentId', operator: 'in', valueType: 'user_department' }), ctx, undefined, l), { departmentId: { in: ['d1', 'd2'] } })
  assert.deepEqual(await scopeRuleToFragment(rule({ fieldName: 'departmentId', operator: 'is_child_of', valueType: 'user_primary_dept' }), ctx, undefined, l), { departmentId: { in: ['d1', 'd1-child'] } })
  // Historical fail-open behaviour for unknown combinations and dept-less users is kept.
  assert.equal(await scopeRuleToFragment(rule({ operator: 'nonsense' }), ctx, undefined, l), null)
  assert.equal(await scopeRuleToFragment(rule({ valueType: 'user_department' }), { ...ctx, deptIds: [] }, undefined, l), null)
})

test('seed-permissions seeds the participant rule for EMPLOYEE todo, not the old assignee-only rule', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'scripts', 'seed-permissions.ts'), 'utf8')
  assert.match(src, /roleKey: 'EMPLOYEE',\s*\.\.\.TODO_PARTICIPANT_SCOPE_RULE/)
  assert.doesNotMatch(src, /roleKey: 'EMPLOYEE',\s*doctypeKey: 'todo',\s*fieldName: 'assigneeId'/)
})
