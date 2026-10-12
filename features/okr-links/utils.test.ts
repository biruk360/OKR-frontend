import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ConnectionItem, ConnectionsPayload, ConnectionSummary } from '@/lib/connections/types'
import type { LinkTargetOption, OkrLinkViewDto } from './types'
import {
  buildCreateLinkPayload,
  canSetParent,
  canSetPrimary,
  defaultLinkFormValues,
  filterLinkTargets,
  groupOkrLinks,
  keyResultRowToTarget,
  lineageSummary,
  linkFormSchema,
  linkRelationLabel,
  otherAlignments,
  pickAlignmentParent,
  previousTimeframeId,
  successorSummary,
  walkAlignment,
} from './utils'

const SUMMARY = {} as ConnectionSummary

function item(type: ConnectionItem['type'], id: string, via: ConnectionItem['via'], over: Record<string, unknown> = {}): ConnectionItem {
  return { type, id, via, redacted: false, title: id, ref: null, href: `/${id}`, status: null, progress: null, owner: null, ...over } as ConnectionItem
}

function payload(type: ConnectionsPayload['subject']['type'], id: string, alignsTo: ConnectionItem[]): ConnectionsPayload {
  return {
    subject: { type, id, title: id, redacted: false },
    alignsTo, supportedBy: [], predecessors: [], successors: [],
    dependencies: { inbound: [], outbound: [] },
    decisions: [], kpis: [], duties: [], development: [], milestones: [],
    summary: SUMMARY,
    permissions: { canManageLinks: false },
  }
}

// ── CON-5 ────────────────────────────────────────────────────────────────────

test('a KR climbs to its own objective', () => {
  const p = payload('KEY_RESULT', 'ednKr', [item('OBJECTIVE', 'ednO1', 'PARENT'), item('KEY_RESULT', 'other', 'CONTRIBUTES_TO')])
  assert.equal(pickAlignmentParent(p)?.id, 'ednO1')
  assert.deepEqual(otherAlignments(p).map((i) => i.id), ['other'])
})

test('an objective prefers the KR it contributes to over its parent objective', () => {
  const p = payload('OBJECTIVE', 'ednO1', [item('OBJECTIVE', 'companyO1', 'PARENT'), item('KEY_RESULT', 'kr13', 'CONTRIBUTES_TO')])
  assert.equal(pickAlignmentParent(p)?.id, 'kr13')
  const noKr = payload('OBJECTIVE', 'ednO1', [item('OBJECTIVE', 'companyO1', 'PARENT')])
  assert.equal(pickAlignmentParent(noKr)?.id, 'companyO1')
})

test('a parent that is also a CONTRIBUTES_TO target (deduped, linkKind kept) still counts', () => {
  const p = payload('OBJECTIVE', 'o', [item('KEY_RESULT', 'kr', 'PARENT', { linkKind: 'CONTRIBUTES_TO' })])
  assert.equal(pickAlignmentParent(p)?.id, 'kr')
})

test('non-OKR items (duties) are never trail steps', () => {
  const p = payload('TODO', 't', [item('DUTY', 'duty', 'PARENT')])
  assert.equal(pickAlignmentParent(p), null)
})

test('walkAlignment builds "Company O1 › KR1.3 › EDN-O1 › EDN-KR1.1" step by step', () => {
  const subject = { type: 'KEY_RESULT' as const, id: 'ednKr11' }
  const p0 = payload('KEY_RESULT', 'ednKr11', [item('OBJECTIVE', 'ednO1', 'PARENT')])
  const p1 = payload('OBJECTIVE', 'ednO1', [item('KEY_RESULT', 'kr13', 'CONTRIBUTES_TO')])
  const p2 = payload('KEY_RESULT', 'kr13', [item('OBJECTIVE', 'companyO1', 'PARENT')])
  const p3 = payload('OBJECTIVE', 'companyO1', [])

  assert.deepEqual(walkAlignment(subject, [undefined]), { ancestors: [], next: null, complete: false })
  const w1 = walkAlignment(subject, [p0])
  assert.deepEqual(w1.next, { type: 'OBJECTIVE', id: 'ednO1' })
  const done = walkAlignment(subject, [p0, p1, p2, p3])
  assert.equal(done.complete, true)
  assert.equal(done.next, null)
  assert.deepEqual(done.ancestors.map((a) => a.id).reverse(), ['companyO1', 'kr13', 'ednO1'])
})

