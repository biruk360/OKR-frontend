import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { Prisma, type ProjectCreationDraft } from '@prisma/client'
import {
  combineNormalizedProjectCreationDraft,
  createEmptyProjectCreationProjectJson,
  createEmptyProjectCreationScheduleJson,
  createEmptyProjectCreationValidationJson,
  splitNormalizedProjectCreationDraft,
  type NormalizedProjectCreationDraft,
} from './creation-normalize'
import {
  ProjectCreationProvenanceError,
  applyUserEditProvenance,
  assertClientProvenanceUnchanged,
  isProjectCreationAssumptionTarget,
  labelProjectCreationInferredValues,
} from './creation-provenance'
import { updateProjectCreationDraft } from './creation-draft'
import { projectCreationClientCommitBlockers } from './creation-commit-shared'
import { createManualScheduleJson } from './manual-creation'

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8')

function fixture(): NormalizedProjectCreationDraft {
  const project = createEmptyProjectCreationProjectJson('pm-1')
  project.project.name = 'Imported portal'
  project.project.clientName = 'Client One'
  project.project.plannedStart = '2026-09-01'
  project.project.plannedEnd = '2026-12-01'
  const schedule = createEmptyProjectCreationScheduleJson()
  schedule.phases.push({ id: 'phase-1', name: 'Delivery', position: 0, weight: 100, plannedStart: null, plannedEnd: null })
  schedule.milestones.push({ id: 'milestone-1', phaseId: 'phase-1', name: 'Go live', position: 0, weight: 100, isKeyMilestone: true, dueDate: '2026-11-30' })
  schedule.activities.push(
    { id: 'activity-1', sourceRowId: 'D-1', milestoneId: 'milestone-1', parentActivityId: null, position: 0, title: 'Build portal', description: null, ownerParty: '360GROUND', assigneeId: null, assigneeEmail: null, suggestedRole: null, startDate: '2026-09-01', endDate: '2026-10-30', weight: 1, estimatedHours: null, priority: null, risk: null, isBlocked: false, blockerDetails: null, isApproval: false },
    { id: 'activity-2', sourceRowId: 'D-2', milestoneId: 'milestone-1', parentActivityId: null, position: 1, title: 'Train users', description: null, ownerParty: 'CLIENT', assigneeId: null, assigneeEmail: null, suggestedRole: null, startDate: '2026-11-02', endDate: '2026-11-20', weight: 1, estimatedHours: null, priority: null, risk: null, isBlocked: false, blockerDetails: null, isApproval: false },
  )
  schedule.deliverables.push({ id: 'deliverable-1', milestoneId: 'milestone-1', name: 'Training manual', producingActivityIds: ['activity-2'], dueDate: null, ownerParty: '360GROUND', approvalActivityId: null, approvalCriteria: null })
  schedule.sources.push(
    { id: 'docx-item-1', type: 'DOCX_TABLE', reference: 'Table 1 under Work Plan, row 2', excerpt: 'Build portal | 2026-09-01', targetPaths: ['activities.activity-1'], basis: 'SOURCE_FACT', confidence: 'MEDIUM', lastEditor: 'USER' },
    { id: 'source-row-2', type: 'SPREADSHEET_ROW', reference: 'Schedule!Row 3', excerpt: null, targetPaths: ['activities.1'], basis: 'SOURCE_FACT', confidence: 'LOW', lastEditor: 'USER' },
  )
  return combineNormalizedProjectCreationDraft(project, schedule, createEmptyProjectCreationValidationJson())
}

function draftRow(draft: NormalizedProjectCreationDraft, overrides: Partial<ProjectCreationDraft> = {}): ProjectCreationDraft {
  const split = splitNormalizedProjectCreationDraft(draft)
  return {
    id: 'draft-1', ownerUserId: 'owner-1', sourceMethod: 'FILE_IMPORT', status: 'READY', version: 3,
    projectJson: split.projectJson, scheduleJson: split.scheduleJson, validationJson: split.validationJson,
    sourceFileName: 'plan.docx', sourceMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sourceSize: 100, sourceHash: 'a'.repeat(64), sourceRef: 'v1/draft-1/abc.docx',
    aiProvider: null, aiModelId: null, aiPromptVersion: null, committedProjectId: null,
    createdAt: new Date('2026-09-25T10:00:00Z'), updatedAt: new Date('2026-09-25T10:00:00Z'), committedAt: null,
    expiresAt: null, ...overrides,
  }
}

