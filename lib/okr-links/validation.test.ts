import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_LINEAGE,
  levelRank,
  lineageFromPredecessor,
  shouldMirrorLineage,
  validateOkrLink,
  validateOkrLinkShape,
  type OkrNodeFacts,
} from './validation'

const FY25 = { timeframeId: 'tf-25', timeframeStart: new Date('2025-07-01') }
const FY26 = { timeframeId: 'tf-26', timeframeStart: new Date('2026-07-01') }

function node(over: Partial<OkrNodeFacts> & Pick<OkrNodeFacts, 'type' | 'id'>): OkrNodeFacts {
  return {
    objectiveId: over.type === 'OBJECTIVE' ? over.id : 'obj-x',
    ...FY26,
    level: 'INDIVIDUAL',
    status: 'ACTIVE',
    createdAt: new Date('2026-07-10'),
    ownerId: 'u1',
    isLocked: false,
    rolledFromId: null,
    lineageRootId: null,
    lineageDepth: 0,
    ...over,
  }
}

test('shape: rejects unknown types and kinds', () => {
  assert.equal(
    validateOkrLinkShape({ fromType: 'TODO', fromId: 'a', toType: 'OBJECTIVE', toId: 'b', kind: 'SUCCEEDS' })?.code,
    'INVALID_TYPE',
  )
  assert.equal(
    validateOkrLinkShape({ fromType: 'OBJECTIVE', fromId: 'a', toType: 'OBJECTIVE', toId: 'b', kind: 'BLOCKS' })?.code,
    'INVALID_KIND',
  )
})

test('shape: no self-links', () => {
  assert.equal(
    validateOkrLinkShape({ fromType: 'KEY_RESULT', fromId: 'k', toType: 'KEY_RESULT', toId: 'k', kind: 'CONTRIBUTES_TO' })?.code,
    'SELF_LINK',
  )
  // Same id but different types is not a self-link.
  assert.equal(
    validateOkrLinkShape({ fromType: 'KEY_RESULT', fromId: 'k', toType: 'OBJECTIVE', toId: 'k', kind: 'SUCCEEDS' }),
    null,
  )
})

test('shape: subKind and isPrimary only on SUCCEEDS', () => {
  const base = { fromType: 'OBJECTIVE', fromId: 'a', toType: 'OBJECTIVE', toId: 'b' }
  assert.equal(validateOkrLinkShape({ ...base, kind: 'CONTRIBUTES_TO', subKind: 'CARRIED' })?.code, 'INVALID_SUB_KIND')
  assert.equal(validateOkrLinkShape({ ...base, kind: 'SUCCEEDS', subKind: 'COPIED' })?.code, 'INVALID_SUB_KIND')
  assert.equal(validateOkrLinkShape({ ...base, kind: 'SUCCEEDS', subKind: 'SPLIT' }), null)
  assert.equal(validateOkrLinkShape({ ...base, kind: 'CONTRIBUTES_TO', isPrimary: true })?.code, 'INVALID_KIND')
  assert.equal(validateOkrLinkShape({ ...base, kind: 'SUCCEEDS', note: 'x'.repeat(501) })?.code, 'NOTE_TOO_LONG')
})

test('LNK-1: CONTRIBUTES_TO must stay in one timeframe', () => {
  const from = node({ type: 'OBJECTIVE', id: 'o-ind', level: 'INDIVIDUAL' })
  const toSame = node({ type: 'KEY_RESULT', id: 'kr-co', objectiveId: 'o-co', level: 'COMPANY' })
  const toOld = node({ type: 'KEY_RESULT', id: 'kr-old', objectiveId: 'o-old', level: 'COMPANY', ...FY25 })
  assert.equal(validateOkrLink({ kind: 'CONTRIBUTES_TO' }, from, toSame), null)
  assert.equal(validateOkrLink({ kind: 'CONTRIBUTES_TO' }, from, toOld)?.code, 'TIMEFRAME_MISMATCH')
})

test('LNK-1: SUCCEEDS may cross timeframes, newer → older only', () => {
  const newer = node({ type: 'OBJECTIVE', id: 'c5', ...FY26 })
  const older = node({ type: 'OBJECTIVE', id: '4wchwg', ...FY25 })
  assert.equal(validateOkrLink({ kind: 'SUCCEEDS' }, newer, older), null)
  assert.equal(validateOkrLink({ kind: 'SUCCEEDS' }, older, newer)?.code, 'WRONG_DIRECTION')
  // Cross-type succession is allowed (KR succeeds an objective).
  const kr = node({ type: 'KEY_RESULT', id: 'kr-new', objectiveId: 'o-new', ...FY26 })
  assert.equal(validateOkrLink({ kind: 'SUCCEEDS', subKind: 'REFRAMED' }, kr, older), null)
})

