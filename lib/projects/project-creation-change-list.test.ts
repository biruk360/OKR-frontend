import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  ProjectCreationChangeConflictError,
  decideProjectCreationCleanupChanges,
  safeProjectCreationCleanupGroups,
  validateProjectCreationCleanupTransitions,
} from './creation-changes'
import {
  combineNormalizedProjectCreationDraft,
  createEmptyProjectCreationProjectJson,
  createEmptyProjectCreationScheduleJson,
  createEmptyProjectCreationValidationJson,
  normalizedProjectCreationDraftSchema,
  type NormalizedProjectCreationDraft,
} from './creation-normalize'

const ROOT = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), 'utf8')

function fixture(): NormalizedProjectCreationDraft {
  const project = createEmptyProjectCreationProjectJson('pm-1')
  project.project.name = 'Duplicate and date review'
  project.project.clientName = 'Client'
  project.project.plannedStart = '2026-09-01'
  project.project.plannedEnd = '2026-10-31'
  const schedule = createEmptyProjectCreationScheduleJson()
  schedule.phases.push({ id: 'phase-1', name: 'Delivery   phase', position: 0, weight: 100, plannedStart: '2026-09-01', plannedEnd: '2026-10-31' })
  schedule.milestones.push({ id: 'milestone-1', phaseId: 'phase-1', name: 'Release', position: 0, weight: 100, isKeyMilestone: true, dueDate: '2026-10-31' })
  const first = { id: 'activity-1', sourceRowId: 'A-1', milestoneId: 'milestone-1', parentActivityId: null, position: 0, title: 'Review   scope', description: null, ownerParty: '360GROUND' as const, assigneeId: null, assigneeEmail: null, suggestedRole: null, startDate: '2026-09-01', endDate: '2026-09-10', weight: 50, estimatedHours: null, priority: null, risk: null, isBlocked: false, blockerDetails: null, isApproval: false }
  const duplicate = { ...first, id: 'activity-2', sourceRowId: 'A-2', position: 1 }
  schedule.activities.push(first, duplicate)
  schedule.changes.push(
    { id: 'change-date', path: '/activities/activity-1/endDate', kind: 'DATE_NORMALIZATION', operation: 'REPLACE', originalValue: '2026-09-10', proposedValue: '2026-10-09', reason: 'The source date is ambiguous; this is one possible interpretation.', confidence: 'LOW', sourceIds: [], status: 'PROPOSED' },
    { id: 'change-duplicate', path: '/activities/activity-2', kind: 'DUPLICATE_ROW', operation: 'DELETE', originalValue: duplicate, proposedValue: null, reason: 'Rows A-1 and A-2 appear to describe the same work.', confidence: 'MEDIUM', sourceIds: [], status: 'PROPOSED' },
    { id: 'change-title-space', path: '/activities/activity-1/title', kind: 'WHITESPACE', operation: 'REPLACE', originalValue: 'Review   scope', proposedValue: 'Review scope', reason: 'Remove repeated whitespace.', confidence: 'HIGH', sourceIds: [], status: 'PROPOSED' },
    { id: 'change-phase-space', path: '/phases/phase-1/name', kind: 'WHITESPACE', operation: 'REPLACE', originalValue: 'Delivery   phase', proposedValue: 'Delivery phase', reason: 'Remove repeated whitespace.', confidence: 'HIGH', sourceIds: [], status: 'PROPOSED' },
  )
  return combineNormalizedProjectCreationDraft(project, schedule, createEmptyProjectCreationValidationJson())
}

