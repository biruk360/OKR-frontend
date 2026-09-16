import test from 'node:test'
import assert from 'node:assert/strict'
import { __toPlanSpecForTests as toPlanSpec } from './compiler'
import { validatePlan, withPlanDefaults } from './plan'
import type { PlanSpec } from '@/types/automations'

/**
 * The compiler's network call is not exercised here — these pin the shaping of
 * the model's flattened wire output into a PlanSpec the validator accepts.
 */
const TZ = 'Africa/Addis_Ababa'

function modelOutput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Weekly stalled key results',
    notes: 'Assumed 08:00 since no time was given.',
    schedule: {
      kind: 'WEEKLY', atTime: '08:00', byDay: ['MON'], dayOfMonth: null,
      minute: null, weekdaysOnly: null, month: null, day: null, catchUpPolicy: 'SKIP',
    },
    steps: [{
      tool: 'okr.query',
      label: 'Stalled key results',
      okrQuery: {
        entities: ['keyResults'], scope: 'OWNER', staleForDays: 14,
        updatedWithinDays: null, statuses: null, limit: 100,
      },
      odooSearch: null,
    }],
    synthesis: {
      objective: 'Surface key results with no check-in for two weeks.',
      relevanceCriteria: null,
      dedupeKeyFields: ['title'],
      fields: ['progress', 'owner'],
      maxFindings: 30,
    },
    briefing: { titleTemplate: '{{date}} OKR briefing', tone: null },
    ...overrides,
  }
}

function compileAndValidate(raw: Record<string, unknown>): PlanSpec {
  const { plan, grants } = toPlanSpec(raw, TZ)
  return withPlanDefaults(validatePlan(plan, { grants, maxCostUsdPerRun: 0.5 }))
}

test('a typical model output compiles into a plan the validator accepts', () => {
  const plan = compileAndValidate(modelOutput())
  assert.equal(plan.schedule.kind, 'WEEKLY')
  assert.equal(plan.schedule.timezone, TZ)
  assert.deepEqual(plan.schedule.byDay, ['MON'])
  assert.equal(plan.steps.length, 1)
  assert.equal(plan.steps[0].tool, 'okr.query')
  assert.equal(plan.steps[0].id, 's1')
})

test('nulls from the schema are dropped rather than written through as null', () => {
  const plan = compileAndValidate(modelOutput())
  assert.equal('dayOfMonth' in plan.schedule, false)
  assert.equal('weekdaysOnly' in plan.schedule, false)
  assert.equal('statuses' in (plan.steps[0].params as Record<string, unknown>), false)
})

test('the timezone comes from the caller, never the model', () => {
  const { plan } = toPlanSpec(modelOutput({ schedule: { ...(modelOutput().schedule as object), timezone: 'America/New_York' } }), TZ)
  assert.equal((plan as PlanSpec).schedule.timezone, TZ)
})

test('recipients are never set by the model', () => {
  const plan = compileAndValidate(modelOutput())
  assert.deepEqual(plan.notify.emailRecipients, [])
  assert.equal(plan.notify.onEmpty, 'SKIP')
})

test('cost caps are fixed by the server, not chosen by the model', () => {
  const plan = compileAndValidate(modelOutput())
  assert.equal(plan.limits?.maxCostUsd, 0.5)
  assert.equal(plan.limits?.timeoutSeconds, 600)
})

test('grants are derived from the steps the model actually produced', () => {
  const { grants } = toPlanSpec(modelOutput(), TZ)
  assert.deepEqual(grants, [{ tool: 'okr.query' }])
})

test('an odoo step becomes a templated write_date domain and a model-pinned grant', () => {
  const { plan, grants } = toPlanSpec(modelOutput({
    steps: [{
      tool: 'odoo.search',
      label: 'Stalled leads',
      okrQuery: null,
      odooSearch: { model: 'crm.lead', untouchedForDays: 14, fields: ['expected_revenue'], limit: 50 },
    }],
  }), TZ)

  const step = (plan as PlanSpec).steps[0]
  assert.deepEqual(step.params.domain, [['write_date', '<', '{{now-14d}}']])
  assert.equal(step.params.order, 'write_date asc')
  assert.deepEqual(grants, [{ tool: 'odoo.search', params: { models: ['crm.lead'], maxLimit: 200 } }])
})

