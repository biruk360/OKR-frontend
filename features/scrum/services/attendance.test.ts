import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { attendanceSafeUpdateData, decideProxyOverwrite } from './attendance'

describe('attendance stamp — preserved on edit (invariant #3)', () => {
  const stamp = { submittedAt: new Date('2026-09-28T07:10:00Z'), isLate: false, status: 'SUBMITTED', todayPlan: '<p>x</p>' }

  it('a first submit writes the full stamp', () => {
    assert.deepEqual(attendanceSafeUpdateData(stamp, false), stamp)
  })

  it('an amendment never rewrites submittedAt / isLate and records amendedAt + AMENDED', () => {
    const late = { ...stamp, submittedAt: new Date('2026-09-28T10:00:00Z'), isLate: true, status: 'LATE' }
    const data = attendanceSafeUpdateData(late, true) as Record<string, unknown>
    assert.equal('submittedAt' in data, false)
    assert.equal('isLate' in data, false)
    assert.equal(data.status, 'AMENDED')
    assert.ok(data.amendedAt instanceof Date)
    assert.equal(data.todayPlan, '<p>x</p>')
  })

  it('saveScrumUpdate routes both the PATCH and the upsert-update path through the guard', () => {
    const source = readFileSync(path.join(process.cwd(), 'features/scrum/services/scrum-updates.ts'), 'utf8')
    assert.match(source, /const amendData = attendanceSafeUpdateData\(updateData, baseline\.isAmend\)/)
    assert.match(source, /data: amendData \}/)
    assert.match(source, /update: amendData,/)
  })
})

describe('proxy entry — can never overwrite a self-report (invariant #5)', () => {
  it('rejects a proxy save over the subject\'s own submitted update', () => {
    for (const status of ['SUBMITTED', 'LATE', 'AMENDED', 'CONFIRMED']) {
      const decision = decideProxyOverwrite({ isProxy: true, existing: { status, isProxyEntry: false } })
      assert.equal(decision.ok, false, status)
    }
  })

  it('allows a proxy to create, replace an unsubmitted draft, or amend a proxy entry', () => {
    assert.deepEqual(decideProxyOverwrite({ isProxy: true, existing: null }), { ok: true })
    assert.deepEqual(decideProxyOverwrite({ isProxy: true, existing: { status: 'DRAFT', isProxyEntry: false } }), { ok: true })
    assert.deepEqual(decideProxyOverwrite({ isProxy: true, existing: { status: 'SUBMITTED', isProxyEntry: true } }), { ok: true })
  })

  it('never blocks the owner', () => {
    assert.deepEqual(decideProxyOverwrite({ isProxy: false, existing: { status: 'SUBMITTED', isProxyEntry: true } }), { ok: true })
  })

  it('the save path returns 409 before any write', () => {
    const source = readFileSync(path.join(process.cwd(), 'features/scrum/services/scrum-updates.ts'), 'utf8')
    const guard = source.indexOf('decideProxyOverwrite({')
    assert.ok(guard > 0)
    assert.ok(guard < source.indexOf('if (input.asDraft) {\n    const decision'))
    assert.ok(guard < source.indexOf('prisma.$transaction'))
    assert.match(source, /return \{ conflict: apiConflict\(/)
  })
})
