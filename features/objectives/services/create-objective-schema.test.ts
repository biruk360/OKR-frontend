import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCreateObjectivePayload,
  childLevelFor,
  createObjectiveResolver,
  createObjectiveSchema,
} from './create-objective-schema'

const base = {
  title: '  Grow revenue  ',
  level: 'INDIVIDUAL' as const,
  ownerId: 'u1',
  timeframeId: 't1',
}

test('minimal valid input gets defaults', () => {
  const r = createObjectiveSchema.safeParse(base)
  assert.equal(r.success, true)
  if (!r.success) return
  assert.equal(r.data.title, 'Grow revenue')
  assert.equal(r.data.checkInCadence, 'WEEKLY')
  assert.equal(r.data.goalStatus, 'ON_TRACK')
  assert.deepEqual(r.data.contributorIds, [])
  assert.deepEqual(r.data.labelIds, [])
})

test('title, owner and timeframe are required', () => {
  const r = createObjectiveSchema.safeParse({ ...base, title: '   ', ownerId: '', timeframeId: '' })
  assert.equal(r.success, false)
  if (r.success) return
  const paths = r.error.issues.map((i) => i.path[0])
  assert.ok(paths.includes('title'))
  assert.ok(paths.includes('ownerId'))
  assert.ok(paths.includes('timeframeId'))
})

test('department level requires a department', () => {
  const r = createObjectiveSchema.safeParse({ ...base, level: 'DEPARTMENT' })
  assert.equal(r.success, false)
  const ok = createObjectiveSchema.safeParse({ ...base, level: 'DEPARTMENT', departmentId: 'd1' })
  assert.equal(ok.success, true)
})

test('end date must not precede start date', () => {
  const r = createObjectiveSchema.safeParse({ ...base, startDate: '2026-10-10', endDate: '2026-10-01' })
  assert.equal(r.success, false)
  const ok = createObjectiveSchema.safeParse({ ...base, startDate: '2026-10-01', endDate: '2026-10-10' })
  assert.equal(ok.success, true)
})

test('payload drops the owner from contributors, dedupes, and nulls company dept/parent', () => {
  const parsed = createObjectiveSchema.parse({
    ...base,
    level: 'COMPANY',
    departmentId: 'd1',
    parentObjectiveId: 'p1',
    contributorIds: ['u1', 'u2', 'u2'],
  })
  const body = buildCreateObjectivePayload(parsed)
  assert.equal(body.departmentId, null)
  assert.equal(body.parentObjectiveId, null)
  assert.deepEqual(body.contributorIds, ['u2'])
  assert.equal(body.startDate, null)
  assert.equal(body.description, undefined)
})

test('payload keeps the aligned parent for non-company levels', () => {
  const body = buildCreateObjectivePayload(createObjectiveSchema.parse({ ...base, parentObjectiveId: 'p1' }))
  assert.equal(body.parentObjectiveId, 'p1')
})

test('resolver maps issues to field errors', async () => {
  const res = await createObjectiveResolver({ ...base, title: '' } as any, undefined, {} as any)
  assert.ok((res.errors as any).title)
  const good = await createObjectiveResolver(base as any, undefined, {} as any)
  assert.deepEqual(good.errors, {})
})

test('childLevelFor', () => {
  assert.equal(childLevelFor('COMPANY'), 'DEPARTMENT')
  assert.equal(childLevelFor('DEPARTMENT'), 'INDIVIDUAL')
  assert.equal(childLevelFor(undefined), 'INDIVIDUAL')
})
