import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import * as XLSX from 'xlsx'
import { SCHEDULE_IMPORT_HEADERS } from './schedule-import'
import {
  createScheduleImportTemplate,
  SCHEDULE_IMPORT_TEMPLATE_EXAMPLE_ROWS,
} from './schedule-import-template'

const ROOT = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), 'utf8')

function scheduleRows(bytes: Buffer) {
  const workbook = XLSX.read(bytes, { type: 'buffer' })
  const schedule = workbook.Sheets.Schedule
  return {
    workbook,
    rows: XLSX.utils.sheet_to_json<unknown[]>(schedule, { header: 1, raw: true }),
  }
}

describe('Project-less schedule import templates', () => {
  it('AC5 CSV/XLSX: creates a flat CSV with the shared schedule headers and example rows', () => {
    const template = createScheduleImportTemplate('csv')
    const workbook = XLSX.read(template.bytes, { type: 'buffer' })
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Sheet1, { header: 1, raw: true })

    assert.equal(template.filename, 'project-schedule-import-template.csv')
    assert.equal(template.contentType, 'text/csv; charset=utf-8')
    assert.deepEqual(rows[0], Array.from(SCHEDULE_IMPORT_HEADERS))
    assert.equal(rows.length, SCHEDULE_IMPORT_TEMPLATE_EXAMPLE_ROWS.length + 1)
    assert.equal(rows[1][0], 'A-001')
    assert.equal(rows[4][18], 'A-001; A-002')
  })

  it('AC5 CSV/XLSX: creates an XLSX workbook with instructions, guidance, examples, filters, and a frozen header', () => {
    const template = createScheduleImportTemplate('xlsx')
    const { workbook, rows } = scheduleRows(template.bytes)
    const instructions = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Instructions, { header: 1, raw: true })
    const archive = XLSX.CFB.read(template.bytes, { type: 'buffer' })
    const scheduleXml = Buffer.from(
      XLSX.CFB.find(archive, 'Root Entry/xl/worksheets/sheet2.xml').content,
    ).toString('utf8')

    assert.equal(template.filename, 'project-schedule-import-template.xlsx')
    assert.deepEqual(workbook.SheetNames, ['Instructions', 'Schedule'])
    assert.deepEqual(rows[0], Array.from(SCHEDULE_IMPORT_HEADERS))
    assert.equal(rows.length, SCHEDULE_IMPORT_TEMPLATE_EXAMPLE_ROWS.length + 1)
    assert.match(String(instructions[1][0]), /Keep the header names unchanged/)
    assert.ok(instructions.some((row) => row[0] === 'Owner Party' && String(row[1]).includes('360GROUND, CLIENT, or SHARED')))
    assert.equal(workbook.Sheets.Schedule['!autofilter']?.ref, 'A1:X5')
    assert.match(scheduleXml, /<pane ySplit="1" topLeftCell="A2"[^>]+state="frozen"\/>/)
  })

  it('AC5 CSV/XLSX: exposes authorized downloads without a project or draft identifier', () => {
    const route = read('app/api/projects/creation-templates/route.ts')
    const entry = read('features/projects/components/creation/NewProjectEntry.tsx')
    const downloads = read('features/projects/components/creation/ImportTemplateDownloads.tsx')

    assert.match(route, /export const GET = withAuth/)
    assert.match(route, /if \(!canCreateProject\(\{/)
    assert.doesNotMatch(route, /getReadableProject|creationDraft|params\.id/)
    assert.match(route, /Format must be csv or xlsx/)
    assert.match(downloads, /\/api\/projects\/creation-templates\?format=\$\{download\.format\}/)
    assert.match(downloads, /do not require an existing project or draft/)
    assert.match(entry, /<ImportTemplateDownloads context="entry" \/>/)
  })

  it('keeps the project-scoped and project-less downloads on the same generator', () => {
    const projectRoute = read('app/api/projects/[id]/schedule-import/template/route.ts')
    const creationRoute = read('app/api/projects/creation-templates/route.ts')
    const generator = read('lib/projects/schedule-import-template.ts')

    assert.match(projectRoute, /createScheduleImportTemplate\(format\)/)
    assert.match(creationRoute, /createScheduleImportTemplate\(format as ScheduleImportTemplateFormat\)/)
    assert.match(generator, /SCHEDULE_IMPORT_HEADERS/)
    assert.doesNotMatch(projectRoute, /EXAMPLE_ROWS|aoa_to_sheet/)
    assert.doesNotMatch(creationRoute, /EXAMPLE_ROWS|aoa_to_sheet/)
  })

  it('shows downloads inside the Import draft while keeping DOCX explicitly unavailable', () => {
    const list = read('features/projects/components/ProjectsListClient.tsx')
    const upload = read('features/projects/components/creation/ImportUploadStep.tsx')
    const downloads = read('features/projects/components/creation/ImportTemplateDownloads.tsx')
    const barrel = read('features/projects/index.ts')

    assert.match(list, /activeDraft\.sourceMethod === 'FILE_IMPORT'/)
    assert.match(list, /<ImportUploadStep/)
    assert.match(upload, /<ImportTemplateDownloads \/>/)
    assert.match(downloads, /DOCX template download will be available in a later release/)
    assert.match(downloads, /aria-disabled="true"/)
    assert.match(barrel, /export \{ ImportTemplateDownloads \}/)
  })
})
