import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import type { ProjectCreationDraft } from '@prisma/client'
import {
  combineNormalizedProjectCreationDraft,
  createEmptyProjectCreationProjectJson,
  createEmptyProjectCreationScheduleJson,
  createEmptyProjectCreationValidationJson,
  splitNormalizedProjectCreationDraft,
  type NormalizedProjectCreationDraft,
} from './creation-normalize'
import { labelProjectCreationInferredValues } from './creation-provenance'
import {
  ProjectCreationBulkDecisionError,
  countProjectCreationAiProposals,
  decideProjectCreationAiProposals,
  projectCreationAssumptionPhaseId,
} from './creation-assumption-decisions'
import {
  ProjectCreationDraftVersionConflictError,
  bulkDecideProjectCreationAiProposals,
} from './creation-draft'
import { projectCreationClientCommitBlockers } from './creation-commit-shared'

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8')

/** Two phases x 30 activities, AI-generated, then labelled (≈150 proposals like prod). */
function aiDraft(): NormalizedProjectCreationDraft {
  const project = createEmptyProjectCreationProjectJson('pm-1')
  project.project.name = 'AI portal'
  project.project.clientName = 'Client'
  project.project.plannedStart = '2026-10-01'
  project.project.plannedEnd = '2027-03-01'
  const empty = combineNormalizedProjectCreationDraft(project, createEmptyProjectCreationScheduleJson(), createEmptyProjectCreationValidationJson())
  const next = structuredClone(empty)
  next.sources.push({ id: 'aigen-1', type: 'AI_ASSUMPTION', reference: 'AI generation', excerpt: null, targetPaths: ['phases', 'activities'], basis: 'INFERRED_RECOMMENDATION', confidence: 'MEDIUM', lastEditor: 'AI' })
  next.sources.push({ id: 'brief-name', type: 'USER_INPUT', reference: 'Brief', excerpt: 'x', targetPaths: ['brief.name'], basis: 'USER_DECISION', confidence: 'HIGH', lastEditor: 'USER' })
  for (const p of [1, 2]) {
    next.phases.push({ id: `phase-${p}`, name: `Phase ${p}`, position: p - 1, weight: 50, plannedStart: null, plannedEnd: null })
    next.milestones.push({ id: `ms-${p}`, phaseId: `phase-${p}`, name: `Milestone ${p}`, position: 0, weight: 100, isKeyMilestone: true, dueDate: '2026-12-01' })
    for (let a = 1; a <= 30; a += 1) {
      next.activities.push({ id: `act-${p}-${a}`, sourceRowId: null, milestoneId: `ms-${p}`, parentActivityId: null, position: a - 1, title: `Task ${p}.${a}`, description: null, ownerParty: '360GROUND', assigneeId: null, assigneeEmail: null, suggestedRole: null, startDate: '2026-10-05', endDate: '2026-10-09', weight: 1, estimatedHours: null, priority: null, risk: null, isBlocked: false, blockerDetails: null, isApproval: false })
    }
    next.assumptions.push({ id: `aigate-phase-${p}`, text: `Accept phase ${p}`, category: 'SCOPE', affectedPaths: [`phases.phase-${p}`, `milestones.ms-${p}`], sourceIds: ['aigen-1'], status: 'PROPOSED' })
  }
  next.dependencies.push({ id: 'dep-x', predecessorActivityId: 'act-1-30', successorActivityId: 'act-2-1', type: 'FS', lagDays: 0 })
  next.assumptions.push({ id: 'aigate-deps', text: 'Accept dependencies', category: 'DEPENDENCY', affectedPaths: ['dependencies.dep-x'], sourceIds: ['aigen-1'], status: 'PROPOSED' })
  next.assumptions.push({ id: 'aigate-exclusion', text: 'Exclude hosting', category: 'SCOPE', affectedPaths: ['project.scopeExcluded'], sourceIds: ['aigen-1'], status: 'PROPOSED' })
  next.assumptions.push({ id: 'user-own', text: 'My own note', category: 'OTHER', affectedPaths: ['activities.act-1-1'], sourceIds: [], status: 'PROPOSED' })
  return labelProjectCreationInferredValues(empty, next, { reason: 'AI proposed this value.' })
}

