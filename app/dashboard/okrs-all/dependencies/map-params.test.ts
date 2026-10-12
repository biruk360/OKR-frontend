import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { activeFilterCount, dependencyMapQuery, parseDependencyMapState } from './map-params'

describe('parseDependencyMapState', () => {
  it('reads every DEP-6 filter and drops invalid values', () => {
    const state = parseDependencyMapState(
      new URLSearchParams(
        'timeframeId=tf1&status=open,done,nope&type=decision,HIRE&providerId=u1&neederId=u2&due=late' +
          '&linkedType=KEY_RESULT&linkedId=kr1&linkedLabel=KR1.2&q=%20budget%20&scope=package&mine=1&view=graph',
      ),
    )
    assert.deepEqual(state.filters, {
      timeframeId: 'tf1',
      status: ['OPEN', 'DONE'],
      type: ['DECISION', 'HIRE'],
      providerId: 'u1',
      neederId: 'u2',
      due: 'late',
      linkedType: 'KEY_RESULT',
      linkedId: 'kr1',
      q: 'budget',
      scope: 'package',
      mine: true,
    })
    assert.equal(state.view, 'graph')
    assert.equal(state.linkedLabel, 'KR1.2')
  })

  it('ignores unknown windows, scopes, link types and the "all" timeframe', () => {
    const state = parseDependencyMapState({
      timeframeId: 'all',
      due: 'someday',
      scope: 'everything',
      linkedType: 'PROJECT',
      linkedId: 'x',
      view: 'kanban',
    })
    assert.deepEqual(state.filters, {})
    assert.equal(state.view, 'table')
    assert.equal(state.linkedLabel, null)
  })

  it('honours both deep-link spellings: ?dependency= and ?focus=', () => {
    assert.equal(parseDependencyMapState(new URLSearchParams('dependency=d1')).focusId, 'd1')
    assert.equal(parseDependencyMapState(new URLSearchParams('focus=d2')).focusId, 'd2')
    assert.equal(parseDependencyMapState(new URLSearchParams('dependency=d1&focus=d2')).focusId, 'd1')
    assert.equal(parseDependencyMapState({ focus: ['d3', 'd4'] }).focusId, 'd3')
  })
})

describe('dependencyMapQuery', () => {
  it('round-trips through parse', () => {
    const query =
      '?timeframeId=tf1&status=OPEN%2CBLOCKED&type=DATA&due=due_soon&linkedType=KEY_RESULT&linkedId=kr1&linkedLabel=KR+1&q=hire&view=graph&dependency=d9'
    const state = parseDependencyMapState(new URLSearchParams(query.slice(1)))
    assert.deepEqual(parseDependencyMapState(new URLSearchParams(dependencyMapQuery(state).slice(1))), state)
  })

  it('normalises ?focus= to ?dependency= and omits defaults', () => {
    const state = parseDependencyMapState(new URLSearchParams('focus=d1&view=table'))
    assert.equal(dependencyMapQuery(state), '?dependency=d1')
    assert.equal(dependencyMapQuery({ filters: {}, view: 'table', focusId: null, linkedLabel: null }), '')
  })
})

describe('activeFilterCount', () => {
  it('counts set filters only', () => {
    assert.equal(activeFilterCount({}), 0)
    assert.equal(activeFilterCount({ status: [], q: 'x', mine: true, linkedType: 'KEY_RESULT', linkedId: 'k' }), 3)
  })
})
