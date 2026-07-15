import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildYesterdayDoneHtml,
  buildYesterdayStatusJson,
  emptyContentJson,
  normalizeContentJson,
  parseHtmlToItems,
  serializeItemsToHtml,
} from './items'

describe('scrum content item helpers', () => {
  it('returns empty content when value is invalid', () => {
    const empty = emptyContentJson()
    assert.deepEqual(normalizeContentJson(null), empty)
    assert.deepEqual(normalizeContentJson('invalid'), empty)
    assert.deepEqual(normalizeContentJson({}), empty)
  })

  it('normalizes items and drops empty text', () => {
    const result = normalizeContentJson({
      todayItems: [{ id: 'a', text: '  Task one  ' }, { id: 'b', text: '   ' }],
    })
    assert.equal(result.todayItems?.length, 1)
    assert.equal(result.todayItems?.[0].text, 'Task one')
  })

  it('parses HTML into items', () => {
    const items = parseHtmlToItems('<p>• First</p><p>• Second</p>')
    assert.deepEqual(items.map((i) => i.text), ['First', 'Second'])
    assert.ok(items[0].id)
  })

  it('serializes items to HTML bullet list', () => {
    const html = serializeItemsToHtml([{ id: '1', text: 'Task A' }, { id: '2', text: 'Task B' }])
    assert.ok(html.includes('Task A'))
    assert.ok(html.includes('Task B'))
  })

  it('builds yesterdayDone HTML from done items only', () => {
    const html = buildYesterdayDoneHtml([
      { id: '1', text: 'Done task', status: 'DONE' },
      { id: '2', text: 'Pending task', status: 'PENDING' },
    ])
    assert.ok(html.includes('Done task'))
    assert.ok(!html.includes('Pending task'))
  })

  it('builds yesterday status JSON excluding pending', () => {
    const json = buildYesterdayStatusJson([
      { id: '1', text: 'Done task', status: 'DONE' },
      { id: '2', text: 'Pending task', status: 'PENDING' },
    ])
    assert.deepEqual(json, { 'Done task': 'DONE' })
  })
})
