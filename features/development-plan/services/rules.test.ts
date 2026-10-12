import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyDevelopmentStatePatch,
  composeEvidenceNote,
  computeDevelopmentRule,
  hasEvidence,
  isDevelopmentDueSoon,
  isDevelopmentOverdue,
  isHttpUrl,
  sortDevelopmentItems,
  splitEvidenceNote,
  statusAfterLoggingHours,
  formatHours,
} from './rules'
import {
  addDevelopmentHoursSchema,
  createDevelopmentItemSchema,
  updateDevelopmentItemSchema,
} from './schemas'
import { dropFormSchema, markDoneEvidenceError, toDevelopmentWriteBody, toDevelopmentFormValues } from './form'
import type { DevelopmentItemDTO } from '../types'

const NOW = new Date('2026-10-12T10:00:00.000Z')

describe('evidence note format (DEV-1)', () => {
  it('round-trips note + link', () => {
    const stored = composeEvidenceNote({ note: 'Cert no. 123', url: 'https://example.com/cert.pdf' })
    assert.equal(stored, 'Cert no. 123\n\nEvidence link: https://example.com/cert.pdf')
    assert.deepEqual(splitEvidenceNote(stored), { note: 'Cert no. 123', url: 'https://example.com/cert.pdf' })
  })
  it('handles link only, note only and empty', () => {
    assert.deepEqual(splitEvidenceNote(composeEvidenceNote({ url: 'https://x.io' })), { note: null, url: 'https://x.io' })
    assert.deepEqual(splitEvidenceNote(composeEvidenceNote({ note: 'Done' })), { note: 'Done', url: null })
    assert.equal(composeEvidenceNote({ note: '  ', url: '' }), null)
    assert.deepEqual(splitEvidenceNote(null), { note: null, url: null })
  })
  it('leaves a free-text note with a link in the middle alone', () => {
    const text = 'See https://x.io for details\nthanks'
    assert.deepEqual(splitEvidenceNote(text), { note: text, url: null })
  })
  it('hasEvidence / isHttpUrl', () => {
    assert.equal(hasEvidence('Evidence link: https://x.io'), true)
    assert.equal(hasEvidence('   '), false)
    assert.equal(isHttpUrl('https://x.io/a'), true)
    assert.equal(isHttpUrl('javascript:alert(1)'), false)
    assert.equal(isHttpUrl('ftp://x.io'), false)
    assert.equal(isHttpUrl('not a url'), false)
  })
})

describe('overdue / due soon (DEV-4)', () => {
  it('overdue only when open and due before today', () => {
    assert.equal(isDevelopmentOverdue({ status: 'IN_PROGRESS', dueDate: '2026-10-11T00:00:00.000Z' }, NOW), true)
    assert.equal(isDevelopmentOverdue({ status: 'NOT_STARTED', dueDate: '2026-10-12T00:00:00.000Z' }, NOW), false)
    assert.equal(isDevelopmentOverdue({ status: 'DONE', dueDate: '2026-01-01T00:00:00.000Z' }, NOW), false)
    assert.equal(isDevelopmentOverdue({ status: 'DROPPED', dueDate: '2026-01-01T00:00:00.000Z' }, NOW), false)
    assert.equal(isDevelopmentOverdue({ status: 'IN_PROGRESS', dueDate: null }, NOW), false)
  })
  it('due soon within 14 days inclusive', () => {
    assert.equal(isDevelopmentDueSoon({ status: 'IN_PROGRESS', dueDate: '2026-10-26T00:00:00.000Z' }, NOW), true)
    assert.equal(isDevelopmentDueSoon({ status: 'IN_PROGRESS', dueDate: '2026-10-27T00:00:00.000Z' }, NOW), false)
    assert.equal(isDevelopmentDueSoon({ status: 'IN_PROGRESS', dueDate: '2026-10-11T00:00:00.000Z' }, NOW), false)
    assert.equal(isDevelopmentDueSoon({ status: 'DONE', dueDate: '2026-10-20T00:00:00.000Z' }, NOW), false)
  })
})

