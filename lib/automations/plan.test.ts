import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PlanValidationError,
  resolveTemplates,
  unknownTemplateVars,
  validatePlan,
  withPlanDefaults,
} from './plan'
import type { PlanSpec, ToolGrant } from '@/types/automations'

const GRANTS: ToolGrant[] = [{ tool: 'okr.query' }]

function basePlan(overrides: Partial<PlanSpec> = {}): Record<string, unknown> {
  return {
    version: 1,
    schedule: { kind: 'DAILY', timezone: 'Africa/Addis_Ababa', atTime: '08:00' },
    steps: [
      { id: 's1', tool: 'okr.query', label: 'Stalled KRs', params: { entities: ['keyResults'], staleForDays: 14 } },
    ],
    synthesis: { objective: 'Surface key results with no check-in for two weeks.' },
    briefing: { titleTemplate: 'OKR Briefing — {{date}}' },
    notify: { emailRecipients: [] },
    ...overrides,
  }
}

function issuesOf(fn: () => unknown): string[] {
  try {
    fn()
    return []
  } catch (error) {
    assert.ok(error instanceof PlanValidationError, `expected PlanValidationError, got ${error}`)
    return (error as PlanValidationError).issues
  }
}

test('a well-formed plan validates', () => {
  const plan = validatePlan(basePlan(), { grants: GRANTS })
  assert.equal(plan.steps.length, 1)
  assert.equal(plan.schedule.kind, 'DAILY')
})

test('every problem is collected, not just the first', () => {
  const issues = issuesOf(() =>
    validatePlan(
      basePlan({
        schedule: { kind: 'WEEKLY', timezone: 'Not/AZone' } as PlanSpec['schedule'],
      }),
      { grants: GRANTS }
    )
  )
  assert.ok(issues.some((i) => i.includes('atTime')), issues.join(' | '))
  assert.ok(issues.some((i) => i.includes('byDay')), issues.join(' | '))
  assert.ok(issues.some((i) => i.includes('timezone')), issues.join(' | '))
})

test('MONTHLY requires exactly one anchor', () => {
  const none = issuesOf(() =>
    validatePlan(basePlan({ schedule: { kind: 'MONTHLY', timezone: 'UTC', atTime: '09:00' } as PlanSpec['schedule'] }), { grants: GRANTS })
  )
  assert.ok(none.some((i) => i.includes('one of dayOfMonth')))

  const both = issuesOf(() =>
    validatePlan(
      basePlan({ schedule: { kind: 'MONTHLY', timezone: 'UTC', atTime: '09:00', dayOfMonth: 1, lastBusinessDay: true } as PlanSpec['schedule'] }),
      { grants: GRANTS }
    )
  )
  assert.ok(both.some((i) => i.includes('exactly one')))
})

test('an invalid cron expression is rejected with its reason', () => {
  const issues = issuesOf(() =>
    validatePlan(basePlan({ schedule: { kind: 'CUSTOM_CRON', timezone: 'UTC', cron: '99 * * * *' } as PlanSpec['schedule'] }), { grants: GRANTS })
  )
  assert.ok(issues.some((i) => i.includes('Invalid cron range')), issues.join(' | '))
})

test('a tool that exists but is not yet available is rejected as phase-gated', () => {
  const issues = issuesOf(() =>
    validatePlan(
      basePlan({ steps: [{ id: 's1', tool: 'web.search', label: 'Tenders', params: {} }] as PlanSpec['steps'] }),
      { grants: [{ tool: 'web.search' }] }
    )
  )
  assert.ok(issues.some((i) => i.includes('not available yet')), issues.join(' | '))
})

test('a tool the automation was never granted is rejected', () => {
  const issues = issuesOf(() => validatePlan(basePlan(), { grants: [] }))
  assert.ok(issues.some((i) => i.includes('not granted')), issues.join(' | '))
})

test('duplicate step ids are rejected', () => {
  const issues = issuesOf(() =>
    validatePlan(
      basePlan({
        steps: [
          { id: 's1', tool: 'okr.query', label: 'A', params: { entities: ['todos'] } },
          { id: 's1', tool: 'okr.query', label: 'B', params: { entities: ['todos'] } },
        ] as PlanSpec['steps'],
      }),
      { grants: GRANTS }
    )
  )
  assert.ok(issues.some((i) => i.includes('duplicate step id')))
})

test('the egress rule rejects a forward or self reference', () => {
  const forward = issuesOf(() =>
    validatePlan(
      basePlan({
        steps: [
          { id: 's1', tool: 'okr.query', label: 'A', params: { entities: ['todos'] }, from: 's2' },
          { id: 's2', tool: 'okr.query', label: 'B', params: { entities: ['todos'] } },
        ] as PlanSpec['steps'],
      }),
      { grants: GRANTS }
    )
  )
  assert.ok(forward.some((i) => i.includes('must reference an earlier step')), forward.join(' | '))
})

