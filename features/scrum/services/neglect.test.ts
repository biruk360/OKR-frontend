import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { decideNeglectAlert, neglectWindowStart, objectiveMentionsFromContent } from './neglect'
import { toScrumDateKey } from './working-days'

const settings = { timezone: 'Africa/Addis_Ababa', workingDays: [1, 2, 3, 4, 5], holidays: ['2026-09-11'] }

describe('objective neglect — window', () => {
  it('spans the last N completed working days, skipping weekends and holidays', () => {
    // Mon 2026-09-28: 14 working days back (excl. today, weekends, 2026-09-11) → Mon 2026-09-07.
    const start = neglectWindowStart('2026-09-28', 14, settings)
    assert.equal(start && toScrumDateKey(start, settings), '2026-09-07')
  })

  it('a 1-day window is the previous working day', () => {
    const start = neglectWindowStart('2026-09-28', 1, settings)
    assert.equal(start && toScrumDateKey(start, settings), '2026-09-25')
  })
})

describe('objective neglect — once per neglect period', () => {
  const windowStart = new Date('2026-09-08T00:00:00.000Z')

  it('never alerts an objective mentioned inside the window', () => {
    assert.equal(decideNeglectAlert({ mentionedInWindow: true, lastAlertDate: null, windowStart, mentionedSinceLastAlert: false }), false)
  })

  it('alerts a never-alerted neglected objective', () => {
    assert.equal(decideNeglectAlert({ mentionedInWindow: false, lastAlertDate: null, windowStart, mentionedSinceLastAlert: false }), true)
  })

  it('does not repeat on the following nights of the same period', () => {
    for (const d of ['2026-09-08', '2026-09-20', '2026-09-28']) {
      assert.equal(decideNeglectAlert({ mentionedInWindow: false, lastAlertDate: new Date(`${d}T00:00:00.000Z`), windowStart, mentionedSinceLastAlert: false }), false, d)
    }
  })

  it('does not repeat when the objective stayed silent since an older alert', () => {
    assert.equal(decideNeglectAlert({ mentionedInWindow: false, lastAlertDate: new Date('2026-08-01T00:00:00.000Z'), windowStart, mentionedSinceLastAlert: false }), false)
  })

  it('alerts again once the objective recovered and then went silent for a full window', () => {
    assert.equal(decideNeglectAlert({ mentionedInWindow: false, lastAlertDate: new Date('2026-08-01T00:00:00.000Z'), windowStart, mentionedSinceLastAlert: true }), true)
  })
})

describe('objective neglect — mention sources', () => {
  it('collects objective, KR and to-do references from every item section', () => {
    const refs = objectiveMentionsFromContent({
      yesterdayItems: [{ id: 'y', text: 'a', objectiveId: 'o1' }],
      todayItems: [{ id: 't', text: 'b', keyResultId: 'kr1', todoId: 'td1' }],
      blockerItems: [{ id: 'b', text: 'c', objectiveId: 'o2' }],
      winItems: [{ id: 'w', text: 'd', keyResultId: 'kr2' }],
    })
    assert.deepEqual(refs.objectiveIds.sort(), ['o1', 'o2'])
    assert.deepEqual(refs.keyResultIds.sort(), ['kr1', 'kr2'])
    assert.deepEqual(refs.todoIds, ['td1'])
    assert.deepEqual(objectiveMentionsFromContent(null), { objectiveIds: [], keyResultIds: [], todoIds: [] })
  })

  it('the health job uses the window, a ScrumJobRun marker, all link contexts and to-do/KR ties', () => {
    const source = readFileSync(path.join(process.cwd(), 'features/scrum/services/scrum-jobs.ts'), 'utf8')
    const fn = source.slice(source.indexOf('async function runObjectiveNeglectAlerts'), source.indexOf('async function runTeamMoodAlerts'))
    assert.match(fn, /objectiveNeglectDays/)
    assert.match(fn, /scrumDate: \{ gte: windowStart \}/)
    assert.match(fn, /OBJECTIVE_NEGLECT_JOB_KEY/)
    assert.match(fn, /keyResultId: \{ in: krIds \}/)
    assert.match(fn, /todo: \{ OR:/)
    assert.doesNotMatch(fn, /context:/, 'neglect must count every link context, not only WIN')
    assert.match(fn, /P2002/)
  })
})
