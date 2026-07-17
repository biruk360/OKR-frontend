import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cloneTemplateStructure,
  countTemplateNodes,
  normalizeTemplateStructure,
  templateStructureSchema,
} from './templates'
import type { ProjectTemplate } from '@prisma/client'

test('normalizeTemplateStructure: fills defaults and trims strings', () => {
  const normalized = normalizeTemplateStructure({
    phases: [
      {
        name: '  Phase 1  ',
        weight: 20,
        milestones: [
          {
            name: 'M1',
            activities: [{ title: '  Activity 1  ' }],
          },
        ],
      },
    ],
  })
  assert.equal(normalized.phases[0].name, 'Phase 1')
  assert.equal(normalized.phases[0].milestones[0].activities[0].title, 'Activity 1')
  assert.equal(normalized.phases[0].milestones[0].activities[0].ownerParty, '360GROUND')
  assert.equal(normalized.phases[0].milestones[0].activities[0].isApproval, false)
  assert.equal(normalized.phases[0].milestones[0].isKeyMilestone, false)
})

test('templateStructureSchema: accepts valid structure', () => {
  const result = templateStructureSchema.safeParse({
    phases: [
      {
        name: 'Phase',
        weight: 100,
        milestones: [
          {
            name: 'Milestone',
            activities: [{ title: 'Activity', ownerParty: 'CLIENT', isApproval: true }],
          },
        ],
      },
    ],
  })
  assert.equal(result.success, true)
})

test('templateStructureSchema: rejects empty phase name', () => {
  const result = templateStructureSchema.safeParse({
    phases: [{ name: '', weight: 100, milestones: [] }],
  })
  assert.equal(result.success, false)
})

test('cloneTemplateStructure: copies tree, strips slug, sets isSystem false', () => {
  const source = {
    name: 'System Template',
    description: 'A system template',
    structureJson: { slug: 'system-template', phases: [{ name: 'P1', weight: 100, milestones: [{ name: 'M1', activities: [{ title: 'A1' }] }] }] },
  } as unknown as ProjectTemplate
  const clone = cloneTemplateStructure(source)
  assert.equal(clone.name, 'Copy of System Template')
  assert.equal(clone.isSystem, false)
  assert.equal(clone.version, 1)
  assert.equal((clone.structureJson as any).slug, undefined)
  assert.equal(clone.structureJson.phases[0].name, 'P1')
  assert.equal(clone.structureJson.phases[0].milestones[0].activities[0].title, 'A1')
})

test('cloneTemplateStructure: respects provided name', () => {
  const source = { name: 'Original', description: null, structureJson: { phases: [] } } as unknown as ProjectTemplate
  const clone = cloneTemplateStructure(source, 'Custom Name')
  assert.equal(clone.name, 'Custom Name')
})

test('countTemplateNodes: counts nested nodes', () => {
  const counts = countTemplateNodes({
    phases: [
      {
        name: 'P1',
        weight: 50,
        milestones: [
          { name: 'M1', activities: [{ title: 'A1' }, { title: 'A2' }] },
          { name: 'M2', activities: [{ title: 'A3' }] },
        ],
      },
      { name: 'P2', weight: 50, milestones: [{ name: 'M3', activities: [] }] },
    ],
  })
  assert.equal(counts.phases, 2)
  assert.equal(counts.milestones, 3)
  assert.equal(counts.activities, 3)
})
