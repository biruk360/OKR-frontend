import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isLateSubmission,
  isScrumWorkingDay,
  previousScrumWorkingDay,
  scrumBusinessDaysBetween,
  toScrumDateKey,
} from './working-days'

const settings = {
  timezone: 'Africa/Addis_Ababa',
  workingDays: [1, 2, 3, 4, 5],
  holidays: ['2026-07-10'],
}

describe('scrum working-day utilities', () => {
  it('uses the configured timezone for date keys', () => {
    assert.equal(toScrumDateKey(new Date('2026-07-12T21:30:00.000Z'), settings), '2026-07-13')
  })

  it('excludes weekends and configured holidays', () => {
    assert.equal(isScrumWorkingDay(new Date('2026-07-10T09:00:00.000Z'), settings), false)
    assert.equal(isScrumWorkingDay(new Date('2026-07-11T09:00:00.000Z'), settings), false)
    assert.equal(isScrumWorkingDay(new Date('2026-07-13T09:00:00.000Z'), settings), true)
  })

  it('finds the previous working day across weekend plus holiday', () => {
    const previous = previousScrumWorkingDay(new Date('2026-07-13T09:00:00.000Z'), settings)
    assert.equal(previous?.toISOString().slice(0, 10), '2026-07-09')
  })

  it('counts scrum business days using configured holidays', () => {
    const count = scrumBusinessDaysBetween(
      new Date('2026-07-09T09:00:00.000Z'),
      new Date('2026-07-13T09:00:00.000Z'),
      settings,
    )
    assert.equal(count, 1)
  })

  it('detects lateness against the configured cutoff', () => {
    assert.equal(
      isLateSubmission(
        new Date('2026-07-13T06:10:00.000Z'),
        new Date('2026-07-13T00:00:00.000Z'),
        { ...settings, cutoffTime: '09:00' },
      ),
      true,
    )
  })
})
