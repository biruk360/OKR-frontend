import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getReadableProject } from '@/lib/projects/access'
import { SCHEDULE_IMPORT_HEADERS } from '@/lib/projects/schedule-import'
import { apiForbidden, withAuth } from '@/lib/api'

const EXAMPLE_ROWS = [
  ['A-001', 'Initiation', 15, 'Kickoff', 100, 'YES', 'Conduct project kickoff', '', 'Align scope, governance, and ways of working.', 'SHARED', 'pm@example.com', '2026-08-03', '2026-08-03', 1, 'HIGH', 'LOW', 'NO', '', '', '', ''],
  ['A-002', 'Initiation', 15, 'Kickoff', 100, 'YES', 'Approve kickoff minutes', '', 'Client confirms the agreed kickoff decisions.', 'CLIENT', '', '2026-08-04', '2026-08-06', 1, 'HIGH', 'MEDIUM', 'YES', 'Waiting for client approval', 'A-001', 'FS', 0],
  ['A-003', 'Delivery', 85, 'Build', 100, 'NO', 'Configure solution', '', 'Configure the agreed solution.', '360GROUND', 'delivery@example.com', '2026-08-07', '2026-08-21', 3, 'CRITICAL', 'HIGH', 'NO', '', 'A-002', 'FS', 0],
  ['A-004', 'Delivery', 85, 'Build', 100, 'NO', 'Prepare test data', 'A-003', 'Subtask owned jointly with the client.', 'SHARED', '', '2026-08-10', '2026-08-14', 1, 'MEDIUM', 'MEDIUM', 'NO', '', 'A-001; A-002', 'SS; FS', '2; 0'],
]

export const GET = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()
  const format = new URL(req.url).searchParams.get('format') === 'csv' ? 'csv' : 'xlsx'
  const schedule = XLSX.utils.aoa_to_sheet([Array.from(SCHEDULE_IMPORT_HEADERS), ...EXAMPLE_ROWS])

  if (format === 'csv') {
    return new NextResponse(XLSX.utils.sheet_to_csv(schedule), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="project-schedule-import-template.csv"',
      },
    })
  }

  schedule['!freeze'] = { xSplit: 0, ySplit: 1 }
  schedule['!autofilter'] = { ref: `A1:U${EXAMPLE_ROWS.length + 1}` }
  schedule['!cols'] = [12, 18, 13, 20, 16, 14, 30, 15, 38, 15, 24, 13, 13, 16, 12, 10, 12, 30, 24, 20, 12].map((wch) => ({ wch }))
  const instructions = XLSX.utils.aoa_to_sheet([
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
  ])
  instructions['!cols'] = [{ wch: 27 }, { wch: 100 }]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, instructions, 'Instructions')
  XLSX.utils.book_append_sheet(workbook, schedule, 'Schedule')
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  return new NextResponse(bytes, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': 'attachment; filename="project-schedule-import-template.xlsx"',
    },
  })
})