test('walkAlignment stops on cycles, failures and maxDepth', () => {
  const subject = { type: 'OBJECTIVE' as const, id: 'a' }
  const pa = payload('OBJECTIVE', 'a', [item('OBJECTIVE', 'b', 'PARENT')])
  const pb = payload('OBJECTIVE', 'b', [item('OBJECTIVE', 'a', 'CONTRIBUTES_TO')])
  const cyc = walkAlignment(subject, [pa, pb])
  assert.equal(cyc.complete, true)
  assert.deepEqual(cyc.ancestors.map((x) => x.id), ['b'])

  const failed = walkAlignment(subject, [pa, null])
  assert.equal(failed.complete, true)
  assert.equal(failed.ancestors.length, 1)

  const capped = walkAlignment(subject, [pa], 1)
  assert.equal(capped.complete, true)
  assert.equal(capped.next, null)
})

test('a redacted ancestor is kept (rendered as "Private item") and the walk continues', () => {
  const subject = { type: 'KEY_RESULT' as const, id: 'k' }
  const hidden: ConnectionItem = { type: 'OBJECTIVE', id: 'secret', via: 'PARENT', redacted: true }
  const w = walkAlignment(subject, [payload('KEY_RESULT', 'k', [hidden])])
  assert.equal(w.ancestors[0].redacted, true)
  assert.deepEqual(w.next, { type: 'OBJECTIVE', id: 'secret' })
})

// ── CON-6 ────────────────────────────────────────────────────────────────────

test('lineage summary: "Continues 3 FY25/26 items"', () => {
  const tf = { timeframe: { id: 't', name: 'FY25/26' } }
  const preds = ['a', 'b', 'c'].map((id) => item('OBJECTIVE', id, 'SUCCEEDS', tf))
  assert.equal(lineageSummary(preds), 'Continues 3 FY25/26 items')
  assert.equal(lineageSummary([preds[0]]), 'Continues 1 FY25/26 item')
  assert.equal(lineageSummary([preds[0], { type: 'OBJECTIVE', id: 'r', via: 'SUCCEEDS', redacted: true }]), 'Continues 2 earlier items')
  assert.equal(lineageSummary([]), null)
  assert.equal(successorSummary([item('KEY_RESULT', 's', 'SUCCEEDS', { timeframe: { id: 'n', name: 'FY26/27' } })]), 'Continued as 1 FY26/27 item')
})

// ── Link form ────────────────────────────────────────────────────────────────

function link(over: Partial<OkrLinkViewDto>): OkrLinkViewDto {
  return {
    id: 'l', kind: 'CONTRIBUTES_TO', subKind: null, isPrimary: false, note: null, createdAt: '2026-10-01T00:00:00.000Z',
    direction: 'OUTGOING', counterpart: item('KEY_RESULT', 'kr', 'CONTRIBUTES_TO'), canDelete: true,
    ...over,
  }
}

test('relation labels and grouping', () => {
  assert.equal(linkRelationLabel(link({})), 'Contributes to')
  assert.equal(linkRelationLabel(link({ direction: 'INCOMING' })), 'Supported by')
  assert.equal(linkRelationLabel(link({ kind: 'SUCCEEDS', subKind: 'REFRAMED', isPrimary: true })), 'Succeeds · Reframed · Primary')
  const groups = groupOkrLinks([
    link({ id: '1', kind: 'SUCCEEDS', createdAt: '2026-01-01' }),
    link({ id: '2', kind: 'SUCCEEDS', isPrimary: true, createdAt: '2026-02-01' }),
    link({ id: '3', direction: 'INCOMING' }),
  ])
  assert.deepEqual(groups.succeeds.map((l) => l.id), ['2', '1'])
  assert.deepEqual(groups.supportedBy.map((l) => l.id), ['3'])
})

test('option rules: primary only for same-type SUCCEEDS; parent only objective → KR contributes', () => {
  assert.equal(canSetPrimary('SUCCEEDS', 'OBJECTIVE', 'OBJECTIVE'), true)
  assert.equal(canSetPrimary('SUCCEEDS', 'OBJECTIVE', 'KEY_RESULT'), false)
  assert.equal(canSetPrimary('CONTRIBUTES_TO', 'OBJECTIVE', 'OBJECTIVE'), false)
  assert.equal(canSetParent('CONTRIBUTES_TO', 'OBJECTIVE', 'KEY_RESULT'), true)
  assert.equal(canSetParent('CONTRIBUTES_TO', 'KEY_RESULT', 'KEY_RESULT'), false)
})

