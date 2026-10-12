import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  batchOptions,
  countByView,
  decisionsPageQuery,
  matchesBatch,
  matchesLogView,
  NO_BATCH,
  orderDecisionLog,
  parseDecisionsPageState,
} from './decisions-params'

const item = (p: Partial<{ status: 'OPEN' | 'DECIDED' | 'DEFERRED' | 'WITHDRAWN'; batch: string | null; neededBy: string | null; decidedAt: string | null; updatedAt: string; title: string }>) => ({
  status: 'OPEN' as const,
  batch: null,
  neededBy: null,
  decidedAt: null,
  updatedAt: '2026-10-01T00:00:00.000Z',
  title: 'x',
  ...p,
})

describe('parseDecisionsPageState / decisionsPageQuery', () => {
  it('defaults to the open view and ignores unknown views and the all timeframe', () => {
    const s = parseDecisionsPageState(new URLSearchParams('view=kanban&timeframeId=all'))
    assert.equal(s.view, 'open')
    assert.equal(s.timeframeId, null)
    assert.equal(decisionsPageQuery(s), '')
  })

  it('honours ?decision= and ?focus= deep links and normalises to ?decision=', () => {
    assert.equal(parseDecisionsPageState(new URLSearchParams('decision=d1')).focusId, 'd1')
    const viaFocus = parseDecisionsPageState({ focus: 'd2' })
    assert.equal(viaFocus.focusId, 'd2')
    assert.equal(decisionsPageQuery(viaFocus), '?decision=d2')
  })

  it('round-trips every field', () => {
    const query = '?view=decided&timeframeId=tf&deciderId=me&requestedById=u1&batch=16+Oct&q=hire&decision=d9'
    const state = parseDecisionsPageState(new URLSearchParams(query.slice(1)))
    assert.deepEqual(parseDecisionsPageState(new URLSearchParams(decisionsPageQuery(state).slice(1))), state)
    assert.equal(state.batch, '16 Oct')
  })
})

describe('log filtering', () => {
  it('matches status views and batches, including "no batch"', () => {
    assert.equal(matchesLogView(item({ status: 'DECIDED' }), 'decided'), true)
    assert.equal(matchesLogView(item({ status: 'DECIDED' }), 'open'), false)
    assert.equal(matchesLogView(item({ status: 'WITHDRAWN' }), 'all'), true)
    assert.equal(matchesBatch(item({ batch: '16 Oct' }), '16 Oct'), true)
    assert.equal(matchesBatch(item({ batch: ' ' }), NO_BATCH), true)
    assert.equal(matchesBatch(item({ batch: '16 Oct' }), NO_BATCH), false)
    assert.equal(matchesBatch(item({ batch: '16 Oct' }), null), true)
  })

  it('counts per view', () => {
    const counts = countByView([item({}), item({ status: 'DECIDED' }), item({ status: 'DECIDED' }), item({ status: 'DEFERRED' })])
    assert.deepEqual(counts, { open: 1, decided: 2, deferred: 1, withdrawn: 0, all: 4 })
  })

  it('lists batches by their earliest needed-by and flags unbatched items', () => {
    const { batches, hasUnbatched } = batchOptions([
      item({ batch: '30 Oct', neededBy: '2026-10-30T00:00:00.000Z' }),
      item({ batch: '16 Oct', neededBy: '2026-10-16T00:00:00.000Z' }),
      item({ batch: '16 Oct', neededBy: '2026-10-20T00:00:00.000Z' }),
      item({ batch: 'Later' }),
      item({ batch: null }),
    ])
    assert.deepEqual(batches, ['16 Oct', '30 Oct', 'Later'])
    assert.equal(hasUnbatched, true)
  })

  it('orders open first (by the given comparator), then most recently decided', () => {
    const ordered = orderDecisionLog(
      [
        item({ title: 'old', status: 'DECIDED', decidedAt: '2026-09-01T00:00:00.000Z' }),
        item({ title: 'b', neededBy: '2026-10-20T00:00:00.000Z' }),
        item({ title: 'new', status: 'DECIDED', decidedAt: '2026-10-05T00:00:00.000Z' }),
        item({ title: 'a', status: 'DEFERRED', neededBy: '2026-10-10T00:00:00.000Z' }),
      ],
      (x, y) => (x.neededBy ?? '').localeCompare(y.neededBy ?? ''),
    )
    assert.deepEqual(
      ordered.map((d) => d.title),
      ['a', 'b', 'new', 'old'],
    )
  })
})