describe('yearly rule (DEV-3)', () => {
  it('defaults to 1 item and 40 hours', () => {
    const rule = computeDevelopmentRule([])
    assert.equal(rule.itemsRequired, 1)
    assert.equal(rule.hoursRequired, 40)
    assert.equal(rule.itemsMet, false)
    assert.equal(rule.hoursPercent, 0)
  })
  it('counts DONE certifications/courses and hours on non-dropped items', () => {
    const rule = computeDevelopmentRule(
      [
        { kind: 'CERTIFICATION', status: 'DONE', hoursLogged: 10 },
        { kind: 'COURSE', status: 'IN_PROGRESS', hoursLogged: 12.5 },
        { kind: 'TRAINING_HOURS', status: 'DONE', hoursLogged: 20 },
        { kind: 'COURSE', status: 'DROPPED', hoursLogged: 30 },
        { kind: 'MENTORING', status: 'DONE', hoursLogged: 0 },
      ],
      { devMinItems: 2, devMinHours: 40 },
    )
    assert.equal(rule.itemsDone, 1)
    assert.equal(rule.itemsRequired, 2)
    assert.equal(rule.itemsPercent, 50)
    assert.equal(rule.hoursLogged, 42.5)
    assert.equal(rule.hoursMet, true)
    assert.equal(rule.hoursPercent, 100)
  })
  it('a zero requirement is met', () => {
    const rule = computeDevelopmentRule([], { devMinItems: 0, devMinHours: 0 })
    assert.equal(rule.itemsMet, true)
    assert.equal(rule.hoursMet, true)
    assert.equal(rule.itemsPercent, 100)
  })
})

