import test from 'node:test'
import assert from 'node:assert/strict'
import { AUTO_SECTION_ID, defaultTaskPlacement, ensureTaskPlacement } from './schedule-creation'

test('blank schedules offer an automatic General section', () => {
  assert.deepEqual(defaultTaskPlacement([]), { sectionId: AUTO_SECTION_ID, subsectionId: '' })
})

test('first task creates its missing section and subsection', async () => {
  const calls: string[] = []
  const placement = await ensureTaskPlacement({
    sectionId: AUTO_SECTION_ID,
    subsectionId: '',
    createSection: async (name) => {
      calls.push(`section:${name}`)
      return { id: 'phase-1' }
    },
    createSubsection: async (sectionId, name) => {
      calls.push(`subsection:${sectionId}:${name}`)
      return { id: 'milestone-1' }
    },
  })

  assert.deepEqual(placement, { sectionId: 'phase-1', subsectionId: 'milestone-1' })
  assert.deepEqual(calls, ['section:General', 'subsection:phase-1:General'])
})

test('existing task placement is reused without creating hierarchy', async () => {
  const placement = await ensureTaskPlacement({
    sectionId: 'phase-1',
    subsectionId: 'milestone-1',
    createSection: async () => assert.fail('section should not be created'),
    createSubsection: async () => assert.fail('subsection should not be created'),
  })

  assert.deepEqual(placement, { sectionId: 'phase-1', subsectionId: 'milestone-1' })
})
