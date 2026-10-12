import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffOrgSettings, orgSettingsPatchSchema } from './schema'

test('accepts the development rule fields', () => {
  const r = orgSettingsPatchSchema.safeParse({ devMinItems: 2, devMinHours: 37.5 })
  assert.equal(r.success, true)
  assert.deepEqual(r.success && r.data, { devMinItems: 2, devMinHours: 37.5 })
})

test('rejects fractional item counts, negatives and over-large values', () => {
  assert.equal(orgSettingsPatchSchema.safeParse({ devMinItems: 1.5 }).success, false)
  assert.equal(orgSettingsPatchSchema.safeParse({ devMinItems: -1 }).success, false)
  assert.equal(orgSettingsPatchSchema.safeParse({ devMinItems: 21 }).success, false)
  assert.equal(orgSettingsPatchSchema.safeParse({ devMinHours: -0.25 }).success, false)
  assert.equal(orgSettingsPatchSchema.safeParse({ devMinHours: 1001 }).success, false)
  assert.equal(orgSettingsPatchSchema.safeParse({ devMinHours: 10.1 }).success, false)
  assert.equal(orgSettingsPatchSchema.safeParse({ devMinHours: '40' }).success, false)
})

test('zero is allowed (turns a rule bar off)', () => {
  assert.equal(orgSettingsPatchSchema.safeParse({ devMinItems: 0, devMinHours: 0 }).success, true)
})

test('keeps the existing fields working and strips unknown keys', () => {
  const r = orgSettingsPatchSchema.safeParse({
    companyName: '  Acme  ',
    companyCeoUserId: null,
    allowMatrixReporting: true,
    allowMultipleDeptHeads: false,
    aiSprintPlanningEnabled: true,
  })
  assert.equal(r.success, true)
  assert.deepEqual(r.success && r.data, {
    companyName: 'Acme',
    companyCeoUserId: null,
    allowMatrixReporting: true,
    allowMultipleDeptHeads: false,
  })
  assert.equal(orgSettingsPatchSchema.safeParse({ companyName: '   ' }).success, false)
})

test('diffOrgSettings lists only sent fields that changed', () => {
  const before = { companyName: 'Acme', devMinItems: 1, devMinHours: 40, companyCeoUserId: null }
  assert.deepEqual(diffOrgSettings(before, { devMinItems: 1, devMinHours: 24 }), {
    devMinHours: { from: 40, to: 24 },
  })
  assert.deepEqual(diffOrgSettings(before, { companyCeoUserId: 'u1' }), {
    companyCeoUserId: { from: null, to: 'u1' },
  })
  assert.deepEqual(diffOrgSettings(before, {}), {})
})
