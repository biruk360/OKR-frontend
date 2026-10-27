import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { fileVersion, findWorkbooks, ownerNameFromLine, packageVersion, parseCompanyWorkbook, parsePackageWorkbook, resolveDataDir } from './parse'

/**
 * The workbooks live outside the repo (data-import/, looked up in ./, ../, ../../): the v1 set
 * (11 Oct 2026) in data-import/v1 and the v2 set (27 Oct 2026) in data-import/OKR_2026-27_v2.
 * An older checkout kept the v1 files directly in data-import/.
 */
function dataDir(kind: 'v1' | 'v2'): string | null {
  let root: string
  try {
    root = resolveDataDir(null)
  } catch {
    return null
  }
  const sub = path.join(root, kind === 'v1' ? 'v1' : 'OKR_2026-27_v2')
  if (fs.existsSync(sub)) return sub
  if (kind === 'v1' && fs.readdirSync(root).some((f) => /company-okr.*\.xlsx$/i.test(f))) return root
  return null
}

const V1 = dataDir('v1')
const V2 = dataDir('v2')

test('ownerNameFromLine / packageVersion', () => {
  assert.equal(ownerNameFromLine('Eden Tsega — Bid Lead, Strategic Pursuits'), 'Eden Tsega')
  assert.equal(ownerNameFromLine('Mukuken (name spelling to be confirmed by Meklit) — ERP & Business Automation Lead'), 'Mukuken')
  assert.equal(ownerNameFromLine('Bethlehem (Betty) — Finance Manager.'), 'Bethlehem')
  assert.equal(packageVersion('v2 — DRAFT for the CEO.', '', 'x.xlsx'), 'v2')
  assert.equal(packageVersion('DRAFT for Betty', '', 'Bethlehem-Operating-Package-FY2026-27.xlsx'), 'v1')
  assert.equal(packageVersion('DRAFT', '', 'Eden-Operating-Package-FY2026-27-v2.xlsx'), 'v2')
  // v2 names: spaces, " v4", a download suffix; a stale README status loses to the file name.
  assert.equal(packageVersion('v3 (27 Oct funder alignment) — DRAFT', '', 'Eden Operating Package FY2026 27 v4 (1).xlsx'), 'v4')
  assert.equal(packageVersion('v3 — DRAFT', '', 'Yared Operating Package FY2026 27 v3 (1).xlsx'), 'v3')
})

test('fileVersion reads hyphenated and spaced names', () => {
  assert.equal(fileVersion('360Ground-Company-OKR-FY2026-27-v4.xlsx'), 4)
  assert.equal(fileVersion('360Ground Company OKR FY2026 27 v6 (1).xlsx'), 6)
  assert.equal(fileVersion('CEO Operating Package Biruk FY2026 27 v4 (1).xlsx'), 4)
  assert.equal(fileVersion('Mobile_and_Banking_Lead_Operating_Package_v3.xlsx'), 3)
  assert.equal(fileVersion('Bethlehem-Operating-Package-FY2026-27.xlsx'), null)
})