function row(draft: NormalizedProjectCreationDraft, overrides: Partial<ProjectCreationDraft> = {}): ProjectCreationDraft {
  const split = splitNormalizedProjectCreationDraft(draft)
  return {
    id: 'draft-1', ownerUserId: 'owner-1', sourceMethod: 'AI_GUIDED', status: 'READY', version: 5,
    projectJson: split.projectJson, scheduleJson: split.scheduleJson, validationJson: split.validationJson,
    sourceFileName: null, sourceMimeType: null, sourceSize: null, sourceHash: null, sourceRef: null,
    aiProvider: 'openai', aiModelId: 'gpt-5.5', aiPromptVersion: 'v1', committedProjectId: null,
    createdAt: new Date('2026-09-25T10:00:00Z'), updatedAt: new Date('2026-09-25T10:00:00Z'), committedAt: null,
    expiresAt: null, ...overrides,
  }
}

function fakeDatabase(initial: ProjectCreationDraft) {
  let current = structuredClone(initial)
  const audits: any[] = []
  const delegate = {
    async findUnique() { return structuredClone(current) },
    async updateMany(args: any) {
      if (args.where.id !== current.id || args.where.ownerUserId !== current.ownerUserId || args.where.version !== current.version) return { count: 0 }
      current = { ...current, ...(args.data.validationJson !== undefined ? { validationJson: args.data.validationJson } : {}), version: current.version + 1 }
      return { count: 1 }
    },
    async create() { throw new Error('unused') },
    async deleteMany() { throw new Error('unused') },
  }
  return {
    audits,
    get row() { return current },
    database: {
      projectCreationDraft: delegate,
      async $transaction(operation: any) {
        return operation({ projectCreationDraft: delegate, activityLog: { async create(args: any) { audits.push(args.data) } } })
      },
    } as any,
  }
}

const stored = (value: ProjectCreationDraft) => combineNormalizedProjectCreationDraft(value.projectJson as any, value.scheduleJson as any, value.validationJson as any)

