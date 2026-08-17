import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  PROJECT_CREATION_SCHEMA_VERSION,
  combineNormalizedProjectCreationDraft,
  createEmptyProjectCreationProjectJson,
  createEmptyProjectCreationScheduleJson,
  createEmptyProjectCreationValidationJson,
  normalizedProjectCreationDraftSchema,
  parseNormalizedProjectCreationDraft,
  projectCreationProjectJsonSchema,
  projectCreationScheduleJsonSchema,
  projectCreationValidationJsonSchema,
  splitNormalizedProjectCreationDraft,
  type NormalizedProjectCreationDraft,
} from './creation-normalize'

const ROOT = process.cwd()

function createRepresentativeDraft(): NormalizedProjectCreationDraft {
  const projectJson = createEmptyProjectCreationProjectJson('pm-1')
  projectJson.project.name = 'ERP delivery'
  projectJson.project.clientName = 'Example Client'
  projectJson.project.description = 'An editable project-creation draft.'
  projectJson.project.plannedStart = '2026-09-01'
  projectJson.project.plannedEnd = '2026-12-15'
  projectJson.project.projectType = 'SOFTWARE_DELIVERY'
  projectJson.project.objective = 'Replace disconnected operational systems.'
  projectJson.project.scopeIncluded = ['Discovery', 'Implementation']

  const scheduleJson = createEmptyProjectCreationScheduleJson()
  scheduleJson.phases.push({
    id: 'phase-1',
    name: 'Implementation',
    position: 0,
    weight: 100,
    plannedStart: '2026-09-01',
    plannedEnd: '2026-12-15',
  })
  scheduleJson.milestones.push({
    id: 'milestone-1',
    phaseId: 'phase-1',
    name: 'Production handover',
    position: 0,
    weight: 100,
    isKeyMilestone: true,
    dueDate: '2026-12-15',
  })
  scheduleJson.activities.push(
    {
      id: 'activity-1',
      sourceRowId: 'ROW-10',
      milestoneId: 'milestone-1',
      parentActivityId: null,
      position: 0,
      title: 'Prepare handover package',
      description: null,
      ownerParty: '360GROUND',
      assigneeId: 'user-1',
      assigneeEmail: 'user@example.com',
      suggestedRole: null,
      startDate: '2026-12-01',
      endDate: '2026-12-10',
      weight: 70,
      estimatedHours: 24,
      priority: 'HIGH',
      risk: 'MEDIUM',
      isBlocked: false,
      blockerDetails: null,
      isApproval: false,
    },
    {
      id: 'activity-2',
      sourceRowId: 'ROW-11',
      milestoneId: 'milestone-1',
      parentActivityId: null,
      position: 1,
      title: 'Approve handover',
      description: null,
      ownerParty: 'CLIENT',
      assigneeId: null,
      assigneeEmail: null,
      suggestedRole: 'Client sponsor',
      startDate: '2026-12-11',
      endDate: '2026-12-15',
      weight: 30,
      estimatedHours: null,
      priority: 'CRITICAL',
      risk: 'HIGH',
      isBlocked: false,
      blockerDetails: null,
      isApproval: true,
    },
  )
  scheduleJson.dependencies.push({
    id: 'dependency-1',
    predecessorActivityId: 'activity-1',
    successorActivityId: 'activity-2',
    type: 'FS',
    lagDays: 0,
  })
  scheduleJson.deliverables.push({
    id: 'deliverable-1',
    milestoneId: 'milestone-1',
    name: 'Production handover package',
    producingActivityIds: ['activity-1'],
    dueDate: '2026-12-15',
    ownerParty: '360GROUND',
    approvalActivityId: 'activity-2',
    approvalCriteria: 'Client confirms the package is complete.',
  })
  scheduleJson.sources.push({
    id: 'source-1',
    type: 'SPREADSHEET_CELL',
    reference: 'Schedule!L10',
    excerpt: '2026-12-01',
    targetPaths: ['/activities/0/startDate'],
    basis: 'SOURCE_FACT',
    confidence: 'HIGH',
    lastEditor: 'USER',
  })
  scheduleJson.changes.push({
    id: 'change-1',
    path: '/activities/1/suggestedRole',
    originalValue: null,
    proposedValue: 'Client sponsor',
    reason: 'The source names a responsibility but no exact active user.',
    confidence: 'MEDIUM',
    sourceIds: ['source-1'],
    status: 'PROPOSED',
  })

  const validationJson = createEmptyProjectCreationValidationJson()
  validationJson.assumptions.push({
    id: 'assumption-1',
    text: 'Client approval takes three working days.',
    category: 'DATE',
    affectedPaths: ['/activities/1/endDate'],
    sourceIds: [],
    status: 'PROPOSED',
  })
  validationJson.questions.push({
    id: 'question-1',
    round: 1,
    text: 'Who signs off the production handover?',
    impact: 'HIGH',
    affectedPaths: ['/activities/1/suggestedRole'],
    status: 'OPEN',
    answer: null,
  })
  validationJson.warnings.push({
    id: 'warning-1',
    code: 'ASSUMED_APPROVAL_DURATION',
    message: 'The approval duration is an assumption.',
    severity: 'WARNING',
    affectedPaths: ['/activities/1/endDate'],
    sourceIds: [],
    acknowledged: false,
  })
  validationJson.issues.push({
    id: 'issue-1',
    severity: 'WARNING',
    code: 'UNKNOWN_ASSIGNEE',
    message: 'No exact active-user match was found.',
    sourceRow: 11,
    field: 'Assignee Email',
    originalValue: 'client sponsor',
    suggestedCorrection: 'Select an active user or keep the role suggestion.',
    affectedPaths: ['/activities/1/assigneeId'],
  })

  return combineNormalizedProjectCreationDraft(projectJson, scheduleJson, validationJson)
}

