import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  SUBMITTED_SCRUM_UPDATE_WHERE,
  decideScrumDraftSave,
  excludeScrumDrafts,
  isScrumDraft,
  scrumSubmitBaseline,
} from './drafts'
import { scrumUpdateInputSchema, scrumUpdatePatchSchema } from './schemas'

const ROOT = process.cwd()

function walk(dir: string, match: (file: string) => boolean): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full, match))
    else if (match(full)) out.push(full)
  }
  return out
}

/** Returns the source text of every `<model>.<method>(...)` call (balanced parentheses). */
function callsIn(source: string, pattern: RegExp): string[] {
  const calls: string[] = []
  for (const match of source.matchAll(pattern)) {
    const open = (match.index ?? 0) + match[0].length - 1
    let depth = 0
    for (let i = open; i < source.length; i++) {
      if (source[i] === '(') depth++
      else if (source[i] === ')') {
        depth--
        if (depth === 0) {
          calls.push(source.slice(match.index, i + 1))
          break
        }
      }
    }
  }
  return calls
}

const COUNTING_READ = /\bscrumUpdate\.(findMany|findFirst|count|aggregate|groupBy)\(/g
const EXCLUDES_DRAFTS = /SUBMITTED_SCRUM_UPDATE_WHERE|excludeScrumDrafts|status:\s*\{\s*in:\s*\[/
/** Drafts are always stored with hasBlocker/hasWin = false, so these filters already exclude them. */
const DRAFT_SAFE_FLAG_FILTER = /hasBlocker:\s*true|hasWin:\s*true/
/** Reads that intentionally target drafts (restore-into-form). */
const READS_DRAFTS_ON_PURPOSE = /status:\s*SCRUM_DRAFT_STATUS/

describe('scrum drafts — helpers', () => {
  it('identifies the DRAFT status only', () => {
    assert.equal(isScrumDraft('DRAFT'), true)
    for (const status of ['SUBMITTED', 'LATE', 'AMENDED', 'CONFIRMED', null, undefined]) {
      assert.equal(isScrumDraft(status), false)
    }
  })

  it('adds the exclusion to any where clause without dropping filters', () => {
    const where = excludeScrumDrafts({ userId: 'u1', hasWin: true })
    assert.deepEqual(where, { userId: 'u1', hasWin: true, status: { not: 'DRAFT' } })
    assert.deepEqual(SUBMITTED_SCRUM_UPDATE_WHERE, { status: { not: 'DRAFT' } })
  })

  it('only lets the owner save a draft, and never over a submitted update', () => {
    assert.deepEqual(decideScrumDraftSave({ isProxy: false, existingStatus: null }), { ok: true })
    assert.deepEqual(decideScrumDraftSave({ isProxy: false, existingStatus: 'DRAFT' }), { ok: true })
    const proxy = decideScrumDraftSave({ isProxy: true, existingStatus: null })
    assert.equal(proxy.ok, false)
    assert.equal(!proxy.ok && proxy.reason, 'proxy')
    for (const status of ['SUBMITTED', 'LATE', 'AMENDED', 'CONFIRMED']) {
      const decision = decideScrumDraftSave({ isProxy: false, existingStatus: status })
      assert.equal(!decision.ok && decision.reason, 'already_submitted', status)
    }
  })

  it('treats submitting a draft as a first submit (side-effects run once), not an amend', () => {
    assert.deepEqual(scrumSubmitBaseline('DRAFT'), { fromDraft: true, isAmend: false })
    assert.deepEqual(scrumSubmitBaseline(null), { fromDraft: false, isAmend: false })
    assert.deepEqual(scrumSubmitBaseline('SUBMITTED'), { fromDraft: false, isAmend: true })
    assert.deepEqual(scrumSubmitBaseline('LATE'), { fromDraft: false, isAmend: true })
  })
})

describe('scrum drafts — input schema', () => {
  const base = { contentJson: { todayItems: [], blockerItems: [{ id: 'b1', text: 'Waiting on access' }] } }

  it('requires a blocker category on submit but not on a draft', () => {
    assert.equal(scrumUpdateInputSchema.safeParse(base).success, false)
    assert.equal(scrumUpdateInputSchema.safeParse({ ...base, asDraft: true }).success, true)
    assert.equal(scrumUpdatePatchSchema.safeParse({ ...base, asDraft: true }).success, true)
    assert.equal(scrumUpdatePatchSchema.safeParse(base).success, false)
  })
})

describe('scrum drafts — every counting read excludes DRAFT', () => {
  const files = [
    ...walk(path.join(ROOT, 'features/scrum/services'), (f) => f.endsWith('.ts') && !f.endsWith('.test.ts')),
    ...walk(path.join(ROOT, 'features/scrum/components'), (f) => f.endsWith('.tsx') || f.endsWith('.ts')),
    ...walk(path.join(ROOT, 'app/api/scrum'), (f) => f.endsWith('route.ts')),
    path.join(ROOT, 'lib/dashboards/home.server.ts'),
  ]

  it('scans a non-trivial set of reads', () => {
    const total = files.reduce((n, file) => n + callsIn(readFileSync(file, 'utf8'), COUNTING_READ).length, 0)
    assert.ok(total >= 12, `expected at least 12 scrumUpdate reads, found ${total}`)
  })

  for (const file of files) {
    const rel = path.relative(ROOT, file)
    const calls = callsIn(readFileSync(file, 'utf8'), COUNTING_READ)
    if (calls.length === 0) continue
    it(`${rel}: every findMany/findFirst/count excludes drafts`, () => {
      for (const call of calls) {
        assert.ok(
          EXCLUDES_DRAFTS.test(call) || READS_DRAFTS_ON_PURPOSE.test(call) || DRAFT_SAFE_FLAG_FILTER.test(call),
          `${rel} reads scrumUpdate without excluding DRAFT:\n${call.slice(0, 300)}`,
        )
      }
    })
  }

  it('a draft is stored with no blocker/win/late flags, so flag-filtered reads never see it', () => {
    const source = readFileSync(path.join(ROOT, 'features/scrum/services/scrum-updates.ts'), 'utf8')
    const draftBranch = source.slice(source.indexOf('if (input.asDraft) {'), source.indexOf('const baseline = scrumSubmitBaseline'))
    assert.match(draftBranch, /status: SCRUM_DRAFT_STATUS/)
    assert.match(draftBranch, /hasBlocker: false/)
    assert.match(draftBranch, /hasWin: false/)
    assert.match(draftBranch, /isLate: false/)
    assert.doesNotMatch(draftBranch, /syncScrumTodos|replaceUpdateLinks|emit\(|recordActivity/)
  })

  it('OKR attention reads only links on submitted updates', () => {
    const source = readFileSync(path.join(ROOT, 'app/api/scrum/attention/route.ts'), 'utf8')
    const [call] = callsIn(source, /\bscrumUpdateLink\.findMany\(/g)
    assert.match(call, /update:\s*SUBMITTED_SCRUM_UPDATE_WHERE/)
  })

  it('the home dashboard does not count a draft as today\'s submission', () => {
    const source = readFileSync(path.join(ROOT, 'lib/dashboards/home.server.ts'), 'utf8')
    assert.match(source, /todaySubmitted:\s*Boolean\(todayUpdate\)\s*&&\s*todayUpdate\?\.status !== 'DRAFT'/)
  })

  it('reminder/nudge jobs treat a draft as not submitted', () => {
    const source = readFileSync(path.join(ROOT, 'features/scrum/services/scrum-jobs.ts'), 'utf8')
    assert.doesNotMatch(source, /scrumUpdate\.findUnique\(\{ where: \{ userId_scrumDate/)
  })
})
