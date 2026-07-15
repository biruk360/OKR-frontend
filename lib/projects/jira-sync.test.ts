import test from 'node:test'
import assert from 'node:assert/strict'
import {
  incrementalJql,
  jiraIssueToDb,
  jiraStatusCategory,
} from '@/features/projects/services/jira/sync'

test('incrementalJql: limits sync to Jira updates in the last 35 minutes', () => {
  assert.equal(incrementalJql('MEDA'), 'project = MEDA AND updated >= -35m ORDER BY updated ASC')
})

test('jiraStatusCategory: normalizes Jira categories to local enum strings', () => {
  assert.equal(jiraStatusCategory('done'), 'DONE')
  assert.equal(jiraStatusCategory('indeterminate'), 'IN_PROGRESS')
  assert.equal(jiraStatusCategory('new'), 'TODO')
})

test('jiraIssueToDb: maps Jira fields and resolves assignee email to User id', () => {
  const userByEmail = new Map([['dev@example.com', 'user-1']])
  const mapped = jiraIssueToDb({
    id: '10001',
    key: 'MEDA-7',
    fields: {
      summary: 'Build sync',
      issuetype: { name: 'Story' },
      status: { name: 'Done', statusCategory: { key: 'done' } },
      assignee: { emailAddress: 'dev@example.com' },
      customfield_10014: 'MEDA-1',
      customfield_10016: 8,
      customfield_10020: [{ id: 3 }, { id: 4 }],
      labels: ['backend'],
      components: [{ name: 'API' }],
      created: '2026-07-01T09:00:00.000Z',
      updated: '2026-07-14T09:00:00.000Z',
      resolutiondate: '2026-07-14T10:00:00.000Z',
      timeoriginalestimate: 14400,
      timespent: 18000,
    },
  }, userByEmail, 'conn-1')

  assert.equal(mapped.connectionId, 'conn-1')
  assert.equal(mapped.jiraKey, 'MEDA-7')
  assert.equal(mapped.statusCategory, 'DONE')
  assert.equal(mapped.assigneeUserId, 'user-1')
  assert.equal(mapped.epicKey, 'MEDA-1')
  assert.equal(mapped.sprintId, '4')
  assert.deepEqual(mapped.labels, ['backend'])
  assert.deepEqual(mapped.components, ['API'])
  assert.equal(mapped.originalEstimateSeconds, 14400)
  assert.equal(mapped.timeSpentSeconds, 18000)
  assert.equal(mapped.resolvedAt?.toISOString(), '2026-07-14T10:00:00.000Z')
})

test('jiraIssueToDb: blocked statuses set blocked flags without crashing on sparse fields', () => {
  const mapped = jiraIssueToDb({
    id: '10002',
    key: 'MEDA-8',
    fields: {
      status: { name: 'Blocked', statusCategory: { name: 'In Progress' } },
      updated: '2026-07-14T09:00:00.000Z',
    },
  }, new Map(), 'conn-1')

  assert.equal(mapped.summary, 'MEDA-8')
  assert.equal(mapped.statusCategory, 'IN_PROGRESS')
  assert.equal(mapped.isBlocked, true)
  assert.equal(mapped.blockedSince?.toISOString(), '2026-07-14T09:00:00.000Z')
})
