import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregatePmDigest } from './project-digest'
import type { RagStatus } from '@/features/projects/types'

const now = new Date('2026-07-15T12:00:00.000Z')

function project(id: string, ragStatus: RagStatus = 'GREEN') {
  return { id, code: `PRJ-${id.slice(-3)}`, name: `Project ${id}`, ragStatus }
}

function activity(overrides: {
  projectId: string
  status?: string
  currentEnd?: Date | null
  isBlocked?: boolean
  waitingSince?: Date | null
}) {
  return {
    id: `act-${overrides.projectId}`,
    title: 'Activity',
    status: overrides.status ?? 'NOT_STARTED',
    currentEnd: overrides.currentEnd ?? null,
    isBlocked: overrides.isBlocked ?? false,
    waitingSince: overrides.waitingSince ?? null,
    milestone: { phase: { projectId: overrides.projectId } },
  }
}

test('aggregatePmDigest: empty input returns zero counts', () => {
  const digest = aggregatePmDigest({ projects: [], activities: [], stageGates: [], paymentMilestones: [], raidItems: [], coes: [], now })
  assert.equal(digest.projectCount, 0)
  assert.equal(digest.overdueCount, 0)
  assert.equal(digest.blockedCount, 0)
  assert.equal(digest.waitingApprovalCount, 0)
  assert.equal(digest.projects.length, 0)
})

test('aggregatePmDigest: counts overdue activities', () => {
  const p = project('p1')
  const a = activity({ projectId: 'p1', status: 'STARTED', currentEnd: new Date('2026-07-10T00:00:00.000Z') })
  const digest = aggregatePmDigest({ projects: [p], activities: [a], stageGates: [], paymentMilestones: [], raidItems: [], coes: [], now })
  assert.equal(digest.overdueCount, 1)
  assert.equal(digest.projects[0].overdue, 1)
})

test('aggregatePmDigest: terminal statuses are not overdue', () => {
  const p = project('p1')
  const finished = activity({ projectId: 'p1', status: 'FINISHED', currentEnd: new Date('2026-07-10T00:00:00.000Z') })
  const approved = activity({ projectId: 'p1', status: 'APPROVED', currentEnd: new Date('2026-07-10T00:00:00.000Z') })
  const digest = aggregatePmDigest({ projects: [p], activities: [finished, approved], stageGates: [], paymentMilestones: [], raidItems: [], coes: [], now })
  assert.equal(digest.overdueCount, 0)
})

test('aggregatePmDigest: counts blocked activities', () => {
  const p = project('p1')
  const a = activity({ projectId: 'p1', status: 'STARTED', isBlocked: true })
  const digest = aggregatePmDigest({ projects: [p], activities: [a], stageGates: [], paymentMilestones: [], raidItems: [], coes: [], now })
  assert.equal(digest.blockedCount, 1)
  assert.equal(digest.projects[0].blocked, 1)
})

test('aggregatePmDigest: counts waiting approvals', () => {
  const p = project('p1')
  const a = activity({ projectId: 'p1', status: 'APPROVAL_REQUESTED', waitingSince: new Date('2026-07-14T00:00:00.000Z') })
  const digest = aggregatePmDigest({ projects: [p], activities: [a], stageGates: [], paymentMilestones: [], raidItems: [], coes: [], now })
  assert.equal(digest.waitingApprovalCount, 1)
  assert.equal(digest.projects[0].waitingApproval, 1)
})

test('aggregatePmDigest: approval_requested without waitingSince is not waiting', () => {
  const p = project('p1')
  const a = activity({ projectId: 'p1', status: 'APPROVAL_REQUESTED', waitingSince: null })
  const digest = aggregatePmDigest({ projects: [p], activities: [a], stageGates: [], paymentMilestones: [], raidItems: [], coes: [], now })
  assert.equal(digest.waitingApprovalCount, 0)
})

test('aggregatePmDigest: counts upcoming due activities', () => {
  const p = project('p1')
  const a = activity({ projectId: 'p1', status: 'STARTED', currentEnd: new Date('2026-07-16T00:00:00.000Z') })
  const digest = aggregatePmDigest({ projects: [p], activities: [a], stageGates: [], paymentMilestones: [], raidItems: [], coes: [], now })
  assert.equal(digest.upcomingCount, 1)
  assert.equal(digest.projects[0].upcoming, 1)
})