function fakeDatabase(initial: ProjectCreationDraft) {
  let row = structuredClone(initial)
  const audits: any[] = []
  const delegate = {
    async findUnique() { return structuredClone(row) },
    async updateMany(args: any) {
      if (args.where.id !== row.id || args.where.ownerUserId !== row.ownerUserId || args.where.version !== row.version) return { count: 0 }
      const data = args.data
      row = {
        ...row,
        ...(data.projectJson !== undefined ? { projectJson: data.projectJson } : {}),
        ...(data.scheduleJson !== undefined ? { scheduleJson: data.scheduleJson === Prisma.DbNull ? null : data.scheduleJson } : {}),
        ...(data.validationJson !== undefined ? { validationJson: data.validationJson === Prisma.DbNull ? null : data.validationJson } : {}),
        version: row.version + 1,
      }
      return { count: 1 }
    },
    async create() { throw new Error('unused') },
    async deleteMany() { throw new Error('unused') },
  }
  const tx: any = { projectCreationDraft: delegate, activityLog: { async create(args: unknown) { audits.push(args) } } }
  return {
    database: { ...tx, async $transaction<T>(operation: (value: any) => Promise<T>) { return operation(tx) } } as any,
    get row() { return row },
    audits,
  }
}

function clientSave(draft: NormalizedProjectCreationDraft, version: number) {
  const split = splitNormalizedProjectCreationDraft(draft)
  return {
    id: 'draft-1',
    actorUserId: 'owner-1',
    expectedVersion: version,
    projectJson: split.projectJson,
    scheduleJson: split.scheduleJson,
    validationJson: split.validationJson,
    enforceServerProvenance: true as const,
  }
}