test('buildCreateLinkPayload: subject is FROM; SUCCEEDS-only fields are dropped for CONTRIBUTES_TO', () => {
  const subject = { type: 'OBJECTIVE' as const, id: 'o1', timeframeId: 't1' }
  const values = {
    ...defaultLinkFormValues(subject, 'CONTRIBUTES_TO'),
    target: { type: 'KEY_RESULT' as const, id: 'kr13', title: 'KR1.3' },
    subKind: 'CARRIED' as const,
    isPrimary: true,
    setParent: true,
    note: '  imported  ',
  }
  const built = buildCreateLinkPayload(subject, values)
  assert.equal(built.ok, true)
  if (!built.ok) return
  assert.deepEqual(built.payload, {
    fromType: 'OBJECTIVE', fromId: 'o1', toType: 'KEY_RESULT', toId: 'kr13', kind: 'CONTRIBUTES_TO',
    subKind: null, isPrimary: false, note: 'imported', setParent: true,
  })
})

test('buildCreateLinkPayload rejects a self-link and a missing target', () => {
  const subject = { type: 'KEY_RESULT' as const, id: 'k1' }
  const self = buildCreateLinkPayload(subject, { ...defaultLinkFormValues(subject, 'SUCCEEDS'), target: { type: 'KEY_RESULT', id: 'k1', title: 'x' } })
  assert.equal(self.ok, false)
  assert.equal(buildCreateLinkPayload(subject, defaultLinkFormValues(subject)).ok, false)
})

test('linkFormSchema requires a target and caps the note at 500', () => {
  const subject = { type: 'OBJECTIVE' as const, id: 'o' }
  const base = defaultLinkFormValues(subject)
  const missing = linkFormSchema.safeParse(base)
  assert.equal(missing.success, false)
  const ok = linkFormSchema.safeParse({ ...base, target: { type: 'OBJECTIVE', id: 'x', title: 'X' } })
  assert.equal(ok.success, true)
  const long = linkFormSchema.safeParse({ ...base, target: { type: 'OBJECTIVE', id: 'x', title: 'X' }, note: 'a'.repeat(501) })
  assert.equal(long.success, false)
})

test('previousTimeframeId picks the latest timeframe that starts before the subject’s', () => {
  const tfs = [
    { id: 'fy25', startDate: '2025-07-08' },
    { id: 'fy26', startDate: '2026-07-08' },
    { id: 'q1', startDate: '2026-07-08' },
    { id: 'fy24', startDate: '2024-07-08' },
  ]
  assert.equal(previousTimeframeId(tfs, 'fy26'), 'fy25')
  assert.equal(previousTimeframeId(tfs, 'fy24'), 'fy24')
  assert.equal(previousTimeframeId(tfs, null), undefined)
})

test('filterLinkTargets drops self, already-linked targets of the same kind and other timeframes', () => {
  const opt = (type: LinkTargetOption['type'], id: string, timeframeId: string | null): LinkTargetOption => ({
    type, id, title: id, level: null, timeframeId, timeframeName: null, progress: null, ownerName: null, objectiveId: null, objectiveTitle: null,
  })
  const out = filterLinkTargets(
    [opt('OBJECTIVE', 'self', 't'), opt('KEY_RESULT', 'kr', 't'), opt('KEY_RESULT', 'free', 't'), opt('KEY_RESULT', 'elsewhere', 'x')],
    {
      subject: { type: 'OBJECTIVE', id: 'self' },
      kind: 'CONTRIBUTES_TO',
      existing: [link({ counterpart: item('KEY_RESULT', 'kr', 'CONTRIBUTES_TO') })],
      timeframeId: 't',
    },
  )
  assert.deepEqual(out.map((o) => o.id), ['free'])
})

test('KR search rows map their objective timeframe and level', () => {
  const t = keyResultRowToTarget({
    id: 'k', title: 'Cut churn', progress: 20, owner: { name: 'Abebe' },
    objective: { id: 'o', title: 'Retention', level: 'COMPANY', timeframeId: 'tf', timeframe: { id: 'tf', name: 'FY26/27' } },
  })
  assert.equal(t.timeframeId, 'tf')
  assert.equal(t.level, 'COMPANY')
  assert.equal(t.objectiveTitle, 'Retention')
})
