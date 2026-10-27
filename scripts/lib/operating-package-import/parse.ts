/**
 * Operating-package importer (IMP) — workbook parsers.
 *
 * Reads the FY 2026/27 Company OKR workbook and the employee Operating Package workbooks into
 * plain typed rows. No mapping decisions are taken here (see rules.ts); this layer only finds
 * header rows, columns and the README blocks.
 */
import * as fs from 'fs'
import * as path from 'path'
import * as XLSX from 'xlsx'
import { packageCodeFromId } from './ids'
import { reviewVerdict } from './rules'
import { cellText, column, keyValueRows, readTable, type SheetTable, type TableRow } from './text'

export interface ReviewCell {
  verdict: 'AGREE' | 'DISPUTE' | null
  raw: string
  comment: string
}

export interface OkrRow {
  sheet: string
  rowNumber: number
  id: string
  kind: 'OBJECTIVE' | 'KEY_RESULT'
  title: string
  ca: string
  baseline: string
  target: string
  due: string
  measuredBy: string
  owner: string
  /** Package OKR: "Linked company KR"; company OKR: ''. */
  linkedKrs: string
  dependencies: string
  /** Company OKR only. */
  team: string
  checkpoints: { Q2: string; Q3: string; Q4: string }
  /** Company OKR only: "Lands in (individual KRs)". */
  landsIn: string
  /** KR rows: id of the objective row above it. */
  objectiveRef: string | null
  review: ReviewCell
}

export interface DependencyRow {
  rowNumber: number
  id: string
  title: string
  providers: string
  needers: string
  neededBy: string
  unblocks: string
  type: string
  status: string
}

export interface DecisionRow {
  source: string
  rowNumber: number
  id: string
  title: string
  requestedBy: string
  neededBy: string
  batch: string
  options: string
  unblocks: string
  status: string
  ceoDecision: string
  dateDecided: string
  note: string
}

export interface MilestoneRow {
  rowNumber: number
  id: string
  /** v1 "Parent KR" or v2 "Parent initiative" (EDN-IN1.1), upper-cased. */
  parentKr: string
  /** True when the parent column is "Parent initiative" (v2). */
  parentIsInitiative: boolean
  title: string
  quarter: string
  due: string
  dependsOn: string
  status: string
  review: ReviewCell
}

/** v2 "Initiatives" sheet: groups (former objectives, EDN-IG1) and initiatives (EDN-IN1.1). */
export interface InitiativeRow {
  rowNumber: number
  id: string
  kind: 'GROUP' | 'INITIATIVE'
  title: string
  ca: string
  baseline: string
  target: string
  due: string
  measuredBy: string
  /** "Supports (key result or KPI)": EDN-KR1.2, "Company KR1.4 (settlement)", "KPI YOG-K01", "Development Plan". */
  supports: string
  dependencies: string
  owner: string
  /** Initiatives: id of the group row above it. */
  groupRef: string | null
  review: ReviewCell
}

export interface TaskRow {
  rowNumber: number
  id: string
  sprint: string
  title: string
  parent: string
  due: string
  collaborators: string
  estHours: string
  unblocks: string
  status: string
  review: ReviewCell
}

export interface KpiRow {
  rowNumber: number
  id: string
  name: string
  type: string
  definition: string
  formula: string
  dataSource: string
  baseline: string
  target: string
  frequency: string
  note: string
  review: ReviewCell
}

export interface DutyRow {
  rowNumber: number
  id: string
  title: string
  cadence: string
  timing: string
  duration: string
  output: string
  with: string
  autoTask: string
  review: ReviewCell
}

export interface RoleRow {
  rowNumber: number
  section: string
  item: string
  review: ReviewCell
}

export interface LinkRow {
  rowNumber: number
  id: string
  direction: string
  item: string
  counterparty: string
  neededBy: string
  linked: string
  status: string
}

export interface DecisionNeededRow {
  rowNumber: number
  decision: string
  why: string
  ids: string
  neededBy: string
}

export interface DevelopmentRow {
  rowNumber: number
  id: string
  title: string
  linkedKr: string
  target: string
  due: string
  status: string
}

export interface WeightRow {
  component: string
  weight: string
  source: string
  how: string
}

export interface CompanyWorkbook {
  file: string
  okr: OkrRow[]
  dependencies: DependencyRow[]
  decisions: DecisionRow[]
  readme: Array<{ label: string; value: string }>
}

