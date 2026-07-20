import test from 'node:test'
import assert from 'node:assert/strict'
import { parseScheduleRows } from './schedule-import'

test('parseScheduleRows: parses responsibility, blockers, subtasks, and dependencies', () => {
  const result = parseScheduleRows([
    {
      'Row ID': 'A-1', Phase: 'Delivery', Milestone: 'Build', Activity: 'Configure solution',
      'Owner Party': '360GROUND', 'Start Date': '2026-08-01', 'End Date': '2026-08-05',
    },
    {
      'Row ID': 'A-2', Phase: 'Delivery', Milestone: 'Build', Activity: 'Prepare test data',
      'Parent Row ID': 'A-1', 'Owner Party': 'CLIENT', 'Is Blocked': 'YES',
      'Blocker Details': 'Waiting for source data', 'Predecessor Row IDs': 'A-1',
      'Dependency Types': 'FS', 'Lag Days': '2',
    },
  ])
  assert.deepEqual(result.errors, [])
  assert.equal(result.rows[1].ownerParty, 'CLIENT')
  assert.equal(result.rows[1].isBlocked, true)
  assert.equal(result.rows[1].blockerDetails, 'Waiting for source data')
  assert.equal(result.rows[1].parentRowId, 'A-1')
  assert.deepEqual(result.rows[1].dependencies, [{ predecessorRowId: 'A-1', type: 'FS', lagDays: 2 }])
})

test('parseScheduleRows: reports duplicate IDs, unknown dependencies, and invalid dates', () => {
  const result = parseScheduleRows([
    { 'Row ID': 'A-1', Phase: 'Delivery', Milestone: 'Build', Activity: 'First activity' },
    { 'Row ID': 'A-1', Phase: 'Delivery', Milestone: 'Build', Activity: 'Second activity', 'Start Date': '2026-09-10', 'End Date': '2026-09-01', 'Predecessor Row IDs': 'MISSING' },
  ])
  assert.ok(result.errors.some((error) => error.includes('duplicated')))
  assert.ok(result.errors.some((error) => error.includes('End Date cannot be before')))
  assert.ok(result.errors.some((error) => error.includes('was not found')))
})
