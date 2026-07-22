import assert from 'node:assert/strict'
import test from 'node:test'
import { buildProjectOverviewReport } from './project-overview'
import type { ProjectDetail } from '@/features/projects/hooks/useProject'

function activity(overrides: Record<string, unknown>) {
  return {
    id: 'activity', status: 'NOT_STARTED', ownerParty: '360GROUND', priority: null, risk: null,
    slipDays: 0, estimatedHours: null, actualHours: null, estimatedCost: null, actualCost: null,
    ...overrides,
  }
}

const project = {
  phases: [
    {
      name: 'Discovery', percentComplete: 37.26, milestones: [
        { name: 'Requirements', percentComplete: 50.04, activities: [
          activity({ id: 'a1', status: 'FINISHED', ownerParty: 'CLIENT', slipDays: 3, estimatedHours: 8, actualHours: 10, estimatedCost: 100, actualCost: 120, risk: 'HIGH' }),
          activity({ id: 'a2', status: 'STARTED', ownerParty: 'CLIENT', slipDays: 2, estimatedHours: 4, actualHours: null, priority: 'HIGH' }),
        ] },
      ],
    },
    {
      name: 'Delivery', percentComplete: 10, milestones: [
        { name: 'Build', percentComplete: 10, activities: [activity({ id: 'a3', ownerParty: 'SHARED', estimatedHours: 6 })] },
      ],
    },
  ],
} as unknown as ProjectDetail

test('project overview reports use only stored project values', () => {
  const report = buildProjectOverviewReport(project)
  assert.deepEqual(report.statusDistribution.map(({ name, value }) => [name, value]), [['Not started', 1], ['Started', 1], ['Finished', 1]])
  assert.deepEqual(report.phaseCompletion, [{ name: 'Discovery', completion: 37.3 }, { name: 'Delivery', completion: 10 }])
  assert.deepEqual(report.sectionCompletion, [{ name: 'Requirements', completion: 50 }, { name: 'Build', completion: 10 }])
  assert.deepEqual(report.delayByOwner, [{ name: 'Client', days: 5 }])
  assert.deepEqual(report.hoursByPhase, [
    { name: 'Discovery', estimated: 12, actual: 10 },
    { name: 'Delivery', estimated: 6, actual: 0 },
  ])
  assert.deepEqual(report.costByPhase, [{ name: 'Discovery', estimated: 100, actual: 120 }])
  assert.deepEqual(report.estimateAccuracy, [{ name: 'a1', estimated: 8, actual: 10 }])
})

test('project overview reports do not invent absent operational data', () => {
  const report = buildProjectOverviewReport({ phases: [] } as unknown as ProjectDetail)
  assert.deepEqual(report.statusDistribution, [])
  assert.deepEqual(report.delayByOwner, [])
  assert.deepEqual(report.hoursByPhase, [])
  assert.deepEqual(report.costByPhase, [])
  assert.deepEqual(report.estimateAccuracy, [])
})
