import test from 'node:test'
import assert from 'node:assert/strict'
import { findWorkbooks, ownerNameFromLine, packageVersion, parseCompanyWorkbook, parsePackageWorkbook, resolveDataDir } from './parse'

function dataDir(): string | null {
  try {
    return resolveDataDir(null)
  } catch {
    return null
  }
}

test('ownerNameFromLine / packageVersion', () => {
  assert.equal(ownerNameFromLine('Eden Tsega — Bid Lead, Strategic Pursuits'), 'Eden Tsega')
  assert.equal(ownerNameFromLine('Mukuken (name spelling to be confirmed by Meklit) — ERP & Business Automation Lead'), 'Mukuken')
  assert.equal(ownerNameFromLine('Bethlehem (Betty) — Finance Manager.'), 'Bethlehem')
  assert.equal(packageVersion('v2 — DRAFT for the CEO.', '', 'x.xlsx'), 'v2')
  assert.equal(packageVersion('DRAFT for Betty', '', 'Bethlehem-Operating-Package-FY2026-27.xlsx'), 'v1')
  assert.equal(packageVersion('DRAFT', '', 'Eden-Operating-Package-FY2026-27-v2.xlsx'), 'v2')
})

test('the FY 2026/27 workbooks parse to the counts in the spec (§0.1)', { skip: dataDir() === null ? 'data-import not present' : false }, () => {
  const files = findWorkbooks(dataDir() as string)
  const company = parseCompanyWorkbook(files.company)
  assert.equal(company.okr.filter((r) => r.kind === 'OBJECTIVE').length, 6)
  assert.equal(company.okr.filter((r) => r.kind === 'KEY_RESULT').length, 31)
  assert.equal(company.dependencies.length, 66)
  assert.ok(company.decisions.length >= 32)
  assert.equal(company.okr.find((r) => r.id === 'KR1.1')?.objectiveRef, 'O1')
  assert.equal(company.okr.find((r) => r.id === 'KR1.1')?.checkpoints.Q3, '175M')

  const packages = files.packages.map((f) => parsePackageWorkbook(f))
  assert.equal(packages.length, 9)
  const sum = (f: (p: (typeof packages)[number]) => number) => packages.reduce((n, p) => n + f(p), 0)
  assert.equal(sum((p) => p.milestones.length), 290)
  assert.equal(sum((p) => p.tasks.length), 141)
  assert.equal(sum((p) => p.kpis.length), 96)
  assert.equal(sum((p) => p.duties.length), 166)
  assert.deepEqual(packages.map((p) => p.code).sort(), ['BET', 'CEO', 'EDN', 'ERP', 'EYO', 'MBL', 'MEK', 'YAR', 'YOG'])
  const ceo = packages.find((p) => p.code === 'CEO')!
  assert.equal(ceo.decisionLog.length, 78)
  assert.equal(ceo.version, 'v2')
  assert.ok(ceo.summary.length >= 4)
  const eden = packages.find((p) => p.code === 'EDN')!
  assert.equal(eden.ownerName, 'Eden Tsega')
  assert.equal(eden.kpiScoredFromQ3, true)
  assert.ok(eden.links.some((l) => l.id === 'X01'))
  assert.ok(eden.weights.some((w) => w.weight === '50%'))
})