describe('Project creation — bulk review of AI proposals (C5)', () => {
  it('counts ~150 labelled proposals and assigns only single-phase proposals to a phase', () => {
    const draft = aiDraft()
    const counts = countProjectCreationAiProposals(draft)
    // 60 activities x 2 dates + 2 milestone dates + 2 phase gates + deps + exclusion = 126
    assert.equal(counts.total, 126)
    assert.equal(counts.byPhase.get('phase-1'), 62)
    assert.equal(counts.byPhase.get('phase-2'), 62)
    const byId = new Map(draft.assumptions.map((item) => [item.id, item]))
    assert.equal(projectCreationAssumptionPhaseId(byId.get('aigate-deps')!, draft), null) // cross-phase
    assert.equal(projectCreationAssumptionPhaseId(byId.get('aigate-exclusion')!, draft), null) // project-level
    assert.equal(projectCreationAssumptionPhaseId(byId.get('aigate-phase-1')!, draft), 'phase-1')
  })

  it('accepts one phase atomically, leaves user-authored and other-phase proposals untouched', () => {
    const draft = aiDraft()
    const result = decideProjectCreationAiProposals(draft, { scope: { type: 'PHASE', phaseId: 'phase-1' }, decision: 'ACCEPT', expectedCount: 62 })
    assert.equal(result.assumptionIds.length, 62)
    const status = new Map(result.draft.assumptions.map((item) => [item.id, item.status]))
    assert.equal(status.get('aigate-phase-1'), 'ACCEPTED')
    assert.equal(status.get('aigate-phase-2'), 'PROPOSED')
    assert.equal(status.get('user-own'), 'PROPOSED')
    assert.deepEqual(result.draft.sources, draft.sources) // provenance untouched
    assert.deepEqual(result.draft.activities, draft.activities) // values untouched
    assert.equal(countProjectCreationAiProposals(result.draft).total, 64)
  })

  it('refuses a stale confirmation count, an unknown phase, and an empty scope', () => {
    const draft = aiDraft()
    assert.throws(() => decideProjectCreationAiProposals(draft, { scope: { type: 'ALL' }, decision: 'ACCEPT', expectedCount: 10 }),
      (error: unknown) => error instanceof ProjectCreationBulkDecisionError && error.code === 'BULK_COUNT_MISMATCH')
    assert.throws(() => decideProjectCreationAiProposals(draft, { scope: { type: 'PHASE', phaseId: 'nope' }, decision: 'ACCEPT', expectedCount: 1 }),
      (error: unknown) => error instanceof ProjectCreationBulkDecisionError && error.code === 'BULK_SCOPE_INVALID')
    const all = decideProjectCreationAiProposals(draft, { scope: { type: 'ALL' }, decision: 'REJECT', expectedCount: 126 })
    assert.throws(() => decideProjectCreationAiProposals(all.draft, { scope: { type: 'ALL' }, decision: 'ACCEPT', expectedCount: 1 }),
      (error: unknown) => error instanceof ProjectCreationBulkDecisionError && error.code === 'BULK_NOTHING_TO_DECIDE')
  })

  it('server op is version-checked, writes once, and audits once with counts (no content)', async () => {
    const fake = fakeDatabase(row(aiDraft()))
    await assert.rejects(
      bulkDecideProjectCreationAiProposals({ id: 'draft-1', actorUserId: 'owner-1', expectedVersion: 4, scope: { type: 'ALL' }, decision: 'ACCEPT', expectedCount: 126 }, fake.database),
      ProjectCreationDraftVersionConflictError,
    )
    await assert.rejects(
      bulkDecideProjectCreationAiProposals({ id: 'draft-1', actorUserId: 'intruder', expectedVersion: 5, scope: { type: 'ALL' }, decision: 'ACCEPT', expectedCount: 126 }, fake.database),
      /not found/,
    )
    const result = await bulkDecideProjectCreationAiProposals({ id: 'draft-1', actorUserId: 'owner-1', expectedVersion: 5, scope: { type: 'ALL' }, decision: 'ACCEPT', expectedCount: 126 }, fake.database)
    assert.equal(result.count, 126)
    assert.equal(fake.row.version, 6)
    assert.equal(fake.audits.length, 1)
    assert.equal(fake.audits[0].action, 'UPDATED')
    assert.equal(fake.audits[0].metadata.kind, 'AI_PROPOSALS_BULK_ACCEPTED')
    assert.equal(fake.audits[0].metadata.count, 126)
    assert.doesNotMatch(JSON.stringify(fake.audits[0]), /AI proposed this value/)
    const after = stored(fake.row)
    // Only the user's own assumption still blocks commit — AI rows needed explicit acceptance.
    assert.deepEqual(after.assumptions.filter((item) => item.status === 'PROPOSED').map((item) => item.id), ['user-own'])
    assert.ok(projectCreationClientCommitBlockers(after, 'AI_GUIDED').includes('Accept or reject every proposed assumption before creation.'))
  })

  it('refuses committed/processing drafts', async () => {
    const fake = fakeDatabase(row(aiDraft(), { status: 'COMMITTED' }))
    await assert.rejects(
      bulkDecideProjectCreationAiProposals({ id: 'draft-1', actorUserId: 'owner-1', expectedVersion: 5, scope: { type: 'ALL' }, decision: 'ACCEPT', expectedCount: 126 }, fake.database),
      /cannot be edited/,
    )
  })

  it('wires a thin authorized route and a confirmed bulk UI in the review workspace', () => {
    const route = read('app/api/projects/creation-drafts/[id]/assumptions/bulk-decision/route.ts')
    assert.match(route, /withAuth/)
    assert.match(route, /canCreateProject/)
    assert.match(route, /expectedCount/)
    assert.doesNotMatch(route, /prisma/)
    const ui = read('features/projects/components/creation/DraftReviewWorkspace.tsx')
    assert.match(ui, /Accept all AI proposals in phase|Accept all in this phase/)
    assert.match(ui, /Accept all remaining AI proposals/)
    assert.match(ui, /Reject all in phase/)
    assert.match(ui, /open=\{Boolean\(bulkRequest\)\}/) // ConfirmDialog states the count
  })
})