describe('Project creation normalized draft schema', () => {
  it('creates explicit version-1 empty storage slices with safe project defaults', () => {
    const project = createEmptyProjectCreationProjectJson('pm-1')
    const schedule = createEmptyProjectCreationScheduleJson()
    const validation = createEmptyProjectCreationValidationJson()

    assert.equal(project.schemaVersion, PROJECT_CREATION_SCHEMA_VERSION)
    assert.equal(project.project.projectManagerId, 'pm-1')
    assert.equal(project.project.currency, 'ETB')
    assert.deepEqual(project.project.workingCalendar.workingDays, ['MON', 'TUE', 'WED', 'THU', 'FRI'])
    assert.deepEqual(schedule.activities, [])
    assert.deepEqual(validation.issues, [])
    assert.equal(projectCreationProjectJsonSchema.safeParse(project).success, true)
    assert.equal(projectCreationScheduleJsonSchema.safeParse(schedule).success, true)
    assert.equal(projectCreationValidationJsonSchema.safeParse(validation).success, true)
  })

  it('round-trips one provider-neutral shape across the three persistence slices', () => {
    const draft = createRepresentativeDraft()
    const slices = splitNormalizedProjectCreationDraft(draft)
    const restored = combineNormalizedProjectCreationDraft(
      slices.projectJson,
      slices.scheduleJson,
      slices.validationJson,
    )

    assert.deepEqual(restored, draft)
    assert.equal(restored.phases.length, 1)
    assert.equal(restored.milestones[0].isKeyMilestone, true)
    assert.equal(restored.deliverables[0].approvalActivityId, 'activity-2')
    assert.equal(restored.dependencies[0].type, 'FS')
  })

  it('rejects missing arrays, an unknown schema version, and provider-specific fields', () => {
    const draft = createRepresentativeDraft() as any
    const { changes: _changes, ...missingChanges } = draft
    assert.equal(normalizedProjectCreationDraftSchema.safeParse(missingChanges).success, false)
    assert.equal(normalizedProjectCreationDraftSchema.safeParse({ ...draft, schemaVersion: 2 }).success, false)
    assert.equal(normalizedProjectCreationDraftSchema.safeParse({ ...draft, openaiResponse: 'free text' }).success, false)
    assert.equal(projectCreationProjectJsonSchema.safeParse({ name: 'legacy unversioned shape' }).success, false)
  })

  it('rejects structurally unsafe dates, enum values, monetary values, and JSON changes', () => {
    const invalidDate = createRepresentativeDraft() as any
    invalidDate.project.plannedStart = '2026-02-30'
    assert.equal(normalizedProjectCreationDraftSchema.safeParse(invalidDate).success, false)

    const invalidOwner = createRepresentativeDraft() as any
    invalidOwner.activities[0].ownerParty = 'VENDOR'
    assert.equal(normalizedProjectCreationDraftSchema.safeParse(invalidOwner).success, false)

    const invalidMoney = createRepresentativeDraft() as any
    invalidMoney.project.contractValue = -1
    assert.equal(normalizedProjectCreationDraftSchema.safeParse(invalidMoney).success, false)

    const invalidName = createRepresentativeDraft() as any
    invalidName.project.name = 'x'
    assert.equal(normalizedProjectCreationDraftSchema.safeParse(invalidName).success, false)

    const invalidJson = createRepresentativeDraft() as any
    invalidJson.changes[0].proposedValue = undefined
    assert.equal(normalizedProjectCreationDraftSchema.safeParse(invalidJson).success, false)
  })

  it('retains field-level provenance, explicit proposals, confidence, and user control', () => {
    const parsed = parseNormalizedProjectCreationDraft(createRepresentativeDraft())
    assert.deepEqual(parsed.sources[0].targetPaths, ['/activities/0/startDate'])
    assert.equal(parsed.sources[0].basis, 'SOURCE_FACT')
    assert.equal(parsed.sources[0].lastEditor, 'USER')
    assert.equal(parsed.changes[0].status, 'PROPOSED')
    assert.equal(parsed.changes[0].originalValue, null)
    assert.equal(parsed.changes[0].proposedValue, 'Client sponsor')
    assert.equal(parsed.assumptions[0].status, 'PROPOSED')
  })

  it('allows at most five clarification questions in any one round', () => {
    const draft = createRepresentativeDraft()
    draft.questions = Array.from({ length: 6 }, (_, index) => ({
      id: `question-${index}`,
      round: 2,
      text: `Question ${index}`,
      impact: 'HIGH' as const,
      affectedPaths: ['/project/name'],
      status: 'OPEN' as const,
      answer: null,
    }))
    const result = normalizedProjectCreationDraftSchema.safeParse(draft)
    assert.equal(result.success, false)
    if (!result.success) {
      assert.match(JSON.stringify(result.error.flatten()), /at most five questions/)
    }
  })

  it('wires draft create/update/read boundaries to the strict versioned slice schemas', () => {
    const collectionRoute = readFileSync(
      path.join(ROOT, 'app/api/projects/creation-drafts/route.ts'),
      'utf8',
    )
    const itemRoute = readFileSync(
      path.join(ROOT, 'app/api/projects/creation-drafts/[id]/route.ts'),
      'utf8',
    )
    const service = readFileSync(path.join(ROOT, 'lib/projects/creation-draft.ts'), 'utf8')

    assert.match(collectionRoute, /projectCreationProjectJsonSchema/)
    assert.match(collectionRoute, /createEmptyProjectCreationProjectJson\(session\.user\.id\)/)
    assert.match(itemRoute, /projectCreationScheduleJsonSchema/)
    assert.match(itemRoute, /projectCreationValidationJsonSchema/)
    assert.match(service, /projectCreationProjectJsonSchema\.parse\(draft\.projectJson\)/)
    assert.match(service, /projectCreationScheduleJsonSchema\.parse\(draft\.scheduleJson\)/)
    assert.doesNotMatch(collectionRoute + itemRoute, /z\.record\(z\.string\(\), z\.unknown\(\)\)/)
  })
})
