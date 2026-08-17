import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import * as XLSX from 'xlsx'
import { parseScheduleRows, SCHEDULE_IMPORT_HEADERS } from './schedule-import'
import { createScheduleImportTemplate } from './schedule-import-template'

const ROOT = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), 'utf8')

describe('Optional schedule import columns', () => {
  it('keeps all 21 legacy headers in place and appends the three optional columns', () => {
    assert.equal(SCHEDULE_IMPORT_HEADERS.length, 24)
    assert.deepEqual(SCHEDULE_IMPORT_HEADERS.slice(0, 21), [
      'Row ID', 'Phase', 'Phase Weight', 'Milestone', 'Milestone Weight', 'Key Milestone',
      'Activity', 'Parent Row ID', 'Description', 'Owner Party', 'Assignee Email', 'Start Date',
      'End Date', 'Activity Weight', 'Priority', 'Risk', 'Is Blocked', 'Blocker Details',
      'Predecessor Row IDs', 'Dependency Types', 'Lag Days',
    ])
    assert.deepEqual(SCHEDULE_IMPORT_HEADERS.slice(21), [
      'Deliverable', 'Estimated Hours', 'Assumptions / Source Notes',
    ])
  })

  it('parses a deliverable indicator or name, estimated hours, and source notes', () => {
    const result = parseScheduleRows([
      {
        'Row ID': 'A-1', Phase: 'Delivery', Milestone: 'Design approved', Activity: 'Prepare design',
        Deliverable: 'Solution design', 'Estimated Hours': 12.5,
        'Assumptions / Source Notes': 'Estimate supplied in the signed work plan.',
      },
      {
        'Row ID': 'A-2', Phase: 'Delivery', Milestone: 'Handover', Activity: 'Approve handover',
        Deliverable: 'YES', 'Estimated Hours': '4',
      },
      {
        'Row ID': 'A-3', Phase: 'Delivery', Milestone: 'Closeout', Activity: 'Archive records',
        Deliverable: 'NO',
      },
    ])

    assert.deepEqual(result.errors, [])
    assert.equal(result.rows[0].deliverableName, 'Solution design')
    assert.equal(result.rows[0].estimatedHours, 12.5)
    assert.equal(result.rows[0].assumptionsOrSourceNotes, 'Estimate supplied in the signed work plan.')
    assert.equal(result.rows[1].deliverableName, 'Handover')
    assert.equal(result.rows[1].estimatedHours, 4)
    assert.equal(result.rows[2].deliverableName, null)
    assert.equal(result.rows[2].estimatedHours, null)
    assert.equal(result.rows[2].assumptionsOrSourceNotes, null)
  })

  it('keeps legacy 21-column records valid and applies the same defaults unchanged', () => {
    const result = parseScheduleRows([{
      'Row ID': 'LEGACY-1', Phase: 'Delivery', Milestone: 'Build', Activity: 'Configure solution',
      'Owner Party': 'CLIENT', 'Activity Weight': 2, 'Is Blocked': 'NO',
    }])

    assert.deepEqual(result.errors, [])
    assert.equal(result.rows[0].ownerParty, 'CLIENT')
    assert.equal(result.rows[0].activityWeight, 2)
    assert.equal(result.rows[0].deliverableName, null)
    assert.equal(result.rows[0].estimatedHours, null)
    assert.equal(result.rows[0].assumptionsOrSourceNotes, null)
  })

  it('rejects only a supplied invalid estimate and leaves the optional field empty', () => {
    const result = parseScheduleRows([{
      'Row ID': 'A-1', Phase: 'Delivery', Milestone: 'Build', Activity: 'Configure solution',
      'Estimated Hours': -1,
    }])

    assert.equal(result.rows[0].estimatedHours, null)
    assert.ok(result.errors.some((error) => error === 'Row 2: Estimated Hours must be a non-negative number.'))
  })

  it('publishes all three fields in CSV/XLSX examples and controlled-value guidance', () => {
    const csv = createScheduleImportTemplate('csv').bytes.toString('utf8')
    const xlsx = XLSX.read(createScheduleImportTemplate('xlsx').bytes, { type: 'buffer' })
    const rows = XLSX.utils.sheet_to_json<unknown[]>(xlsx.Sheets.Schedule, { header: 1, raw: true })
    const instructions = XLSX.utils.sheet_to_json<unknown[]>(xlsx.Sheets.Instructions, { header: 1, raw: true })

    assert.equal(csv.split('\n')[0].split(',').length, 24)
    assert.deepEqual(rows[0], Array.from(SCHEDULE_IMPORT_HEADERS))
    assert.equal(rows[1][21], 'Kickoff pack')
    assert.equal(rows[1][22], 8)
    assert.match(String(rows[1][23]), /sponsor and core team availability/)
    assert.ok(instructions.some((row) => row[0] === 'Deliverable' && String(row[1]).includes('key milestones')))
    assert.ok(instructions.some((row) => row[0] === 'Estimated Hours' && String(row[1]).includes('non-negative')))
    assert.ok(instructions.some((row) => row[0] === 'Assumptions / Source Notes' && String(row[1]).includes('preserved')))
  })

  it('maps new values through the existing project import without a Deliverable model', () => {
    const route = read('app/api/projects/[id]/schedule-import/route.ts')
    const schema = read('prisma/schema.prisma')

    assert.match(route, /namedDeliverable \?\? row\.milestone/)
    assert.match(route, /candidate\.keyMilestone \|\| Boolean\(candidate\.deliverableName\)/)
    assert.match(route, /estimatedHours: row\.estimatedHours/)
    assert.match(route, /Assumptions \/ source notes:/)
    assert.doesNotMatch(schema, /model Deliverable\s*\{/)
  })
})
