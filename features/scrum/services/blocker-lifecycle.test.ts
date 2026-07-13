import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { blockerSimilarity, decideBlockerLifecycle } from './blocker-lifecycle'

const settings = {
  timezone: 'Africa/Addis_Ababa',
  workingDays: [1, 2, 3, 4, 5],
  holidays: ['2026-07-10'],
  recurringThresholdDays: 2,
  escalationThresholdDays: 3,
}

describe('blocker lifecycle', () => {
  it('opens a new blocker with today as first-raised date', () => {
    const now = new Date('2026-07-13T09:00:00.000Z')
    const decision = decideBlockerLifecycle({
      text: 'Waiting for VPN access',
      category: 'ENVIRONMENT_ACCESS',
      now,
      settings,
    })

    assert.equal(decision.hasBlocker, true)
    assert.equal(decision.status, 'OPEN')
    assert.equal(decision.daysOpen, 1)
    assert.equal(decision.firstRaisedAt?.toISOString(), now.toISOString())
  })

  it('marks the same working-day-aware blocker as recurring after the threshold', () => {
    const decision = decideBlockerLifecycle({
      previousText: 'Waiting for client approval on launch scope',
      previousCategory: 'CLIENT_APPROVAL',
      previousStatus: 'OPEN',
      previousFirstRaisedAt: new Date('2026-07-08T09:00:00.000Z'),
      text: 'Waiting for client approval on launch scope',
      category: 'CLIENT_APPROVAL',
      now: new Date('2026-07-13T09:00:00.000Z'),
      settings,
    })

    assert.equal(decision.status, 'RECURRING')
    assert.equal(decision.daysOpen, 2)
    assert.equal(decision.firstRaisedAt?.toISOString(), '2026-07-08T09:00:00.000Z')
  })

  it('keeps an escalated blocker escalated until it is resolved', () => {
    const decision = decideBlockerLifecycle({
      previousText: 'Blocked by production database credentials',
      previousCategory: 'ENVIRONMENT_ACCESS',
      previousStatus: 'ESCALATED',
      previousFirstRaisedAt: new Date('2026-07-13T09:00:00.000Z'),
      text: 'Blocked by production database credentials',
      category: 'ENVIRONMENT_ACCESS',
      now: new Date('2026-07-14T09:00:00.000Z'),
      settings,
    })

    assert.equal(decision.status, 'ESCALATED')
  })

  it('asks for confirmation on fuzzy same-category matches below auto-match threshold', () => {
    const decision = decideBlockerLifecycle({
      previousText: 'Client has not approved the security questionnaire',
      previousCategory: 'CLIENT_APPROVAL',
      previousStatus: 'OPEN',
      previousFirstRaisedAt: new Date('2026-07-13T09:00:00.000Z'),
      text: 'Client has not approved questionnaire',
      category: 'CLIENT_APPROVAL',
      now: new Date('2026-07-14T09:00:00.000Z'),
      settings,
    })

    assert.equal(decision.shouldAskSameBlocker, true)
    assert.ok(blockerSimilarity('Client approved questionnaire', 'Client not approved questionnaire') >= 0.65)
  })
})