describe('status transitions (DEV-2, DEV-5)', () => {
  const base = { kind: 'CERTIFICATION', status: 'IN_PROGRESS', evidenceNote: null, dropReason: null, completedAt: null }

  it('DONE on a certification needs evidence', () => {
    const r = applyDevelopmentStatePatch(base, { status: 'DONE' }, NOW)
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.code, 'EVIDENCE_REQUIRED')
  })
  it('DONE with a link only is enough; completedAt defaults to now', () => {
    const r = applyDevelopmentStatePatch(base, { status: 'DONE', evidenceUrl: 'https://x.io/c.pdf' }, NOW)
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.equal(r.next.status, 'DONE')
      assert.equal(r.next.completedAt?.toISOString(), NOW.toISOString())
      assert.equal(r.next.evidenceNote, 'Evidence link: https://x.io/c.pdf')
      assert.equal(r.statusChanged, true)
    }
  })
  it('DONE on TRAINING_HOURS needs no evidence', () => {
    const r = applyDevelopmentStatePatch({ ...base, kind: 'TRAINING_HOURS' }, { status: 'DONE' }, NOW)
    assert.equal(r.ok, true)
  })
  it('clearing evidence on a DONE course is rejected; switching a DONE item to COURSE without evidence too', () => {
    const done = { ...base, kind: 'COURSE', status: 'DONE', evidenceNote: 'Completed', completedAt: NOW }
    const cleared = applyDevelopmentStatePatch(done, { evidenceNote: null }, NOW)
    assert.equal(cleared.ok, false)
    const other = { ...base, kind: 'OTHER', status: 'DONE', completedAt: NOW }
    const switched = applyDevelopmentStatePatch(other, { kind: 'COURSE' }, NOW)
    assert.equal(switched.ok, false)
  })
  it('editing only the note keeps the stored link', () => {
    const withBoth = { ...base, evidenceNote: 'Old\n\nEvidence link: https://x.io' }
    const r = applyDevelopmentStatePatch(withBoth, { evidenceNote: 'New' }, NOW)
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.next.evidenceNote, 'New\n\nEvidence link: https://x.io')
  })
  it('rejects a non-http evidence link', () => {
    const r = applyDevelopmentStatePatch(base, { evidenceUrl: 'javascript:alert(1)' }, NOW)
    assert.equal(r.ok, false)
    if (!r.ok) assert.equal(r.code, 'INVALID_EVIDENCE_URL')
  })
  it('DROPPED needs a reason of at least 10 characters', () => {
    const short = applyDevelopmentStatePatch(base, { status: 'DROPPED', dropReason: 'too busy' }, NOW)
    assert.equal(short.ok, false)
    if (!short.ok) assert.equal(short.code, 'DROP_REASON_REQUIRED')
    const missing = applyDevelopmentStatePatch(base, { status: 'DROPPED' }, NOW)
    assert.equal(missing.ok, false)
    const ok = applyDevelopmentStatePatch(base, { status: 'DROPPED', dropReason: '  Budget moved to next year ' }, NOW)
    assert.equal(ok.ok, true)
    if (ok.ok) assert.equal(ok.next.dropReason, 'Budget moved to next year')
  })
  it('leaving DROPPED clears the reason; leaving DONE clears completedAt', () => {
    const dropped = { ...base, status: 'DROPPED', dropReason: 'Budget moved to next year' }
    const restored = applyDevelopmentStatePatch(dropped, { status: 'IN_PROGRESS' }, NOW)
    assert.equal(restored.ok, true)
    if (restored.ok) assert.equal(restored.next.dropReason, null)
    const done = { ...base, status: 'DONE', evidenceNote: 'x', completedAt: new Date('2026-09-01T00:00:00.000Z') }
    const reopened = applyDevelopmentStatePatch(done, { status: 'IN_PROGRESS' }, NOW)
    assert.equal(reopened.ok, true)
    if (reopened.ok) assert.equal(reopened.next.completedAt, null)
  })
  it('keeps the original completedAt when a DONE item is edited', () => {
    const at = new Date('2026-09-01T00:00:00.000Z')
    const done = { ...base, status: 'DONE', evidenceNote: 'x', completedAt: at }
    const r = applyDevelopmentStatePatch(done, { evidenceNote: 'y' }, NOW)
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.equal(r.next.completedAt, at)
      assert.equal(r.statusChanged, false)
    }
  })
  it('logging hours starts a NOT_STARTED item', () => {
    assert.equal(statusAfterLoggingHours('NOT_STARTED'), 'IN_PROGRESS')
    assert.equal(statusAfterLoggingHours('DONE'), 'DONE')
  })
})

describe('ordering', () => {
  it('overdue first, then by due date, undated last, then done, then dropped', () => {
    const items = [
      { title: 'dropped', status: 'DROPPED', dueDate: null },
      { title: 'done-old', status: 'DONE', dueDate: null, completedAt: '2026-01-01' },
      { title: 'done-new', status: 'DONE', dueDate: null, completedAt: '2026-09-01' },
      { title: 'undated', status: 'IN_PROGRESS', dueDate: null },
      { title: 'later', status: 'NOT_STARTED', dueDate: '2026-12-01' },
      { title: 'sooner', status: 'NOT_STARTED', dueDate: '2026-11-01' },
      { title: 'overdue', status: 'IN_PROGRESS', dueDate: '2026-10-01', overdue: true },
    ]
    assert.deepEqual(
      sortDevelopmentItems(items).map((i) => i.title),
      ['overdue', 'sooner', 'later', 'undated', 'done-new', 'done-old', 'dropped'],
    )
  })
  it('formats hours', () => {
    assert.equal(formatHours(40), '40')
    assert.equal(formatHours(12.5), '12.5')
    assert.equal(formatHours(null), '0')
  })
})

