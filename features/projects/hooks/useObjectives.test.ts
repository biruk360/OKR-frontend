import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apiPaginated, apiForbidden } from '@/lib/api/apiResponse'
import { fetchObjectivesForLink } from './useObjectives'

test('project objective picker consumes the objective API pagination envelope', async (t) => {
  const objectives = [{ id: 'objective-1', title: 'Ship reliably', level: 'COMPANY', progress: 40 }]
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    assert.equal(url, '/api/objectives?status=ACTIVE&limit=500')
    return apiPaginated(objectives, { page: 1, limit: 500, total: 1 })
  })
  assert.deepEqual(await fetchObjectivesForLink(), objectives)
})

test('project objective picker returns an empty array when there are no visible objectives', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => apiPaginated([], { page: 1, limit: 500, total: 0 }))
  assert.deepEqual(await fetchObjectivesForLink(), [])
})

test('project objective picker propagates access failures', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => apiForbidden('Access denied'))
  await assert.rejects(fetchObjectivesForLink(), /Access denied/)
})