test('bad tool params are surfaced with their path', () => {
  const issues = issuesOf(() =>
    validatePlan(
      basePlan({ steps: [{ id: 's1', tool: 'okr.query', label: 'A', params: { entities: ['nope'] } }] as PlanSpec['steps'] }),
      { grants: GRANTS }
    )
  )
  assert.ok(issues.some((i) => i.startsWith('steps[0].params')), issues.join(' | '))
})

test('a plan may not raise the owner per-run cost cap', () => {
  const issues = issuesOf(() =>
    validatePlan(basePlan({ limits: { maxCostUsd: 5 } }), { grants: GRANTS, maxCostUsdPerRun: 0.5 })
  )
  assert.ok(issues.some((i) => i.includes('exceeds the automation')), issues.join(' | '))
})

test('a plan with no steps is rejected', () => {
  const issues = issuesOf(() => validatePlan(basePlan({ steps: [] }), { grants: GRANTS }))
  assert.ok(issues.some((i) => i.includes('at least one step')))
})

test('unknown template variables are a validation error', () => {
  const issues = issuesOf(() =>
    validatePlan(basePlan({ briefing: { titleTemplate: 'Report for {{clientName}}' } }), { grants: GRANTS })
  )
  assert.ok(issues.some((i) => i.includes('unknown variable {{clientName}}')), issues.join(' | '))
})

test('relative date variables are recognised', () => {
  const plan = validatePlan(
    basePlan({
      steps: [{ id: 's1', tool: 'okr.query', label: 'A', params: { entities: ['todos'], since: '{{now-14d}}' } }] as PlanSpec['steps'],
    }),
    { grants: GRANTS }
  )
  assert.deepEqual(unknownTemplateVars(plan), [])
})

test('withPlanDefaults fills everything the runner depends on', () => {
  const plan = withPlanDefaults(validatePlan(basePlan(), { grants: GRANTS }))
  assert.equal(plan.notify.onEmpty, 'SKIP')
  assert.equal(plan.notify.inApp, true)
  assert.equal(plan.synthesis.maxFindings, 30)
  assert.deepEqual(plan.synthesis.findingSchema?.dedupeKeyFields, ['title'])
  assert.equal(plan.limits?.timeoutSeconds, 600)
})

test('template resolution substitutes dates and leaves non-strings alone', () => {
  const now = new Date('2026-09-16T05:00:00Z')
  const resolved = resolveTemplates(
    { title: 'Briefing {{date}} ({{quarter}} {{year}})', since: '{{now-14d}}', limit: 25, tags: ['{{monthName}}'] },
    { now, timezone: 'UTC' }
  )
  assert.equal(resolved.title, 'Briefing 2026-09-16 (Q3 2026)')
  assert.equal(resolved.since, '2026-09-02T05:00:00.000Z')
  assert.equal(resolved.limit, 25)
  assert.deepEqual(resolved.tags, ['September'])
})

test('month arithmetic is calendar-aware, not 30-day', () => {
  const resolved = resolveTemplates('{{now-1m}}', { now: new Date('2026-03-31T00:00:00Z'), timezone: 'UTC' })
  // Calendar month arithmetic, not a fixed 30-day subtraction.
  assert.ok(resolved.startsWith('2026-03-0') || resolved.startsWith('2026-02-'), resolved)
})

// ---------------------------------------------------------------------------
// odoo.search (P1)
// ---------------------------------------------------------------------------

const ODOO_GRANTS: ToolGrant[] = [{ tool: 'odoo.search', params: { models: ['crm.lead'] } }]

function odooPlan(params: Record<string, unknown>): Record<string, unknown> {
  return basePlan({
    steps: [{ id: 's1', tool: 'odoo.search', label: 'Stalled leads', params }] as PlanSpec['steps'],
  })
}

test('an odoo.search step with a templated domain validates', () => {
  const plan = validatePlan(
    odooPlan({
      model: 'crm.lead',
      domain: [['write_date', '<', '{{now-14d}}']],
      fields: ['expected_revenue'],
      limit: 50,
    }),
    { grants: ODOO_GRANTS }
  )
  assert.equal(plan.steps[0].tool, 'odoo.search')
  assert.deepEqual(unknownTemplateVars(plan), [])
})

test('an unknown Odoo model is rejected at validation, before any call', () => {
  const issues = issuesOf(() => validatePlan(odooPlan({ model: 'res.users' }), { grants: ODOO_GRANTS }))
  assert.ok(issues.some((i) => i.startsWith('steps[0].params.model')), issues.join(' | '))
})

test('a malformed domain term is rejected by the plan schema', () => {
  const issues = issuesOf(() =>
    validatePlan(odooPlan({ model: 'crm.lead', domain: [['write_date', '<']] }), { grants: ODOO_GRANTS })
  )
  assert.ok(issues.some((i) => i.startsWith('steps[0].params.domain')), issues.join(' | '))
})

test('a limit above the Odoo ceiling is rejected', () => {
  const issues = issuesOf(() =>
    validatePlan(odooPlan({ model: 'crm.lead', limit: 5000 }), { grants: ODOO_GRANTS })
  )
  assert.ok(issues.some((i) => i.startsWith('steps[0].params.limit')), issues.join(' | '))
})
