import test from 'node:test'
import assert from 'node:assert/strict'
import { expandRanges, extractDecisionRefs, extractDependencyRefs, extractInitiativeRefs, extractKpiRefs, extractLocalRefs, extractOkrRefs, initiativeRefKind, okrRefKind, packageCodeFromId } from './ids'

const ids = (text: string) => extractOkrRefs(text).map((r) => `${r.id}:${r.kind === 'OBJECTIVE' ? 'O' : 'K'}`)

test('extractOkrRefs reads carry-forward "New home" cells', () => {
  assert.deepEqual(ids('C5 · Biruk; company O4 (systems and AI)'), ['C5:O', 'O4:O'])
  assert.deepEqual(ids('Eyoel EYO-K10 (12 weeks → <4 weeks); company KR4.4'), ['KR4.4:K'])
  assert.deepEqual(ids("Company KR4.3 (Meklit's AI programme); ERP Lead ERP-O4; Betty BET-KR6.5"), ['KR4.3:K', 'ERP-O4:O', 'BET-KR6.5:K'])
  assert.deepEqual(ids('RD-W1 Saturday meeting (issues solved with the 5-step); Meklit MEK-KR3.7 (12 improvement actions)'), ['MEK-KR3.7:K'])
  assert.deepEqual(ids('Betty BET-KR4.1; company KR1.5; CEO-K03'), ['BET-KR4.1:K', 'KR1.5:K'])
  assert.deepEqual(ids('C1.4 (white-label signed 31 Dec, launched 30 Jun); scope 1 vs 5 products — D74'), ['C1.4:K'])
  assert.deepEqual(ids('Split: company O2 (products), O6 (trade), private line (Yared)'), ['O2:O', 'O6:O'])
  assert.deepEqual(ids('Meklit MEK-KR3.10 and MEK-KR3.1'), ['MEK-KR3.10:K', 'MEK-KR3.1:K'])
  assert.deepEqual(ids('C080J6 is a code (merged)'), [])
})

test('ranges expand within the same KR group', () => {
  assert.equal(expandRanges('KR6.1–KR6.4; trade hires'), 'KR6.1, KR6.2, KR6.3, KR6.4; trade hires')
  assert.deepEqual(extractDecisionRefs('16 October decision batch closed (D01–D04, D61)'), ['D01', 'D02', 'D03', 'D04', 'D61'])
  assert.equal(expandRanges('KR1.1–KR2.3'), 'KR1.1–KR2.3')
})

test('okrRefKind', () => {
  assert.equal(okrRefKind('KR1.3'), 'KEY_RESULT')
  assert.equal(okrRefKind('EDN-KR1.1'), 'KEY_RESULT')
  assert.equal(okrRefKind('C1.4'), 'KEY_RESULT')
  assert.equal(okrRefKind('C1'), 'OBJECTIVE')
  assert.equal(okrRefKind('YOG-O5'), 'OBJECTIVE')
  assert.equal(okrRefKind('O6'), 'OBJECTIVE')
  assert.equal(okrRefKind('EDN-K01'), null)
})

test('KPI, dependency, decision and package-local refs', () => {
  assert.deepEqual(extractKpiRefs('KPIs EDN-K03, EDN-K04; CEO-K10'), ['EDN-K03', 'EDN-K04', 'CEO-K10'])
  assert.deepEqual(extractDependencyRefs('DEP05, DEP06; KR4.3 design pipeline'), ['DEP05', 'DEP06'])
  assert.deepEqual(extractDecisionRefs('D29, D78'), ['D29', 'D78'])
  const local = extractLocalRefs('M4.2.1; DEP19 · T06 · RD-W2 · DV3 · X04')
  assert.deepEqual(local, { milestones: ['M4.2.1'], tasks: ['T06'], duties: ['RD-W2'], development: ['DV3'], links: ['X04'] })
})

test('packageCodeFromId', () => {
  assert.equal(packageCodeFromId('EDN-KR1.1'), 'EDN')
  assert.equal(packageCodeFromId('C3.2'), 'CEO')
  assert.equal(packageCodeFromId('KR1.1'), null)
})

test('v2 initiative and group ids are read without being taken for OKR ids', () => {
  const ini = (text: string) => extractInitiativeRefs(text).map((r) => `${r.id}:${r.kind === 'GROUP' ? 'G' : 'I'}`)
  assert.deepEqual(ini('CIG5 · Biruk; company O4 (systems and AI)'), ['CIG5:G'])
  assert.deepEqual(ini('Meklit MEK-IN4.2, MEK-IN4.3 (≥5 suppliers; −15% cost)'), ['MEK-IN4.2:I', 'MEK-IN4.3:I'])
  assert.deepEqual(ini('CIN1.2 (3 PPPs) and CIN1.4 (EthioTelecom white-label)'), ['CIN1.2:I', 'CIN1.4:I'])
  assert.deepEqual(ini('Company KR1.1 NGO line, KR2.2–KR2.5; Yared YAR-IN1.2, YAR-IN1.5; MEK-IN3.10'), ['YAR-IN1.2:I', 'YAR-IN1.5:I', 'MEK-IN3.10:I'])
  assert.deepEqual(ini('CEO CIN1.1'), ['CIN1.1:I'])
  // OKR ids are not confused with initiative ids.
  assert.deepEqual(ids('CIG5 · Biruk; company O4; MEK-IN4.2; CIN1.2; C1.2'), ['O4:O', 'C1.2:K'])
  assert.equal(initiativeRefKind('EDN-IG1'), 'GROUP')
  assert.equal(initiativeRefKind('EDN-IN1.1'), 'INITIATIVE')
  assert.equal(initiativeRefKind('CIN6.4'), 'INITIATIVE')
  assert.equal(initiativeRefKind('EDN-KR1.1'), null)
  assert.equal(packageCodeFromId('CIN1.1'), 'CEO')
  assert.equal(packageCodeFromId('CIG2'), 'CEO')
  assert.equal(packageCodeFromId('YOG-IN3.6'), 'YOG')
})
