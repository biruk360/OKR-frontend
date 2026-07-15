import test from 'node:test'
import assert from 'node:assert/strict'
import {
  JiraConnectionError,
  mapJiraHttpError,
  normalizeJiraProjectKey,
  normalizeJiraSiteUrl,
  serializeJiraConnection,
  testJiraConnection,
} from '@/features/projects/services/jira/connection'

test('normalizeJiraSiteUrl: requires https and strips path noise', () => {
  assert.equal(normalizeJiraSiteUrl('https://demo.atlassian.net///'), 'https://demo.atlassian.net')
  assert.throws(() => normalizeJiraSiteUrl('http://demo.atlassian.net'), /https/)
  assert.throws(() => normalizeJiraSiteUrl('not a url'), /valid/)
})

test('normalizeJiraProjectKey: uppercases and validates Jira project keys', () => {
  assert.equal(normalizeJiraProjectKey('meda'), 'MEDA')
  assert.equal(normalizeJiraProjectKey('ABC_123'), 'ABC_123')
  assert.throws(() => normalizeJiraProjectKey('1BAD'), /Project key/)
})

test('serializeJiraConnection: never exposes encryptedToken', () => {
  const serialized = serializeJiraConnection({
    id: 'jc1',
    name: 'Meda Jira',
    siteUrl: 'https://demo.atlassian.net',
    authType: 'API_TOKEN',
    email: 'pm@example.com',
    encryptedToken: 'secret-ciphertext',
    projectKey: 'MEDA',
    isActive: true,
    lastSyncAt: null,
    lastSyncStatus: null,
    createdAt: new Date('2026-07-14T00:00:00.000Z'),
  })

  assert.equal(serialized.tokenMasked, '••••')
  assert.equal(JSON.stringify(serialized).includes('secret-ciphertext'), false)
})

test('mapJiraHttpError: maps required Jira statuses clearly', () => {
  assert.deepEqual(pick(mapJiraHttpError(401)), { status: 401, code: 'JIRA_INVALID_TOKEN', message: 'Invalid Jira token or email.' })
  assert.deepEqual(pick(mapJiraHttpError(403)), { status: 403, code: 'JIRA_FORBIDDEN', message: 'Jira access denied for this account.' })
  assert.deepEqual(pick(mapJiraHttpError(404)), { status: 404, code: 'JIRA_PROJECT_NOT_FOUND', message: 'Project key not found.' })
  assert.deepEqual(pick(mapJiraHttpError(429)), { status: 429, code: 'JIRA_RATE_LIMITED', message: 'Jira rate limit reached. Try again shortly.' })
})

test('testJiraConnection: calls myself, issue count, and sprint count', async () => {
  const seen: string[] = []
  const fetchMock = async (url: string | URL | Request) => {
    const text = String(url)
    seen.push(text)
    if (text.endsWith('/rest/api/3/myself')) {
      return jsonResponse(200, { displayName: 'PM', emailAddress: 'pm@example.com' })
    }
    if (text.includes('/rest/api/3/search')) {
      return jsonResponse(200, { total: 142 })
    }
    if (text.includes('/rest/agile/1.0/board?')) {
      return jsonResponse(200, { values: [{ id: 7 }] })
    }
    if (text.includes('/rest/agile/1.0/board/7/sprint')) {
      return jsonResponse(200, { total: 8 })
    }
    return jsonResponse(500, {})
  }

  const result = await testJiraConnection({
    siteUrl: 'https://demo.atlassian.net',
    email: 'pm@example.com',
    apiToken: 'token',
    projectKey: 'meda',
  }, fetchMock as typeof fetch)

  assert.deepEqual(result, {
    accountName: 'PM',
    accountEmail: 'pm@example.com',
    issueCount: 142,
    sprintCount: 8,
  })
  assert.equal(seen.some((url) => url.includes('project%20%3D%20MEDA')), true)
})

test('testJiraConnection: throws mapped errors from Jira responses', async () => {
  const fetchMock = async () => jsonResponse(401, {})
  await assert.rejects(
    () => testJiraConnection({ siteUrl: 'https://demo.atlassian.net', email: 'pm@example.com', apiToken: 'bad', projectKey: 'MEDA' }, fetchMock as typeof fetch),
    (error) => error instanceof JiraConnectionError && error.code === 'JIRA_INVALID_TOKEN',
  )
})

function pick(error: JiraConnectionError) {
  return { status: error.status, code: error.code, message: error.message }
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}
