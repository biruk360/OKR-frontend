import test from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml, renderAppHtml, renderEmailHtml, renderInline, renderPlainText, safeUrl } from './render'
import type { BriefingBlock } from '@/types/automations'

const META = { title: 'Tender Briefing', summary: '3 new tenders this week.' }

test('escapeHtml neutralises every dangerous character', () => {
  assert.equal(escapeHtml(`<script>a&b"c'd</script>`), '&lt;script&gt;a&amp;b&quot;c&#39;d&lt;/script&gt;')
})

test('model text containing HTML renders as visible text, not markup', () => {
  const blocks: BriefingBlock[] = [{ type: 'paragraph', text: '<img src=x onerror=alert(1)>' }]
  const app = renderAppHtml(blocks)
  assert.ok(!app.includes('<img'), app)
  assert.ok(app.includes('&lt;img'), app)

  const email = renderEmailHtml(blocks, META)
  assert.ok(!email.includes('<img'), 'email must not contain live markup from model text')
})

test('a script tag in a finding title is escaped in all three renderings', () => {
  const blocks: BriefingBlock[] = [{
    type: 'finding', dedupeKey: 'k1', status: 'NEW',
    title: '<script>steal()</script>', fields: { issuer: '<b>X</b>' },
  }]
  assert.ok(!renderAppHtml(blocks).includes('<script>'))
  assert.ok(!renderEmailHtml(blocks, META).includes('<script>'))
  assert.ok(renderPlainText(blocks, META).includes('<script>steal()</script>'))
})

test('inline formatting is applied after escaping', () => {
  const out = renderInline('**bold** and _italic_ and [link](https://example.org)')
  assert.ok(out.includes('<strong>bold</strong>'), out)
  assert.ok(out.includes('<em>italic</em>'), out)
  assert.ok(out.includes('<a href="https://example.org/">link</a>'), out)
})

test('javascript: URLs are dropped, http(s) and in-app paths survive', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null)
  assert.equal(safeUrl('data:text/html,<script>'), null)
  assert.equal(safeUrl('//evil.example'), null)
  assert.equal(safeUrl('https://example.org/a'), 'https://example.org/a')
  assert.equal(safeUrl('/dashboard/objectives/abc'), '/dashboard/objectives/abc')
})

test('a link with a javascript: href degrades to plain label text', () => {
  const out = renderInline('[click me](javascript:alert(1))')
  assert.ok(!out.includes('<a '), out)
  assert.ok(out.includes('click me'), out)
})

test('app HTML uses design tokens rather than hardcoded hex', () => {
  const blocks: BriefingBlock[] = [
    { type: 'heading', level: 2, text: 'Summary' },
    { type: 'callout', tone: 'danger', text: 'Two deadlines inside 7 days.' },
  ]
  const html = renderAppHtml(blocks)
  assert.ok(html.includes('text-ink-primary'), html)
  assert.ok(html.includes('border-danger-500'), html)
  assert.ok(!/#[0-9A-Fa-f]{6}/.test(html), 'in-app rendering must not inline hex colours')
})

test('email HTML is a self-contained light-mode document with inline styles', () => {
  const html = renderEmailHtml([{ type: 'paragraph', text: 'Hello' }], { ...META, viewUrl: 'https://okr.example/app' })
  assert.ok(html.startsWith('<!DOCTYPE html>'))
  assert.ok(html.includes('content="light"'))
  assert.ok(html.includes('width="600"'))
  assert.ok(html.includes('style="'))
  assert.ok(html.includes('Open in the app'))
  // Preview text for the inbox list.
  assert.ok(html.includes(META.summary))
})

test('metrics pair up into rows in email and a grid in app', () => {
  const blocks: BriefingBlock[] = [
    { type: 'metric', label: 'New', value: '3' },
    { type: 'metric', label: 'Changed', value: '1', tone: 'warning' },
    { type: 'metric', label: 'Unchanged', value: '12' },
  ]
  const email = renderEmailHtml(blocks, META)
  assert.equal((email.match(/width="50%"/g) ?? []).length, 3)
  assert.ok(renderAppHtml(blocks).includes('grid gap-3'))
})

test('tables render headers and rows in every representation', () => {
  const blocks: BriefingBlock[] = [
    { type: 'table', columns: ['Issuer', 'Deadline'], rows: [['Ministry of Education', '2026-10-12']], caption: 'Top 1' },
  ]
  assert.ok(renderAppHtml(blocks).includes('<th'))
  assert.ok(renderEmailHtml(blocks, META).includes('Ministry of Education'))
  const text = renderPlainText(blocks, META)
  assert.ok(text.includes('Issuer | Deadline'), text)
  assert.ok(text.includes('Ministry of Education | 2026-10-12'), text)
})

test('plain text keeps the status, fields and link of a finding', () => {
  const blocks: BriefingBlock[] = [{
    type: 'finding', dedupeKey: 'k1', status: 'CHANGED',
    title: 'Classroom construction', url: 'https://example.org/t/1',
    fields: { issuer: 'MoE', deadline: '2026-10-12' },
    changeNote: 'deadline: 2026-10-05 → 2026-10-12',
  }]
  const text = renderPlainText(blocks, META)
  assert.ok(text.includes('[CHANGED] Classroom construction'), text)
  assert.ok(text.includes('issuer: MoE, deadline: 2026-10-12'), text)
  assert.ok(text.includes('https://example.org/t/1'), text)
  assert.ok(text.includes('changed — deadline'), text)
})

test('empty block list still produces a usable document', () => {
  assert.equal(renderAppHtml([]), '')
  const text = renderPlainText([], META)
  assert.ok(text.includes('Tender Briefing'))
  assert.ok(renderEmailHtml([], META).includes('Tender Briefing'))
})
