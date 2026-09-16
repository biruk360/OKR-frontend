import test from 'node:test'
import assert from 'node:assert/strict'
import { diffPlans, summarizeDiff } from './plan-diff'
import type { PlanSpec } from '@/types/automations'

function plan(overrides: Partial<PlanSpec> = {}): PlanSpec {
  return {
    version: 1,
    schedule: { kind: 'WEEKLY', timezone: 'Africa/Addis_Ababa', atTime: '08:00', byDay: ['MON'] },
    steps: [
      { id: 's1', tool: 'okr.query', label: 'Internal data', params: { entities: ['keyResults'], limit: 100 } },
    ],
    synthesis: { objective: 'Surface stalled key results.' },
    briefing: { titleTemplate: '{{date}} briefing' },
    notify: { emailRecipients: ['u1'], inApp: true, onEmpty: 'SKIP' },
    limits: { maxCostUsd: 0.5, timeoutSeconds: 600 },
    ...overrides,
  } as PlanSpec
}

function labels(changes: ReturnType<typeof diffPlans>['changes']): string[] {
  return changes.map((c) => `${c.group}/${c.label}`)
}

test('no previous version means nothing to diff', () => {
  const diff = diffPlans(null, plan())
  assert.equal(diff.hasChanges, false)
  assert.equal(summarizeDiff(diff), 'No changes')
})

test('an identical plan produces no changes', () => {
  assert.equal(diffPlans(plan(), plan()).hasChanges, false)
})

test('a frequency increase is flagged as widening', () => {
  const diff = diffPlans(
    plan(),
    plan({ schedule: { kind: 'DAILY', timezone: 'Africa/Addis_Ababa', atTime: '08:00' } })
  )
  const change = diff.changes.find((c) => c.label === 'When it runs')
  assert.ok(change, labels(diff.changes).join(' | '))
  assert.equal(change!.widening, true)
  assert.match(change!.before!, /Weekly/)
  assert.match(change!.after!, /Daily/)
})

test('a frequency decrease changes but does not widen', () => {
  const diff = diffPlans(
    plan({ schedule: { kind: 'DAILY', timezone: 'UTC', atTime: '08:00' } }),
    plan({ schedule: { kind: 'MONTHLY', timezone: 'UTC', atTime: '08:00', dayOfMonth: 1 } })
  )
  const change = diff.changes.find((c) => c.label === 'When it runs')
  assert.ok(change)
  assert.notEqual(change!.widening, true)
})

test('an added step is reported as widening', () => {
  const diff = diffPlans(
    plan(),
    plan({
      steps: [
        { id: 's1', tool: 'okr.query', label: 'Internal data', params: { entities: ['keyResults'], limit: 100 } },
        { id: 's2', tool: 'odoo.search', label: 'Odoo leads', params: { model: 'crm.lead' } },
      ],
    })
  )
  const added = diff.changes.find((c) => c.kind === 'added' && c.group === 'Steps')
  assert.ok(added, labels(diff.changes).join(' | '))
  assert.equal(added!.widening, true)
  assert.match(added!.after!, /odoo\.search/)
})

test('a removed step is reported without widening', () => {
  const diff = diffPlans(plan(), plan({ steps: [] }))
  const removed = diff.changes.find((c) => c.kind === 'removed' && c.group === 'Steps')
  assert.ok(removed)
  assert.notEqual(removed!.widening, true)
})

test('changed step params are reported against the step label', () => {
  const diff = diffPlans(
    plan(),
    plan({ steps: [{ id: 's1', tool: 'okr.query', label: 'Internal data', params: { entities: ['keyResults', 'todos'], limit: 100 } }] })
  )
  const change = diff.changes.find((c) => c.group === 'Steps' && c.label === 'Internal data')
  assert.ok(change, labels(diff.changes).join(' | '))
  assert.match(change!.after!, /todos/)
})

test('more recipients widens; fewer does not', () => {
  const more = diffPlans(plan(), plan({ notify: { emailRecipients: ['u1', 'u2'], inApp: true, onEmpty: 'SKIP' } }))
  assert.equal(more.changes.find((c) => c.label === 'Email recipients')!.widening, true)

  const fewer = diffPlans(plan(), plan({ notify: { emailRecipients: [], inApp: true, onEmpty: 'SKIP' } }))
  assert.notEqual(fewer.changes.find((c) => c.label === 'Email recipients')!.widening, true)
})

test('switching onEmpty from SKIP to SEND widens — it starts mailing quiet runs', () => {
  const diff = diffPlans(plan(), plan({ notify: { emailRecipients: ['u1'], inApp: true, onEmpty: 'SEND' } }))
  const change = diff.changes.find((c) => c.label === 'When nothing is new')
  assert.ok(change)
  assert.equal(change!.widening, true)
})

test('a raised cost cap widens, a lowered one does not', () => {
  const up = diffPlans(plan(), plan({ limits: { maxCostUsd: 2, timeoutSeconds: 600 } }))
  assert.equal(up.changes.find((c) => c.label === 'Cost cap per run')!.widening, true)

  const down = diffPlans(plan(), plan({ limits: { maxCostUsd: 0.1, timeoutSeconds: 600 } }))
  assert.notEqual(down.changes.find((c) => c.label === 'Cost cap per run')!.widening, true)
})

test('widening changes sort ahead of the rest', () => {
  const diff = diffPlans(
    plan(),
    plan({
      briefing: { titleTemplate: 'New title' },
      schedule: { kind: 'DAILY', timezone: 'Africa/Addis_Ababa', atTime: '08:00' },
    })
  )
  assert.equal(diff.changes[0].widening, true)
})

test('the summary counts changes and calls out widening ones', () => {
  const diff = diffPlans(plan(), plan({ schedule: { kind: 'HOURLY', timezone: 'UTC', minute: 0 } }))
  assert.match(summarizeDiff(diff), /widen what it does/)
})
