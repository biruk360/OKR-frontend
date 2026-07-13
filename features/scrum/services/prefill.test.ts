import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeInheritedLinks, parsePlanItems } from './prefill'

describe('scrum prefill carry-forward helpers', () => {
  it('parses HTML plans into carryable line items', () => {
    const items = parsePlanItems('<p>Finish API route</p><p>Review blocker queue</p>')
    assert.deepEqual(items.map((item) => item.text), ['Finish API route', 'Review blocker queue'])
  })

  it('inherits prior today/yesterday links as today links and deduplicates them', () => {
    const inherited = normalizeInheritedLinks([
      { keyResultId: 'kr-1', context: 'TODAY' },
      { keyResultId: 'kr-1', context: 'YESTERDAY' },
      { todoId: 'todo-1', context: 'BLOCKER' },
      { objectiveId: 'obj-1', context: null },
    ])

    assert.deepEqual(inherited, [
      { objectiveId: null, keyResultId: 'kr-1', todoId: null, context: 'TODAY', progressNote: null },
      { objectiveId: 'obj-1', keyResultId: null, todoId: null, context: 'TODAY', progressNote: null },
    ])
  })
})
