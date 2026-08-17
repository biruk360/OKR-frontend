import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  inspectProjectCreationSpreadsheet,
  validateProjectCreationSpreadsheet,
} from './creation-import'
import {
  hasBlockingProjectCreationIssues,
  validateProjectCreationCommitReadiness,
  validateProjectCreationImport,
} from './creation-validate'
import { createEmptyProjectCreationProjectJson } from './creation-normalize'
import { parseScheduleRows } from './schedule-import'

const ROOT = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), 'utf8')
const csv = (value: string) => new TextEncoder().encode(value)

describe('Project creation deterministic validation', () => {
  it('AC8: reports the exact source row, field, original value, issue, and correction guidance', async () => {
    const inspection = inspectProjectCreationSpreadsheet(csv([
      'Row ID,Phase,Milestone,Activity,Owner Party,Start Date,End Date,Activity Weight',
      'A-1,Delivery,Build,Configure solution,OUTSIDE,2026-09-10,2026-09-01,125',
      'A-1,Delivery,Build,Repeat identifier,CLIENT,2026-09-11,2026-09-12,1',
    ].join('\n')))
    const result = await validateProjectCreationSpreadsheet(inspection, undefined, {
      activeAssigneeEmails: new Set(),
    })

    assert.equal(result.hasBlockingErrors, true)
    assert.equal(result.scheduleJson.activities.length, 0)
    const date = result.validationJson.issues.find((item) => item.code === 'INVALID_DATE' && item.field === 'End Date')
    assert.ok(date)
    assert.equal(date.sourceRow, 2)
    assert.equal(date.originalValue, '2026-09-01')
    assert.match(date.message, /cannot be before Start Date/)
    assert.equal(date.suggestedCorrection, 'Set End Date on or after Start Date.')
    const duplicate = result.validationJson.issues.find((item) => item.code === 'DUPLICATE_ROW_ID')
    assert.equal(duplicate?.sourceRow, 3)
    assert.equal(duplicate?.field, 'Row ID')
    assert.equal(duplicate?.originalValue, 'A-1')
    assert.match(duplicate?.suggestedCorrection ?? '', /unique Row ID/)
    const weight = result.validationJson.issues.find((item) => item.code === 'INVALID_WEIGHT')
    assert.equal(weight?.sourceRow, 2)
    assert.equal(weight?.field, 'Activity Weight')
    assert.equal(weight?.originalValue, 125)
  })

  it('AC9: detects the exact dependency cycle row and keeps commit blocked', async () => {
    const inspection = inspectProjectCreationSpreadsheet(csv([
      'Row ID,Phase,Milestone,Activity,Predecessor Row IDs,Dependency Types,Lag Days',
      'A,Delivery,Build,First activity,C,FS,0',
      'B,Delivery,Build,Second activity,A,FS,0',
      'C,Delivery,Build,Third activity,B,FS,0',
    ].join('\n')))
    const result = await validateProjectCreationSpreadsheet(inspection, undefined, {
      activeAssigneeEmails: new Set(),
    })

    const cycle = result.validationJson.issues.find((item) => item.code === 'DEPENDENCY_CYCLE')
    assert.equal(result.hasBlockingErrors, true)
    assert.equal(hasBlockingProjectCreationIssues(result.validationJson), true)
    assert.equal(cycle?.severity, 'BLOCKING')
    assert.equal(cycle?.sourceRow, 4)
    assert.equal(cycle?.field, 'Predecessor Row IDs')
    assert.equal(cycle?.originalValue, 'B')
    assert.match(cycle?.suggestedCorrection ?? '', /break another link in the cycle/)

    const projectJson = createEmptyProjectCreationProjectJson('pm-1')
    projectJson.project.name = 'Cycle test project'
    projectJson.project.clientName = 'Client'
    projectJson.project.plannedStart = '2026-09-01'
    projectJson.project.plannedEnd = '2026-10-01'
    const readiness = validateProjectCreationCommitReadiness({
      projectJson,
      scheduleJson: result.scheduleJson,
      validationJson: result.validationJson,
      sourceMethod: 'FILE_IMPORT',
      authorized: true,
    })
    assert.equal(hasBlockingProjectCreationIssues(readiness), true)
    assert.ok(readiness.issues.some((item) => item.code === 'DEPENDENCY_CYCLE'))
  })

  it('categorizes incomplete dates and missing blocker details as non-blocking warnings', () => {
    const records = [{
      'Row ID': 'A-1',
      Phase: 'Delivery',
      Milestone: 'Build',
      Activity: 'Prepare test data',
      'Start Date': '2026-09-01',
      'Is Blocked': 'YES',
    }]
    const parsed = parseScheduleRows(records)
    const validation = validateProjectCreationImport({
      rows: parsed.rows,
      records,
      parseIssues: parsed.issues,
      sourceRowOffset: 2,
      activeAssigneeEmails: new Set(),
    })
    assert.equal(hasBlockingProjectCreationIssues(validation), false)
    assert.deepEqual(validation.issues.map((item) => item.severity), ['WARNING', 'WARNING'])
    assert.equal(validation.warnings.length, 2)
    assert.ok(validation.warnings.every((item) => item.acknowledged === false))
  })

  it('wires persisted validation stages, safe audit outcomes, exact report columns, and no AI path', () => {
    const uploadRoute = read('app/api/projects/creation-drafts/[id]/upload/route.ts')
    const analyzeRoute = read('app/api/projects/creation-drafts/[id]/analyze/route.ts')
    const draftService = read('lib/projects/creation-draft.ts')
    const uploadStep = read('features/projects/components/creation/ImportUploadStep.tsx')
    const report = read('features/projects/components/creation/ValidationReportPanel.tsx')
    const barrel = read('features/projects/index.ts')

    for (const route of [uploadRoute, analyzeRoute]) {
      assert.match(route, /validateProjectCreationSpreadsheet/)
      assert.match(route, /VALIDATION_ERRORS/)
      assert.match(route, /commitBlocked/)
      assert.doesNotMatch(route, /openai|anthropic|generateText|AiGenerationLog/i)
    }
    assert.match(draftService, /VALIDATION_FAILED/)
    assert.match(uploadStep, /Project creation is blocked|ValidationReportPanel/)
    for (const heading of ['Source Row', 'Field', 'Original Value', 'Issue', 'Suggested Correction']) {
      assert.match(report, new RegExp(heading))
    }
    assert.match(report, /Download error report/)
    assert.match(report, /text\/csv/)
    assert.match(barrel, /export \{ ValidationReportPanel \}/)
  })
})