export interface PackageWorkbook {
  file: string
  /** EDN, EYO, YOG, YAR, MEK, BET, ERP, MBL or CEO. */
  code: string
  ownerName: string
  ownerLine: string
  version: string
  statusText: string
  summary: Array<{ label: string; value: string }>
  counts: Record<string, string>
  okr: OkrRow[]
  /** v2 only; empty for v1 workbooks. */
  initiatives: InitiativeRow[]
  milestones: MilestoneRow[]
  tasks: TaskRow[]
  kpis: KpiRow[]
  /** True when the KPI target header says "(scored from Q3)". */
  kpiScoredFromQ3: boolean
  duties: DutyRow[]
  role: RoleRow[]
  links: LinkRow[]
  decisionsNeeded: DecisionNeededRow[]
  /** CEO package only: the full Decision Log (D01–D78). */
  decisionLog: DecisionRow[]
  development: DevelopmentRow[]
  weights: WeightRow[]
  warnings: string[]
}

// ─── Workbook discovery ─────────────────────────────────────────────────────

export const DEFAULT_DIR = 'data-import'

/** The data-import directory: explicit, or looked up in ./, ../, ../../ (worktrees sit two levels down). */
export function resolveDataDir(explicit: string | null): string {
  const candidates = explicit ? [explicit] : [DEFAULT_DIR, path.join('..', DEFAULT_DIR), path.join('..', '..', DEFAULT_DIR), path.join('..', '..', '..', DEFAULT_DIR)]
  for (const candidate of candidates) {
    const abs = path.resolve(candidate)
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return abs
  }
  throw new Error(`Workbook directory not found (${candidates.join(', ')}). Pass --dir <path>.`)
}

export interface WorkbookFiles {
  company: string
  packages: string[]
  ceo: string | null
}

/** Word separators in workbook file names: "Company-OKR", "Company OKR", "Company_OKR". */
const SEP = '[\\s_-]*'
export const COMPANY_FILE_RE = new RegExp(`company${SEP}okr`, 'i')
export const PACKAGE_FILE_RE = new RegExp(`operating${SEP}package`, 'i')
export const CEO_FILE_RE = new RegExp(`\\bceo${SEP}operating${SEP}package`, 'i')

/**
 * v1 names ("Eden-Operating-Package-FY2026-27-v2.xlsx") and v2 names ("Eden Operating Package FY2026 27
 * v4 (1).xlsx", "360Ground Company OKR FY2026 27 v6 (1).xlsx") are both recognised; the version comes
 * from a "-v4" / " v4" token, and a download suffix such as " (1)" is ignored.
 */
export function findWorkbooks(dir: string): WorkbookFiles {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$') && !f.startsWith('.'))
    .sort()
  const companies = files.filter((f) => COMPANY_FILE_RE.test(f))
  if (companies.length === 0) throw new Error(`No Company OKR workbook (*Company OKR*.xlsx) in ${dir}`)
  const company = companies.sort(byVersion).slice(-1)[0]
  const packages = files.filter((f) => PACKAGE_FILE_RE.test(f)).map((f) => path.join(dir, f))
  const ceos = packages.filter((f) => CEO_FILE_RE.test(path.basename(f))).sort((a, b) => byVersion(path.basename(a), path.basename(b)))
  return { company: path.join(dir, company), packages, ceo: ceos.slice(-1)[0] ?? null }
}

/** Version from a file name: "-v2", " v4 (1)", "_v3" → 2 / 4 / 3; 1 when none. */
export function fileVersion(name: string): number | null {
  const m = path.basename(name).match(/(?:^|[\s_-])v(\d+)(?=$|[\s_.()-])/i)
  return m ? Number(m[1]) : null
}

function versionNumber(name: string): number {
  return fileVersion(name) ?? 1
}

function byVersion(a: string, b: string): number {
  return versionNumber(a) - versionNumber(b)
}

// ─── Shared row helpers ─────────────────────────────────────────────────────

function reviewOf(table: SheetTable): (row: TableRow) => ReviewCell {
  const verdict = column(table, /^review: agree/i)
  const comment = column(table, /^review comment/i)
  return (row) => {
    const raw = verdict(row)
    return { verdict: reviewVerdict(raw), raw, comment: comment(row) }
  }
}

