import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { commitProjectCreationDraft } from './creation-commit'
import {
  projectCreationClientCommitBlockers,
  projectCreationCommitCounts,
} from './creation-commit-shared'
import type { NormalizedProjectCreationDraft } from './creation-normalize'

const ROOT = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), 'utf8')

function normalizedFixture(): NormalizedProjectCreationDraft {
  return {
    schemaVersion: 1,
    project: {
      name: 'Client Portal Rollout', code: 'PRJ-2026-901', clientName: 'Acme PLC', clientId: 'odoo-1',
      description: 'Deliver the portal.', projectManagerId: 'admin-1', departmentId: 'dept-1',
      contractValue: 250000, currency: 'ETB', plannedStart: '2026-09-01', plannedEnd: '2026-10-31',
      projectType: 'Software', projectTypeOther: null, objective: 'Launch securely', businessOutcome: 'Self-service access',
      scopeIncluded: ['Portal'], scopeExcluded: ['Mobile app'],
      workingCalendar: { mode: 'ORGANIZATION', timezone: 'Africa/Addis_Ababa', workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'], nonWorkingDates: [], allowNonWorkingDates: false },
    },
    phases: [{ id: 'phase-1', name: 'Delivery', position: 0, weight: 100, plannedStart: '2026-09-01', plannedEnd: '2026-10-31' }],
    milestones: [{ id: 'milestone-1', phaseId: 'phase-1', name: 'Portal ready', position: 0, weight: 100, isKeyMilestone: false, dueDate: '2026-10-31' }],
    activities: [
      { id: 'activity-1', sourceRowId: 'A1', milestoneId: 'milestone-1', parentActivityId: null, position: 0, title: 'Configure portal', description: null, ownerParty: '360GROUND', assigneeId: null, assigneeEmail: null, suggestedRole: null, startDate: '2026-09-01', endDate: '2026-09-30', weight: 60, estimatedHours: 80, priority: 'HIGH', risk: 'MEDIUM', isBlocked: false, blockerDetails: null, isApproval: false },
      { id: 'activity-2', sourceRowId: 'A2', milestoneId: 'milestone-1', parentActivityId: 'activity-1', position: 1, title: 'Client approval', description: null, ownerParty: 'CLIENT', assigneeId: null, assigneeEmail: null, suggestedRole: null, startDate: '2026-10-01', endDate: '2026-10-05', weight: 40, estimatedHours: 8, priority: 'HIGH', risk: 'LOW', isBlocked: false, blockerDetails: null, isApproval: true },
    ],
    dependencies: [{ id: 'dependency-1', predecessorActivityId: 'activity-1', successorActivityId: 'activity-2', type: 'FS', lagDays: 1 }],
    deliverables: [{ id: 'deliverable-1', milestoneId: 'milestone-1', name: 'Production portal package', producingActivityIds: ['activity-1'], dueDate: '2026-10-31', ownerParty: 'CLIENT', approvalActivityId: 'activity-2', approvalCriteria: 'Client signs off.' }],
    assumptions: [{ id: 'assumption-1', text: 'Client supplies content.', category: 'SCOPE', affectedPaths: ['project.scopeIncluded'], sourceIds: [], status: 'ACCEPTED' }],
    questions: [],
    warnings: [{ id: 'warning-1', code: 'CLIENT_CONTENT', message: 'Content timing remains unresolved.', severity: 'WARNING', affectedPaths: ['project.scopeIncluded'], sourceIds: [], acknowledged: true }],
    sources: [{ id: 'source-1', type: 'SPREADSHEET_ROW', reference: 'Schedule!2', excerpt: null, targetPaths: ['activities.0'], basis: 'SOURCE_FACT', confidence: 'HIGH', lastEditor: 'USER' }],
    changes: [], issues: [],
  }
}

function fakeDatabase(options: { failDependency?: boolean } = {}) {
  const normalized = normalizedFixture()
  let sequence = 0
  let state: any = {
    users: [{ id: 'admin-1', role: 'ADMIN', isActive: true, isProjectManager: false }],
    drafts: [{
      id: 'draft-1', ownerUserId: 'admin-1', sourceMethod: 'FILE_IMPORT', status: 'READY', version: 3,
      projectJson: { schemaVersion: 1, project: normalized.project },
      scheduleJson: { schemaVersion: 1, phases: normalized.phases, milestones: normalized.milestones, activities: normalized.activities, dependencies: normalized.dependencies, deliverables: normalized.deliverables, sources: normalized.sources, changes: normalized.changes },
      validationJson: { schemaVersion: 1, assumptions: normalized.assumptions, questions: normalized.questions, warnings: normalized.warnings, issues: normalized.issues },
      sourceFileName: 'schedule.xlsx', sourceMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sourceSize: 1024, sourceHash: 'a'.repeat(64), sourceRef: null,
      aiProvider: null, aiModelId: null, aiPromptVersion: null, committedProjectId: null,
      createdAt: new Date(), updatedAt: new Date(), committedAt: null, expiresAt: new Date('2026-12-01'),
    }],
    projects: [], members: [], phases: [], milestones: [], activities: [], dependencies: [], logs: [],
  }
  const id = (prefix: string) => `${prefix}-${++sequence}`
  const matches = (row: any, where: any) => Object.entries(where).every(([key, expected]: [string, any]) => {
    if (expected && typeof expected === 'object' && 'in' in expected) return expected.in.includes(row[key])
    return row[key] === expected
  })
  const tx: any = {
    projectCreationDraft: {
      findUnique: async ({ where }: any) => state.drafts.find((row: any) => row.id === where.id) ?? null,
      updateMany: async ({ where, data }: any) => {
        const row = state.drafts.find((candidate: any) => matches(candidate, where))
        if (!row) return { count: 0 }
        for (const [key, value] of Object.entries(data) as Array<[string, any]>) row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : value
        return { count: 1 }
      },
    },
    user: {
      findUnique: async ({ where }: any) => state.users.find((row: any) => row.id === where.id) ?? null,
      findMany: async ({ where }: any) => state.users.filter((row: any) => where.id.in.includes(row.id) && row.isActive).map((row: any) => ({ id: row.id })),
    },
    departmentMembership: { findFirst: async () => null },
    projectTemplate: { findUnique: async () => null },
    project: {
      findFirst: async () => null,
      findUnique: async ({ where }: any) => state.projects.find((row: any) => where.id ? row.id === where.id : row.code === where.code) ?? null,
      create: async ({ data }: any) => { const row = { id: id('project'), baselineCommittedAt: null, baselineVersion: 0, percentComplete: 0, percentPlanned: 0, ...data }; state.projects.push(row); return { id: row.id, code: row.code } },
      update: async ({ where, data }: any) => { const row = state.projects.find((item: any) => item.id === where.id); Object.assign(row, data); return row },
    },
    projectMember: { create: async ({ data }: any) => { state.members.push({ id: id('member'), ...data }); return state.members.at(-1) } },
    phase: {
      create: async ({ data }: any) => { const row = { id: id('phase'), percentComplete: 0, baselineStart: null, baselineEnd: null, ...data }; state.phases.push(row); return row },
      findMany: async ({ where }: any) => state.phases.filter((row: any) => row.projectId === where.projectId).map((phase: any) => ({ ...phase, milestones: state.milestones.filter((row: any) => row.phaseId === phase.id).map((milestone: any) => ({ ...milestone, keyResultId: null, activities: state.activities.filter((row: any) => row.milestoneId === milestone.id) })) })),
      update: async ({ where, data }: any) => { const row = state.phases.find((item: any) => item.id === where.id); Object.assign(row, data); return row },
    },
    milestone: {
      create: async ({ data }: any) => { const row = { id: id('milestone'), percentComplete: 0, baselineDate: null, ...data }; state.milestones.push(row); return row },
      update: async ({ where, data }: any) => { const row = state.milestones.find((item: any) => item.id === where.id); Object.assign(row, data); return row },
    },
    activity: {
      create: async ({ data }: any) => { const row = { id: id('activity'), parentActivityId: null, baselineStart: null, baselineEnd: null, slipDays: 0, ...data }; state.activities.push(row); return row },
      update: async ({ where, data }: any) => { const row = state.activities.find((item: any) => item.id === where.id); Object.assign(row, data); return row },
    },
    activityDependency: {
      create: async ({ data }: any) => { if (options.failDependency) throw new Error('injected dependency failure'); const row = { id: id('dependency'), ...data }; state.dependencies.push(row); return row },
    },
    activityLog: { create: async ({ data }: any) => { state.logs.push({ id: id('log'), ...data }); return state.logs.at(-1) } },
  }
  return {
    get state() { return state },
    database: {
      async $transaction(operation: (client: any) => Promise<any>) {
        const snapshot = structuredClone(state)
        try { return await operation(tx) } catch (error) { state = snapshot; throw error }
      },
    },
  }
}

describe('Project creation draft commit', () => {
  it('AC20: disables Create Project for blocking findings and unresolved user decisions', () => {
    const draft = normalizedFixture()
    draft.issues.push({ id: 'blocking-1', severity: 'BLOCKING', code: 'INVALID_DATE', message: 'End date is invalid.', sourceRow: 2, field: 'End Date', suggestedCorrection: 'Correct it.', affectedPaths: ['activities.0.endDate'] })
    assert.deepEqual(projectCreationClientCommitBlockers(draft, 'FILE_IMPORT')[0], 'End date is invalid.')
    const workspace = read('features/projects/components/creation/DraftReviewWorkspace.tsx')
    assert.match(workspace, /Create Project is disabled/)
    assert.match(workspace, /disabled=\{updateDraft\.isPending \|\| commitDraft\.isPending \|\| knownCommitBlockers\.length > 0\}/)
  })

  it('AC21: acknowledged warnings create one project and its complete schedule atomically', async () => {
    const fake = fakeDatabase()
    const result = await commitProjectCreationDraft({ draftId: 'draft-1', actorUserId: 'admin-1', expectedVersion: 3, now: new Date('2026-08-17T12:00:00Z') }, fake.database as never)
    assert.deepEqual(result.counts, { phases: 1, milestones: 1, activities: 2, deliverables: 1, dependencies: 1 })
    assert.equal(result.acknowledgedWarnings, 1)
    assert.equal(fake.state.projects.length, 1)
    assert.equal(fake.state.members.length, 1)
    assert.equal(fake.state.phases.length, 1)
    assert.equal(fake.state.milestones[0].isKeyMilestone, true)
    assert.equal(fake.state.milestones[0].name, 'Production portal package')
    assert.equal(fake.state.activities.length, 2)
    assert.equal(fake.state.activities[1].parentActivityId, fake.state.activities[0].id)
    assert.equal(fake.state.activities[1].isMilestone, true)
    assert.equal(fake.state.dependencies.length, 1)
    assert.equal(fake.state.logs.length, 2)
    assert.equal(fake.state.drafts[0].status, 'COMMITTED')
  })

  it('AC22: any database failure rolls back the claim, project, schedule, membership, and audits', async () => {
    const fake = fakeDatabase({ failDependency: true })
    await assert.rejects(commitProjectCreationDraft({ draftId: 'draft-1', actorUserId: 'admin-1', expectedVersion: 3 }, fake.database as never), /injected dependency failure/)
    assert.equal(fake.state.drafts[0].status, 'READY')
    assert.equal(fake.state.drafts[0].committedProjectId, null)
    for (const collection of ['projects', 'members', 'phases', 'milestones', 'activities', 'dependencies', 'logs']) assert.equal(fake.state[collection].length, 0, `${collection} must roll back`)
  })

  it('AC23: import commit is Planning, unbaselined, and has no notification or external publication path', async () => {
    const fake = fakeDatabase()
    const result = await commitProjectCreationDraft({ draftId: 'draft-1', actorUserId: 'admin-1', expectedVersion: 3 }, fake.database as never)
    assert.equal(result.status, 'PLANNING')
    assert.equal(result.baselineCommittedAt, null)
    assert.equal(fake.state.projects[0].status, 'PLANNING')
    assert.equal(fake.state.projects[0].baselineCommittedAt, null)
    const service = read('lib/projects/creation-commit.ts')
    const route = read('app/api/projects/creation-drafts/[id]/commit/route.ts')
    assert.doesNotMatch(`${service}\n${route}`, /\bemit\s*\(|lib\/notifications|portalEnabled:\s*true|jiraLinked:\s*true/i)
  })

  it('AC24: a repeated committed-draft request returns the existing project without duplication', async () => {
    const fake = fakeDatabase()
    const first = await commitProjectCreationDraft({ draftId: 'draft-1', actorUserId: 'admin-1', expectedVersion: 3 }, fake.database as never)
    const second = await commitProjectCreationDraft({ draftId: 'draft-1', actorUserId: 'admin-1', expectedVersion: 3 }, fake.database as never)
    assert.equal(first.existing, false)
    assert.equal(second.existing, true)
    assert.equal(second.id, first.id)
    assert.equal(fake.state.projects.length, 1)
    assert.equal(fake.state.members.length, 1)
    assert.deepEqual(projectCreationCommitCounts(normalizedFixture()), second.counts)
  })

  it('wires explicit counts, repeated identity fields, versioned endpoint, Gantt redirect, and next actions', () => {
    const dialog = read('features/projects/components/creation/CommitConfirmDialog.tsx')
    const route = read('app/api/projects/creation-drafts/[id]/commit/route.ts')
    const list = read('features/projects/components/ProjectsListClient.tsx')
    const workspace = read('features/projects/components/ProjectWorkspaceClient.tsx')
    for (const value of ['phases', 'milestones', 'activities', 'deliverables', 'dependency links', 'Project manager', 'Acknowledged unresolved warnings']) assert.match(dialog, new RegExp(value, 'i'))
    assert.match(route, /commitSchema/)
    assert.match(route, /commitProjectCreationDraft/)
    assert.match(list, /created=1&warnings=/)
    for (const action of ['Review schedule', 'Configure project team', 'Configure client obligations', 'Commit baseline when ready']) assert.match(workspace, new RegExp(action))
  })
})
