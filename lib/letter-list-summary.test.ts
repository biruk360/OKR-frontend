import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LETTER_LIST_SUMMARY_SELECT } from './letter-list-summary'
import { listLetters } from '../features/letters/services/lettersApi'

test('letters inbox excludes document blobs, body HTML and avatar payloads', () => {
  assert.equal('bodyDocx' in LETTER_LIST_SUMMARY_SELECT, false)
  assert.equal('bodyContent' in LETTER_LIST_SUMMARY_SELECT, false)
  assert.equal('avatar' in LETTER_LIST_SUMMARY_SELECT.preparedBy.select, false)
  assert.equal('avatar' in LETTER_LIST_SUMMARY_SELECT.signatory.select, false)
  for (const field of ['id', 'referenceNumber', 'subject', 'letterType', 'status', 'date', 'customerName']) {
    assert.equal(LETTER_LIST_SUMMARY_SELECT[field as keyof typeof LETTER_LIST_SUMMARY_SELECT], true)
  }
  assert.equal(LETTER_LIST_SUMMARY_SELECT._count.select.enclosures, true)
})

test('letters inbox requests summaries with filters, pagination and cancellation', async (t) => {
  const controller = new AbortController()
  const rows = [{ id: 'letter-1', subject: 'Example' }]
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    const parsed = new URL(url, 'https://example.test')
    assert.equal(parsed.pathname, '/api/letters')
    for (const [key, value] of Object.entries({ view: 'summary', page: '2', limit: '20', letterTypeId: 'type-1', search: 'Example' })) {
      assert.equal(parsed.searchParams.get(key), value)
    }
    assert.equal(init.signal, controller.signal)
    return Response.json({ success: true, data: rows, pagination: { total: 45, page: 2, limit: 20 } })
  })
  assert.deepEqual(await listLetters({ page: 2, limit: 20, letterTypeId: 'type-1', search: 'Example' }, controller.signal), {
    items: rows, total: 45, page: 2, limit: 20,
  })
})

test('letters inbox preserves permission errors', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ success: false, error: 'Forbidden' }, { status: 403 }))
  await assert.rejects(listLetters({}), /Forbidden/)
})
