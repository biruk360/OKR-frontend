import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import * as XLSX from 'xlsx'
import {
  inspectProjectCreationSpreadsheet,
  normalizeProjectCreationSpreadsheet,
  resolveProjectCreationImportLimits,
  validateProjectCreationSpreadsheet,
  validateProjectCreationSpreadsheetFile,
} from './creation-import'
import { createScheduleImportTemplate } from './schedule-import-template'

const ROOT = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), 'utf8')

function workbookBytes(sheets: Array<{ name: string; rows: unknown[][] }>): Uint8Array {
  const workbook = XLSX.utils.book_new()
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name)
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

describe('Project creation deterministic spreadsheet import', () => {
  it('AC6: sends a valid standard XLSX schedule to review without AI or explicit-value changes', async () => {
    const template = createScheduleImportTemplate('xlsx')
    const inspection = inspectProjectCreationSpreadsheet(template.bytes)

    assert.equal(inspection.selectedSheetName, 'Schedule')
    assert.equal(inspection.headerRowNumber, 1)
    assert.equal(inspection.requiresSheetSelection, false)
    assert.equal(inspection.requiresMapping, false)
    assert.ok(inspection.mapping.every((row) => row.match === 'EXACT' || row.sourceColumnKey === null))

    const normalized = normalizeProjectCreationSpreadsheet(inspection)
    assert.deepEqual(normalized.summary, {
      phases: 2,
      milestones: 2,
      activities: 4,
      dependencies: 4,
      deliverables: 1,
    })
    const first = normalized.scheduleJson.activities[0]
    assert.equal(first.sourceRowId, 'A-001')
    assert.equal(first.title, 'Conduct project kickoff')
    assert.equal(first.description, 'Align scope, governance, and ways of working.')
    assert.equal(first.ownerParty, 'SHARED')
    assert.equal(first.assigneeEmail, 'pm@example.com')
    assert.equal(first.startDate, '2026-08-03')
    assert.equal(first.endDate, '2026-08-03')
    assert.equal(first.estimatedHours, 8)
    assert.equal(normalized.scheduleJson.sources[0].excerpt, 'Assumes sponsor and core team availability.')
    assert.deepEqual(normalized.scheduleJson.changes, [])
    assert.deepEqual(normalized.validationJson.issues, [])

    const validated = await validateProjectCreationSpreadsheet(inspection, undefined, {
      activeAssigneeEmails: new Set(['pm@example.com', 'delivery@example.com']),
    })
    assert.equal(validated.hasBlockingErrors, false)
    assert.equal(validated.scheduleJson.activities[0].title, first.title)
    assert.deepEqual(validated.validationJson.issues, [])
  })

  it('AC7 deterministic: proposes known aliases but requires editable approval before applying them', () => {
    const bytes = workbookBytes([{ name: 'Plan', rows: [
      ['Imported delivery plan'],
      [],
      ['Task ID', 'Workstream', 'Checkpoint', 'Task Name', 'Correct Activity', 'Begin', 'Finish', 'Responsible Party'],
      ['T-01', 'Discovery', 'Scope agreed', 'Wrong proposed task', 'Confirm exact scope', '2026-09-01', '2026-09-03', 'CLIENT'],
    ] }])
    const inspection = inspectProjectCreationSpreadsheet(bytes)

    assert.equal(inspection.headerRowNumber, 3)
    assert.equal(inspection.requiresMapping, true)
    assert.equal(inspection.mapping.find((row) => row.target === 'Row ID')?.match, 'ALIAS')
    assert.equal(inspection.mapping.find((row) => row.target === 'Phase')?.match, 'ALIAS')
    assert.equal(inspection.mapping.find((row) => row.target === 'Activity')?.match, 'ALIAS')

    const correctActivity = inspection.sourceColumns.find((column) => column.header === 'Correct Activity')
    assert.ok(correctActivity)
    const approved = inspection.mapping.map(({ target, sourceColumnKey }) => ({
      target,
      sourceColumnKey: target === 'Activity' ? correctActivity.key : sourceColumnKey,
    }))
    const normalized = normalizeProjectCreationSpreadsheet(inspection, approved)
    assert.equal(normalized.scheduleJson.activities[0].title, 'Confirm exact scope')
    assert.equal(normalized.scheduleJson.activities[0].ownerParty, 'CLIENT')
    assert.equal(normalized.scheduleJson.sources[0].reference, 'Plan!Row 4')
    assert.deepEqual(normalized.scheduleJson.changes, [])
  })

  it('prefers Schedule and otherwise requires a user sheet choice when multiple sheets exist', () => {
    const bytes = workbookBytes([
      { name: 'Overview', rows: [['Project overview'], ['Not a schedule']] },
      { name: 'Work Plan', rows: [['Row ID', 'Phase', 'Milestone', 'Activity'], ['A-1', 'Plan', 'Gate', 'Review scope']] },
    ])
    const waiting = inspectProjectCreationSpreadsheet(bytes)
    assert.equal(waiting.requiresSheetSelection, true)
    assert.equal(waiting.selectedSheetName, null)
    assert.deepEqual(waiting.sheetNames, ['Overview', 'Work Plan'])

    const selected = inspectProjectCreationSpreadsheet(bytes, { sheetName: 'Work Plan' })
    assert.equal(selected.selectedSheetName, 'Work Plan')
    assert.equal(selected.requiresMapping, false)
    assert.equal(normalizeProjectCreationSpreadsheet(selected).summary.activities, 1)
  })

  it('detects headers below title rows and ignores clearly empty rows', () => {
    const bytes = workbookBytes([{ name: 'Schedule', rows: [
      ['Client delivery plan'],
      [],
      ['Row ID', 'Phase', 'Milestone', 'Activity'],
      [],
      ['A-1', 'Plan', 'Gate', 'Review scope'],
      ['', '', '', ''],
    ] }])
    const inspection = inspectProjectCreationSpreadsheet(bytes)
    assert.equal(inspection.headerRowNumber, 3)
    assert.equal(inspection.dataRowCount, 1)
    const normalized = normalizeProjectCreationSpreadsheet(inspection)
    assert.equal(normalized.scheduleJson.sources[0].reference, 'Schedule!Row 5')
  })

  it('uses server-configurable 10 MB and 2,000-row defaults and rejects unsafe file metadata', () => {
    assert.deepEqual(resolveProjectCreationImportLimits({}), {
      maxFileBytes: 10 * 1024 * 1024,
      maxRows: 2_000,
    })
    assert.deepEqual(resolveProjectCreationImportLimits({
      PROJECT_CREATION_IMPORT_MAX_FILE_BYTES: String(12 * 1024 * 1024),
      PROJECT_CREATION_IMPORT_MAX_ROWS: '2500',
    }), {
      maxFileBytes: 12 * 1024 * 1024,
      maxRows: 2_500,
    })
    assert.throws(
      () => validateProjectCreationSpreadsheetFile({ name: '../plan.docx', type: 'application/octet-stream', size: 100 }),
      /Choose a CSV, XLS, or XLSX/,
    )
    assert.throws(
      () => validateProjectCreationSpreadsheetFile({ name: 'plan.xlsx', type: 'application/pdf', size: 100 }),
      /does not match/,
    )
  })

  it('wires authenticated audited upload/analyze mutations and an editable react-hook-form mapping UI', () => {
    const uploadRoute = read('app/api/projects/creation-drafts/[id]/upload/route.ts')
    const analyzeRoute = read('app/api/projects/creation-drafts/[id]/analyze/route.ts')
    const draftService = read('lib/projects/creation-draft.ts')
    const uploadStep = read('features/projects/components/creation/ImportUploadStep.tsx')
    const mappingStep = read('features/projects/components/creation/ColumnMappingStep.tsx')
    const list = read('features/projects/components/ProjectsListClient.tsx')

    for (const route of [uploadRoute, analyzeRoute]) {
      assert.match(route, /export const POST = withAuth/)
      assert.match(route, /if \(!canCreateProject\(\{/)
      assert.match(route, /updateProjectCreationDraft\(\{/)
      assert.doesNotMatch(route, /openai|anthropic|generateText|AiGenerationLog/i)
    }
    assert.match(draftService, /kind: 'FILE_IMPORT_PROCESSED'/)
    assert.match(draftService, /sourceHash: sourceMetadata\.hash/)
    assert.match(uploadStep, /useForm<UploadFormValues>/)
    assert.match(uploadStep, /Uploading, reading, and validating the spreadsheet/)
    assert.match(uploadStep, /Ready for review/)
    assert.match(uploadStep, /no AI cleanup was used/i)
    assert.match(mappingStep, /useForm<MappingFormValues>/)
    assert.match(mappingStep, /Approve mapping/)
    assert.match(mappingStep, /Each source column can map to only one project field/)
    assert.match(list, /<ImportUploadStep/)
  })
})