test('findWorkbooks discovers spaced v2 names and picks the highest company version', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opk-find-'))
  try {
    for (const f of [
      '360Ground Company OKR FY2026 27 v6 (1).xlsx',
      '360Ground-Company-OKR-FY2026-27-v4.xlsx',
      'CEO Operating Package Biruk FY2026 27 v4 (1).xlsx',
      'Mobile and Banking Lead Operating Package FY2026 27 v3 (1).xlsx',
      'Eden-Operating-Package-FY2026-27-v2.xlsx',
      '~$Eden Operating Package FY2026 27 v4 (1).xlsx',
      'notes.txt',
    ]) {
      fs.writeFileSync(path.join(dir, f), '')
    }
    const found = findWorkbooks(dir)
    assert.equal(path.basename(found.company), '360Ground Company OKR FY2026 27 v6 (1).xlsx')
    assert.equal(path.basename(found.ceo ?? ''), 'CEO Operating Package Biruk FY2026 27 v4 (1).xlsx')
    assert.deepEqual(found.packages.map((f) => path.basename(f)).sort(), [
      'CEO Operating Package Biruk FY2026 27 v4 (1).xlsx',
      'Eden-Operating-Package-FY2026-27-v2.xlsx',
      'Mobile and Banking Lead Operating Package FY2026 27 v3 (1).xlsx',
    ])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('the v1 FY 2026/27 workbooks parse to the counts in the spec (§0.1)', { skip: V1 === null ? 'data-import/v1 not present' : false }, () => {
  const files = findWorkbooks(V1 as string)
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
  assert.equal(sum((p) => p.initiatives.length), 0)
  assert.ok(packages.every((p) => p.milestones.every((m) => !m.parentIsInitiative)))
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

/** Per package, from the 27 Oct 2026 workbooks: [version, objectives, KRs, groups, initiatives, milestones, tasks, KPIs, duties]. */
const V2_COUNTS: Record<string, [string, number, number, number, number, number, number, number, number]> = {
  BET: ['v3', 3, 7, 7, 35, 34, 15, 12, 14],
  CEO: ['v4', 4, 10, 6, 24, 38, 22, 12, 23],
  EDN: ['v4', 3, 7, 5, 12, 26, 17, 12, 23],
  ERP: ['v3', 3, 5, 5, 19, 19, 10, 8, 11],
  EYO: ['v4', 3, 6, 7, 14, 50, 21, 12, 28],
  MBL: ['v3', 2, 5, 5, 14, 15, 9, 8, 13],
  MEK: ['v3', 4, 9, 6, 34, 44, 17, 12, 22],
  YAR: ['v3', 3, 7, 6, 33, 40, 17, 11, 17],
  YOG: ['v3', 3, 7, 6, 34, 38, 20, 11, 15],
}

test('the v2 workbooks (Company OKR v6 + 9 packages) parse to their real counts', { skip: V2 === null ? 'data-import/OKR_2026-27_v2 not present' : false }, () => {
  const files = findWorkbooks(V2 as string)
  assert.match(path.basename(files.company), /Company OKR FY2026 27 v6/)
  assert.match(path.basename(files.ceo ?? ''), /^CEO Operating Package Biruk FY2026 27 v4/)

  const company = parseCompanyWorkbook(files.company)
  assert.equal(company.okr.filter((r) => r.kind === 'OBJECTIVE').length, 6)
  assert.equal(company.okr.filter((r) => r.kind === 'KEY_RESULT').length, 22)
  assert.equal(company.dependencies.length, 78)
  assert.equal(company.decisions.length, 41)
  assert.equal(company.okr.find((r) => r.id === 'KR1.4')?.objectiveRef, 'O1')
  assert.equal(company.okr.find((r) => r.id === 'KR1.1')?.checkpoints.Q3, '175M')

  const packages = files.packages.map((f) => parsePackageWorkbook(f))
  assert.equal(packages.length, 9)
  for (const p of packages) {
    const [version, objectives, krs, groups, initiatives, milestones, tasks, kpis, duties] = V2_COUNTS[p.code]
    assert.deepEqual(
      [
        p.version,
        p.okr.filter((r) => r.kind === 'OBJECTIVE').length,
        p.okr.filter((r) => r.kind === 'KEY_RESULT').length,
        p.initiatives.filter((r) => r.kind === 'GROUP').length,
        p.initiatives.filter((r) => r.kind === 'INITIATIVE').length,
        p.milestones.length,
        p.tasks.length,
        p.kpis.length,
        p.duties.length,
      ],
      [version, objectives, krs, groups, initiatives, milestones, tasks, kpis, duties],
      p.code,
    )
    assert.deepEqual(p.warnings, [], p.code)
    // README "Initiatives (work behind the KRs)" counts groups and initiatives together.
    assert.equal(Number(p.counts['Initiatives (work behind the KRs)']), groups + initiatives, `${p.code} README count`)
    assert.ok(p.milestones.every((m) => m.parentIsInitiative), `${p.code} milestones hang off initiatives`)
    const ids = new Set(p.initiatives.map((i) => i.id))
    assert.ok(p.milestones.every((m) => ids.has(m.parentKr)), `${p.code} milestone parents are its own initiatives`)
  }

  const eden = packages.find((p) => p.code === 'EDN')!
  const o1 = eden.okr.find((r) => r.id === 'EDN-O1')!
  assert.equal(o1.linkedKrs, 'KR1.2')
  assert.equal(o1.ca, '')
  const kr11 = eden.okr.find((r) => r.id === 'EDN-KR1.1')!
  assert.equal(kr11.target, '≥200 (45 by 31 Dec · 115 by 31 Mar)')
  assert.equal(kr11.objectiveRef, 'EDN-O1')
  const in11 = eden.initiatives.find((r) => r.id === 'EDN-IN1.1')!
  assert.deepEqual([in11.kind, in11.groupRef, in11.supports, in11.ca, in11.owner], ['INITIATIVE', 'EDN-IG1', 'EDN-KR1.2', 'C/A', 'Eden'])
  assert.equal(eden.milestones.find((m) => m.id === 'M1.1.1')?.parentKr, 'EDN-IN1.1')
  assert.equal(eden.tasks.find((t) => t.id === 'T12')?.parent, 'KPI EDN-K01')

  const ceo = packages.find((p) => p.code === 'CEO')!
  assert.equal(ceo.decisionLog.length, 87)
  assert.equal(ceo.initiatives.find((r) => r.id === 'CIN1.1')?.supports, 'C1.1')
  assert.equal(packages.find((p) => p.code === 'YOG')!.tasks.find((t) => t.id === 'T09')?.parent, 'CEO CIN1.1')

  // KPI ids the Odoo sync matches on (scripts/link-odoo-sales-kpis.ts) are still there.
  const kpiIds = new Set(packages.flatMap((p) => p.kpis.map((k) => k.id)))
  for (const ref of ['CEO-K01', 'CEO-K02', 'CEO-K07', 'EDN-K01', 'EDN-K02', 'YAR-K01', 'YAR-K02', 'YOG-K01', 'YOG-K02']) assert.ok(kpiIds.has(ref), ref)
  assert.equal(kpiIds.size, 98)
})