describe('Story 2.3 AI cleanup change list', () => {
  it('AC10: shows duplicate/date proposals without changing values, then applies only accepted decisions', () => {
    const original = fixture()
    assert.equal(original.activities[0].endDate, '2026-09-10')
    assert.equal(original.activities.length, 2)

    const rejectedDate = decideProjectCreationCleanupChanges(original, ['change-date'], 'REJECT')
    assert.equal(rejectedDate.activities[0].endDate, '2026-09-10')
    assert.equal(rejectedDate.changes.find((change) => change.id === 'change-date')?.status, 'REJECTED')

    const acceptedDate = decideProjectCreationCleanupChanges(original, ['change-date'], 'ACCEPT')
    assert.equal(acceptedDate.activities[0].endDate, '2026-10-09')
    assert.equal(acceptedDate.changes.find((change) => change.id === 'change-date')?.status, 'ACCEPTED')

    const acceptedDuplicate = decideProjectCreationCleanupChanges(original, ['change-duplicate'], 'ACCEPT')
    assert.deepEqual(acceptedDuplicate.activities.map((activity) => activity.id), ['activity-1'])
    assert.equal(acceptedDuplicate.changes.find((change) => change.id === 'change-duplicate')?.status, 'ACCEPTED')
    assert.equal(normalizedProjectCreationDraftSchema.safeParse(acceptedDuplicate).success, true)
  })

  it('fails closed when a direct user edit conflicts and limits bulk acceptance to deterministic safe text groups', () => {
    const edited = fixture()
    edited.activities[0].endDate = '2026-09-20'
    assert.throws(
      () => decideProjectCreationCleanupChanges(edited, ['change-date'], 'ACCEPT'),
      (error: unknown) => error instanceof ProjectCreationChangeConflictError && /edited after/.test(error.message),
    )
    assert.equal(edited.activities[0].endDate, '2026-09-20')
    assert.deepEqual(safeProjectCreationCleanupGroups(edited.changes), [{
      kind: 'WHITESPACE',
      label: 'whitespace cleanups',
      changeIds: ['change-title-space', 'change-phase-space'],
    }])
    const grouped = decideProjectCreationCleanupChanges(edited, ['change-title-space', 'change-phase-space'], 'ACCEPT')
    assert.equal(grouped.activities[0].title, 'Review scope')
    assert.equal(grouped.phases[0].name, 'Delivery phase')
    assert.equal(grouped.activities[0].endDate, '2026-09-20')
  })

  it('validates immutable server-side transitions and records accepted/rejected decisions without values', () => {
    const current = fixture()
    const accepted = decideProjectCreationCleanupChanges(current, ['change-date'], 'ACCEPT')
    assert.deepEqual(validateProjectCreationCleanupTransitions(current, accepted), {
      acceptedIds: ['change-date'],
      rejectedIds: [],
    })
    const statusOnly = structuredClone(current)
    statusOnly.changes[0].status = 'ACCEPTED'
    assert.throws(() => validateProjectCreationCleanupTransitions(current, statusOnly), /was not applied/)
    const tampered = structuredClone(accepted)
    tampered.changes[0].reason = 'Changed evidence'
    assert.throws(() => validateProjectCreationCleanupTransitions(current, tampered), /evidence cannot be edited/)

    const service = read('lib/projects/creation-draft.ts')
    assert.match(service, /validateProjectCreationCleanupTransitions/)
    assert.match(service, /AI_CLEANUP_ACCEPTED/)
    assert.match(service, /AI_CLEANUP_REJECTED/)
    assert.doesNotMatch(service, /originalValue: cleanupDecisions|proposedValue: cleanupDecisions/)
  })

  it('uses a dedicated read-only ChangeListPanel with individual and safe-group controls plus Undo', () => {
    const panel = read('features/projects/components/creation/ChangeListPanel.tsx')
    const workspace = read('features/projects/components/creation/DraftReviewWorkspace.tsx')
    const barrel = read('features/projects/index.ts')
    for (const text of ['Original value', 'Proposed value', 'Reason:', 'confidence', 'Accept cleanup', 'Reject cleanup', 'Accept group', 'Reject group', 'Nothing changes until you accept']) {
      assert.match(panel, new RegExp(text, 'i'))
    }
    assert.match(panel, /safeProjectCreationCleanupGroups/)
    assert.doesNotMatch(panel, /<input|<textarea|<select/)
    assert.match(workspace, /<ChangeListPanel/)
    assert.match(workspace, /decideProjectCreationCleanupChanges/)
    assert.match(workspace, /Undo/)
    assert.doesNotMatch(workspace, /changes\.\$\{index\}\.reason/)
    assert.match(barrel, /export \{ ChangeListPanel \}/)
  })
})