describe('API schemas', () => {
  it('create: defaults and date parsing', () => {
    const r = createDevelopmentItemSchema.safeParse({
      ownerId: 'u1',
      timeframeId: 't1',
      title: ' AWS cert ',
      kind: 'CERTIFICATION',
      targetText: 'Certified',
      dueDate: '2027-03-31',
    })
    assert.equal(r.success, true)
    if (r.success) {
      assert.equal(r.data.title, 'AWS cert')
      assert.equal(r.data.status, 'NOT_STARTED')
      assert.equal(r.data.hoursLogged, 0)
      assert.equal(r.data.dueDate?.toISOString(), '2027-03-31T00:00:00.000Z')
      assert.equal(r.data.keyResultId, null)
    }
  })
  it('create: DONE / DROPPED are not creatable statuses', () => {
    const r = createDevelopmentItemSchema.safeParse({
      ownerId: 'u1', timeframeId: 't1', title: 'x', kind: 'COURSE', targetText: 'y', status: 'DONE',
    })
    assert.equal(r.success, false)
  })
  it('update: empty body rejected; null clears', () => {
    assert.equal(updateDevelopmentItemSchema.safeParse({}).success, false)
    const r = updateDevelopmentItemSchema.safeParse({ dueDate: '', keyResultId: null, evidenceUrl: '' })
    assert.equal(r.success, true)
    if (r.success) {
      assert.equal(r.data.dueDate, null)
      assert.equal(r.data.keyResultId, null)
      assert.equal(r.data.evidenceUrl, null)
      assert.equal(r.data.title, undefined)
    }
  })
  it('hours: positive and bounded', () => {
    assert.equal(addDevelopmentHoursSchema.safeParse({ hours: 0 }).success, false)
    assert.equal(addDevelopmentHoursSchema.safeParse({ hours: -2 }).success, false)
    assert.equal(addDevelopmentHoursSchema.safeParse({ hours: 5000 }).success, false)
    assert.equal(addDevelopmentHoursSchema.safeParse({ hours: '3' }).success, false)
    const ok = addDevelopmentHoursSchema.safeParse({ hours: 2.5, note: 'Module 1' })
    assert.equal(ok.success, true)
  })
})

describe('form helpers', () => {
  const item: DevelopmentItemDTO = {
    id: 'd1', externalRef: null, ownerId: 'u1', timeframeId: 't1', packageId: null, title: 'AWS', kind: 'CERTIFICATION',
    targetText: 'Certified', targetHours: null, hoursLogged: 4, dueDate: '2027-03-31T00:00:00.000Z', keyResultId: null,
    keyResult: null, status: 'IN_PROGRESS', completedAt: null, evidence: { note: 'n', url: null }, evidenceNote: 'n',
    dropReason: null, isMandatory: true, overdue: false, dueSoon: false, requiresEvidence: true,
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  }
  it('edit body sends evidence and hours only when changed', () => {
    const values = toDevelopmentFormValues(item)
    assert.equal(values.dueDate, '2027-03-31')
    const body = toDevelopmentWriteBody(values, item)
    assert.equal('evidenceNote' in body, false)
    assert.equal('hoursLogged' in body, false)
    const changed = toDevelopmentWriteBody({ ...values, evidenceUrl: 'https://x.io', hoursLogged: '6' }, item)
    assert.equal(changed.evidenceUrl, 'https://x.io')
    assert.equal(changed.hoursLogged, 6)
  })
  it('mark-done and drop form checks', () => {
    assert.ok(markDoneEvidenceError('COURSE', { evidenceNote: ' ', evidenceUrl: '' }))
    assert.equal(markDoneEvidenceError('COURSE', { evidenceNote: '', evidenceUrl: 'https://x.io' }), null)
    assert.equal(markDoneEvidenceError('OTHER', { evidenceNote: '', evidenceUrl: '' }), null)
    assert.equal(dropFormSchema.safeParse({ dropReason: 'short' }).success, false)
    assert.equal(dropFormSchema.safeParse({ dropReason: 'long enough reason' }).success, true)
  })
})