test('an odoo step without a staleness window omits the domain entirely', () => {
  const { plan } = toPlanSpec(modelOutput({
    steps: [{
      tool: 'odoo.search', label: 'All leads', okrQuery: null,
      odooSearch: { model: 'crm.lead', untouchedForDays: null, fields: null, limit: 25 },
    }],
  }), TZ)
  assert.equal('domain' in (plan as PlanSpec).steps[0].params, false)
})

test('two odoo steps collapse into one grant listing both models', () => {
  const { grants } = toPlanSpec(modelOutput({
    steps: [
      { tool: 'odoo.search', label: 'Leads', okrQuery: null, odooSearch: { model: 'crm.lead', untouchedForDays: 7, fields: null, limit: 50 } },
      { tool: 'odoo.search', label: 'Orders', okrQuery: null, odooSearch: { model: 'sale.order', untouchedForDays: 7, fields: null, limit: 50 } },
    ],
  }), TZ)
  assert.equal(grants.length, 1)
  assert.deepEqual((grants[0].params?.models as string[]).sort(), ['crm.lead', 'sale.order'])
})

test('mixed sources produce sequential step ids and both grants', () => {
  const { plan, grants } = toPlanSpec(modelOutput({
    steps: [
      { tool: 'okr.query', label: 'Internal', okrQuery: { entities: ['todos'], scope: 'OWNER', staleForDays: null, updatedWithinDays: null, statuses: null, limit: 50 }, odooSearch: null },
      { tool: 'odoo.search', label: 'Odoo', okrQuery: null, odooSearch: { model: 'crm.lead', untouchedForDays: 30, fields: null, limit: 50 } },
    ],
  }), TZ)
  assert.deepEqual((plan as PlanSpec).steps.map((s) => s.id), ['s1', 's2'])
  assert.deepEqual(grants.map((g) => g.tool).sort(), ['odoo.search', 'okr.query'])
})

test('a step whose payload is missing is skipped rather than emitted broken', () => {
  const { plan } = toPlanSpec(modelOutput({
    steps: [{ tool: 'okr.query', label: 'Broken', okrQuery: null, odooSearch: null }],
  }), TZ)
  assert.equal((plan as PlanSpec).steps.length, 0)
})

test('an empty entities list falls back to a sane default instead of failing validation', () => {
  const plan = compileAndValidate(modelOutput({
    steps: [{
      tool: 'okr.query', label: 'Internal',
      okrQuery: { entities: [], scope: null, staleForDays: null, updatedWithinDays: null, statuses: null, limit: null },
      odooSearch: null,
    }],
  }))
  assert.deepEqual(plan.steps[0].params.entities, ['keyResults'])
  assert.equal(plan.steps[0].params.limit, 100)
})

test('a quarterly plan gets the anchors the validator requires', () => {
  const plan = compileAndValidate(modelOutput({
    schedule: {
      kind: 'QUARTERLY', atTime: '16:00', byDay: null, dayOfMonth: null,
      minute: null, weekdaysOnly: null, month: null, day: null, catchUpPolicy: 'RUN_LATE',
    },
  }))
  assert.equal(plan.schedule.quarterSource, 'CALENDAR')
  assert.equal(plan.schedule.quarterOffset, 'LAST_DAY')
  assert.equal(plan.schedule.catchUpPolicy, 'RUN_LATE')
})

test('a monthly plan carries its day anchor through', () => {
  const plan = compileAndValidate(modelOutput({
    schedule: {
      kind: 'MONTHLY', atTime: '09:00', byDay: null, dayOfMonth: 1,
      minute: null, weekdaysOnly: null, month: null, day: null, catchUpPolicy: null,
    },
  }))
  assert.equal(plan.schedule.dayOfMonth, 1)
})

test('the suggested name and notes are carried through verbatim', () => {
  const { name, notes } = toPlanSpec(modelOutput(), TZ)
  assert.equal(name, 'Weekly stalled key results')
  assert.match(notes, /Assumed 08:00/)
})

test('a missing dedupeKeyFields falls back to title rather than an unstable key', () => {
  const plan = compileAndValidate(modelOutput({
    synthesis: {
      objective: 'x', relevanceCriteria: null, dedupeKeyFields: [], fields: [], maxFindings: null,
    },
  }))
  assert.deepEqual(plan.synthesis.findingSchema?.dedupeKeyFields, ['title'])
})
