import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildJiraMappingKeys,
  computeJiraRollup,
  filterIssuesForMapping,
  parseJiraMappingKeys,
  type JiraIssueForRollup,
} from '@/features/projects/services/jira/rollup'

const issues: JiraIssueForRollup[] = [
  {
    jiraKey: 'MEDA-1',
    statusCategory: 'DONE',
    epicKey: 'EPIC-1',
    sprintId: '10',
    storyPoints: 5,
    labels: ['auth', 'api'],
    components: ['Backend'],
  },
  {
    jiraKey: 'MEDA-2',
    statusCategory: 'IN_PROGRESS',
    epicKey: 'EPIC-1',
    sprintId: '10',
    storyPoints: 3,
    labels: ['auth'],
    components: ['Frontend'],
  },
  {
    jiraKey: 'MEDA-3',
    statusCategory: 'DONE',
    epicKey: 'EPIC-2',
    sprintId: '11',
    storyPoints: null,
    labels: ['billing'],
    components: ['Backend'],
  },
]

test('buildJiraMappingKeys/parseJiraMappingKeys: stores typed mappings in jiraIssueKeys', () => {
  assert.deepEqual(buildJiraMappingKeys('EPIC', ['epic-1']), ['EPIC:EPIC-1'])
  assert.deepEqual(buildJiraMappingKeys('LABEL', ['auth']), ['LABEL:auth'])
  assert.deepEqual(buildJiraMappingKeys('MANUAL', ['meda-1', 'MEDA-2']), ['MEDA-1', 'MEDA-2'])
  assert.deepEqual(parseJiraMappingKeys(['COMPONENT:Frontend']), { type: 'COMPONENT', values: ['Frontend'] })
})

test('filterIssuesForMapping: supports manual issue keys', () => {
  const matched = filterIssuesForMapping(issues, buildJiraMappingKeys('MANUAL', ['MEDA-1', 'MEDA-3']))
  assert.deepEqual(matched.map((issue) => issue.jiraKey), ['MEDA-1', 'MEDA-3'])
})

test('filterIssuesForMapping: supports epic, label, component and sprint mappings', () => {
  assert.deepEqual(filterIssuesForMapping(issues, ['EPIC:EPIC-1']).map((issue) => issue.jiraKey), ['MEDA-1', 'MEDA-2'])
  assert.deepEqual(filterIssuesForMapping(issues, ['LABEL:auth']).map((issue) => issue.jiraKey), ['MEDA-1', 'MEDA-2'])
  assert.deepEqual(filterIssuesForMapping(issues, ['COMPONENT:Backend']).map((issue) => issue.jiraKey), ['MEDA-1', 'MEDA-3'])
  assert.deepEqual(filterIssuesForMapping(issues, ['SPRINT:10']).map((issue) => issue.jiraKey), ['MEDA-1', 'MEDA-2'])
})

test('computeJiraRollup: uses story-point weighting when points exist', () => {
  const rollup = computeJiraRollup(filterIssuesForMapping(issues, ['EPIC:EPIC-1']))
  assert.equal(rollup.totalIssues, 2)
  assert.equal(rollup.doneIssues, 1)
  assert.equal(rollup.totalPoints, 8)
  assert.equal(rollup.donePoints, 5)
  assert.equal(rollup.weightedByPoints, true)
  assert.equal(rollup.percentComplete, 62.5)
})

test('computeJiraRollup: falls back to issue-count percentage without points', () => {
  const rollup = computeJiraRollup([
    { ...issues[0], storyPoints: null },
    { ...issues[1], storyPoints: null },
  ])
  assert.equal(rollup.weightedByPoints, false)
  assert.equal(rollup.percentComplete, 50)
})