describe('Story 2.6 server-owned provenance, confidence, and assumptions', () => {
  it('rejects any client change to imported provenance fields, additions, or removals', () => {
    const current = fixture().sources
    for (const [field, value] of [['lastEditor', 'AI'], ['basis', 'USER_DECISION'], ['confidence', 'HIGH'], ['reference', 'Forged'], ['type', 'USER_INPUT'], ['targetPaths', ['activities.activity-2']]] as const) {
      const submitted = current.map((source, index) => index === 0 ? { ...source, [field]: value } : source)
      assert.throws(() => assertClientProvenanceUnchanged(current, submitted as typeof current), ProjectCreationProvenanceError, `editing ${field} must be rejected`)
    }
    assert.throws(() => assertClientProvenanceUnchanged(current, current.slice(1)), /cannot be removed/)
    assert.throws(() => assertClientProvenanceUnchanged(current, [...current, { ...current[0], id: 'forged', type: 'DOCX_TABLE' }]), /cannot be added/)
    // The Manual flow's template selection is the user's own decision and stays client-editable.
    const template = createManualScheduleJson('template-1').sources
    assert.doesNotThrow(() => assertClientProvenanceUnchanged(current, [...current, ...template]))
    assert.doesNotThrow(() => assertClientProvenanceUnchanged(template, createManualScheduleJson('template-2').sources))
  })

  it('stamps lastEditor/basis/confidence on the server for the values the user edited', async () => {
    const original = fixture()
    const fake = fakeDatabase(draftRow(original))
    const edited = structuredClone(original)
    edited.activities[1].title = 'Train super-users' // index-based target activities.1
    await updateProjectCreationDraft(clientSave(edited, 3), fake.database)

    const saved = combineNormalizedProjectCreationDraft(fake.row.projectJson, fake.row.scheduleJson, fake.row.validationJson)
    const byId = new Map(saved.sources.map((source) => [source.id, source]))
    assert.deepEqual(
      { lastEditor: byId.get('source-row-2')!.lastEditor, basis: byId.get('source-row-2')!.basis, confidence: byId.get('source-row-2')!.confidence },
      { lastEditor: 'USER', basis: 'USER_DECISION', confidence: 'HIGH' },
    )
    assert.equal(byId.get('source-row-2')!.reference, 'Schedule!Row 3', 'evidence reference is preserved')
    assert.deepEqual(byId.get('docx-item-1'), original.sources[0], 'untouched values keep their imported provenance')
    assert.equal(fake.row.version, 4)

    // A reorder alone is not an edit.
    const reordered = structuredClone(original)
    reordered.activities.reverse()
    assert.deepEqual(applyUserEditProvenance(original, reordered), original.sources)
  })

  it('rejects a client save that falsifies provenance without writing anything', async () => {
    const original = fixture()
    const fake = fakeDatabase(draftRow(original))
    const tampered = structuredClone(original)
    tampered.sources[1] = { ...tampered.sources[1], confidence: 'HIGH', lastEditor: 'AI' }
    await assert.rejects(updateProjectCreationDraft(clientSave(tampered, 3), fake.database), ProjectCreationProvenanceError)
    assert.equal(fake.row.version, 3)
    assert.equal(fake.audits.length, 0)
  })

  it('AC12: an AI-proposed date for an undated deliverable is labelled as an assumption and stays editable', async () => {
    const before = fixture()
    const aiOutput = structuredClone(before)
    aiOutput.deliverables[0].dueDate = '2026-11-20'
    const labelled = labelProjectCreationInferredValues(before, aiOutput, {
      reason: 'The document gives no date for this deliverable; AI aligned it with the end of Train users.',
    })

    const assumption = labelled.assumptions.find((item) => item.affectedPaths.includes('deliverables.deliverable-1.dueDate'))
    assert.ok(assumption, 'the proposed date is listed as an assumption')
    assert.equal(assumption!.category, 'DATE')
    assert.equal(assumption!.status, 'PROPOSED')
    const source = labelled.sources.find((item) => assumption!.sourceIds.includes(item.id))!
    assert.deepEqual(
      { type: source.type, basis: source.basis, lastEditor: source.lastEditor, confidence: source.confidence },
      { type: 'AI_ASSUMPTION', basis: 'INFERRED_RECOMMENDATION', lastEditor: 'AI', confidence: 'LOW' },
    )
    assert.equal(isProjectCreationAssumptionTarget(labelled.sources, 'deliverables', 'deliverable-1'), true)
    assert.equal(labelProjectCreationInferredValues(labelled, labelled).assumptions.length, labelled.assumptions.length, 'labelling is idempotent')
    assert.ok(projectCreationClientCommitBlockers(labelled, 'AI_GUIDED').includes('Accept or reject every proposed assumption before creation.'))

    // The server-saved AI draft remains editable: the user changes the date; the label becomes their decision.
    const fake = fakeDatabase(draftRow(labelled))
    const userEdit = structuredClone(labelled)
    userEdit.deliverables[0].dueDate = '2026-11-27'
    await updateProjectCreationDraft(clientSave(userEdit, 3), fake.database)
    const saved = combineNormalizedProjectCreationDraft(fake.row.projectJson, fake.row.scheduleJson, fake.row.validationJson)
    assert.equal(saved.deliverables[0].dueDate, '2026-11-27')
    const restamped = saved.sources.find((item) => item.id === source.id)!
    assert.equal(restamped.lastEditor, 'USER')
    assert.equal(restamped.basis, 'USER_DECISION')
    assert.equal(restamped.type, 'AI_ASSUMPTION', 'the origin of the value is still recorded')

    // UI: the date is an editable field, the assumption is labelled, provenance is display-only.
    const workspace = read('features/projects/components/creation/DraftReviewWorkspace.tsx')
    assert.ok(workspace.includes('deliverables.${index}.dueDate'))
    assert.match(workspace, /isProjectCreationAssumptionTarget\(sources, 'deliverables', item\.id\) && <AssumptionLabel \/>/)
  })

  it('makes provenance read-only in the review UI and server-enforced on PATCH', () => {
    const workspace = read('features/projects/components/creation/DraftReviewWorkspace.tsx')
    const route = read('app/api/projects/creation-drafts/[id]/route.ts')
    const service = read('lib/projects/creation-draft.ts')
    assert.doesNotMatch(workspace, /register\(`sources\./, 'no editable provenance inputs remain')
    assert.match(workspace, /aria-label="Source provenance \(read-only\)"/)
    assert.match(workspace, /sources: serverSourcesRef\.current/, 'saves send the server copy of provenance')
    assert.match(route, /enforceServerProvenance: true/)
    assert.match(route, /ProjectCreationProvenanceError[\s\S]*status: 422/)
    assert.match(service, /assertClientProvenanceUnchanged\(currentScheduleJson\.sources, scheduleJson\.sources\)/)
    assert.match(service, /applyUserEditProvenance\(previousDraft, nextDraft\)/)
  })
})
