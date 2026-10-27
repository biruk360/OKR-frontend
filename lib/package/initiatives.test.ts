import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  groupMilestonesByInitiative,
  milestoneInitiativeRef,
  parseCommitmentCode,
  parseInitiativeMeta,
  todoKindRank,
} from './initiatives'
import { TODO_KINDS, TODO_KIND_LABELS, TODO_KIND_ORDER } from '@/types/package'

test('TODO_KINDS includes INITIATIVE with a label and a sort rank', () => {
  assert.ok((TODO_KINDS as readonly string[]).includes('INITIATIVE'))
  assert.equal(TODO_KIND_LABELS.INITIATIVE, 'Initiative')
  for (const k of TODO_KINDS) assert.equal(typeof TODO_KIND_ORDER[k], 'number', k)
  assert.ok(TODO_KIND_ORDER.INITIATIVE < TODO_KIND_ORDER.MILESTONE)
  assert.ok(TODO_KIND_ORDER.MILESTONE < TODO_KIND_ORDER.TASK)
})

test('todoKindRank: initiatives before milestones; unknown kinds rank as tasks', () => {
  assert.ok(todoKindRank('INITIATIVE') < todoKindRank('MILESTONE'))
  assert.equal(todoKindRank('WHATEVER'), todoKindRank('TASK'))
  assert.equal(todoKindRank(null), todoKindRank('TASK'))
})

test('parseCommitmentCode: codes, words and leading codes', () => {
  assert.equal(parseCommitmentCode('C'), 'COMMITTED')
  assert.equal(parseCommitmentCode(' a '), 'ASPIRATIONAL')
  assert.equal(parseCommitmentCode('C / A'), 'MIXED')
  assert.equal(parseCommitmentCode('A/C'), 'MIXED')
  assert.equal(parseCommitmentCode('Committed'), 'COMMITTED')
  assert.equal(parseCommitmentCode('C (committed)'), 'COMMITTED')
  assert.equal(parseCommitmentCode('Cross-team'), null)
  assert.equal(parseCommitmentCode(''), null)
  assert.equal(parseCommitmentCode(null), null)
})

test('parseInitiativeMeta: reads the structured block, ignores prose and blanks', () => {
  const meta = parseInitiativeMeta(
    [
      'Grow partner pipeline across the region.',
      '',
      'Group: Revenue',
      'Type (C/A): A',
      'Baseline: 0',
      '- Target: 12 signed MoUs',
      'Due: 2026-12-31',
      'Measured by: CRM pipeline report',
      'Supports: KR1.1, KPI-3',
      'Dependencies: —',
    ].join('\n'),
  )
  assert.deepEqual(meta, {
    group: 'Revenue',
    commitment: 'ASPIRATIONAL',
    baseline: '0',
    target: '12 signed MoUs',
    due: '2026-12-31',
    measuredBy: 'CRM pipeline report',
    supports: 'KR1.1, KPI-3',
    dependencies: null,
  })
})

test('parseInitiativeMeta: empty / missing description → all null', () => {
  const meta = parseInitiativeMeta(null)
  assert.equal(meta.commitment, null)
  assert.equal(meta.target, null)
  assert.equal(parseInitiativeMeta('just some text').group, null)
})

test('milestoneInitiativeRef: first non-empty line only, any dash', () => {
  assert.equal(milestoneInitiativeRef('Initiative: EDN-IN1.1 — Partner outreach\nmore'), 'EDN-IN1.1')
  assert.equal(milestoneInitiativeRef('\n  initiative:EDN-IN2.3 – x'), 'EDN-IN2.3')
  assert.equal(milestoneInitiativeRef('Initiative: EDN-IN1.4'), 'EDN-IN1.4')
  assert.equal(milestoneInitiativeRef('Initiative: EDN-IN1.4, then'), 'EDN-IN1.4')
  assert.equal(milestoneInitiativeRef('Ship it\nInitiative: EDN-IN1.1 — x'), null)
  assert.equal(milestoneInitiativeRef('Initiative:  — no ref'), null)
  assert.equal(milestoneInitiativeRef(null), null)
})

test('groupMilestonesByInitiative: matches refs case-insensitively, keeps order, leaves the rest ungrouped', () => {
  const initiatives = [
    { id: 'i1', externalRef: 'EDN-IN1.1' },
    { id: 'i2', externalRef: 'EDN-IN1.2' },
    { id: 'i3', externalRef: null },
  ]
  const ms = [
    { id: 'm1', initiativeRef: 'edn-in1.1' },
    { id: 'm2', initiativeRef: 'EDN-IN1.9' },
    { id: 'm3', initiativeRef: null },
    { id: 'm4', initiativeRef: 'EDN-IN1.1' },
    { id: 'm5', initiativeRef: 'EDN-IN1.2' },
  ]
  const { byInitiative, ungrouped } = groupMilestonesByInitiative(initiatives, ms)
  assert.deepEqual(byInitiative.get('i1')?.map((m) => m.id), ['m1', 'm4'])
  assert.deepEqual(byInitiative.get('i2')?.map((m) => m.id), ['m5'])
  assert.equal(byInitiative.has('i3'), false)
  assert.deepEqual(ungrouped.map((m) => m.id), ['m2', 'm3'])
})
