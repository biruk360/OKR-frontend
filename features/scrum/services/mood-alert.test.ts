import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isRedTeamMoodDay, shouldSendTeamMoodAlert, trailingRedMoodStreak, type MoodReport } from './mood-alert'

const day = (...moods: string[]): MoodReport[] => moods.map((mood, i) => ({ userId: `u${i}`, mood }))

describe('team mood alert', () => {
  it('needs at least three reporters so one person is never exposed', () => {
    assert.equal(isRedTeamMoodDay(day('STRUGGLING', 'STRUGGLING')), false)
    assert.equal(isRedTeamMoodDay(day('STRUGGLING', 'STRUGGLING', 'GOOD')), true)
  })

  it('is red only when at least half of reported moods are struggling', () => {
    assert.equal(isRedTeamMoodDay(day('STRUGGLING', 'OKAY', 'GOOD', 'GOOD')), false)
    assert.equal(isRedTeamMoodDay(day('STRUGGLING', 'STRUGGLING', 'GOOD', 'OKAY')), true)
    assert.equal(isRedTeamMoodDay([{ userId: 'a', mood: null }, { userId: 'b', mood: null }, { userId: 'c', mood: null }]), false)
  })

  it('counts consecutive red days ending at the latest day', () => {
    const red = day('STRUGGLING', 'STRUGGLING', 'OKAY')
    const green = day('GOOD', 'GOOD', 'GOOD')
    const keys = ['d1', 'd2', 'd3', 'd4']
    const reports = new Map([['d1', red], ['d2', green], ['d3', red], ['d4', red]])
    assert.equal(trailingRedMoodStreak(keys, reports), 2)
    assert.equal(trailingRedMoodStreak(keys, new Map([['d4', green]])), 0)
  })

  it('alerts on the threshold day and once per further threshold run', () => {
    assert.equal(shouldSendTeamMoodAlert(9, 10), false)
    assert.equal(shouldSendTeamMoodAlert(10, 10), true)
    assert.equal(shouldSendTeamMoodAlert(11, 10), false)
    assert.equal(shouldSendTeamMoodAlert(20, 10), true)
  })
})
