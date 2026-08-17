import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  createManualReviewScheduleJson,
  createManualScheduleJson,
  getManualTemplateId,
} from './manual-creation'
import {
  createProjectWithTemplate,
  ProjectTemplateSelectionError,
} from './service'

const ROOT = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), 'utf8')

function createFakeDatabase(structureJson: unknown = null) {
  const calls = {
    transactions: 0,
    projectCreates: [] as Array<Record<string, any>>,
    memberCreates: [] as Array<Record<string, any>>,
    phaseCreates: [] as Array<Record<string, any>>,
    milestoneCreates: [] as Array<Record<string, any>>,
    activityCreates: [] as Array<Record<string, any>>,
    templateReads: 0,
  }
  const tx = {
    project: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        calls.projectCreates.push(structuredClone(data))
        return { id: 'project-1', code: data.code }
      },
    },
    projectMember: {
      create: async ({ data }: any) => {
        calls.memberCreates.push(structuredClone(data))
        return data
      },
    },
    projectTemplate: {
      findUnique: async () => {
        calls.templateReads++
        return structureJson === null ? null : { structureJson }
      },
    },
    phase: {
      create: async ({ data }: any) => {
        calls.phaseCreates.push(structuredClone(data))
        return { id: `phase-${calls.phaseCreates.length}` }
      },
    },
    milestone: {
      create: async ({ data }: any) => {
        calls.milestoneCreates.push(structuredClone(data))
        return { id: `milestone-${calls.milestoneCreates.length}` }
      },
    },
    activity: {
      create: async ({ data }: any) => {
        calls.activityCreates.push(structuredClone(data))
        return { id: `activity-${calls.activityCreates.length}` }
      },
    },
  }
  const database = {
    $transaction: async (operation: (client: typeof tx) => Promise<unknown>) => {
      calls.transactions++
      return operation(tx)
    },
  }
  return { database, calls }
}

const baseInput = {
  name: 'Manual Project',
  clientName: 'Client One',
  projectManagerId: 'user-pm',
  plannedStart: new Date('2026-09-01T00:00:00.000Z'),
  plannedEnd: new Date('2026-12-01T00:00:00.000Z'),
  createdById: 'user-creator',
}

describe('Manual project creation', () => {
  it('AC3: Start blank creates one PLANNING, unbaselined project and zero schedule rows', async () => {
    const { database, calls } = createFakeDatabase()
    const created = await createProjectWithTemplate(database as never, baseInput)

    assert.deepEqual(created, { id: 'project-1', code: 'PRJ-2026-001' })
    assert.equal(calls.transactions, 1)
    assert.equal(calls.projectCreates.length, 1)
    assert.equal(calls.projectCreates[0].status, 'PLANNING')
    assert.equal('baselineCommittedAt' in calls.projectCreates[0], false)
    assert.equal(calls.memberCreates.length, 1)
    assert.equal(calls.templateReads, 0)
    assert.equal(calls.phaseCreates.length, 0)
    assert.equal(calls.milestoneCreates.length, 0)
    assert.equal(calls.activityCreates.length, 0)
  })

  it('AC4: copies the selected template tree inside the same transaction', async () => {
    const source = {
      phases: [{
        name: 'Discovery',
        weight: 100,
        milestones: [{
          name: 'Requirements approved',
          isKeyMilestone: true,
          activities: [
            { title: 'Gather requirements', ownerParty: '360GROUND' },
            { title: 'Approve requirements', ownerParty: 'CLIENT', isApproval: true },
          ],
        }],
      }],
    }
    const { database, calls } = createFakeDatabase(source)
    await createProjectWithTemplate(database as never, { ...baseInput, templateId: 'template-1' })

    assert.equal(calls.transactions, 1)
    assert.equal(calls.templateReads, 1)
    assert.equal(calls.projectCreates.length, 1)
    assert.equal(calls.phaseCreates.length, 1)
    assert.equal(calls.milestoneCreates.length, 1)
    assert.equal(calls.activityCreates.length, 2)
    assert.equal(calls.phaseCreates[0].name, 'Discovery')
    assert.equal(calls.milestoneCreates[0].name, 'Requirements approved')
    assert.equal(calls.activityCreates[1].title, 'Approve requirements')

    source.phases[0].name = 'Edited later'
    source.phases[0].milestones[0].activities[0].title = 'Edited later'
    assert.equal(calls.phaseCreates[0].name, 'Discovery')
    assert.equal(calls.activityCreates[0].title, 'Gather requirements')
  })

  it('AC4: fails closed before project creation when a selected template is unavailable', async () => {
    const { database, calls } = createFakeDatabase(null)
    await assert.rejects(
      createProjectWithTemplate(database as never, { ...baseInput, templateId: 'missing' }),
      ProjectTemplateSelectionError,
    )
    assert.equal(calls.transactions, 1)
    assert.equal(calls.projectCreates.length, 0)
    assert.equal(calls.phaseCreates.length, 0)
  })

  it('persists blank versus template choice in the normalized schedule slice', () => {
    const blank = createManualScheduleJson(null)
    assert.equal(getManualTemplateId(blank), null)
    assert.deepEqual(blank.phases, [])
    assert.deepEqual(blank.milestones, [])
    assert.deepEqual(blank.activities, [])

    const selected = createManualScheduleJson('template-1')
    assert.equal(getManualTemplateId(selected), 'template-1')
    assert.equal(selected.sources[0].type, 'TEMPLATE')
    assert.equal(selected.sources[0].basis, 'USER_DECISION')
  })

  it('materializes a selected template into an editable normalized review schedule', () => {
    const schedule = createManualReviewScheduleJson('template-1', {
      phases: [{
        name: 'Discovery',
        weight: 100,
        milestones: [{
          name: 'Requirements',
          isKeyMilestone: true,
          activities: [{ title: 'Interview stakeholders', ownerParty: 'SHARED' }],
        }],
      }],
    })
    assert.equal(getManualTemplateId(schedule), 'template-1')
    assert.equal(schedule.phases[0].name, 'Discovery')
    assert.equal(schedule.milestones[0].isKeyMilestone, true)
    assert.equal(schedule.activities[0].title, 'Interview stakeholders')
    assert.equal(schedule.activities[0].ownerParty, 'SHARED')
    assert.equal(schedule.activities[0].startDate, null)
    assert.equal(schedule.activities[0].endDate, null)
  })

  it('folds the draft-backed wizard behind Manual with counts, preview, and shared editable review', () => {
    const list = read('features/projects/components/ProjectsListClient.tsx')
    const wizard = read('features/projects/components/CreateProjectWizard.tsx')
    const route = read('app/api/projects/route.ts')
    assert.match(list, /activeDraft\.sourceMethod === 'MANUAL'/)
    assert.match(list, /<CreateProjectWizard/)
    assert.match(wizard, /Start blank/)
    assert.match(wizard, /phases ·.*milestones ·.*activities/)
    assert.match(wizard, /TemplatePreview/)
    assert.match(wizard, /createManualReviewScheduleJson/)
    assert.match(wizard, /<DraftReviewWorkspace/)
    assert.doesNotMatch(route, /emit\('PROJECT_CREATED'/)
  })
})