test('SUCCEEDS inside one timeframe: the later-created item succeeds the earlier one', () => {
  const early = node({ type: 'OBJECTIVE', id: 'a', createdAt: new Date('2026-07-02') })
  const late = node({ type: 'OBJECTIVE', id: 'b', createdAt: new Date('2026-08-02') })
  assert.equal(validateOkrLink({ kind: 'SUCCEEDS' }, late, early), null)
  assert.equal(validateOkrLink({ kind: 'SUCCEEDS' }, early, late)?.code, 'WRONG_DIRECTION')
})

test('CONTRIBUTES_TO goes lower → higher (equal level allowed)', () => {
  const company = node({ type: 'KEY_RESULT', id: 'kr1.3', objectiveId: 'O1', level: 'COMPANY' })
  const dept = node({ type: 'OBJECTIVE', id: 'D1', level: 'DEPARTMENT' })
  const ind = node({ type: 'OBJECTIVE', id: 'EDN-O1', level: 'INDIVIDUAL' })
  const indKr = node({ type: 'KEY_RESULT', id: 'EDN-KR1.1', objectiveId: 'EDN-O2', level: 'INDIVIDUAL' })
  assert.equal(validateOkrLink({ kind: 'CONTRIBUTES_TO' }, ind, company), null)
  assert.equal(validateOkrLink({ kind: 'CONTRIBUTES_TO' }, dept, company), null)
  assert.equal(validateOkrLink({ kind: 'CONTRIBUTES_TO' }, ind, indKr), null)
  assert.equal(validateOkrLink({ kind: 'CONTRIBUTES_TO' }, company, ind)?.code, 'WRONG_DIRECTION')
  assert.equal(validateOkrLink({ kind: 'CONTRIBUTES_TO' }, dept, ind)?.code, 'WRONG_DIRECTION')
})

test('CONTRIBUTES_TO rejects structural links (KR → own objective, objective → own KR)', () => {
  const obj = node({ type: 'OBJECTIVE', id: 'O1', level: 'COMPANY' })
  const ownKr = node({ type: 'KEY_RESULT', id: 'KR1', objectiveId: 'O1', level: 'COMPANY' })
  const siblingKr = node({ type: 'KEY_RESULT', id: 'KR2', objectiveId: 'O1', level: 'COMPANY' })
  assert.equal(validateOkrLink({ kind: 'CONTRIBUTES_TO' }, ownKr, obj)?.code, 'STRUCTURAL_LINK')
  assert.equal(validateOkrLink({ kind: 'CONTRIBUTES_TO' }, obj, ownKr)?.code, 'STRUCTURAL_LINK')
  assert.equal(validateOkrLink({ kind: 'CONTRIBUTES_TO' }, siblingKr, ownKr), null)
})

test('deleted items and reverse links are rejected', () => {
  const a = node({ type: 'OBJECTIVE', id: 'a' })
  const b = node({ type: 'OBJECTIVE', id: 'b', level: 'COMPANY' })
  assert.equal(validateOkrLink({ kind: 'CONTRIBUTES_TO' }, a, { ...b, status: 'DELETED' })?.code, 'DELETED_ITEM')
  assert.equal(validateOkrLink({ kind: 'CONTRIBUTES_TO' }, a, b, { reverseExists: true })?.code, 'REVERSE_EXISTS')
})

test('levelRank orders INDIVIDUAL < DEPARTMENT < COMPANY', () => {
  assert.ok(levelRank('INDIVIDUAL') < levelRank('DEPARTMENT'))
  assert.ok(levelRank('DEPARTMENT') < levelRank('COMPANY'))
  assert.equal(levelRank(undefined), 0)
})

test('LNK-2: mirror only a primary SUCCEEDS between same-type items', () => {
  assert.equal(shouldMirrorLineage({ kind: 'SUCCEEDS', isPrimary: true, fromType: 'OBJECTIVE', toType: 'OBJECTIVE' }), true)
  assert.equal(shouldMirrorLineage({ kind: 'SUCCEEDS', isPrimary: false, fromType: 'OBJECTIVE', toType: 'OBJECTIVE' }), false)
  assert.equal(shouldMirrorLineage({ kind: 'SUCCEEDS', isPrimary: true, fromType: 'KEY_RESULT', toType: 'OBJECTIVE' }), false)
  assert.equal(shouldMirrorLineage({ kind: 'CONTRIBUTES_TO', isPrimary: true, fromType: 'OBJECTIVE', toType: 'OBJECTIVE' }), false)
})

test('LNK-2: lineage follows the clone-route formula', () => {
  assert.deepEqual(lineageFromPredecessor({ id: 'p1', lineageRootId: null, lineageDepth: 0 }), {
    rolledFromId: 'p1',
    lineageRootId: 'p1',
    lineageDepth: 1,
  })
  assert.deepEqual(lineageFromPredecessor({ id: 'p2', lineageRootId: 'root', lineageDepth: 2 }), {
    rolledFromId: 'p2',
    lineageRootId: 'root',
    lineageDepth: 3,
  })
  assert.deepEqual(EMPTY_LINEAGE, { rolledFromId: null, lineageRootId: null, lineageDepth: 0 })
})
