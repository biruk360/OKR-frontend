import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dedupeScrumLinks, deriveItemLinks, deriveLinkType, scrumLinkInputSchema } from './scrum-links'

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

describe('scrum link derivation (spec S11)', () => {
  it('turns OKR picks in every section into links with the section as context', () => {
    const links = deriveItemLinks({
      yesterdayItems: [{ objectiveId: 'o1' }],
      todayItems: [{ keyResultId: 'kr1' }, {}],
      blockerItems: [{ objectiveId: 'o2', keyResultId: 'kr2' }],
      winItems: [{ keyResultId: 'kr1' }],
    })
    assert.deepEqual(
      links.map((l) => `${l.context}:${l.objectiveId ?? l.keyResultId}`),
      ['YESTERDAY:o1', 'TODAY:kr1', 'BLOCKER:o2', 'BLOCKER:kr2', 'WIN:kr1'],
    )
  })

  it('dedupes by (context, entity) so the unique constraints cannot fail', () => {
    const links = dedupeScrumLinks([
      { context: 'TODAY', keyResultId: 'kr1' },
      { context: 'TODAY', keyResultId: 'kr1', progressNote: 'dup' },
      { context: 'WIN', keyResultId: 'kr1' },
      { context: 'TODAY', objectiveId: 'kr1' },
    ])
    assert.equal(links.length, 3)
    assert.equal(links[0].progressNote, undefined)
  })
})