test('aggregatePmDigest: counts failed stage gates', () => {
  const p = project('p1')
  const digest = aggregatePmDigest({
    projects: [p],
    activities: [],
    stageGates: [{ projectId: 'p1', status: 'FAILED' }, { projectId: 'p1', status: 'PASSED' }],
    paymentMilestones: [],
    raidItems: [],
    coes: [],
    now,
  })
  assert.equal(digest.projects[0].failedGates, 1)
})

test('aggregatePmDigest: counts overdue payment milestones', () => {
  const p = project('p1')
  const digest = aggregatePmDigest({
    projects: [p],
    activities: [],
    stageGates: [],
    paymentMilestones: [
      { projectId: 'p1', actualInvoiceDate: new Date('2026-06-01T00:00:00.000Z'), invoiceStatus: 'INVOICED', paymentStatus: 'UNPAID' },
      { projectId: 'p1', actualInvoiceDate: new Date('2026-07-14T00:00:00.000Z'), invoiceStatus: 'INVOICED', paymentStatus: 'UNPAID' },
    ],
    raidItems: [],
    coes: [],
    now,
  })
  assert.equal(digest.projects[0].overduePayments, 1)
})

test('aggregatePmDigest: counts open high-risk RAID items', () => {
  const p = project('p1')
  const digest = aggregatePmDigest({
    projects: [p],
    activities: [],
    stageGates: [],
    paymentMilestones: [],
    raidItems: [
      { projectId: 'p1', type: 'RISK', status: 'OPEN', score: 20 },
      { projectId: 'p1', type: 'RISK', status: 'MITIGATING', score: 15 },
      { projectId: 'p1', type: 'RISK', status: 'CLOSED', score: 20 },
      { projectId: 'p1', type: 'RISK', status: 'OPEN', score: 10 },
      { projectId: 'p1', type: 'ISSUE', status: 'OPEN', score: 20 },
    ],
    coes: [],
    now,
  })
  assert.equal(digest.projects[0].highRisks, 2)
})

test('aggregatePmDigest: counts overdue COEs', () => {
  const p = project('p1')
  const digest = aggregatePmDigest({
    projects: [p],
    activities: [],
    stageGates: [],
    paymentMilestones: [],
    raidItems: [],
    coes: [
      { projectId: 'p1', fixStatus: 'OPEN', fixDueDate: new Date('2026-07-10T00:00:00.000Z') },
      { projectId: 'p1', fixStatus: 'DONE', fixDueDate: new Date('2026-07-10T00:00:00.000Z') },
      { projectId: 'p1', fixStatus: 'OPEN', fixDueDate: new Date('2026-07-20T00:00:00.000Z') },
    ],
    now,
  })
  assert.equal(digest.projects[0].overdueCoes, 1)
})

test('aggregatePmDigest: tallies RAG counts', () => {
  const digest = aggregatePmDigest({
    projects: [project('p1', 'RED'), project('p2', 'AMBER'), project('p3', 'GREEN'), project('p4', 'GREEN')],
    activities: [],
    stageGates: [],
    paymentMilestones: [],
    raidItems: [],
    coes: [],
    now,
  })
  assert.equal(digest.redCount, 1)
  assert.equal(digest.amberCount, 1)
  assert.equal(digest.greenCount, 2)
})

test('aggregatePmDigest: groups issues by project', () => {
  const p1 = project('p1', 'RED')
  const p2 = project('p2', 'GREEN')
  const digest = aggregatePmDigest({
    projects: [p1, p2],
    activities: [
      activity({ projectId: 'p1', status: 'STARTED', currentEnd: new Date('2026-07-10T00:00:00.000Z') }),
      activity({ projectId: 'p2', status: 'STARTED', isBlocked: true }),
    ],
    stageGates: [],
    paymentMilestones: [],
    raidItems: [],
    coes: [],
    now,
  })
  assert.equal(digest.projects.find((p) => p.id === 'p1')?.overdue, 1)
  assert.equal(digest.projects.find((p) => p.id === 'p2')?.blocked, 1)
})
