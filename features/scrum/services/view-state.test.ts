import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  calendarFetchRange,
  isDateKey,
  isoWeekBounds,
  monthBounds,
  normalizeSavedViewFilters,
  parseScrumDeepLink,
  scrumDateKeyOf,
  stepDateKey,
} from './view-state'

const params = (query: string) => new URLSearchParams(query)

describe('scrum view-state', () => {
  it('returns the ISO week (Mon–Sun) containing the date', () => {
    assert.deepEqual(isoWeekBounds('2026-09-25'), { from: '2026-09-21', to: '2026-09-27' }) // Friday
    assert.deepEqual(isoWeekBounds('2026-09-21'), { from: '2026-09-21', to: '2026-09-27' }) // Monday
    assert.deepEqual(isoWeekBounds('2026-09-27'), { from: '2026-09-21', to: '2026-09-27' }) // Sunday
  })

  it('covers a week that straddles the month boundary', () => {
    assert.deepEqual(monthBounds('2026-10-01'), { from: '2026-10-01', to: '2026-10-31' })
    assert.deepEqual(calendarFetchRange('2026-10-01'), { from: '2026-09-28', to: '2026-10-31' })
    assert.deepEqual(calendarFetchRange('2026-09-15'), { from: '2026-09-01', to: '2026-09-30' })
  })

  it('steps by the active view unit and clamps month ends', () => {
    assert.equal(stepDateKey('2026-01-31', 'month', 1), '2026-02-28')
    assert.equal(stepDateKey('2026-09-25', 'week', -1), '2026-09-18')
    assert.equal(stepDateKey('2026-09-25', 'day', 1), '2026-09-26')
    assert.equal(stepDateKey('2026-12-15', 'month', 1), '2027-01-15')
  })

  it('parses notification deep links and drops invalid values', () => {
    assert.deepEqual(parseScrumDeepLink(params('update=clx123abc')), { updateId: 'clx123abc', view: 'day' })
    assert.deepEqual(parseScrumDeepLink(params('date=2026-09-25')), { date: '2026-09-25', view: 'day' })
    assert.deepEqual(parseScrumDeepLink(params('view=week&date=2026-09-25')), { date: '2026-09-25', view: 'week' })
    assert.deepEqual(parseScrumDeepLink(params('date=2026-02-30&update=<script>&view=evil')), {})
    assert.deepEqual(parseScrumDeepLink(null), {})
  })

  it('validates date keys strictly', () => {
    assert.equal(isDateKey('2026-09-25'), true)
    assert.equal(isDateKey('2026-13-01'), false)
    assert.equal(isDateKey('25/09/2026'), false)
    assert.equal(scrumDateKeyOf('2026-09-25T00:00:00.000Z'), '2026-09-25')
  })

  it('normalises untrusted saved-view JSON', () => {
    assert.deepEqual(normalizeSavedViewFilters({ hasBlocker: true, hasWin: 'yes', state: 'late', view: 'week' }), {
      hasBlocker: true,
      hasWin: false,
      state: 'late',
      view: 'week',
    })
    assert.deepEqual(normalizeSavedViewFilters({ state: 'drop table', view: 'x' }), { hasBlocker: false, hasWin: false, state: '' })
    assert.deepEqual(normalizeSavedViewFilters(null), { hasBlocker: false, hasWin: false, state: '' })
  })
})
