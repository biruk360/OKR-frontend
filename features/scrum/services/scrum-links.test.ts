import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { deriveLinkType, scrumLinkInputSchema } from './scrum-links'

describe('scrum link validation', () => {
  it('accepts exactly one linked entity and derives link type server-side', () => {
    const parsed = scrumLinkInputSchema.safeParse({ keyResultId: 'kr-1', context: 'TODAY' })
    assert.equal(parsed.success, true)
    assert.equal(deriveLinkType({ keyResultId: 'kr-1' }), 'KEY_RESULT')
    assert.equal(deriveLinkType({ objectiveId: 'obj-1' }), 'OBJECTIVE')
    assert.equal(deriveLinkType({ todoId: 'todo-1' }), 'TODO')
  })

  it('rejects zero linked entities', () => {
    const parsed = scrumLinkInputSchema.safeParse({ context: 'TODAY' })
    assert.equal(parsed.success, false)
  })

  it('rejects multiple linked entities in one link row', () => {
    const parsed = scrumLinkInputSchema.safeParse({ objectiveId: 'obj-1', keyResultId: 'kr-1', context: 'BLOCKER' })
    assert.equal(parsed.success, false)
  })
})
