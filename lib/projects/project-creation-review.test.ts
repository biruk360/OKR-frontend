import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import * as XLSX from 'xlsx'
import {
  combineNormalizedProjectCreationDraft,
  createEmptyProjectCreationProjectJson,
  createEmptyProjectCreationScheduleJson,
  createEmptyProjectCreationValidationJson,
} from './creation-normalize'
import {
  createProjectCreationDraftWorkbook,
  movePositionedItem,
} from './creation-review'

const ROOT = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), 'utf8')

function reviewFixture() {
  const project = createEmptyProjectCreationProjectJson('user-pm')
  project.project.name = 'Editable delivery project'
  project.project.clientName = 'Client One'
  project.project.plannedStart = '2026-09-01'
  project.project.plannedEnd = '2026-10-01'
  const schedule = createEmptyProjectCreationScheduleJson()
  schedule.phases.push({ id: 'phase-1', name: 'Delivery', position: 0, weight: 100, plannedStart: '2026-09-01', plannedEnd: '2026-10-01' })
  schedule.milestones.push({ id: 'milestone-1', phaseId: 'phase-1', name: 'Release', position: 0, weight: 100, isKeyMilestone: true, dueDate: '2026-10-01' })
  schedule.activities.push({ id: 'activity-1', sourceRowId: 'A-001', milestoneId: 'milestone-1', parentActivityId: null, position: 0, title: 'Ship release', description: 'Controlled by reviewer', ownerParty: '360GROUND', assigneeId: 'user-pm', assigneeEmail: 'pm@example.com', suggestedRole: 'Delivery lead', startDate: '2026-09-01', endDate: '2026-09-30', weight: 100, estimatedHours: 40, priority: 'HIGH', risk: 'MEDIUM', isBlocked: false, blockerDetails: null, isApproval: false })
  schedule.deliverables.push({ id: 'deliverable-1', milestoneId: 'milestone-1', name: 'Production release', producingActivityIds: ['activity-1'], dueDate: '2026-10-01', ownerParty: '360GROUND', approvalActivityId: null, approvalCriteria: 'Accepted by sponsor' })
  schedule.sources.push({ id: 'source-1', type: 'SPREADSHEET_ROW', reference: 'Schedule!2', excerpt: 'Ship release', targetPaths: ['activities.0'], basis: 'SOURCE_FACT', confidence: 'HIGH', lastEditor: 'USER' })
  const validation = createEmptyProjectCreationValidationJson()
  validation.assumptions.push({ id: 'assumption-1', text: 'Sponsor is available', category: 'DATE', affectedPaths: ['activities.0'], sourceIds: ['source-1'], status: 'PROPOSED' })
  return combineNormalizedProjectCreationDraft(project, schedule, validation)
}

describe('Story 1.9 draft review workspace', () => {
  it('AC18: renders all seven review panels and editable controls for every required business area', () => {
    const workspace = read('features/projects/components/creation/DraftReviewWorkspace.tsx')
    for (const panel of ['Project Details', 'Schedule', 'Deliverables', 'Dependencies', 'Assumptions & Questions', 'Validation', 'Source & Changes']) {
      assert.match(workspace, new RegExp(panel.replace(/[&]/g, '&')))
    }
    for (const field of ['project.name', 'project.clientName', 'activities.${index}.title', 'activities.${index}.startDate', 'activities.${index}.endDate', 'activities.${index}.ownerParty', 'activities.${index}.assigneeId', 'activities.${index}.weight', 'activities.${index}.risk', 'deliverables.${index}.name', 'deliverables.${index}.producingActivityIds', 'deliverables.${index}.dueDate', 'dependencies.${index}.predecessorActivityId', 'dependencies.${index}.successorActivityId', 'dependencies.${index}.lagDays']) {
      assert.ok(workspace.includes(field), `missing editable field binding: ${field}`)
    }
    assert.match(workspace, /<CustomerLookup/)
    assert.match(workspace, /useUsersForSelection/)
    assert.match(workspace, /useDepartments/)
  })

  it('provides the required user-control operations without mutating production project APIs', () => {
    const workspace = read('features/projects/components/creation/DraftReviewWorkspace.tsx')
    const changeList = read('features/projects/components/creation/ChangeListPanel.tsx')
    const hook = read('features/projects/hooks/useProjects.ts')
    for (const control of ['Undo', 'Redo', 'Download XLSX', 'Save and exit', 'Restart from source', 'Restore open version', 'Accept cleanup', 'Reject cleanup', 'Add phase', 'Add milestone', 'Add activity', 'Add dependency']) {
      assert.match(`${workspace}\n${changeList}`, new RegExp(control, 'i'))
    }
    assert.match(workspace, /wouldCreateDependencyCycle/)
    assert.match(workspace, /<ConfirmDialog/)
    assert.match(workspace, /useUpdateProjectCreationDraft/)
    assert.doesNotMatch(workspace, /useCreateProject\(/)
    assert.match(hook, /method: 'PATCH'/)
  })

  it('routes Manual and deterministic Import drafts into the same review workspace', () => {
    const manual = read('features/projects/components/CreateProjectWizard.tsx')
    const imported = read('features/projects/components/creation/ImportUploadStep.tsx')
    assert.match(manual, /createManualReviewScheduleJson/)
    assert.match(manual, /<DraftReviewWorkspace/)
    assert.match(imported, /READY_FOR_REVIEW/)
    assert.match(imported, /<DraftReviewWorkspace/)
  })

  it('exports the complete review state as a seven-sheet XLSX workbook', () => {
    const generated = createProjectCreationDraftWorkbook(reviewFixture(), 'draft-1')
    assert.equal(generated.filename, 'project-creation-draft-1.xlsx')
    const workbook = XLSX.read(generated.bytes, { type: 'array' })
    assert.deepEqual(workbook.SheetNames, [
      'Project Details',
      'Schedule',
      'Deliverables',
      'Dependencies',
      'Assumptions Questions',
      'Validation',
      'Source Changes',
    ])
    const scheduleRows = XLSX.utils.sheet_to_json<Array<string | number>>(workbook.Sheets.Schedule, { header: 1 })
    assert.equal(scheduleRows[1][2], 'Ship release')
    assert.equal(scheduleRows[1][6], '2026-09-01')
    const deliverableRows = XLSX.utils.sheet_to_json<Array<string | number>>(workbook.Sheets.Deliverables, { header: 1 })
    assert.equal(deliverableRows[1][0], 'Production release')
  })

  it('reorders positioned schedule nodes deterministically without losing values', () => {
    const moved = movePositionedItem([
      { id: 'one', position: 0, name: 'One' },
      { id: 'two', position: 1, name: 'Two' },
      { id: 'three', position: 2, name: 'Three' },
    ], 2, -1)
    assert.deepEqual(moved.map((item) => [item.id, item.position]), [
      ['one', 0], ['three', 1], ['two', 2],
    ])
    assert.equal(moved[1].name, 'Three')
  })
})
