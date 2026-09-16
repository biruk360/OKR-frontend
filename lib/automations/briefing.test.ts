import test from 'node:test'
import assert from 'node:assert/strict'
import { assembleBriefingBlocks } from './briefing'
import { diffFindings } from './findings'
import type { BriefingBlock, PlanSpec, RawFinding } from '@/types/automations'

const KEYS = ['title']
const PLAN = { synthesis: { objective: 'x' } } as PlanSpec

function item(title: string, fields?: Record<string, string>): RawFinding {
  return { title, ...(fields ? { fields } : {}) }
}

function assemble(current: RawFinding[], previousTitles: string[], narrative: BriefingBlock[] = []) {
  const previous = diffFindings(previousTitles.map((t) => item(t)), [], KEYS).findings
  const diff = diffFindings(current, previous, KEYS)
  return { blocks: assembleBriefingBlocks({ plan: PLAN, summary: 'Summary line.', narrative, diff }), diff }
}

function headings(blocks: BriefingBlock[]): string[] {
  return blocks.filter((b): b is Extract<BriefingBlock, { type: 'heading' }> => b.type === 'heading').map((b) => b.text)
}

test('the summary always leads the document', () => {
  const { blocks } = assemble([item('A')], [])
  assert.equal(blocks[0].type, 'paragraph')
  assert.equal((blocks[0] as { text: string }).text, 'Summary line.')
})

test('new items get their own section with finding blocks', () => {
  const { blocks } = assemble([item('Tender A'), item('Tender B')], [])
  assert.deepEqual(headings(blocks), ['New (2)'])
  assert.equal(blocks.filter((b) => b.type === 'finding').length, 2)
})

test('unchanged items collapse to one line instead of being re-listed', () => {
  const previous = ['A', 'B', 'C']
  const { blocks } = assemble(previous.map((t) => item(t)), previous)
  assert.equal(blocks.filter((b) => b.type === 'finding').length, 0)
  const collapsed = blocks.find((b) => b.type === 'paragraph' && b.text.includes('unchanged'))
  assert.ok(collapsed, 'expected a collapsed unchanged line')
  assert.match((collapsed as { text: string }).text, /3 previously reported items are unchanged/)
})

test('a single unchanged item reads as singular', () => {
  const { blocks } = assemble([item('A')], ['A'])
  const collapsed = blocks.find((b) => b.type === 'paragraph' && b.text.includes('unchanged')) as { text: string }
  assert.match(collapsed.text, /1 previously reported item is unchanged/)
})

test('changed items are separated from new ones', () => {
  const previous = [item('A', { deadline: '2026-10-01' })]
  const prior = diffFindings(previous, [], KEYS).findings
  const diff = diffFindings([item('A', { deadline: '2026-10-12' }), item('B')], prior, KEYS)
  const blocks = assembleBriefingBlocks({ plan: PLAN, summary: 's', narrative: [], diff })
  assert.deepEqual(headings(blocks), ['New (1)', 'Changed (1)'])
})

test('items that disappeared are listed as closed', () => {
  const { blocks } = assemble([item('A')], ['A', 'B'])
  assert.ok(headings(blocks).some((h) => h.startsWith('Closed since last run')))
  const list = blocks.find((b) => b.type === 'list') as { items: string[] }
  assert.deepEqual(list.items, ['B'])
})

test('counts are emitted as metrics when there is anything to count', () => {
  const { blocks } = assemble([item('A')], [])
  const metrics = blocks.filter((b) => b.type === 'metric') as Array<{ label: string; value: string }>
  assert.deepEqual(metrics.map((m) => m.label), ['New', 'Changed', 'Unchanged', 'Closed'])
  assert.equal(metrics[0].value, '1')
})

test('a completely empty run says so instead of rendering a blank page', () => {
  const { blocks } = assemble([], [])
  const callout = blocks.find((b) => b.type === 'callout') as { title?: string }
  assert.equal(callout.title, 'Nothing to report')
  assert.equal(blocks.filter((b) => b.type === 'metric').length, 0)
})

test('warnings surface at the top so a partial run never looks complete', () => {
  const diff = diffFindings([item('A')], [], KEYS)
  const blocks = assembleBriefingBlocks({
    plan: PLAN, summary: 's', narrative: [], diff,
    warnings: ['Step "Tenders" was refused: not granted to this automation'],
  })
  assert.equal(blocks[1].type, 'callout')
  assert.equal((blocks[1] as { title?: string }).title, 'Partial run')
})

test('narrative detail follows the findings, after a divider', () => {
  const narrative: BriefingBlock[] = [{ type: 'heading', level: 2, text: 'Analysis' }]
  const { blocks } = assemble([item('A')], [], narrative)
  const dividerIndex = blocks.findIndex((b) => b.type === 'divider')
  const analysisIndex = blocks.findIndex((b) => b.type === 'heading' && b.text === 'Analysis')
  assert.ok(dividerIndex > 0 && analysisIndex > dividerIndex, 'narrative must come after the diff sections')
})
