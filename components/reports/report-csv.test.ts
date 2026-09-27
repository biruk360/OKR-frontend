import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildReportCsv, csvCell, toCsv } from './report-csv'

test('csvCell quotes commas, quotes and newlines', () => {
  assert.equal(csvCell('plain'), 'plain')
  assert.equal(csvCell('a,b'), '"a,b"')
  assert.equal(csvCell('say "hi"'), '"say ""hi"""')
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"')
  assert.equal(csvCell(null), '')
  assert.equal(csvCell(42), '42')
  assert.equal(csvCell(-5), '-5')
})

test('csvCell neutralises spreadsheet formulas in strings', () => {
  assert.equal(csvCell('=SUM(A1:A2)'), "'=SUM(A1:A2)")
  assert.equal(csvCell('+1'), "'+1")
  assert.equal(csvCell('@cmd'), "'@cmd")
})

test('toCsv joins header and rows with CRLF', () => {
  assert.equal(toCsv(['a', 'b'], [[1, 'x'], [2, 'y,z']]), 'a,b\r\n1,x\r\n2,"y,z"')
})

test('buildReportCsv exports the initiatives tab with a date-only due column', () => {
  const csv = buildReportCsv('initiatives', {
    krs: [],
    objectives: [],
    todos: [{
      id: 't1', title: 'Ship it', status: 'IN_PROGRESS', priority: 'HIGH', keyResultId: 'k1',
      krTitle: 'KR', objectiveTitle: 'Obj', assigneeId: null, assigneeName: 'Unassigned',
      dueDate: '2026-10-01T00:00:00.000Z',
    }],
  })
  const [header, row] = csv.split('\r\n')
  assert.equal(header, 'Initiative,Key result,Objective,Status,Priority,Assignee,Due date')
  assert.equal(row, 'Ship it,KR,Obj,IN_PROGRESS,HIGH,Unassigned,2026-10-01')
})
