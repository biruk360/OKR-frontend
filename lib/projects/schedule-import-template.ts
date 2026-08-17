import * as XLSX from 'xlsx'
import { SCHEDULE_IMPORT_HEADERS } from './schedule-import'

export type ScheduleImportTemplateFormat = 'csv' | 'xlsx'

export const SCHEDULE_IMPORT_TEMPLATE_EXAMPLE_ROWS = [
  ['A-001', 'Initiation', 15, 'Kickoff', 100, 'YES', 'Conduct project kickoff', '', 'Align scope, governance, and ways of working.', 'SHARED', 'pm@example.com', '2026-08-03', '2026-08-03', 1, 'HIGH', 'LOW', 'NO', '', '', '', '', 'Kickoff pack', 8, 'Assumes sponsor and core team availability.'],
  ['A-002', 'Initiation', 15, 'Kickoff', 100, 'YES', 'Approve kickoff minutes', '', 'Client confirms the agreed kickoff decisions.', 'CLIENT', '', '2026-08-04', '2026-08-06', 1, 'HIGH', 'MEDIUM', 'YES', 'Waiting for client approval', 'A-001', 'FS', 0, 'YES', 4, 'Approval timing is based on the agreed client SLA.'],
  ['A-003', 'Delivery', 85, 'Build', 100, 'NO', 'Configure solution', '', 'Configure the agreed solution.', '360GROUND', 'delivery@example.com', '2026-08-07', '2026-08-21', 3, 'CRITICAL', 'HIGH', 'NO', '', 'A-002', 'FS', 0, '', 64, 'Estimate is based on the approved scope.'],
  ['A-004', 'Delivery', 85, 'Build', 100, 'NO', 'Prepare test data', 'A-003', 'Subtask owned jointly with the client.', 'SHARED', '', '2026-08-10', '2026-08-14', 1, 'MEDIUM', 'MEDIUM', 'NO', '', 'A-001; A-002', 'SS; FS', '2; 0', 'NO', 20, 'Client provides representative source data.'],
] as const

const COLUMN_WIDTHS: Record<(typeof SCHEDULE_IMPORT_HEADERS)[number], number> = {
  'Row ID': 12,
  Phase: 18,
  'Phase Weight': 13,
  Milestone: 20,
  'Milestone Weight': 16,
  'Key Milestone': 14,
  Activity: 30,
  'Parent Row ID': 15,
  Description: 38,
  'Owner Party': 15,
  'Assignee Email': 24,
  'Start Date': 13,
  'End Date': 13,
  'Activity Weight': 16,
  Priority: 12,
  Risk: 10,
  'Is Blocked': 12,
  'Blocker Details': 30,
  'Predecessor Row IDs': 24,
  'Dependency Types': 20,
  'Lag Days': 12,
  Deliverable: 24,
  'Estimated Hours': 16,
  'Assumptions / Source Notes': 42,
}

const INSTRUCTION_ROWS = [
  ['Project Schedule Import Template'],
  ['Use the Schedule sheet. Keep the header names unchanged and delete the example rows before importing your schedule.'],
  [],
  ['Field', 'Guidance'],
  ['Row ID', 'Required unique ID used by Parent Row ID and Predecessor Row IDs (example: A-001).'],
  ['Phase / Milestone / Activity', 'Required hierarchy. Repeat Phase and Milestone names on every activity row.'],
  ['Weights', 'Non-negative numbers. Phase and milestone weights normally total 100 within their parent.'],
  ['Owner Party', '360GROUND, CLIENT, or SHARED. This is the accountability/responsibility owner.'],
  ['Assignee Email', 'Optional internal system-user email. Unknown emails are reported before import.'],
  ['Dates', 'Use YYYY-MM-DD. End Date must be on or after Start Date.'],
  ['Priority', 'Optional: LOW, MEDIUM, HIGH, CRITICAL.'],
  ['Risk', 'Optional: LOW, MEDIUM, HIGH.'],
  ['Is Blocked / Blocker Details', 'Use YES/NO. Blocker Details are retained in the activity description.'],
  ['Parent Row ID', 'Optional one-level subtask link to another Row ID.'],
  ['Predecessor Row IDs', 'Optional semicolon-separated Row IDs, such as A-001; A-002.'],
  ['Dependency Types', 'FS, SS, FF, or SF. Use the same order as predecessor IDs; defaults to FS.'],
  ['Lag Days', 'Integer from -365 to 365. Use the same order as predecessor IDs; defaults to 0.'],
  ['Deliverable', 'Optional. Use YES to treat the milestone as the deliverable, NO/blank for none, or enter a deliverable name. Deliverables are represented as key milestones.'],
  ['Estimated Hours', 'Optional non-negative number. Leave blank when no estimate is available.'],
  ['Assumptions / Source Notes', 'Optional source context or planning assumptions. Values are preserved as entered for user review.'],
] as const

export interface ScheduleImportTemplateDownload {
  bytes: Buffer
  contentType: string
  filename: string
}

function createScheduleSheet() {
  const sheet = XLSX.utils.aoa_to_sheet([
    Array.from(SCHEDULE_IMPORT_HEADERS),
    ...SCHEDULE_IMPORT_TEMPLATE_EXAMPLE_ROWS.map((row) => Array.from(row)),
  ])
  const lastColumn = XLSX.utils.encode_col(SCHEDULE_IMPORT_HEADERS.length - 1)
  sheet['!autofilter'] = { ref: `A1:${lastColumn}${SCHEDULE_IMPORT_TEMPLATE_EXAMPLE_ROWS.length + 1}` }
  sheet['!cols'] = SCHEDULE_IMPORT_HEADERS.map((header) => ({ wch: COLUMN_WIDTHS[header] }))
  return sheet
}

/** SheetJS CE does not serialize pane metadata, so add the standard OOXML pane to the generated sheet. */
function freezeScheduleHeader(bytes: Buffer): Buffer {
  const archive = XLSX.CFB.read(bytes, { type: 'buffer' })
  const entry = XLSX.CFB.find(archive, 'Root Entry/xl/worksheets/sheet2.xml')
  if (!entry?.content) throw new Error('Schedule worksheet was not generated')

  const xml = Buffer.from(entry.content).toString('utf8')
  const frozenView = '<sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>'
  const updated = xml.replace('<sheetView workbookViewId="0"/>', frozenView)
  if (updated === xml) throw new Error('Schedule worksheet view was not generated')

  entry.content = Buffer.from(updated)
  entry.size = entry.content.length
  return XLSX.CFB.write(archive, { fileType: 'zip', type: 'buffer', compression: true })
}

export function createScheduleImportTemplate(format: ScheduleImportTemplateFormat): ScheduleImportTemplateDownload {
  const schedule = createScheduleSheet()
  if (format === 'csv') {
    return {
      bytes: Buffer.from(XLSX.utils.sheet_to_csv(schedule), 'utf8'),
      contentType: 'text/csv; charset=utf-8',
      filename: 'project-schedule-import-template.csv',
    }
  }

  const instructions = XLSX.utils.aoa_to_sheet(INSTRUCTION_ROWS.map((row) => Array.from(row)))
  instructions['!cols'] = [{ wch: 27 }, { wch: 100 }]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, instructions, 'Instructions')
  XLSX.utils.book_append_sheet(workbook, schedule, 'Schedule')
  const generated = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  return {
    bytes: freezeScheduleHeader(generated),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: 'project-schedule-import-template.xlsx',
  }
}
