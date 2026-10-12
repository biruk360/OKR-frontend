import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDefinitionPatch, definitionFormSchema, definitionToFormValues } from './definition-form'
import type { KrDefinitionDTO } from '../checkpoints/checkpoint-types'

const DEF: KrDefinitionDTO = {
  commitment: 'COMMITTED',
  direction: 'INCREASE',
  baselineText: '38% of qualified bids',
  targetText: '45% win rate',
  measuredBy: 'CRM',
  dueText: null,
  dueDate: '2027-06-30T00:00:00.000Z',
  startValue: 38,
  targetValue: 45,
  currentValue: 40,
  unit: '%',
}

test('definitionToFormValues maps nulls to empty strings', () => {
  const v = definitionToFormValues(DEF)
  assert.equal(v.commitment, 'COMMITTED')
  assert.equal(v.dueText, '')
  assert.equal(v.dueDate, '2027-06-30')
  assert.equal(v.startValue, '38')
})

test('buildDefinitionPatch sends only changed keys', () => {
  const v = definitionToFormValues(DEF)
  assert.equal(buildDefinitionPatch(DEF, v), null)
  assert.deepEqual(buildDefinitionPatch(DEF, { ...v, measuredBy: '  KPI-7  ' }), { measuredBy: 'KPI-7' })
  assert.deepEqual(buildDefinitionPatch(DEF, { ...v, baselineText: '' }), { baselineText: null })
  assert.deepEqual(buildDefinitionPatch(DEF, { ...v, commitment: 'ASPIRATIONAL' }), { commitment: 'ASPIRATIONAL' })
  assert.deepEqual(buildDefinitionPatch(DEF, { ...v, commitment: '' }), { commitment: null })
  assert.deepEqual(buildDefinitionPatch(DEF, { ...v, dueDate: '' }), { dueDate: null })
  assert.deepEqual(buildDefinitionPatch(DEF, { ...v, dueDate: '2027-03-31' }), { dueDate: '2027-03-31T00:00:00.000Z' })
})

test('flipping direction sends the numbers with it (KRX-1)', () => {
  const v = definitionToFormValues(DEF)
  assert.deepEqual(buildDefinitionPatch(DEF, { ...v, direction: 'DECREASE', startValue: '45', targetValue: '38' }), {
    direction: 'DECREASE',
    startValue: 45,
    targetValue: 38,
  })
})

test('definitionFormSchema enforces the span direction', () => {
  const v = definitionToFormValues(DEF)
  assert.ok(definitionFormSchema.safeParse(v).success)
  assert.equal(definitionFormSchema.safeParse({ ...v, direction: 'DECREASE' }).success, false)
  assert.ok(definitionFormSchema.safeParse({ ...v, direction: 'DECREASE', startValue: '45', targetValue: '38' }).success)
  assert.equal(definitionFormSchema.safeParse({ ...v, commitment: 'MAYBE' }).success, false)
  assert.equal(definitionFormSchema.safeParse({ ...v, dueText: 'x'.repeat(501) }).success, false)
})
