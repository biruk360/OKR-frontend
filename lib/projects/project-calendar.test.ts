import assert from 'node:assert/strict'
import test from 'node:test'
import { projectCalendarDays, parseProjectDate, toProjectDateValue } from './project-calendar'

test('project date values parse and format without timezone drift', () => {
  const date = parseProjectDate('2026-08-07')
  assert.ok(date)
  assert.equal(date.getFullYear(), 2026)
  assert.equal(date.getMonth(), 7)
  assert.equal(date.getDate(), 7)
  assert.equal(toProjectDateValue(date), '2026-08-07')
})

test('invalid project date values are rejected', () => {
  assert.equal(parseProjectDate('2026-02-30'), null)
  assert.equal(parseProjectDate('not-a-date'), null)
  assert.equal(parseProjectDate(''), null)
})

test('project calendars always provide a stable six-week grid', () => {
  const days = projectCalendarDays(new Date(2026, 7, 1))
  assert.equal(days.length, 42)
  assert.equal(toProjectDateValue(days[0]), '2026-07-26')
  assert.equal(toProjectDateValue(days[41]), '2026-09-05')
})