function parseOkrTable(table: SheetTable): OkrRow[] {
  const c = {
    id: column(table, /^id$/i),
    level: column(table, /^level$/i),
    title: column(table, /objective \/ key result/i),
    ca: column(table, /^type/i),
    baseline: column(table, /^baseline/i),
    target: column(table, /^target/i),
    due: column(table, /^due/i),
    measuredBy: column(table, /^measured by/i),
    linked: column(table, /linked company kr/i),
    deps: column(table, /^dependencies/i),
    owner: column(table, /^owner$/i),
    team: column(table, /^team/i),
    q2: column(table, /^q2 checkpoint/i),
    q3: column(table, /^q3 checkpoint/i),
    q4: column(table, /^q4 checkpoint/i),
    landsIn: column(table, /^lands in/i),
  }
  const review = reviewOf(table)
  const out: OkrRow[] = []
  let objectiveRef: string | null = null
  for (const row of table.rows) {
    const id = c.id(row).toUpperCase()
    if (!id) continue
    const level = c.level(row).toLowerCase()
    const kind = level.startsWith('objective') ? 'OBJECTIVE' : level.startsWith('key result') ? 'KEY_RESULT' : null
    if (!kind) continue
    if (kind === 'OBJECTIVE') objectiveRef = id
    out.push({
      sheet: table.sheet,
      rowNumber: row.rowNumber,
      id,
      kind,
      title: c.title(row),
      ca: c.ca(row),
      baseline: c.baseline(row),
      target: c.target(row),
      due: c.due(row),
      measuredBy: c.measuredBy(row),
      owner: c.owner(row),
      linkedKrs: c.linked(row),
      dependencies: c.deps(row),
      team: c.team(row),
      checkpoints: { Q2: c.q2(row), Q3: c.q3(row), Q4: c.q4(row) },
      landsIn: c.landsIn(row),
      objectiveRef: kind === 'KEY_RESULT' ? objectiveRef : null,
      review: review(row),
    })
  }
  return out
}

function parseDecisionTable(table: SheetTable, source: string): DecisionRow[] {
  const c = {
    id: column(table, /^id$/i),
    title: column(table, /^decision$/i),
    requestedBy: column(table, /^requested by/i),
    neededBy: column(table, /^needed by/i),
    batch: column(table, /^batch/i),
    options: column(table, /^options/i),
    unblocks: column(table, /^unblocks/i),
    status: column(table, /^status/i),
    ceoDecision: column(table, /^ceo decision/i),
    dateDecided: column(table, /^date decided/i),
    note: column(table, /^note/i),
  }
  return table.rows
    .filter((r) => /^D\d+$/i.test(c.id(r)))
    .map((r) => ({
      source,
      rowNumber: r.rowNumber,
      id: c.id(r).toUpperCase(),
      title: c.title(r),
      requestedBy: c.requestedBy(r),
      neededBy: c.neededBy(r),
      batch: c.batch(r),
      options: c.options(r),
      unblocks: c.unblocks(r),
      status: c.status(r),
      ceoDecision: c.ceoDecision(r),
      dateDecided: c.dateDecided(r),
      note: c.note(r),
    }))
}

// ─── Company workbook ───────────────────────────────────────────────────────

