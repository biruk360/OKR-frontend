import { test } from 'node:test'
import assert from 'node:assert/strict'
import { awaitingClientActions, flattenClientActivities, portalDelayRows } from '../../features/projects/services/portal-dashboard'
import type { ClientProject } from '../../features/projects/services/portal-serializer'

const project: ClientProject = {
  id: 'p1',
  code: 'PRJ-001',
  name: 'Meda Platform',
  description: null,
  clientName: 'Meda',
  status: 'ACTIVE',
  ragStatus: 'AMBER',
  confidence: 68,
  percentComplete: 50,
  percentPlanned: 65,
  spi: 0.9,
  plannedStart: '2026-07-01T00:00:00.000Z',
  plannedEnd: '2026-09-01T00:00:00.000Z',
  baselineCommittedAt: '2026-07-01T00:00:00.000Z',
  baselineVersion: 1,
  phases: [{
    id: 'ph1',
    name: 'Build',
    position: 0,
    percentComplete: 50,
    status: 'STARTED',
    baselineStart: null,
    baselineEnd: null,
    currentStart: null,
    currentEnd: null,
    milestones: [{
      id: 'm1',
      name: 'Approval',
      position: 0,
      percentComplete: 0,
      status: 'APPROVAL_REQUESTED',
      baselineDate: null,
      currentDate: null,
      isKeyMilestone: true,
      activities: [
        {
          id: 'a1',
          title: 'Requirements approval',
          owner: 'Your Team',
          baselineStart: '2026-07-01T00:00:00.000Z',
          baselineEnd: '2026-07-04T00:00:00.000Z',
          currentStart: '2026-07-01T00:00:00.000Z',
          currentEnd: '2026-07-10T00:00:00.000Z',
          status: 'APPROVAL_REQUESTED',
          percentComplete: 90,
          isMilestone: false,
          slipDays: 6,
          slipReason: 'CLIENT_APPROVAL_DELAY',
          slipOwner: 'CLIENT',
          waitingSince: '2026-07-01T00:00:00.000Z',
        },
        {
          id: 'a2',
          title: 'Internal build',
          owner: '360Ground Team',
          baselineStart: null,
          baselineEnd: null,
          currentStart: null,
          currentEnd: null,
          status: 'APPROVAL_REQUESTED',
          percentComplete: 70,
          isMilestone: false,
          slipDays: 0,
          slipReason: null,
          slipOwner: null,
          waitingSince: '2026-07-07T00:00:00.000Z',
        },
      ],
    }],
  }],
}

test('flattenClientActivities: preserves phase and milestone context', () => {
  assert.deepEqual(flattenClientActivities(project).map((row) => [row.phaseName, row.milestoneName, row.activity.id]), [
    ['Build', 'Approval', 'a1'],
    ['Build', 'Approval', 'a2'],
  ])
})

test('awaitingClientActions: only client-owned approval requests appear with business-day wait', () => {
  const rows = awaitingClientActions(project, new Date('2026-07-08T12:00:00Z'), 3)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].activityId, 'a1')
  assert.equal(rows[0].daysWaiting, 5)
  assert.equal(rows[0].isOverSla, true)
})

test('portalDelayRows: shows baseline/current dates and honest owner attribution', () => {
  assert.deepEqual(portalDelayRows(project, [{
    id: 'd1',
    activityId: 'a1',
    reason: 'CLIENT_APPROVAL_DELAY',
    owner: 'CLIENT',
    daysLost: 6,
  }]), [{
    id: 'd1',
    activityId: 'a1',
    activityTitle: 'Requirements approval',
    originalDate: '2026-07-04T00:00:00.000Z',
    currentDate: '2026-07-10T00:00:00.000Z',
    daysLost: 6,
    reason: 'CLIENT_APPROVAL_DELAY',
    owner: 'CLIENT',
  }])
})
