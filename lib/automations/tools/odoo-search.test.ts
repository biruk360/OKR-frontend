import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeOdooRows,
  odooValueToString,
  recordUrl,
  resolveAllowedModels,
  validateDomain,
} from './odoo-search'
import { ODOO_ALLOWED_MODELS } from '@/types/automations'

// ---------------------------------------------------------------------------
// Domain validation
// ---------------------------------------------------------------------------

test('a well-formed domain passes through unchanged', () => {
  const domain = [['write_date', '<', '2026-09-02'], ['stage_id.is_won', '=', false]]
  assert.deepEqual(validateDomain(domain), domain)
})

test('logical operators are accepted', () => {
  const domain = ['|', ['state', '=', 'draft'], ['state', '=', 'sent']]
  assert.deepEqual(validateDomain(domain), domain)
})

test('an absent domain becomes an empty one rather than throwing', () => {
  assert.deepEqual(validateDomain(undefined), [])
  assert.deepEqual(validateDomain(null), [])
})

test('malformed domains are refused with a readable reason', () => {
  assert.throws(() => validateDomain('everything'), /must be an array/)
  assert.throws(() => validateDomain([['a', '=']]), /\[field, operator, value\]/)
  assert.throws(() => validateDomain([[1, '=', 'x']]), /field must be a non-empty string/)
  assert.throws(() => validateDomain([['a', 5, 'x']]), /operator must be a string/)
  assert.throws(() => validateDomain(['AND', ['a', '=', 1]]), /unknown domain operator/)
})

test('an oversized domain is refused', () => {
  const huge = Array.from({ length: 41 }, () => ['x', '=', 1])
  assert.throws(() => validateDomain(huge), /too many terms/)
})

// ---------------------------------------------------------------------------
// The model allowlist: outer bound ∩ grant
// ---------------------------------------------------------------------------

test('no grant params means the outer bound applies', () => {
  assert.deepEqual(resolveAllowedModels(undefined), ODOO_ALLOWED_MODELS)
  assert.deepEqual(resolveAllowedModels({}), ODOO_ALLOWED_MODELS)
})

test('a grant narrows the allowlist and can never widen it', () => {
  assert.deepEqual(resolveAllowedModels({ models: ['crm.lead'] }), ['crm.lead'])
  // A model outside the outer bound cannot be smuggled in through the grant.
  assert.deepEqual(resolveAllowedModels({ models: ['res.users' as never] }), [])
})

// ---------------------------------------------------------------------------
// Odoo's value conventions
// ---------------------------------------------------------------------------

test('false means unset for every type, not the string "false"', () => {
  assert.equal(odooValueToString(false), undefined)
  assert.equal(odooValueToString(null), undefined)
  assert.equal(odooValueToString(undefined), undefined)
  assert.equal(odooValueToString(''), undefined)
})

test('a many2one pair resolves to its label', () => {
  assert.equal(odooValueToString([7, 'Awash Bank S.C.']), 'Awash Bank S.C.')
})

test('scalars and id lists survive', () => {
  assert.equal(odooValueToString(8400000), '8400000')
  assert.equal(odooValueToString('draft'), 'draft')
  assert.equal(odooValueToString([]), undefined)
})

test('recordUrl builds a deep link only when both base URL and numeric id exist', () => {
  assert.equal(
    recordUrl('https://erp.example.org', 'crm.lead', 42),
    'https://erp.example.org/web#id=42&model=crm.lead&view_type=form'
  )
  assert.equal(recordUrl(undefined, 'crm.lead', 42), undefined)
  assert.equal(recordUrl('https://erp.example.org', 'crm.lead', 'abc'), undefined)
})

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

const LEADS = [
  {
    id: 11,
    name: 'Classroom construction — MoE',
    partner_id: [3, 'Ministry of Education'],
    stage_id: [2, 'Proposition'],
    user_id: [9, 'Eyoel'],
    expected_revenue: 8400000,
    write_date: '2026-09-01 07:15:22',
    probability: false,
  },
  {
    id: 12,
    name: 'Road maintenance',
    partner_id: false,
    stage_id: [1, 'New'],
    user_id: false,
    expected_revenue: 0,
    write_date: '2026-08-20 11:00:00',
  },
]

test('a crm.lead record maps onto the normalised row shape', () => {
  const [row] = normalizeOdooRows('crm.lead', [LEADS[0]], ['expected_revenue', 'probability'], 'https://erp.example.org')
  assert.equal(row.kind, 'crm.lead')
  assert.equal(row.id, '11')
  assert.equal(row.title, 'Classroom construction — MoE')
  assert.equal(row.subtitle, 'Ministry of Education')
  assert.equal(row.status, 'Proposition')
  assert.equal(row.owner, 'Eyoel')
  assert.equal(row.url, 'https://erp.example.org/web#id=11&model=crm.lead&view_type=form')
  assert.deepEqual(row.fields, { expected_revenue: '8400000' })
})

test('unset relations degrade to undefined rather than "false"', () => {
  const [, row] = normalizeOdooRows('crm.lead', LEADS, [], undefined)
  assert.equal(row.subtitle, undefined)
  assert.equal(row.owner, undefined)
  assert.equal(row.url, undefined)
})

test('write_date becomes an ISO instant the differ and prompt can use', () => {
  const [row] = normalizeOdooRows('crm.lead', [LEADS[0]], [], undefined)
  assert.equal(row.updatedAt, '2026-09-01T07:15:22Z')
  assert.ok(!Number.isNaN(Date.parse(row.updatedAt!)))
})

test('identity fields are not duplicated into the fields bag', () => {
  const [row] = normalizeOdooRows('crm.lead', [LEADS[0]], ['name', 'partner_id', 'stage_id', 'expected_revenue'], undefined)
  assert.deepEqual(Object.keys(row.fields ?? {}), ['expected_revenue'])
})

test('an unknown model still normalises through the default hint', () => {
  const [row] = normalizeOdooRows(
    'some.model',
    [{ id: 3, display_name: 'Thing', state: 'open', write_date: '2026-09-01 00:00:00' }],
    [],
    undefined
  )
  assert.equal(row.title, 'Thing')
  assert.equal(row.status, 'open')
})

test('a record with no usable title falls back to a model#id label', () => {
  const [row] = normalizeOdooRows('crm.lead', [{ id: 99, write_date: false }], [], undefined)
  assert.equal(row.title, 'crm.lead #99')
})