export function parseCompanyWorkbook(file: string): CompanyWorkbook {
  const wb = XLSX.readFile(file)
  const okrTable = readTable(wb, 'Company OKR', 'ID')
  if (!okrTable) throw new Error(`${path.basename(file)}: sheet "Company OKR" with an "ID" header not found`)

  const deps: DependencyRow[] = []
  const depTable = readTable(wb, 'Dependency Map', 'ID')
  if (depTable) {
    const c = {
      id: column(depTable, /^id$/i),
      title: column(depTable, /^what must exist/i),
      providers: column(depTable, /^owner/i),
      needers: column(depTable, /^needed by \(people/i),
      neededBy: column(depTable, /^needed by \(date/i),
      unblocks: column(depTable, /^unblocks/i),
      type: column(depTable, /^type/i),
      status: column(depTable, /^status/i),
    }
    for (const r of depTable.rows) {
      const id = c.id(r).toUpperCase()
      if (!/^DEP\d+$/.test(id)) continue
      deps.push({
        rowNumber: r.rowNumber,
        id,
        title: c.title(r),
        providers: c.providers(r),
        needers: c.needers(r),
        neededBy: c.neededBy(r),
        unblocks: c.unblocks(r),
        type: c.type(r),
        status: c.status(r),
      })
    }
  }

  const decTable = readTable(wb, 'Decisions for the CEO', 'ID')
  return {
    file,
    okr: parseOkrTable(okrTable),
    dependencies: deps,
    decisions: decTable ? parseDecisionTable(decTable, 'Company OKR · Decisions for the CEO') : [],
    readme: keyValueRows(wb, 'README').map(({ label, value }) => ({ label, value })),
  }
}

// ─── Package workbooks ──────────────────────────────────────────────────────

/** "Eden Tsega — Bid Lead, …" → "Eden Tsega"; "Mukuken (name spelling …) — …" → "Mukuken". */
export function ownerNameFromLine(line: string): string {
  const head = cellText(line).split(/\s+[—–]\s+|\s+-\s+/)[0] ?? ''
  return head.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * The highest of the README status ("v2 — DRAFT …"), the title "(v2)" and the file name ("-v2",
 * " v4 (1)"); "v1" when none. The highest wins because a re-issued workbook can keep a stale status
 * line (the v4 Eden file still says "v3 (27 Oct funder alignment)").
 */
export function packageVersion(statusText: string, title: string, file: string): string {
  const found = [cellText(statusText).match(/^v(\d+)\b/i)?.[1], cellText(title).match(/\(v(\d+)\b/i)?.[1], fileVersion(file)]
    .filter((v) => v !== undefined && v !== null)
    .map(Number)
  return found.length ? `v${Math.max(...found)}` : 'v1'
}

function readmeBlocks(wb: XLSX.WorkBook) {
  const rows = keyValueRows(wb, 'README')
  const title = rows[0]?.label ?? ''
  const get = (label: string) => rows.find((r) => r.label.toLowerCase() === label)?.value ?? ''
  const summary: Array<{ label: string; value: string }> = []
  const counts: Record<string, string> = {}
  let mode: 'none' | 'numbers' | 'counts' = 'none'
  for (const r of rows) {
    const upper = r.label.toUpperCase()
    if (upper.startsWith('THE NUMBERS THIS PACKAGE COMMITS TO')) {
      mode = 'numbers'
      continue
    }
    if (upper.startsWith('COUNTS')) {
      mode = 'counts'
      continue
    }
    if (r.label && r.label === upper && !r.value) {
      // Another all-caps block heading ("THE BUCKETS", "HOW TO REVIEW").
      mode = 'none'
      continue
    }
    if (mode === 'numbers' && r.label && r.value) summary.push({ label: r.label, value: r.value })
    if (mode === 'counts' && r.label && r.value) counts[r.label.trim()] = r.value
  }
  return { title, owner: get('owner'), status: get('status'), summary, counts }
}

export function parsePackageWorkbook(file: string): PackageWorkbook {
  const wb = XLSX.readFile(file)
  const warnings: string[] = []
  const base = path.basename(file)
  const readme = readmeBlocks(wb)

  const okrTable = readTable(wb, 'OKR', 'ID')
  if (!okrTable) throw new Error(`${base}: sheet "OKR" with an "ID" header not found`)
  const okr = parseOkrTable(okrTable)
  const codes = okr.map((r) => packageCodeFromId(r.id)).filter((c): c is string => !!c)
  const code = codes[0] ?? ''
  if (!code) throw new Error(`${base}: cannot tell the package code from the OKR ids`)
  if (codes.some((c) => c !== code)) warnings.push(`${base}: OKR ids mix package prefixes (${Array.from(new Set(codes)).join(', ')})`)

  const initiatives: InitiativeRow[] = []
  const ini = readTable(wb, 'Initiatives', 'ID')
  if (ini) {
    const c = {
      id: column(ini, /^id$/i),
      level: column(ini, /^level$/i),
      title: column(ini, /^initiative/i),
      ca: column(ini, /^type/i),
      baseline: column(ini, /^baseline/i),
      target: column(ini, /^target/i),
      due: column(ini, /^due/i),
      measuredBy: column(ini, /^measured by/i),
      supports: column(ini, /^supports/i),
      deps: column(ini, /^dependencies/i),
      owner: column(ini, /^owner$/i),
    }
    const review = reviewOf(ini)
    let groupRef: string | null = null
    for (const r of ini.rows) {
      const id = c.id(r).toUpperCase()
      if (!id) continue
      const level = c.level(r).toLowerCase()
      const kind = level.startsWith('group') ? 'GROUP' : level.startsWith('initiative') ? 'INITIATIVE' : null
      if (!kind) {
        warnings.push(`${base} Initiatives row ${r.rowNumber}: unknown level "${c.level(r)}" — skipped`)
        continue
      }
      if (kind === 'GROUP') groupRef = id
      initiatives.push({
        rowNumber: r.rowNumber,
        id,
        kind,
        title: c.title(r),
        ca: c.ca(r),
        baseline: c.baseline(r),
        target: c.target(r),
        due: c.due(r),
        measuredBy: c.measuredBy(r),
        supports: c.supports(r),
        dependencies: c.deps(r),
        owner: c.owner(r),
        groupRef: kind === 'INITIATIVE' ? groupRef : null,
        review: review(r),
      })
    }
  }

  const milestones: MilestoneRow[] = []
  const ms = readTable(wb, 'Milestones', 'ID')
  if (ms) {
    const parentIsInitiative = ms.header.some((h) => /^parent initiative/i.test(h))
    const c = {
      id: column(ms, /^id$/i),
      parent: column(ms, /^parent (kr|initiative)/i),
      title: column(ms, /^milestone/i),
      quarter: column(ms, /^quarter/i),
      due: column(ms, /^due/i),
      dependsOn: column(ms, /^depends on/i),
      status: column(ms, /^status/i),
    }
    const review = reviewOf(ms)
    for (const r of ms.rows) {
      const id = c.id(r).toUpperCase()
      if (!id) continue
      milestones.push({
        rowNumber: r.rowNumber,
        id,
        parentKr: c.parent(r).toUpperCase(),
        parentIsInitiative,
        title: c.title(r),
        quarter: c.quarter(r),
        due: c.due(r),
        dependsOn: c.dependsOn(r),
        status: c.status(r),
        review: review(r),
      })
    }
  }

  const tasks: TaskRow[] = []
  const ts = readTable(wb, 'Tasks', 'ID')
  if (ts) {
    const c = {
      id: column(ts, /^id$/i),
      sprint: column(ts, /^sprint/i),
      title: column(ts, /^task/i),
      parent: column(ts, /^parent/i),
      due: column(ts, /^due/i),
      collaborators: column(ts, /^collaborators/i),
      est: column(ts, /^est/i),
      unblocks: column(ts, /^unblocks/i),
      status: column(ts, /^status/i),
    }
    const review = reviewOf(ts)
    for (const r of ts.rows) {
      const id = c.id(r).toUpperCase()
      if (!id) continue
      tasks.push({
        rowNumber: r.rowNumber,
        id,
        sprint: c.sprint(r),
        title: c.title(r),
        parent: c.parent(r),
        due: c.due(r),
        collaborators: c.collaborators(r),
        estHours: c.est(r),
        unblocks: c.unblocks(r),
        status: c.status(r),
        review: review(r),
      })
    }
  }

  const kpis: KpiRow[] = []
  const ks = readTable(wb, 'KPIs', 'ID')
  let kpiScoredFromQ3 = false
  if (ks) {
    const targetHeader = ks.header.find((h) => /^target/i.test(h)) ?? ''
    kpiScoredFromQ3 = /scored from q3/i.test(targetHeader)
    const c = {
      id: column(ks, /^id$/i),
      name: column(ks, /^kpi$/i),
      type: column(ks, /^type$/i),
      definition: column(ks, /^definition/i),
      formula: column(ks, /^formula/i),
      dataSource: column(ks, /^data source/i),
      baseline: column(ks, /^baseline/i),
      target: column(ks, /^target/i),
      frequency: column(ks, /^frequency/i),
      note: column(ks, /^note/i),
    }
    const review = reviewOf(ks)
    for (const r of ks.rows) {
      const id = c.id(r).toUpperCase()
      if (!id) continue
      kpis.push({
        rowNumber: r.rowNumber,
        id,
        name: c.name(r),
        type: c.type(r),
        definition: c.definition(r),
        formula: c.formula(r),
        dataSource: c.dataSource(r),
        baseline: c.baseline(r),
        target: c.target(r),
        frequency: c.frequency(r),
        note: c.note(r),
        review: review(r),
      })
    }
  }

  const duties: DutyRow[] = []
  const ds = readTable(wb, 'Recurring Duties', 'ID')
  if (ds) {
    const c = {
      id: column(ds, /^id$/i),
      title: column(ds, /^duty/i),
      cadence: column(ds, /^cadence/i),
      timing: column(ds, /^timing/i),
      duration: column(ds, /^duration/i),
      output: column(ds, /^output/i),
      with: column(ds, /^with$/i),
      auto: column(ds, /^auto-task/i),
    }
    const review = reviewOf(ds)
    for (const r of ds.rows) {
      const id = c.id(r).toUpperCase()
      if (!id) continue
      duties.push({
        rowNumber: r.rowNumber,
        id,
        title: c.title(r),
        cadence: c.cadence(r),
        timing: c.timing(r),
        duration: c.duration(r),
        output: c.output(r),
        with: c.with(r),
        autoTask: c.auto(r),
        review: review(r),
      })
    }
  }

  const role: RoleRow[] = []
  const rs = readTable(wb, 'Role Definition', 'Section')
  if (rs) {
    const section = column(rs, /^section$/i)
    const item = column(rs, /^item$/i)
    const review = reviewOf(rs)
    for (const r of rs.rows) {
      if (!section(r) && !item(r)) continue
      role.push({ rowNumber: r.rowNumber, section: section(r), item: item(r), review: review(r) })
    }
  }

  const links: LinkRow[] = []
  const ls = readTable(wb, 'Links', 'ID') ?? readTable(wb, 'Dependencies', 'ID')
  if (ls) {
    const c = {
      id: column(ls, /^id$/i),
      direction: column(ls, /^direction/i),
      item: column(ls, /^item/i),
      counterparty: column(ls, /^counterparty/i),
      neededBy: column(ls, /^needed by/i),
      linked: column(ls, /^(linked|unblocks)/i),
      status: column(ls, /^status/i),
    }
    for (const r of ls.rows) {
      const id = c.id(r).toUpperCase()
      if (!id) continue
      links.push({
        rowNumber: r.rowNumber,
        id,
        direction: c.direction(r),
        item: c.item(r),
        counterparty: c.counterparty(r),
        neededBy: c.neededBy(r),
        linked: c.linked(r),
        status: c.status(r),
      })
    }
  }

  const decisionsNeeded: DecisionNeededRow[] = []
  const dn = readTable(wb, 'Decisions Needed', 'Decision')
  if (dn) {
    const c = {
      decision: column(dn, /^decision$/i),
      why: column(dn, /^why/i),
      ids: column(dn, /decision log id/i),
      neededBy: column(dn, /^needed by/i),
    }
    for (const r of dn.rows) {
      if (!c.decision(r)) continue
      decisionsNeeded.push({ rowNumber: r.rowNumber, decision: c.decision(r), why: c.why(r), ids: c.ids(r), neededBy: c.neededBy(r) })
    }
  }

  const dl = readTable(wb, 'Decision Log', 'ID')
  const decisionLog = dl ? parseDecisionTable(dl, `${base} · Decision Log`) : []

  const development: DevelopmentRow[] = []
  const dv = readTable(wb, 'Development Plan', 'ID')
  if (dv) {
    const c = {
      id: column(dv, /^id$/i),
      title: column(dv, /^development item/i),
      linked: column(dv, /^linked kr/i),
      target: column(dv, /^target/i),
      due: column(dv, /^due/i),
      status: column(dv, /^status/i),
    }
    for (const r of dv.rows) {
      const id = c.id(r).toUpperCase()
      if (!id) continue
      development.push({ rowNumber: r.rowNumber, id, title: c.title(r), linkedKr: c.linked(r), target: c.target(r), due: c.due(r), status: c.status(r) })
    }
  }

  const weights: WeightRow[] = []
  const pr = readTable(wb, 'Performance Review', 'Component')
  if (pr) {
    const c = { component: column(pr, /^component/i), weight: column(pr, /^weight/i), source: column(pr, /^source/i), how: column(pr, /^how it works/i) }
    for (const r of pr.rows) {
      if (!c.component(r)) continue
      weights.push({ component: c.component(r), weight: c.weight(r), source: c.source(r), how: c.how(r) })
    }
  }

  const ownerName = ownerNameFromLine(readme.owner)
  if (!ownerName) warnings.push(`${base}: README has no "Owner" line`)

  return {
    file,
    code,
    ownerName,
    ownerLine: readme.owner,
    version: packageVersion(readme.status, readme.title, file),
    statusText: readme.status,
    summary: readme.summary,
    counts: readme.counts,
    okr,
    initiatives,
    milestones,
    tasks,
    kpis,
    kpiScoredFromQ3,
    duties,
    role,
    links,
    decisionsNeeded,
    decisionLog,
    development,
    weights,
    warnings,
  }
}
