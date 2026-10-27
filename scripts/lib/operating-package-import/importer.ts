/**
 * Operating-package importer (IMP-1 … IMP-6) — orchestration.
 *
 * Phases (IMP-3): timeframe → Company OKR (objectives, KRs, checkpoints) → every package's header,
 * objectives and KRs → every package's initiatives (v2 "Initiatives" sheet, Todo kind=INITIATIVE) →
 * per package (milestones, tasks, duties + heads, role definition, KPIs, development) →
 * CONTRIBUTES_TO links → company Dependency Map + package X-links → Decisions (+ links) →
 * Agree/Dispute reviews → FY25/26 carry-forward SUCCEEDS links → optional summary notifications.
 * Initiatives are imported for all packages before any milestone or task, so a task may name another
 * package's initiative ("CEO CIN1.1").
 *
 * Idempotent on externalRef: every record is found by its workbook id and created or updated,
 * never deleted. A dry run (the default) reads the database but writes nothing.
 */
import { Prisma, type PrismaClient } from '@prisma/client'
import * as path from 'path'
import { readCarryForwardWorkbook, type CarryForwardRow } from '../../close-fy2526-okrs'
import {
  extractDecisionRefs,
  extractDependencyRefs,
  extractInitiativeRefs,
  extractKpiRefs,
  extractLocalRefs,
  extractOkrRefs,
  type OkrRefKind,
} from './ids'
import {
  findWorkbooks,
  parseCompanyWorkbook,
  parsePackageWorkbook,
  type CompanyWorkbook,
  type DecisionRow,
  type InitiativeRow,
  type OkrRow,
  type PackageWorkbook,
  type ReviewCell,
} from './parse'
import { loadUserMap, PeopleResolver, type Resolution, type UserRow } from './people'
import { REVIEW_SHEET_ORDER, ReviewSheets } from './review'
import {
  checkpointValue,
  commitmentFromCa,
  decisionStatus,
  dependencyStatus,
  dependencyType,
  developmentKind,
  developmentStatus,
  kpiPlan,
  krNumericPlan,
  linkDirection,
  mapCadence,
  parsePercent,
  parseYes,
  roleRowKind,
  succeedsSubKind,
  targetHours,
  todoStatus,
  weightKey,
  type KrScoring,
  type RoleItemSection,
} from './rules'
import { dutyHeadPlan, localDay } from './schedule'
import { ActivityBuffer, Counters, diffFields, dryId, isDryId, pick, type ActivityRow, type ChangeMap, type SyncOp } from './sync'
import { earliestDate, isBlank, isoDay, latestDate, leadTitle, parseDates, parseDurationMinutes, textOrNull, truncate, utcDate } from './text'

// ─── Constants ──────────────────────────────────────────────────────────────

export const TIMEFRAME = {
  name: 'FY 2026/27',
  type: 'YEARLY',
  startDate: utcDate(2026, 6, 7) as Date,
  endDate: utcDate(2027, 6, 6) as Date,
}

export const CHECKPOINTS: ReadonlyArray<{ label: 'Q2' | 'Q3' | 'Q4'; dueDate: Date }> = [
  { label: 'Q2', dueDate: utcDate(2026, 11, 31) as Date },
  { label: 'Q3', dueDate: utcDate(2027, 2, 31) as Date },
  { label: 'Q4', dueDate: utcDate(2027, 6, 6) as Date },
]

/** DUT-1/DUT-2: duties start with sprint S1 (Mon 12 Oct 2026) and run to the end of the fiscal year. */
export const DUTY_STARTS_ON_ISO = '2026-10-12'
export const DUTY_ENDS_ON_ISO = '2027-07-06'

/** "Target (scored from Q3)": Q3 of FY 2026/27 starts 1 Jan 2027. */
export const KPI_SCORED_FROM = utcDate(2027, 0, 1) as Date

export const NOTIFY_EVENT_KEY = 'PACKAGE_SENT_FOR_REVIEW'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ImportOptions {
  apply: boolean
  dataDir: string
  userMapPath: string
  reviewOut: string | null
  actorEmail: string | null
  notify: boolean
  oldTimeframeId: string | null
  now?: Date
  log?: (line: string) => void
}

export interface ImportResult {
  applied: boolean
  blocked: boolean
  blockers: string[]
  counters: Counters
  warnings: string[]
  reviewPath: string | null
  timeframeId: string | null
  activityRows: number
}

interface OkrNode {
  id: string
  type: OkrRefKind
  ownerId: string
  /** KRs: their objective; objectives: themselves. */
  objectiveId: string
  title: string
  level: 'COMPANY' | 'INDIVIDUAL'
  scoring?: KrScoring
}

/** An imported initiative (Todo kind=INITIATIVE) and the KR it supports. */
interface InitiativeState {
  todoId: string
  /** The supported KR (first KR named in "Supports", else the KR of a supported KPI); null when none. */
  keyResultId: string | null
  krRef: string | null
  title: string
  code: string
}

interface PackageState {
  pkg: PackageWorkbook
  ownerId: string
  packageId: string
  initiatives: Map<string, InitiativeState>
  milestones: Map<string, { todoId: string; keyResultId: string | null; title: string; initiativeRef: string | null }>
  tasks: Map<string, { todoId: string; keyResultId: string | null }>
  duties: Map<string, string>
  development: Map<string, string>
  roleItems: Map<number, string>
}

interface PlannedReview {
  packageId: string
  reviewerId: string
  entityType: string
  entityId: string
  verdict: 'AGREE' | 'DISPUTE'
  comment: string | null
  where: string
}

interface NameRecord {
  raw: string
  resolution: Resolution
  contexts: Set<string>
  blocking: boolean
}

/** Sensitive KPI edits are audited by field name only (KPI-7). */
function redactChanges(changes: ChangeMap): ChangeMap {
  const out: ChangeMap = {}
  for (const f of Object.keys(changes)) out[f] = { from: '(sensitive)', to: '(sensitive)' }
  return out
}

// ─── Importer ───────────────────────────────────────────────────────────────

export class OperatingPackageImporter {
  private readonly apply: boolean
  private readonly now: Date
  private readonly log: (line: string) => void
  readonly counters = new Counters()
  readonly review = new ReviewSheets()
  readonly warnings: string[] = []
  private readonly activity = new ActivityBuffer()
  private resolver!: PeopleResolver
  private readonly names = new Map<string, NameRecord>()
  private readonly blockerNotes: string[] = []

  private ceoId: string | null = null
  private actorId: string | null = null
  private tf = { id: '', startDate: TIMEFRAME.startDate, endDate: TIMEFRAME.endDate, exists: false }

  private readonly objByRef = new Map<string, OkrNode>()
  private readonly krByRef = new Map<string, OkrNode>()
  private readonly kpiByRef = new Map<string, string>()
  private readonly kpiToKr = new Map<string, string>()
  private readonly depByRef = new Map<string, { id: string; depType: string; title: string; unblocks: string }>()
  private readonly packages = new Map<string, PackageState>()
  /** Initiatives of every package by id (ids are global: EDN-IN1.1, CIN1.1). */
  private readonly initiativeByRef = new Map<string, InitiativeState>()
  private readonly contributes: Array<{ fromRef: string; toRef: string; source: string }> = []
  private readonly reviews: PlannedReview[] = []
  /** Decision refs found on tasks / milestones (Decision → TODO links). */
  private readonly decisionTodoRefs: Array<{ decisionRef: string; todoId: string }> = []
  /** Dependency refs found on tasks (WorkDependency → TODO links). */
  private readonly dependencyTodoRefs: Array<{ depRef: string; todoId: string }> = []

  constructor(
    private readonly prisma: PrismaClient,
    private readonly opts: ImportOptions,
  ) {
    this.apply = opts.apply
    this.now = opts.now ?? new Date()
    this.log = opts.log ?? ((line) => console.log(line))
  }

  // ── Entry point ──────────────────────────────────────────────────────────

  async run(): Promise<ImportResult> {
    const files = findWorkbooks(this.opts.dataDir)
    const company = parseCompanyWorkbook(files.company)
    const parsed = files.packages.map((f) => parsePackageWorkbook(f))
    const packages = this.dedupePackages(parsed)
    for (const p of packages) this.warnings.push(...p.warnings)
    const carry = files.ceo ? readCarryForwardWorkbook(files.ceo) : { rows: [] as CarryForwardRow[], errors: [] as string[] }
    for (const e of carry.errors) this.warn(`Carry-forward sheet: ${e}`)
    this.log(`Workbooks: ${path.basename(files.company)} + ${packages.length} packages (${packages.map((p) => p.code).join(', ')}); carry-forward rows: ${carry.rows.length}`)

    const users = await this.prisma.user.findMany({ select: { id: true, name: true, email: true, isActive: true } })
    this.resolver = new PeopleResolver(users as UserRow[], loadUserMap(this.opts.userMapPath))

    this.resolveEveryName(company, packages)
    await this.resolveActor()
    const blockers = this.blockers()
    this.writePeopleSheets()

    if (this.apply && blockers.length > 0) {
      this.finishReview(company, packages)
      return this.result(true, blockers)
    }

    await this.ensureTimeframe()
    await this.importCompanyOkr(company)
    await this.flush()
    const states: PackageState[] = []
    for (const pkg of packages) {
      const state = await this.importPackage(pkg)
      if (state) states.push(state)
      await this.flush()
    }
    for (const state of states) {
      await this.importInitiatives(state)
      await this.flush()
    }
    for (const state of states) {
      await this.importPackageWork(state)
      await this.flush()
    }
    await this.importContributesLinks()
    await this.flush()
    await this.importDependencies(company, packages)
    await this.flush()
    await this.importDecisions(company, packages)
    await this.flush()
    await this.importReviews()
    await this.flush()
    await this.importCarryForward(carry.rows)
    await this.flush()
    if (this.opts.notify) await this.notifyOwners()

    this.finishReview(company, packages)
    return this.result(false, this.blockers())
  }

  private result(blocked: boolean, blockers: string[]): ImportResult {
    return {
      applied: this.apply && !blocked,
      blocked,
      blockers,
      counters: this.counters,
      warnings: this.warnings,
      reviewPath: this.opts.reviewOut,
      timeframeId: this.tf.id && !isDryId(this.tf.id) ? this.tf.id : null,
      activityRows: this.activity.written,
    }
  }

  private async flush() {
    await this.activity.flush(this.prisma, this.apply)
  }

  private warn(message: string) {
    this.warnings.push(message)
  }

  private dedupePackages(parsed: PackageWorkbook[]): PackageWorkbook[] {
    const byCode = new Map<string, PackageWorkbook>()
    for (const p of parsed) {
      const prev = byCode.get(p.code)
      if (!prev) {
        byCode.set(p.code, p)
        continue
      }
      const keep = Number(p.version.slice(1)) >= Number(prev.version.slice(1)) ? p : prev
      const drop = keep === p ? prev : p
      this.warn(`Two workbooks for package ${p.code}: using ${path.basename(keep.file)}, ignoring ${path.basename(drop.file)}`)
      byCode.set(p.code, keep)
    }
    return Array.from(byCode.values())
  }

  // ── People ───────────────────────────────────────────────────────────────

  /** Resolve every name in a cell; records each token for the People sheet. Returns matched user ids. */
  private peopleIn(cell: string | null | undefined, context: string, blocking: boolean): string[] {
    const ids: string[] = []
    for (const { raw, resolution } of this.resolver.resolveList(cell)) {
      const key = raw.toLowerCase()
      const rec = this.names.get(key) ?? { raw, resolution, contexts: new Set<string>(), blocking: false }
      rec.contexts.add(context)
      rec.blocking = rec.blocking || blocking
      this.names.set(key, rec)
      if (resolution.status === 'MATCHED' && !ids.includes(resolution.userId)) ids.push(resolution.userId)
    }
    return ids
  }

  /** The single owner of a cell ("Eden (Bid Lead)"); notes a blocker when a blocking cell has no person. */
  private ownerIn(cell: string, context: string, blocking: boolean): string | null {
    const ids = this.peopleIn(cell, context, blocking)
    const skipped = this.resolver.resolveList(cell).some(({ resolution }) => resolution.status === 'SKIPPED')
    if (ids.length === 0 && blocking && !isBlank(cell) && !skipped) {
      const note = `${context}: "${cell}" names no matched person`
      if (!this.blockerNotes.includes(note)) this.blockerNotes.push(note)
    }
    return ids[0] ?? null
  }

  private resolveEveryName(company: CompanyWorkbook, packages: PackageWorkbook[]) {
    this.ceoId = this.ownerIn('CEO', 'Decision decider (CEO)', true)
    for (const r of company.okr) this.ownerIn(r.owner, `Company OKR ${r.id} owner`, true)
    for (const d of company.dependencies) {
      this.peopleIn(d.providers, `Dependency ${d.id} provider`, true)
      this.peopleIn(d.needers, `Dependency ${d.id} needed by`, false)
    }
    for (const d of company.decisions) this.peopleIn(d.requestedBy, `Decision ${d.id} requested by`, false)
    for (const p of packages) {
      const where = `${p.code} package`
      this.ownerIn(p.ownerName, `${where} owner (README)`, true)
      for (const r of p.okr) this.ownerIn(r.owner || p.ownerName, `${where} ${r.id} owner`, true)
      for (const r of p.initiatives) if (r.kind === 'INITIATIVE') this.ownerIn(r.owner || p.ownerName, `${where} ${r.id} owner`, true)
      for (const t of p.tasks) this.peopleIn(t.collaborators, `${where} task ${t.id} collaborators`, false)
      for (const d of p.duties) this.peopleIn(d.with, `${where} duty ${d.id} with`, false)
      for (const l of p.links) this.peopleIn(l.counterparty, `${where} link ${l.id} counterparty`, false)
      for (const d of p.decisionLog) this.peopleIn(d.requestedBy, `Decision ${d.id} requested by`, false)
      for (const r of p.role) if (roleRowKind(r.section).kind === 'REPORTS_TO') this.peopleIn(r.item, `${where} reports to`, false)
    }
  }

  private async resolveActor() {
    if (this.opts.actorEmail) {
      const actor = await this.prisma.user.findUnique({ where: { email: this.opts.actorEmail }, select: { id: true } })
      if (!actor) {
        this.blockerNotes.push(`--actor-email ${this.opts.actorEmail}: no such user`)
        return
      }
      this.actorId = actor.id
    } else {
      this.actorId = this.ceoId
    }
  }

  private blockers(): string[] {
    const out: string[] = []
    for (const rec of Array.from(this.names.values())) {
      if (!rec.blocking) continue
      if (rec.resolution.status === 'UNMATCHED' || rec.resolution.status === 'AMBIGUOUS') {
        const detail = rec.resolution.status === 'AMBIGUOUS' ? ` (ambiguous: ${rec.resolution.candidates.join('; ')})` : ''
        out.push(`Unmatched owner "${rec.raw}"${detail} — used in ${Array.from(rec.contexts).slice(0, 3).join(' | ')}${rec.contexts.size > 3 ? ` (+${rec.contexts.size - 3} more)` : ''}`)
      }
    }
    for (const note of this.blockerNotes) if (!out.includes(note)) out.push(note)
    if (!this.actorId) out.push('No actor: the CEO is unmatched and no --actor-email was given')
    return out
  }

  private writePeopleSheets() {
    const recs = Array.from(this.names.values()).sort((a, b) => a.raw.localeCompare(b.raw))
    for (const rec of recs) {
      const r = rec.resolution
      const row = {
        'Name as written': rec.raw,
        Status: r.status,
        'Matched user': r.status === 'MATCHED' ? r.userName : null,
        Email: r.status === 'MATCHED' ? r.userEmail : null,
        Method: r.method,
        Candidates: r.status === 'AMBIGUOUS' ? r.candidates.join('; ') : null,
        'Blocks --apply': rec.blocking && (r.status === 'UNMATCHED' || r.status === 'AMBIGUOUS') ? 'YES' : '',
        'Used in': Array.from(rec.contexts).slice(0, 12).join(' | ') + (rec.contexts.size > 12 ? ` (+${rec.contexts.size - 12})` : ''),
      }
      this.review.add('People', row)
      if (r.status === 'UNMATCHED' || r.status === 'AMBIGUOUS') this.review.add('Unmatched', row)
    }
  }

  // ── Generic create-or-update ─────────────────────────────────────────────

  private async sync(p: {
    entity: string
    key: string
    existing: { id: string } | null
    desired: Record<string, unknown>
    updateFields: readonly string[]
    create: () => Promise<{ id: string }>
    update: (id: string, data: Record<string, unknown>) => Promise<unknown>
    activity?: (id: string, op: 'create' | 'update', changes: ChangeMap | null) => ActivityRow | null
  }): Promise<{ id: string; op: SyncOp }> {
    if (!p.existing) {
      const id = this.apply ? (await p.create()).id : dryId(p.entity, p.key)
      this.counters.bump(p.entity, 'create')
      const row = p.activity?.(id, 'create', null)
      if (row) this.activity.push(row)
      return { id, op: 'create' }
    }
    const changes = diffFields(p.existing as unknown as Record<string, unknown>, p.desired, p.updateFields)
    if (!changes) {
      this.counters.bump(p.entity, 'unchanged')
      return { id: p.existing.id, op: 'unchanged' }
    }
    if (this.apply) await p.update(p.existing.id, pick(p.desired, Object.keys(changes)))
    this.counters.bump(p.entity, 'update')
    const row = p.activity?.(p.existing.id, 'update', changes)
    if (row) this.activity.push(row)
    return { id: p.existing.id, op: 'update' }
  }

  /** Create the join rows (members, collaborators, parties, links) that are missing; never deletes. */
  private async ensureJoins(entity: string, existingKeys: Set<string>, wanted: Array<{ key: string }>, create: (missing: string[]) => Promise<unknown>) {
    const missing = Array.from(new Set(wanted.map((w) => w.key))).filter((k) => !existingKeys.has(k))
    this.counters.bump(entity, 'unchanged', wanted.length - missing.length)
    if (missing.length === 0) return
    this.counters.bump(entity, 'create', missing.length)
    if (this.apply) await create(missing)
  }

  private pkgMeta(state: PackageState | null, entityId: string, extra: Record<string, unknown> = {}) {
    return {
      entityId,
      ...(state ? { userId: state.ownerId, packageId: isDryId(state.packageId) ? null : state.packageId } : {}),
      timeframeId: this.tf.id,
      ...extra,
    }
  }

  // ── Timeframe ────────────────────────────────────────────────────────────

  private async ensureTimeframe() {
    const existing = await this.prisma.timeframe.findUnique({ where: { name: TIMEFRAME.name } })
    if (existing) {
      this.tf = { id: existing.id, startDate: existing.startDate, endDate: existing.endDate, exists: true }
      this.counters.bump('Timeframe', 'unchanged')
      return
    }
    if (!this.apply) {
      this.tf = { id: dryId('Timeframe', TIMEFRAME.name), startDate: TIMEFRAME.startDate, endDate: TIMEFRAME.endDate, exists: false }
      this.counters.bump('Timeframe', 'create')
      return
    }
    const created = await this.prisma.timeframe.create({
      data: { name: TIMEFRAME.name, type: TIMEFRAME.type, startDate: TIMEFRAME.startDate, endDate: TIMEFRAME.endDate, isActive: false },
    })
    this.tf = { id: created.id, startDate: created.startDate, endDate: created.endDate, exists: true }
    this.counters.bump('Timeframe', 'create')
  }

  // ── OKR items ────────────────────────────────────────────────────────────

  private async syncObjective(row: OkrRow, level: 'COMPANY' | 'INDIVIDUAL', ownerId: string, parentObjectiveId: string | null, description: string | null, state: PackageState | null) {
    const existing = isDryId(this.tf.id)
      ? null
      : await this.prisma.objective.findUnique({ where: { timeframeId_externalRef: { timeframeId: this.tf.id, externalRef: row.id } } })
    const desired: Record<string, unknown> = {
      title: row.title,
      description,
      level,
      ownerId,
      startDate: this.tf.startDate,
      endDate: this.tf.endDate,
    }
    const updateFields = ['title', 'description', 'level', 'ownerId', 'startDate', 'endDate']
    if (existing && !existing.parentObjectiveId && parentObjectiveId && !isDryId(parentObjectiveId)) {
      desired.parentObjectiveId = parentObjectiveId
      updateFields.push('parentObjectiveId')
    }
    const { id } = await this.sync({
      entity: 'Objective',
      key: row.id,
      existing,
      desired,
      updateFields,
      create: () =>
        this.prisma.objective.create({
          data: {
            title: row.title,
            description,
            level,
            ownerId,
            timeframeId: this.tf.id,
            externalRef: row.id,
            status: 'ACTIVE',
            startDate: this.tf.startDate,
            endDate: this.tf.endDate,
            parentObjectiveId: parentObjectiveId && !isDryId(parentObjectiveId) ? parentObjectiveId : null,
            alignmentType: 'LOOSE',
          },
          select: { id: true },
        }),
      update: (oid, data) => this.prisma.objective.update({ where: { id: oid }, data: data as Prisma.ObjectiveUncheckedUpdateInput }),
      activity: (oid, op, changes) => ({
        entityType: 'OBJECTIVE',
        action: op === 'create' ? 'CREATED' : 'UPDATED',
        actorId: this.actorId,
        objectiveId: oid,
        changes,
        metadata: { externalRef: row.id, title: row.title, ...(state ? { packageId: state.packageId, userId: state.ownerId } : {}) },
      }),
    })
    this.objByRef.set(row.id, { id, type: 'OBJECTIVE', ownerId, objectiveId: id, title: row.title, level })
    if (row.review.verdict && state) this.planReview(state, 'OBJECTIVE', id, row.review, `${row.sheet} ${row.id}`)
    return id
  }

  private async syncKeyResult(row: OkrRow, objective: OkrNode, ownerId: string, description: string | null, state: PackageState | null) {
    const plan = krNumericPlan(row.target, row.baseline, row.title)
    const existing =
      isDryId(objective.id) ? null : await this.prisma.keyResult.findUnique({ where: { objectiveId_externalRef: { objectiveId: objective.id, externalRef: row.id } } })
    const definition: Record<string, unknown> = {
      title: row.title,
      description,
      ownerId,
      commitment: commitmentFromCa(row.ca),
      baselineText: textOrNull(row.baseline),
      targetText: textOrNull(row.target),
      measuredBy: textOrNull(row.measuredBy),
      dueText: textOrNull(row.due),
      dueDate: latestDate(row.due),
    }
    const numbers = {
      startValue: plan.startValue,
      targetValue: plan.targetValue,
      currentValue: plan.startValue,
      unit: plan.unit,
      direction: plan.direction,
    }
    let pristine = true
    if (existing) {
      const checkIns = await this.prisma.keyResultCheckIn.count({ where: { keyResultId: existing.id } })
      pristine = checkIns === 0 && existing.currentValue === existing.startValue && existing.progress === 0
      if (!pristine && diffFields(existing as unknown as Record<string, unknown>, numbers, ['startValue', 'targetValue', 'unit', 'direction'])) {
        this.warn(`${row.id}: KR already has progress or check-ins — its numbers were left as they are (workbook plan: ${plan.scoring} ${plan.startValue}→${plan.targetValue} ${plan.unit})`)
      }
    }
    const desired = pristine ? { ...definition, ...numbers } : definition
    const updateFields = Object.keys(desired)
    const { id } = await this.sync({
      entity: 'KeyResult',
      key: row.id,
      existing,
      desired,
      updateFields,
      create: () =>
        this.prisma.keyResult.create({
          data: {
            title: row.title,
            description,
            ownerId,
            objectiveId: objective.id,
            externalRef: row.id,
            commitment: definition.commitment as string | null,
            baselineText: definition.baselineText as string | null,
            targetText: definition.targetText as string | null,
            measuredBy: definition.measuredBy as string | null,
            dueText: definition.dueText as string | null,
            dueDate: definition.dueDate as Date | null,
            ...numbers,
          },
          select: { id: true },
        }),
      update: (kid, data) => this.prisma.keyResult.update({ where: { id: kid }, data: data as Prisma.KeyResultUncheckedUpdateInput }),
      activity: (kid, op, changes) => ({
        entityType: 'KEY_RESULT',
        action: op === 'create' ? 'CREATED' : 'UPDATED',
        actorId: this.actorId,
        keyResultId: kid,
        changes,
        metadata: { externalRef: row.id, title: row.title, objectiveId: objective.id, ...(state ? { packageId: state.packageId, userId: state.ownerId } : {}) },
      }),
    })

    const final = pristine || !existing ? numbers : { startValue: existing.startValue, targetValue: existing.targetValue, unit: existing.unit }
    const scoring: KrScoring =
      plan.scoring === 'MILESTONE' && final.startValue === 0 && final.targetValue === 100 && final.unit === '%' ? 'MILESTONE' : 'NUMERIC'
    this.krByRef.set(row.id, { id, type: 'KEY_RESULT', ownerId, objectiveId: objective.id, title: row.title, level: objective.level, scoring })
    for (const kpiRef of extractKpiRefs(row.measuredBy)) if (!this.kpiToKr.has(kpiRef)) this.kpiToKr.set(kpiRef, id)

    this.review.add('KR plan', {
      Package: state?.pkg.code ?? 'Company',
      KR: row.id,
      Owner: this.userLabel(ownerId),
      'C/A': row.ca,
      Target: row.target,
      Baseline: truncate(row.baseline, 120),
      Scoring: scoring,
      Start: final.startValue,
      'Target value': final.targetValue,
      Unit: final.unit,
      Direction: pristine || !existing ? plan.direction : existing.direction,
      Reason: pristine || !existing ? plan.reason : 'existing KR has progress — numbers kept',
      Due: row.due,
      'Due date': isoDay(latestDate(row.due)),
    })

    // Checkpoints (company OKR only carries the Q2/Q3/Q4 columns).
    for (const cp of CHECKPOINTS) {
      const text = row.checkpoints[cp.label]
      if (isBlank(text)) continue
      const targetValue = scoring === 'NUMERIC' ? checkpointValue(text, final.unit, pristine || !existing ? plan.pick : null) : null
      const cpExisting = isDryId(id) ? null : await this.prisma.keyResultCheckpoint.findUnique({ where: { keyResultId_label: { keyResultId: id, label: cp.label } } })
      await this.sync({
        entity: 'KeyResultCheckpoint',
        key: `${row.id}:${cp.label}`,
        existing: cpExisting,
        desired: { dueDate: cp.dueDate, targetText: text, targetValue },
        updateFields: ['dueDate', 'targetText', 'targetValue'],
        create: () =>
          this.prisma.keyResultCheckpoint.create({ data: { keyResultId: id, label: cp.label, dueDate: cp.dueDate, targetText: text, targetValue }, select: { id: true } }),
        update: (cid, data) => this.prisma.keyResultCheckpoint.update({ where: { id: cid }, data: data as Prisma.KeyResultCheckpointUncheckedUpdateInput }),
        activity: (cid, op, changes) => ({
          entityType: 'KR_CHECKPOINT',
          action: op === 'create' ? 'CREATED' : 'UPDATED',
          actorId: this.actorId,
          keyResultId: id,
          changes,
          metadata: { entityId: cid, keyResultId: id, label: cp.label, timeframeId: this.tf.id },
        }),
      })
      this.review.add('Checkpoints', { KR: row.id, Label: cp.label, 'Due date': isoDay(cp.dueDate), Target: text, 'Target value': targetValue })
    }

    if (row.review.verdict && state) this.planReview(state, 'KEY_RESULT', id, row.review, `${row.sheet} ${row.id}`)
    return id
  }

  // ── Company OKR ──────────────────────────────────────────────────────────

  private async importCompanyOkr(company: CompanyWorkbook) {
    for (const row of company.okr) {
      const ownerId = this.ownerIn(row.owner, `Company OKR ${row.id} owner`, true) ?? this.ceoId
      if (!ownerId) {
        this.counters.bump(row.kind === 'OBJECTIVE' ? 'Objective' : 'KeyResult', 'skip')
        continue
      }
      if (row.review.verdict) this.warn(`Company OKR ${row.id}: review cell "${row.review.raw}" has no package to attach to — not imported`)
      if (row.kind === 'OBJECTIVE') {
        const description = textOrNull(row.team) ? `Team: ${row.team}` : null
        await this.syncObjective(row, 'COMPANY', ownerId, null, description, null)
      } else {
        const objective = row.objectiveRef ? this.objByRef.get(row.objectiveRef) : undefined
        if (!objective) {
          this.warn(`Company OKR ${row.id}: no objective row above it`)
          this.counters.bump('KeyResult', 'skip')
          continue
        }
        const lines = [textOrNull(row.team) ? `Team: ${row.team}` : null, textOrNull(row.dependencies) ? `Dependencies: ${row.dependencies}` : null].filter(Boolean)
        await this.syncKeyResult(row, objective, ownerId, lines.length ? lines.join('\n') : null, null)
        for (const ref of extractOkrRefs(row.landsIn)) this.contributes.push({ fromRef: ref.id, toRef: row.id, source: `Company ${row.id} "Lands in"` })
      }
    }
  }

  // ── Packages ─────────────────────────────────────────────────────────────

  private userLabel(id: string | null | undefined): string {
    if (!id) return ''
    for (const rec of Array.from(this.names.values())) {
      if (rec.resolution.status === 'MATCHED' && rec.resolution.userId === id) return rec.resolution.userName
    }
    return id
  }

  /** Package header, objectives and KRs; the rest of the package follows in importPackageWork(). */
  private async importPackage(pkg: PackageWorkbook): Promise<PackageState | null> {
    const ownerId = this.ownerIn(pkg.ownerName, `${pkg.code} package owner (README)`, true)
    const ownerSkipped = this.resolver.resolveList(pkg.ownerName).some(({ resolution }) => resolution.status === 'SKIPPED')
    if (!ownerId && ownerSkipped) {
      this.warn(`${pkg.code}: package owner "${pkg.ownerName}" is marked skip in the user map — package not imported`)
      this.counters.bump('OperatingPackage', 'skip')
      return null
    }
    if (!ownerId) {
      this.warn(`${pkg.code}: package owner "${pkg.ownerName}" is unmatched — package skipped`)
      this.counters.bump('OperatingPackage', 'skip')
      return null
    }

    // Header (PKG): status DRAFT on create; never moved by the importer afterwards.
    const seat = pkg.role.find((r) => roleRowKind(r.section).kind === 'SEAT')?.item ?? null
    const weights: Record<string, number> = {}
    for (const w of pkg.weights) {
      const key = weightKey(w.component)
      const value = parsePercent(w.weight)
      if (key && value !== null) weights[key] = value
    }
    const summaryJson = { lines: pkg.summary.map((s) => ({ label: s.label, value: s.value })), counts: pkg.counts }
    const sourceFile = path.basename(pkg.file)
    const existingPkg = isDryId(this.tf.id)
      ? null
      : await this.prisma.operatingPackage.findUnique({ where: { userId_timeframeId: { userId: ownerId, timeframeId: this.tf.id } } })
    const desiredPkg: Record<string, unknown> = {
      version: pkg.version,
      seatTitle: seat,
      summaryJson,
      weightsJson: Object.keys(weights).length ? weights : null,
      sourceFile,
    }
    let packageId: string
    if (existingPkg && existingPkg.status !== 'DRAFT') {
      this.warn(`${pkg.code}: package is ${existingPkg.status} — header left unchanged`)
      this.counters.bump('OperatingPackage', 'skip')
      packageId = existingPkg.id
    } else {
      const res = await this.sync({
        entity: 'OperatingPackage',
        key: pkg.code,
        existing: existingPkg,
        desired: desiredPkg,
        updateFields: ['version', 'seatTitle', 'summaryJson', 'weightsJson', 'sourceFile'],
        create: () =>
          this.prisma.operatingPackage.create({
            data: {
              userId: ownerId,
              timeframeId: this.tf.id,
              version: pkg.version,
              status: 'DRAFT',
              seatTitle: seat,
              summaryJson: summaryJson as Prisma.InputJsonValue,
              weightsJson: Object.keys(weights).length ? (weights as Prisma.InputJsonValue) : Prisma.DbNull,
              sourceFile,
            },
            select: { id: true },
          }),
        update: (pid, data) => {
          const d: Record<string, unknown> = { ...data }
          if ('weightsJson' in d && d.weightsJson === null) d.weightsJson = Prisma.DbNull
          return this.prisma.operatingPackage.update({ where: { id: pid }, data: d as Prisma.OperatingPackageUncheckedUpdateInput })
        },
        activity: (pid, op, changes) => ({
          entityType: 'OPERATING_PACKAGE',
          action: op === 'create' ? 'CREATED' : 'UPDATED',
          actorId: this.actorId,
          changes: changes ? { ...changes, ...(changes.weightsJson ? { weightsJson: { from: '(sensitive)', to: '(sensitive)' } } : {}) } : null,
          metadata: { entityId: pid, userId: ownerId, timeframeId: this.tf.id, packageId: pid, version: pkg.version, sourceFile },
        }),
      })
      packageId = res.id
    }

    const state: PackageState = {
      pkg,
      ownerId,
      packageId,
      initiatives: new Map(),
      milestones: new Map(),
      tasks: new Map(),
      duties: new Map(),
      development: new Map(),
      roleItems: new Map(),
    }
    this.packages.set(pkg.code, state)
    this.review.add('Packages', {
      Package: pkg.code,
      Owner: this.userLabel(ownerId),
      'Owner (README)': pkg.ownerName,
      Version: pkg.version,
      File: sourceFile,
      Seat: seat,
      Weights: JSON.stringify(weights),
      'README counts': Object.entries(pkg.counts)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · '),
      'Parsed rows': `OKR ${pkg.okr.length} · initiatives ${pkg.initiatives.filter((i) => i.kind === 'INITIATIVE').length} · milestones ${pkg.milestones.length} · tasks ${pkg.tasks.length} · KPIs ${pkg.kpis.length} · duties ${pkg.duties.length} · dev ${pkg.development.length} · links ${pkg.links.length}`,
    })

    await this.importPackageOkr(state)
    return state
  }

  private async importPackageWork(state: PackageState) {
    await this.importMilestones(state)
    await this.importTasks(state)
    await this.importDuties(state)
    await this.importRoleDefinition(state)
    await this.importKpis(state)
    await this.importDevelopment(state)
  }

  private async importPackageOkr(state: PackageState) {
    const { pkg } = state
    for (const row of pkg.okr) {
      const ownerId = this.ownerIn(row.owner || pkg.ownerName, `${pkg.code} package ${row.id} owner`, true) ?? state.ownerId
      const linked = extractOkrRefs(row.linkedKrs)
      if (row.kind === 'OBJECTIVE') {
        const firstCompanyKr = linked.find((r) => r.kind === 'KEY_RESULT' && this.krByRef.get(r.id)?.level === 'COMPANY')
        const parent = firstCompanyKr ? this.krByRef.get(firstCompanyKr.id)?.objectiveId ?? null : null
        if (!parent && linked.length > 0) this.warn(`${row.id}: linked company KR(s) "${row.linkedKrs}" not found — no parent objective`)
        const description = textOrNull(row.dependencies) ? `Dependencies: ${row.dependencies}` : null
        await this.syncObjective(row, 'INDIVIDUAL', ownerId, parent, description, state)
      } else {
        const objective = row.objectiveRef ? this.objByRef.get(row.objectiveRef) : undefined
        if (!objective) {
          this.warn(`${pkg.code} ${row.id}: no objective row above it`)
          this.counters.bump('KeyResult', 'skip')
          continue
        }
        const description = textOrNull(row.dependencies) ? `Dependencies: ${row.dependencies}` : null
        await this.syncKeyResult(row, objective, ownerId, description, state)
      }
      for (const ref of linked) this.contributes.push({ fromRef: row.id, toRef: ref.id, source: `${row.id} "Linked company KR"` })
    }
  }

  // ── Initiatives (v2) ─────────────────────────────────────────────────────

  /** The KR id of a KPI: the KR whose "Measured by" names it, else the KR an earlier run or the Odoo link stored on it. */
  private async kpiKeyResult(kpiRef: string): Promise<{ id: string; ref: string } | null> {
    const fromSheet = this.kpiToKr.get(kpiRef)
    if (fromSheet) return { id: fromSheet, ref: this.krRefOf(fromSheet) }
    if (isDryId(this.tf.id)) return null
    const kpi = await this.prisma.kpi.findFirst({ where: { timeframeId: this.tf.id, externalRef: kpiRef, keyResultId: { not: null } }, select: { keyResultId: true } })
    return kpi?.keyResultId ? { id: kpi.keyResultId, ref: this.krRefOf(kpi.keyResultId) } : null
  }

  /**
   * "Supports (key result or KPI)" → the KR the initiative hangs off: the first imported KR named
   * ("EDN-KR1.2", "Company KR1.4 (settlement)", "CEO C1.2"), else the KR of a named KPI ("KPI YOG-K01");
   * an objective named alone sets objectiveId. Everything else is kept as description lines.
   */
  private async resolveSupports(text: string) {
    const krs = extractOkrRefs(text).filter((r) => r.kind === 'KEY_RESULT')
    const objectives = extractOkrRefs(text).filter((r) => r.kind === 'OBJECTIVE')
    const kpis = extractKpiRefs(text)
    const lines: string[] = []
    let keyResultId: string | null = null
    let krRef: string | null = null
    let objectiveId: string | null = null
    const resolved = krs.filter((r) => this.krByRef.has(r.id))
    if (resolved.length > 0) {
      krRef = resolved[0].id
      keyResultId = this.krByRef.get(krRef)!.id
    }
    const others = krs.map((r) => r.id).filter((id) => id !== krRef)
    if (others.length) lines.push(`Also supports: ${others.join(', ')}${others.some((id) => !this.krByRef.has(id)) ? ' (not all imported)' : ''}`)
    if (kpis.length) {
      lines.push(`Supports KPI: ${kpis.join(', ')}`)
      if (!keyResultId) {
        for (const k of kpis) {
          const viaKpi = await this.kpiKeyResult(k)
          if (viaKpi) {
            keyResultId = viaKpi.id
            krRef = viaKpi.ref
            lines.push(`Key result via KPI ${k}: ${viaKpi.ref}`)
            break
          }
        }
      }
    }
    if (!keyResultId && objectives.length) {
      const obj = objectives.map((o) => this.objByRef.get(o.id)).find(Boolean)
      if (obj) objectiveId = obj.id
    }
    return { keyResultId, krRef, objectiveId, lines }
  }

  private async importInitiatives(state: PackageState) {
    const { pkg } = state
    const groups = new Map(pkg.initiatives.filter((r) => r.kind === 'GROUP').map((g) => [g.id, g.title]))
    for (const row of pkg.initiatives) {
      if (row.kind !== 'INITIATIVE') continue
      await this.syncInitiative(state, row, groups)
    }
  }

  private async syncInitiative(state: PackageState, row: InitiativeRow, groups: Map<string, string>) {
    const { pkg } = state
    const ownerId = this.ownerIn(row.owner || pkg.ownerName, `${pkg.code} package ${row.id} owner`, true) ?? state.ownerId
    const supports = await this.resolveSupports(row.supports)
    const dates = parseDates(row.due)
    const dueDate = dates.length === 1 ? dates[0] : null
    const title = leadTitle(row.title, 140)
    const groupTitle = row.groupRef ? groups.get(row.groupRef) ?? '' : ''
    const description = [
      row.title,
      '',
      // "Label: value" lines read back by lib/package/initiatives.ts (parseInitiativeMeta).
      `Initiative ${row.id}`,
      row.groupRef ? `Group: ${row.groupRef}${groupTitle ? ` — ${groupTitle}` : ''}` : null,
      textOrNull(row.ca) ? `Type (C/A): ${row.ca}` : null,
      textOrNull(row.baseline) ? `Baseline: ${row.baseline}` : null,
      textOrNull(row.target) ? `Target: ${row.target}` : null,
      textOrNull(row.due) ? `Due: ${row.due}` : null,
      textOrNull(row.measuredBy) ? `Measured by: ${row.measuredBy}` : null,
      `Supports: ${textOrNull(row.supports) ?? '—'}`,
      ...supports.lines,
      textOrNull(row.dependencies) ? `Dependencies: ${row.dependencies}` : null,
    ]
      .filter((l) => l !== null)
      .join('\n')

    const keyResultId = supports.keyResultId && !isDryId(supports.keyResultId) ? supports.keyResultId : null
    let existing: { id: string } | null = null
    if (keyResultId) {
      existing = await this.prisma.todo.findUnique({ where: { keyResultId_externalRef: { keyResultId, externalRef: row.id } } })
    }
    if (!existing && !isDryId(this.tf.id)) {
      // KR-less initiatives (and ones whose KR changed) are found by ref + kind + owner within this timeframe.
      existing = await this.prisma.todo.findFirst({
        where: {
          externalRef: row.id,
          kind: 'INITIATIVE',
          AND: [
            { OR: [{ assigneeId: ownerId }, { creatorId: ownerId }] },
            { OR: [{ keyResultId: null }, { keyResult: { objective: { timeframeId: this.tf.id } } }] },
          ],
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, title: true, description: true, dueDate: true, assigneeId: true, keyResultId: true, objectiveId: true, progressValue: true, kind: true },
      })
    }
    const desired = {
      title,
      description,
      dueDate,
      assigneeId: ownerId,
      keyResultId: supports.keyResultId,
      objectiveId: supports.objectiveId,
      progressValue: null,
      kind: 'INITIATIVE',
    }
    const { id } = await this.sync({
      entity: 'Todo (initiative)',
      key: row.id,
      existing,
      desired,
      updateFields: ['title', 'description', 'dueDate', 'assigneeId', 'keyResultId', 'objectiveId', 'progressValue', 'kind'],
      create: () =>
        this.prisma.todo.create({
          data: { ...desired, status: 'PENDING', priority: 'MEDIUM', creatorId: ownerId, externalRef: row.id },
          select: { id: true },
        }),
      update: (tid, data) => this.prisma.todo.update({ where: { id: tid }, data: data as Prisma.TodoUncheckedUpdateInput }),
      activity: (tid, op, changes) => ({
        entityType: 'TODO',
        action: op === 'create' ? 'INITIATIVE_CREATED' : 'INITIATIVE_UPDATED',
        actorId: this.actorId,
        todoId: tid,
        changes,
        metadata: { externalRef: row.id, kind: 'INITIATIVE', keyResultId: supports.keyResultId, packageId: state.packageId, userId: ownerId, title },
      }),
    })
    await this.ensureTodoMembers(id, [ownerId])
    const info: InitiativeState = { todoId: id, keyResultId: supports.keyResultId, krRef: supports.krRef, title, code: pkg.code }
    state.initiatives.set(row.id, info)
    if (!this.initiativeByRef.has(row.id)) this.initiativeByRef.set(row.id, info)
    else this.warn(`${pkg.code} initiative ${row.id}: id already used by another package — the first one wins for cross-package references`)
    for (const d of extractDecisionRefs(row.dependencies)) this.decisionTodoRefs.push({ decisionRef: d, todoId: id })
    for (const d of extractDependencyRefs(row.dependencies)) this.dependencyTodoRefs.push({ depRef: d, todoId: id })
    if (row.review.verdict) this.planReview(state, 'TODO', id, row.review, `Initiatives ${row.id}`)
    if (!supports.keyResultId && !supports.objectiveId) {
      this.warn(`${pkg.code} initiative ${row.id}: "Supports" (${row.supports || '—'}) names no imported key result — imported without a KR`)
    }
    this.review.add('Initiatives', {
      Package: pkg.code,
      Id: row.id,
      Group: row.groupRef ?? '',
      Title: title,
      'C/A': row.ca,
      Supports: row.supports,
      'Linked KR': supports.krRef ?? '',
      'Linked objective': supports.objectiveId ? 'yes' : '',
      Notes: supports.lines.join(' | '),
      Due: row.due,
      'Due date': isoDay(dueDate),
      Owner: this.userLabel(ownerId),
    })
  }

  // ── Milestones and tasks ─────────────────────────────────────────────────

  private async ensureTodoMembers(todoId: string, userIds: string[]) {
    const wanted = Array.from(new Set(userIds)).map((u) => ({ key: u }))
    if (wanted.length === 0) return
    const existing = isDryId(todoId)
      ? new Set<string>()
      : new Set((await this.prisma.todoMember.findMany({ where: { todoId }, select: { userId: true } })).map((m) => m.userId))
    await this.ensureJoins('TodoMember', existing, wanted, (missing) =>
      this.prisma.todoMember.createMany({ data: missing.map((userId) => ({ todoId, userId })), skipDuplicates: true }),
    )
  }

  /** 100/n per milestone, two decimals, the last one taking the rounding remainder so they sum to 100. */
  private milestoneShares(n: number): number[] {
    if (n <= 0) return []
    const share = Math.floor((100 / n) * 100) / 100
    const out = Array.from({ length: n }, () => share)
    out[n - 1] = Math.round((100 - share * (n - 1)) * 100) / 100
    return out
  }

  private initiativeOf(state: PackageState, ref: string): InitiativeState | undefined {
    return state.initiatives.get(ref) ?? this.initiativeByRef.get(ref)
  }

  /**
   * A milestone's parent: v1 "Parent KR" (the KR itself) or v2 "Parent initiative" (the initiative's
   * KR, which may be none). `found: false` when the parent is not imported.
   */
  private milestoneParent(state: PackageState, m: { parentKr: string; parentIsInitiative: boolean }) {
    const viaInitiative = m.parentIsInitiative || extractInitiativeRefs(m.parentKr).length > 0
    if (viaInitiative) {
      const initiativeRef = extractInitiativeRefs(m.parentKr)[0]?.id ?? m.parentKr
      const initiative = this.initiativeOf(state, initiativeRef)
      if (!initiative) return { found: false as const, initiativeRef, initiative: undefined, kr: undefined, krRef: null }
      const kr = initiative.krRef ? this.krByRef.get(initiative.krRef) : undefined
      return { found: true as const, initiativeRef, initiative, kr, krRef: initiative.krRef }
    }
    const kr = this.krByRef.get(m.parentKr)
    return { found: !!kr, initiativeRef: null, initiative: undefined, kr, krRef: kr ? m.parentKr : null }
  }

  private async importMilestones(state: PackageState) {
    const { pkg, ownerId } = state
    // 100/n shares are counted per KR, over the milestones that land on it (directly or via an initiative).
    // Only the package's own KRs are scored this way: an initiative that supports a company or another
    // package's KR ("Company KR5.1 (with Biruk)") must not move that KR from one package's milestones.
    const ownKrs = new Set(pkg.okr.filter((r) => r.kind === 'KEY_RESULT').map((r) => r.id))
    const byKr = new Map<string, number>()
    for (const m of pkg.milestones) {
      const parent = this.milestoneParent(state, m)
      if (parent.krRef && ownKrs.has(parent.krRef)) byKr.set(parent.krRef, (byKr.get(parent.krRef) ?? 0) + 1)
    }
    const seen = new Map<string, number>()
    for (const m of pkg.milestones) {
      const parent = this.milestoneParent(state, m)
      if (!parent.found) {
        this.warn(`${pkg.code} milestone ${m.id}: parent ${parent.initiativeRef ? 'initiative' : 'KR'} "${m.parentKr}" not found — skipped`)
        this.counters.bump('Todo (milestone)', 'skip')
        continue
      }
      const { kr, krRef, initiative, initiativeRef } = parent
      const keyResultId = kr?.id ?? null
      let progressValue: number | null = null
      if (kr && krRef && kr.scoring === 'MILESTONE' && ownKrs.has(krRef)) {
        const index = seen.get(krRef) ?? 0
        seen.set(krRef, index + 1)
        progressValue = this.milestoneShares(byKr.get(krRef) ?? 1)[index]
      }
      const dueDate = latestDate(m.due)
      const description = [
        initiative ? `Initiative: ${initiativeRef} — ${initiative.title}` : null,
        m.title,
        '',
        `Milestone ${m.id} · ${initiative ? `${initiativeRef}${krRef ? ` → ${krRef}` : ' (no key result)'}` : m.parentKr}${m.quarter ? ` · ${m.quarter}` : ''}`,
        textOrNull(m.due) ? `Due: ${m.due}` : null,
        textOrNull(m.dependsOn) ? `Depends on: ${m.dependsOn}` : null,
      ]
        .filter((l) => l !== null)
        .join('\n')
      const title = truncate(m.title, 180)
      let existing: { id: string } | null =
        keyResultId && !isDryId(keyResultId) ? await this.prisma.todo.findUnique({ where: { keyResultId_externalRef: { keyResultId, externalRef: m.id } } }) : null
      if (!existing && !isDryId(this.tf.id)) {
        // Milestone ids are package-local: a milestone with no KR (or whose KR changed) is found by ref + owner.
        existing = await this.prisma.todo.findFirst({
          where: {
            externalRef: m.id,
            kind: 'MILESTONE',
            AND: [
              { OR: [{ assigneeId: ownerId }, { creatorId: ownerId }] },
              { OR: [{ keyResultId: null }, { keyResult: { objective: { timeframeId: this.tf.id } } }] },
            ],
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true, title: true, description: true, dueDate: true, assigneeId: true, keyResultId: true, progressValue: true, kind: true },
        })
      }
      const desired = { title, description, dueDate, assigneeId: ownerId, keyResultId, progressValue, kind: 'MILESTONE' }
      const { id } = await this.sync({
        entity: 'Todo (milestone)',
        key: `${pkg.code}:${m.id}`,
        existing,
        desired,
        updateFields: ['title', 'description', 'dueDate', 'assigneeId', 'keyResultId', 'progressValue', 'kind'],
        create: () =>
          this.prisma.todo.create({
            data: { ...desired, status: todoStatus(m.status), priority: 'MEDIUM', creatorId: ownerId, externalRef: m.id },
            select: { id: true },
          }),
        update: (tid, data) => this.prisma.todo.update({ where: { id: tid }, data: data as Prisma.TodoUncheckedUpdateInput }),
        activity: (tid, op, changes) => ({
          entityType: 'TODO',
          action: op === 'create' ? 'INITIATIVE_CREATED' : 'INITIATIVE_UPDATED',
          actorId: this.actorId,
          todoId: tid,
          changes,
          metadata: { externalRef: m.id, kind: 'MILESTONE', keyResultId, initiativeRef, packageId: state.packageId, userId: ownerId, title },
        }),
      })
      await this.ensureTodoMembers(id, [ownerId])
      state.milestones.set(m.id, { todoId: id, keyResultId, title, initiativeRef })
      for (const d of extractDecisionRefs(`${m.dependsOn}`)) this.decisionTodoRefs.push({ decisionRef: d, todoId: id })
      if (m.review.verdict) this.planReview(state, 'TODO', id, m.review, `Milestones ${m.id}`)
      this.review.add('Milestones & tasks', {
        Package: pkg.code,
        Kind: 'MILESTONE',
        Id: m.id,
        Parent: m.parentKr,
        'Key result': krRef ?? '',
        'KR scoring': kr ? `${kr.scoring}${krRef && !ownKrs.has(krRef) ? ' (not this package — not scored)' : ''}` : 'no KR',
        'Progress value': progressValue,
        Due: m.due,
        'Due date': isoDay(dueDate),
        Title: truncate(m.title, 100),
      })
    }
  }

  private async importTasks(state: PackageState) {
    const { pkg, ownerId } = state
    for (const t of pkg.tasks) {
      const local = extractLocalRefs(t.parent)
      const okr = extractOkrRefs(t.parent).filter((r) => r.kind === 'KEY_RESULT')
      let keyResultId: string | null = null
      let milestone: { todoId: string; keyResultId: string | null; title: string; initiativeRef: string | null } | undefined
      for (const mid of local.milestones) {
        milestone = state.milestones.get(mid)
        if (milestone) break
      }
      // v2: a task may hang off an initiative ("YOG-IN1.3", or another package's "CEO CIN1.1").
      let initiativeRef: string | null = milestone?.initiativeRef ?? null
      let initiative = initiativeRef ? this.initiativeOf(state, initiativeRef) : undefined
      if (!milestone) {
        for (const ref of extractInitiativeRefs(t.parent)) {
          if (ref.kind !== 'INITIATIVE') continue
          const found = this.initiativeOf(state, ref.id)
          if (found) {
            initiative = found
            initiativeRef = ref.id
            break
          }
          this.warn(`${pkg.code} task ${t.id}: initiative ${ref.id} not found`)
        }
      }
      let via = 'no KR'
      if (milestone) {
        keyResultId = milestone.keyResultId
        via = keyResultId ? `via ${local.milestones[0]}` : `${local.milestones[0]} (no KR)`
      } else if (initiative) {
        keyResultId = initiative.keyResultId
        via = keyResultId ? `via ${initiativeRef}` : `${initiativeRef} (no KR)`
      } else if (okr.length > 0) {
        keyResultId = this.krByRef.get(okr[0].id)?.id ?? null
        if (keyResultId) via = 'direct KR'
      }
      if (!milestone && local.milestones.length > 0) this.warn(`${pkg.code} task ${t.id}: milestone ${local.milestones.join(', ')} not found`)

      const dueDate = latestDate(t.due)
      const description = [
        t.title,
        '',
        `Task ${t.id}${t.sprint ? ` · Sprint ${t.sprint}` : ''}`,
        milestone ? `Milestone: ${local.milestones[0]} — ${milestone.title}` : null,
        initiative ? `Initiative: ${initiativeRef} — ${initiative.title}` : null,
        `Parent: ${t.parent || '—'}`,
        textOrNull(t.unblocks) ? `Unblocks: ${t.unblocks}` : null,
        textOrNull(t.estHours) ? `Estimated hours: ${t.estHours}` : null,
        textOrNull(t.due) && !dueDate ? `Due: ${t.due}` : null,
      ]
        .filter((l) => l !== null)
        .join('\n')
      const title = truncate(t.title, 180)

      let existing: { id: string } | null = null
      if (keyResultId && !isDryId(keyResultId)) {
        existing = await this.prisma.todo.findUnique({ where: { keyResultId_externalRef: { keyResultId, externalRef: t.id } } })
      }
      if (!existing && !isDryId(this.tf.id)) {
        // A task without a KR (or one whose parent changed) is found by owner + ref within this timeframe.
        existing = await this.prisma.todo.findFirst({
          where: {
            externalRef: t.id,
            kind: 'TASK',
            assigneeId: ownerId,
            OR: [{ keyResultId: null }, { keyResult: { objective: { timeframeId: this.tf.id } } }],
          },
          select: { id: true, title: true, description: true, dueDate: true, assigneeId: true, keyResultId: true, progressValue: true, kind: true },
        })
      }
      const desired = { title, description, dueDate, assigneeId: ownerId, keyResultId, progressValue: null, kind: 'TASK' }
      const { id } = await this.sync({
        entity: 'Todo (task)',
        key: `${pkg.code}:${t.id}`,
        existing,
        desired,
        updateFields: ['title', 'description', 'dueDate', 'assigneeId', 'keyResultId', 'progressValue', 'kind'],
        create: () =>
          this.prisma.todo.create({
            data: { ...desired, status: todoStatus(t.status), priority: 'MEDIUM', creatorId: ownerId, externalRef: t.id },
            select: { id: true },
          }),
        update: (tid, data) => this.prisma.todo.update({ where: { id: tid }, data: data as Prisma.TodoUncheckedUpdateInput }),
        activity: (tid, op, changes) => ({
          entityType: 'TODO',
          action: op === 'create' ? 'INITIATIVE_CREATED' : 'INITIATIVE_UPDATED',
          actorId: this.actorId,
          todoId: tid,
          changes,
          metadata: { externalRef: t.id, kind: 'TASK', keyResultId, initiativeRef, packageId: state.packageId, userId: ownerId, title },
        }),
      })
      const collaborators = this.peopleIn(t.collaborators, `${pkg.code} task ${t.id} collaborators`, false)
      await this.ensureTodoMembers(id, [ownerId, ...collaborators])
      state.tasks.set(t.id, { todoId: id, keyResultId })
      for (const d of extractDecisionRefs(t.parent)) this.decisionTodoRefs.push({ decisionRef: d, todoId: id })
      for (const d of extractDependencyRefs(t.parent)) this.dependencyTodoRefs.push({ depRef: d, todoId: id })
      if (t.review.verdict) this.planReview(state, 'TODO', id, t.review, `Tasks ${t.id}`)
      this.review.add('Milestones & tasks', {
        Package: pkg.code,
        Kind: 'TASK',
        Id: t.id,
        Parent: t.parent,
        'Key result': keyResultId ? this.krRefOf(keyResultId) : '',
        'KR scoring': via,
        'Progress value': null,
        Due: t.due,
        'Due date': isoDay(dueDate),
        Title: truncate(t.title, 100),
      })
    }
  }

  private async importDuties(state: PackageState) {
    const { pkg, ownerId } = state
    const startsOn = localDay(DUTY_STARTS_ON_ISO)
    const endsOn = localDay(DUTY_ENDS_ON_ISO)
    for (const d of pkg.duties) {
      const mapping = mapCadence(d.cadence, d.title, d.timing)
      const autoTask = parseYes(d.autoTask)
      const durationMin = parseDurationMinutes(d.duration)
      const timingText = textOrNull(d.timing)
      const outputText = textOrNull(d.output)
      const collaborators = this.peopleIn(d.with, `${pkg.code} duty ${d.id} with`, false).filter((u) => u !== ownerId)
      const plan = dutyHeadPlan({
        cadence: mapping.cadence,
        autoTask,
        startsOn,
        endsOn,
        timingText,
        durationMin,
        outputText,
        eventLabel: mapping.eventLabel,
        now: this.now,
      })

      const existing = isDryId(this.tf.id)
        ? null
        : await this.prisma.recurringDuty.findUnique({ where: { timeframeId_ownerId_externalRef: { timeframeId: this.tf.id, ownerId, externalRef: d.id } } })
      const desired: Record<string, unknown> = {
        title: d.title,
        cadence: mapping.cadence,
        eventLabel: mapping.eventLabel,
        timingText,
        durationMin,
        outputText,
        autoTask,
        packageId: isDryId(state.packageId) ? null : state.packageId,
      }
      let updateFields = ['title', 'outputText', 'packageId', 'eventLabel', 'cadence', 'timingText', 'durationMin', 'autoTask']
      if (existing?.todoHeadId) {
        // The head's schedule belongs to the duties service once it exists (DUT-4): reschedule there.
        const scheduleChanged = diffFields(existing as unknown as Record<string, unknown>, desired, ['cadence', 'timingText', 'durationMin', 'autoTask'])
        if (scheduleChanged) this.warn(`${pkg.code} duty ${d.id}: cadence/timing changed in the workbook — edit it in the duties UI to reschedule its series`)
        updateFields = ['title', 'outputText', 'packageId', 'eventLabel']
      }
      const { id } = await this.sync({
        entity: 'RecurringDuty',
        key: `${pkg.code}:${d.id}`,
        existing,
        desired,
        updateFields,
        create: () =>
          this.prisma.recurringDuty.create({
            data: {
              externalRef: d.id,
              ownerId,
              timeframeId: this.tf.id,
              packageId: isDryId(state.packageId) ? null : state.packageId,
              title: d.title,
              cadence: mapping.cadence,
              eventLabel: mapping.eventLabel,
              timingText,
              durationMin,
              outputText,
              autoTask,
              status: 'ACTIVE',
              startsOn,
              endsOn,
            },
            select: { id: true },
          }),
        update: (did, data) => this.prisma.recurringDuty.update({ where: { id: did }, data: data as Prisma.RecurringDutyUncheckedUpdateInput }),
        activity: (did, op, changes) => ({
          entityType: 'RECURRING_DUTY',
          action: op === 'create' ? 'CREATED' : 'UPDATED',
          actorId: this.actorId,
          changes,
          metadata: this.pkgMeta(state, did, { externalRef: d.id, title: d.title, cadence: mapping.cadence }),
        }),
      })
      state.duties.set(d.id, id)

      const existingCollabs = isDryId(id)
        ? new Set<string>()
        : new Set((await this.prisma.recurringDutyCollaborator.findMany({ where: { dutyId: id }, select: { userId: true } })).map((c) => c.userId))
      await this.ensureJoins('RecurringDutyCollaborator', existingCollabs, collaborators.map((u) => ({ key: u })), (missing) =>
        this.prisma.recurringDutyCollaborator.createMany({ data: missing.map((userId) => ({ dutyId: id, userId })), skipDuplicates: true }),
      )

      // DUT-1: the Todo recurrence head, created once.
      let headNote = plan ? '' : mapping.cadence === 'EVENT' ? 'EVENT — no head (Log occurrence)' : 'no head'
      const headId = existing?.todoHeadId ?? null
      if (plan && !headId) {
        this.counters.bump('Todo (duty head)', 'create')
        this.counters.bump('TodoMember', 'create', new Set([ownerId, ...collaborators]).size)
        if (this.apply) {
          // DUT-1: head create + duty link happen in one transaction so a crash cannot
          // leave a head whose duty has no todoHeadId. An orphan head left by an older
          // partial run (dutyId set, duty not linked) is re-linked instead of duplicated.
          const head = await this.prisma.$transaction(async (tx) => {
            const orphan = await tx.todo.findFirst({
              where: { dutyId: id, recurrenceRule: { not: null }, recurrenceParentId: null },
              orderBy: { createdAt: 'asc' },
              select: { id: true },
            })
            const h =
              orphan ??
              (await tx.todo.create({
                data: {
                  title: d.title,
                  description: plan.description,
                  status: 'PENDING',
                  priority: 'MEDIUM',
                  dueDate: plan.dueDate,
                  startTime: plan.startTime,
                  endTime: plan.endTime,
                  recurrenceRule: plan.rule,
                  recurrenceEndsAt: endsOn,
                  recurrenceAnchorDay: plan.anchorDay,
                  recurrenceCountsProgress: false,
                  progressValue: null,
                  kind: 'DUTY',
                  dutyId: id,
                  assigneeId: ownerId,
                  creatorId: ownerId,
                  members: { create: Array.from(new Set([ownerId, ...collaborators])).map((userId) => ({ userId })) },
                },
                select: { id: true },
              }))
            await tx.recurringDuty.update({ where: { id }, data: { todoHeadId: h.id } })
            return { id: h.id, relinked: Boolean(orphan) }
          })
          if (head.relinked) {
            this.warn(`${pkg.code} duty ${d.id}: re-linked orphan duty head ${head.id} left by an earlier partial run`)
            await this.ensureTodoMembers(head.id, [ownerId, ...collaborators])
          } else this.activity.push({
            entityType: 'TODO',
            action: 'INITIATIVE_CREATED',
            actorId: this.actorId,
            todoId: head.id,
            metadata: { kind: 'DUTY', dutyId: id, externalRef: d.id, recurrenceRule: plan.rule, userId: ownerId, packageId: state.packageId, title: d.title },
          })
        }
        headNote = `head created: ${plan.rule}, first due ${isoDay(plan.dueDate)}`
      } else if (headId) {
        this.counters.bump('Todo (duty head)', 'unchanged')
        await this.ensureTodoMembers(headId, [ownerId, ...collaborators])
        headNote = 'head exists (schedule untouched)'
      }

      if (d.review.verdict) this.planReview(state, 'DUTY', id, d.review, `Recurring Duties ${d.id}`)
      this.review.add('Duties', {
        Package: pkg.code,
        Id: d.id,
        Duty: truncate(d.title, 90),
        'Cadence (workbook)': d.cadence,
        Cadence: mapping.cadence,
        Rule: plan?.rule ?? '',
        'Event label': mapping.eventLabel,
        Timing: d.timing,
        'Duration (min)': durationMin,
        'First due': plan ? isoDay(new Date(Date.UTC(plan.dueDate.getFullYear(), plan.dueDate.getMonth(), plan.dueDate.getDate()))) : '',
        Planner: plan?.startTime || plan?.endTime ? `${plan?.startTime ?? ''}–${plan?.endTime ?? ''}` : '',
        'Auto-task': autoTask ? 'Yes' : 'No',
        With: d.with,
        Head: headNote,
        Note: mapping.note,
      })
    }
  }

  private async importRoleDefinition(state: PackageState) {
    const { pkg, ownerId } = state
    if (pkg.role.length === 0) return
    let seatTitle = ''
    let reportsToText: string | null = null
    let purpose = ''
    const items: Array<{ section: RoleItemSection; label: string; text: string; source: (typeof pkg.role)[number] }> = []
    for (const r of pkg.role) {
      const kind = roleRowKind(r.section)
      if (kind.kind === 'SEAT') seatTitle = r.item
      else if (kind.kind === 'REPORTS_TO') reportsToText = textOrNull(r.item)
      else if (kind.kind === 'PURPOSE') purpose = r.item
      else {
        const parts = kind.split ? r.item.split(/\s+·\s+/).map((s) => s.trim()).filter(Boolean) : [r.item]
        for (const text of parts) if (text) items.push({ section: kind.section, label: r.section, text, source: r })
      }
    }
    const reportsToId = reportsToText ? this.peopleIn(reportsToText, `${pkg.code} reports to`, false)[0] ?? null : null

    const existing = isDryId(this.tf.id)
      ? null
      : await this.prisma.roleDefinition.findFirst({ where: { userId: ownerId, timeframeId: this.tf.id }, orderBy: { createdAt: 'desc' } })
    if (existing && existing.status !== 'DRAFT') {
      this.warn(`${pkg.code}: role definition is ${existing.status} — left unchanged`)
      this.counters.bump('RoleDefinition', 'skip')
      return
    }
    const desired = {
      seatTitle: seatTitle || pkg.ownerName,
      reportsToId,
      reportsToText,
      purpose,
      packageId: isDryId(state.packageId) ? null : state.packageId,
    }
    const { id } = await this.sync({
      entity: 'RoleDefinition',
      key: pkg.code,
      existing,
      desired,
      updateFields: ['seatTitle', 'reportsToId', 'reportsToText', 'purpose', 'packageId'],
      create: () =>
        this.prisma.roleDefinition.create({
          data: { ...desired, userId: ownerId, timeframeId: this.tf.id, status: 'DRAFT' },
          select: { id: true },
        }),
      update: (rid, data) => this.prisma.roleDefinition.update({ where: { id: rid }, data: data as Prisma.RoleDefinitionUncheckedUpdateInput }),
      activity: (rid, op, changes) => ({
        entityType: 'ROLE_DEFINITION',
        action: op === 'create' ? 'CREATED' : 'UPDATED',
        actorId: this.actorId,
        changes,
        metadata: this.pkgMeta(state, rid, { seatTitle: desired.seatTitle }),
      }),
    })

    // Items: matched by section + label + occurrence; text/position updated, missing ones created.
    const existingItems = isDryId(id)
      ? []
      : await this.prisma.roleDefinitionItem.findMany({ where: { roleDefinitionId: id }, orderBy: { position: 'asc' } })
    const keyed = new Map<string, (typeof existingItems)[number]>()
    const occ = new Map<string, number>()
    for (const it of existingItems) {
      const base = `${it.section}|${it.label ?? ''}`
      const n = occ.get(base) ?? 0
      occ.set(base, n + 1)
      keyed.set(`${base}|${n}`, it)
    }
    occ.clear()
    for (let position = 0; position < items.length; position++) {
      const it = items[position]
      const base = `${it.section}|${it.label}`
      const n = occ.get(base) ?? 0
      occ.set(base, n + 1)
      const prev = keyed.get(`${base}|${n}`) ?? null
      const res = await this.sync({
        entity: 'RoleDefinitionItem',
        key: `${pkg.code}:${base}|${n}`,
        existing: prev,
        desired: { text: it.text, position },
        updateFields: ['text', 'position'],
        create: () =>
          this.prisma.roleDefinitionItem.create({
            data: { roleDefinitionId: id, section: it.section, label: it.label, text: it.text, position },
            select: { id: true },
          }),
        update: (iid, data) => this.prisma.roleDefinitionItem.update({ where: { id: iid }, data: data as Prisma.RoleDefinitionItemUncheckedUpdateInput }),
      })
      state.roleItems.set(it.source.rowNumber * 100 + n, res.id)
      if (it.source.review.verdict && n === 0) this.planReview(state, 'ROLE_ITEM', res.id, it.source.review, `Role Definition row ${it.source.rowNumber}`)
    }
    this.review.add('Role definitions', {
      Package: pkg.code,
      Seat: desired.seatTitle,
      'Reports to': reportsToText,
      'Reports to (user)': this.userLabel(reportsToId),
      Purpose: truncate(purpose, 120),
      Items: items.length,
      'Direct-report seats': items.filter((i) => i.section === 'DIRECT_REPORT_SEAT').map((i) => i.text).join(' | '),
    })
  }

  private async importKpis(state: PackageState) {
    const { pkg, ownerId } = state
    for (const k of pkg.kpis) {
      const plan = kpiPlan({ name: k.name, type: k.type, definition: k.definition, target: k.target, baseline: k.baseline, frequency: k.frequency, note: k.note })
      const note = [
        textOrNull(k.note),
        plan.frequencyNote ? `Workbook frequency: ${plan.frequencyNote}` : null,
        plan.compound ? 'Compound KPI: several sub-targets in one row — enter readings as text with a manual RAG (KPI-6).' : null,
      ]
        .filter(Boolean)
        .join('\n')
      const keyResultId = this.kpiToKr.get(k.id) ?? null
      const desired: Record<string, unknown> = {
        name: k.name,
        kpiType: plan.kpiType,
        definition: k.definition || k.name,
        formula: textOrNull(k.formula),
        dataSource: textOrNull(k.dataSource),
        unit: plan.unit,
        direction: plan.direction,
        baselineText: textOrNull(k.baseline),
        baselineValue: plan.baselineValue,
        targetText: k.target || '—',
        targetValue: plan.targetValue,
        targetMin: plan.targetMin,
        targetMax: plan.targetMax,
        frequency: plan.frequency,
        scoredFrom: pkg.kpiScoredFromQ3 ? KPI_SCORED_FROM : null,
        keyResultId: keyResultId && !isDryId(keyResultId) ? keyResultId : null,
        isSensitive: plan.isSensitive,
        note: note || null,
        packageId: isDryId(state.packageId) ? null : state.packageId,
      }
      const existing = isDryId(this.tf.id)
        ? null
        : await this.prisma.kpi.findUnique({ where: { timeframeId_ownerId_externalRef: { timeframeId: this.tf.id, ownerId, externalRef: k.id } } })
      // A KR link made in the app or by scripts/link-odoo-sales-kpis.ts (CEO-K01 → KR1.1) is never cleared;
      // externalSource / coverageOfKpiId (Odoo sync) are not importer fields at all.
      const keepLink = !!existing?.keyResultId && !desired.keyResultId
      const { id } = await this.sync({
        entity: 'Kpi',
        key: k.id,
        existing,
        desired,
        updateFields: Object.keys(desired).filter((f) => !(keepLink && f === 'keyResultId')),
        create: () =>
          this.prisma.kpi.create({
            data: { ...(desired as Omit<Prisma.KpiUncheckedCreateInput, 'ownerId' | 'timeframeId'>), externalRef: k.id, ownerId, timeframeId: this.tf.id, status: 'ACTIVE' },
            select: { id: true },
          }),
        update: (kid, data) => this.prisma.kpi.update({ where: { id: kid }, data: data as Prisma.KpiUncheckedUpdateInput }),
        activity: (kid, op, changes) => ({
          entityType: 'KPI',
          action: op === 'create' ? 'CREATED' : 'UPDATED',
          actorId: this.actorId,
          changes: plan.isSensitive && changes ? redactChanges(changes) : changes,
          metadata: this.pkgMeta(state, kid, { externalRef: k.id, name: k.name, ...(plan.isSensitive ? { sensitive: true } : {}) }),
        }),
      })
      this.kpiByRef.set(k.id, id)
      if (k.review.verdict) this.planReview(state, 'KPI', id, k.review, `KPIs ${k.id}`)
      this.review.add('KPIs', {
        Package: pkg.code,
        Id: k.id,
        KPI: k.name,
        Type: plan.kpiType,
        Target: k.target,
        'Target value': plan.targetValue,
        'Range': plan.targetMin !== null ? `${plan.targetMin}–${plan.targetMax}` : '',
        Unit: plan.unit,
        Direction: plan.direction,
        'Baseline value': plan.baselineValue,
        Frequency: plan.frequency,
        'Frequency (workbook)': k.frequency,
        Compound: plan.compound ? 'YES' : '',
        Sensitive: plan.isSensitive ? 'YES' : '',
        'Linked KR': keyResultId ? this.krRefOf(keyResultId) : keepLink && existing?.keyResultId ? `${this.krRefOf(existing.keyResultId)} (kept)` : '',
        'Scored from': pkg.kpiScoredFromQ3 ? isoDay(KPI_SCORED_FROM) : '',
      })
    }
  }

  private krRefOf(id: string): string {
    for (const [ref, node] of Array.from(this.krByRef.entries())) if (node.id === id) return ref
    return id
  }

  private async importDevelopment(state: PackageState) {
    const { pkg, ownerId } = state
    for (const dv of pkg.development) {
      const krRef = extractOkrRefs(dv.linkedKr).find((r) => r.kind === 'KEY_RESULT' && this.krByRef.has(r.id))
      let keyResultId = krRef ? this.krByRef.get(krRef.id)!.id : null
      let linkedVia = krRef?.id ?? ''
      if (!keyResultId) {
        // v2: "Linked KR" may name an initiative ("CIN4.3", "CIN6.1, CIN6.2") — use the KR it supports.
        for (const ref of extractInitiativeRefs(dv.linkedKr)) {
          const ini = this.initiativeOf(state, ref.id)
          if (ini?.keyResultId) {
            keyResultId = ini.keyResultId
            linkedVia = `${ref.id} → ${ini.krRef}`
            break
          }
        }
      }
      const kind = developmentKind(dv.title, dv.target)
      const deferred = /deferred/i.test(`${dv.status} ${dv.due}`)
      const desired: Record<string, unknown> = {
        title: dv.title,
        kind,
        targetText: dv.target || dv.title,
        targetHours: targetHours(dv.target, kind === 'TRAINING_HOURS' ? dv.title : ''),
        dueDate: latestDate(dv.due),
        keyResultId: keyResultId && !isDryId(keyResultId) ? keyResultId : null,
        isMandatory: true,
        packageId: isDryId(state.packageId) ? null : state.packageId,
      }
      const existing = isDryId(this.tf.id)
        ? null
        : await this.prisma.developmentItem.findUnique({ where: { timeframeId_ownerId_externalRef: { timeframeId: this.tf.id, ownerId, externalRef: dv.id } } })
      const { id } = await this.sync({
        entity: 'DevelopmentItem',
        key: `${pkg.code}:${dv.id}`,
        existing,
        desired,
        updateFields: Object.keys(desired),
        create: () =>
          this.prisma.developmentItem.create({
            data: {
              ...(desired as Omit<Prisma.DevelopmentItemUncheckedCreateInput, 'ownerId' | 'timeframeId'>),
              externalRef: dv.id,
              ownerId,
              timeframeId: this.tf.id,
              status: developmentStatus(dv.status),
            },
            select: { id: true },
          }),
        update: (did, data) => this.prisma.developmentItem.update({ where: { id: did }, data: data as Prisma.DevelopmentItemUncheckedUpdateInput }),
        activity: (did, op, changes) => ({
          entityType: 'DEVELOPMENT_ITEM',
          action: op === 'create' ? 'CREATED' : 'UPDATED',
          actorId: this.actorId,
          changes,
          metadata: this.pkgMeta(state, did, { externalRef: dv.id, title: dv.title }),
        }),
      })
      state.development.set(dv.id, id)
      this.review.add('Development', {
        Package: pkg.code,
        Id: dv.id,
        Item: truncate(dv.title, 90),
        Kind: kind,
        Target: dv.target,
        'Target hours': desired.targetHours as number | null,
        Due: dv.due,
        'Due date': isoDay(desired.dueDate as Date | null),
        'Linked KR': linkedVia,
        Status: dv.status,
        Note: deferred ? 'Deferred in the workbook — imported NOT_STARTED with no due date' : '',
      })
    }
  }

  // ── CONTRIBUTES_TO ───────────────────────────────────────────────────────

  private nodeOf(ref: string): OkrNode | null {
    return this.krByRef.get(ref) ?? this.objByRef.get(ref) ?? null
  }

  private async upsertOkrLink(p: {
    from: OkrNode
    to: OkrNode
    kind: 'SUCCEEDS' | 'CONTRIBUTES_TO'
    subKind: string | null
    isPrimary: boolean
    note: string | null
    key: string
  }): Promise<{ id: string; op: SyncOp }> {
    const entity = p.kind === 'SUCCEEDS' ? 'OkrLink (SUCCEEDS)' : 'OkrLink (CONTRIBUTES_TO)'
    const existing =
      isDryId(p.from.id) || isDryId(p.to.id)
        ? null
        : await this.prisma.okrLink.findUnique({
            where: { fromType_fromId_toType_toId_kind: { fromType: p.from.type, fromId: p.from.id, toType: p.to.type, toId: p.to.id, kind: p.kind } },
          })
    const desired = { subKind: p.subKind, isPrimary: p.isPrimary, note: p.note }
    return this.sync({
      entity,
      key: p.key,
      existing,
      desired,
      updateFields: ['subKind', 'isPrimary', 'note'],
      create: () =>
        this.prisma.okrLink.create({
          data: { fromType: p.from.type, fromId: p.from.id, toType: p.to.type, toId: p.to.id, kind: p.kind, ...desired, createdById: this.actorId },
          select: { id: true },
        }),
      update: (lid, data) => this.prisma.okrLink.update({ where: { id: lid }, data: data as Prisma.OkrLinkUncheckedUpdateInput }),
      activity: (lid, op, changes) => ({
        entityType: 'OKR_LINK',
        action: op === 'create' ? 'LINKED' : 'UPDATED',
        actorId: this.actorId,
        objectiveId: p.from.type === 'OBJECTIVE' ? p.from.id : null,
        keyResultId: p.from.type === 'KEY_RESULT' ? p.from.id : null,
        changes,
        metadata: {
          entityId: lid,
          kind: p.kind,
          subKind: p.subKind,
          isPrimary: p.isPrimary,
          fromType: p.from.type,
          fromId: p.from.id,
          toType: p.to.type,
          toId: p.to.id,
          toTitle: p.to.title,
          timeframeId: this.tf.id,
        },
      }),
    })
  }

  private async importContributesLinks() {
    const done = new Set<string>()
    for (const plan of this.contributes) {
      const from = this.nodeOf(plan.fromRef)
      const to = this.nodeOf(plan.toRef)
      const key = `${plan.fromRef}->${plan.toRef}`
      const row = { From: plan.fromRef, To: plan.toRef, Source: plan.source, Result: '' }
      if (!from || !to) {
        row.Result = `unresolved: ${!from ? plan.fromRef : plan.toRef} not imported`
        this.review.add('Links (CONTRIBUTES_TO)', row)
        this.counters.bump('OkrLink (CONTRIBUTES_TO)', 'skip')
        continue
      }
      if (from.id === to.id || done.has(key)) {
        if (!done.has(key)) this.counters.bump('OkrLink (CONTRIBUTES_TO)', 'skip')
        continue
      }
      if (to.level !== 'COMPANY' || to.type !== 'KEY_RESULT') {
        row.Result = 'skipped: target is not a company KR'
        this.review.add('Links (CONTRIBUTES_TO)', row)
        this.counters.bump('OkrLink (CONTRIBUTES_TO)', 'skip')
        continue
      }
      if (from.level === 'COMPANY') {
        row.Result = 'skipped: company item contributing to a company KR'
        this.review.add('Links (CONTRIBUTES_TO)', row)
        this.counters.bump('OkrLink (CONTRIBUTES_TO)', 'skip')
        continue
      }
      done.add(key)
      const res = await this.upsertOkrLink({ from, to, kind: 'CONTRIBUTES_TO', subKind: null, isPrimary: false, note: null, key })
      row.Result = res.op
      this.review.add('Links (CONTRIBUTES_TO)', row)
    }
  }

  // ── Dependencies (DEP) ───────────────────────────────────────────────────

  private async syncDependency(p: {
    ref: string
    title: string
    depType: string
    neededByText: string
    unblocksText: string
    statusText: string
    note: string | null
    providers: string[]
    needers: string[]
    links: Array<{ entityType: string; entityId: string }>
    state: PackageState | null
  }) {
    const existing = isDryId(this.tf.id)
      ? null
      : await this.prisma.workDependency.findUnique({ where: { timeframeId_externalRef: { timeframeId: this.tf.id, externalRef: p.ref } } })
    const desired: Record<string, unknown> = {
      title: p.title,
      depType: p.depType,
      neededByDate: earliestDate(p.neededByText),
      unblocksText: textOrNull(p.unblocksText),
      note: p.note,
    }
    const { id } = await this.sync({
      entity: 'WorkDependency',
      key: p.ref,
      existing,
      desired,
      updateFields: ['title', 'depType', 'neededByDate', 'unblocksText', 'note'],
      create: () =>
        this.prisma.workDependency.create({
          data: {
            externalRef: p.ref,
            timeframeId: this.tf.id,
            title: p.title,
            depType: p.depType,
            neededByDate: desired.neededByDate as Date | null,
            unblocksText: desired.unblocksText as string | null,
            note: p.note,
            status: dependencyStatus(p.statusText),
            createdById: this.actorId,
          },
          select: { id: true },
        }),
      update: (wid, data) => this.prisma.workDependency.update({ where: { id: wid }, data: data as Prisma.WorkDependencyUncheckedUpdateInput }),
      activity: (wid, op, changes) => ({
        entityType: 'WORK_DEPENDENCY',
        action: op === 'create' ? 'CREATED' : 'UPDATED',
        actorId: this.actorId,
        changes,
        metadata: this.pkgMeta(p.state, wid, { externalRef: p.ref, title: truncate(p.title, 120) }),
      }),
    })
    this.depByRef.set(p.ref, { id, depType: p.depType, title: p.title, unblocks: p.unblocksText })

    const existingParties = isDryId(id)
      ? new Set<string>()
      : new Set((await this.prisma.workDependencyParty.findMany({ where: { dependencyId: id } })).map((r) => `${r.userId}|${r.role}`))
    const wantedParties = [...p.providers.map((u) => ({ key: `${u}|PROVIDER` })), ...p.needers.map((u) => ({ key: `${u}|NEEDER` }))]
    await this.ensureJoins('WorkDependencyParty', existingParties, wantedParties, (missing) =>
      this.prisma.workDependencyParty.createMany({
        data: missing.map((k) => {
          const [userId, role] = k.split('|')
          return { dependencyId: id, userId, role }
        }),
        skipDuplicates: true,
      }),
    )
    await this.ensureDependencyLinks(id, p.links)
    return id
  }

  private async ensureDependencyLinks(dependencyId: string, links: Array<{ entityType: string; entityId: string }>) {
    const usable = links.filter((l) => !isDryId(l.entityId))
    const dry = links.length - usable.length
    if (dry > 0) this.counters.bump('WorkDependencyLink', 'create', dry)
    const existing = isDryId(dependencyId)
      ? new Set<string>()
      : new Set((await this.prisma.workDependencyLink.findMany({ where: { dependencyId } })).map((r) => `${r.entityType}|${r.entityId}`))
    await this.ensureJoins('WorkDependencyLink', existing, usable.map((l) => ({ key: `${l.entityType}|${l.entityId}` })), (missing) =>
      this.prisma.workDependencyLink.createMany({
        data: missing.map((k) => {
          const [entityType, entityId] = k.split('|')
          return { dependencyId, entityType, entityId }
        }),
        skipDuplicates: true,
      }),
    )
  }

  /** OKR / KPI refs in free text → link targets; unresolved ids are returned for the review sheet. */
  private globalLinkTargets(text: string): { links: Array<{ entityType: string; entityId: string; ref: string }>; unresolved: string[] } {
    const links: Array<{ entityType: string; entityId: string; ref: string }> = []
    const unresolved: string[] = []
    for (const ref of extractOkrRefs(text)) {
      const node = this.nodeOf(ref.id)
      if (node) links.push({ entityType: node.type, entityId: node.id, ref: ref.id })
      else unresolved.push(ref.id)
    }
    for (const ref of extractKpiRefs(text)) {
      const id = this.kpiByRef.get(ref)
      if (id) links.push({ entityType: 'KPI', entityId: id, ref })
      else unresolved.push(ref)
    }
    for (const ref of extractInitiativeRefs(text)) {
      if (ref.kind !== 'INITIATIVE') continue
      const ini = this.initiativeByRef.get(ref.id)
      if (ini) links.push({ entityType: 'TODO', entityId: ini.todoId, ref: ref.id })
      else unresolved.push(ref.id)
    }
    return { links, unresolved }
  }

  /** Package-local refs (milestones, tasks, duties, development) plus global refs. */
  private packageLinkTargets(state: PackageState, text: string) {
    const out = this.globalLinkTargets(text)
    const local = extractLocalRefs(text)
    for (const m of local.milestones) {
      const ms = state.milestones.get(m)
      if (ms) out.links.push({ entityType: 'TODO', entityId: ms.todoId, ref: m })
      else out.unresolved.push(m)
    }
    for (const t of local.tasks) {
      const task = state.tasks.get(t)
      if (task) out.links.push({ entityType: 'TODO', entityId: task.todoId, ref: t })
      else out.unresolved.push(t)
    }
    for (const d of local.duties) {
      const duty = state.duties.get(d)
      if (duty) out.links.push({ entityType: 'DUTY', entityId: duty, ref: d })
      else out.unresolved.push(d)
    }
    for (const d of local.development) {
      const dev = state.development.get(d)
      if (dev) out.links.push({ entityType: 'DEVELOPMENT', entityId: dev, ref: d })
      else out.unresolved.push(d)
    }
    return out
  }

  private async importDependencies(company: CompanyWorkbook, packages: PackageWorkbook[]) {
    for (const d of company.dependencies) {
      const providers = this.peopleIn(d.providers, `Dependency ${d.id} provider`, true)
      const needers = this.peopleIn(d.needers, `Dependency ${d.id} needed by`, false)
      const depType = dependencyType(d.type)
      const { links, unresolved } = this.globalLinkTargets(d.unblocks)
      const noteParts = [depType === 'OTHER' || depType === 'BUDGET' ? `Type in workbook: ${d.type}` : null]
      const dateOk = earliestDate(d.neededBy)
      if (!dateOk || !/^(?:[A-Za-z]{3}\s+)?\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/.test(d.neededBy)) noteParts.push(`Needed by: ${d.neededBy}`)
      await this.syncDependency({
        ref: d.id,
        title: d.title,
        depType,
        neededByText: d.neededBy,
        unblocksText: d.unblocks,
        statusText: d.status,
        note: noteParts.filter(Boolean).join('\n') || null,
        providers,
        needers,
        links,
        state: null,
      })
      this.review.add('Dependencies', {
        Id: d.id,
        Source: 'Company Dependency Map',
        Title: truncate(d.title, 90),
        Type: depType,
        Providers: d.providers,
        'Provider users': providers.map((u) => this.userLabel(u)).join(', '),
        'Needed by (people)': d.needers,
        'Needer users': needers.map((u) => this.userLabel(u)).join(', '),
        'Needed by': d.neededBy,
        'Needed by date': isoDay(dateOk),
        'Linked items': links.map((l) => l.ref).join(', '),
        Unresolved: unresolved.join(', '),
      })
    }
    const mapIds = new Set(company.dependencies.map((d) => d.id))

    // Package-specific links (X-ids, DEP-7): one dependency each, keyed "<code>-X01".
    for (const pkg of packages) {
      const state = this.packages.get(pkg.code)
      if (!state) continue
      for (const l of pkg.links) {
        if (/^DEP\d+$/.test(l.id)) {
          if (!mapIds.has(l.id)) this.warn(`${pkg.code} Links: ${l.id} is not in the company Dependency Map`)
          continue
        }
        if (!/^X\d+$/.test(l.id)) {
          this.warn(`${pkg.code} Links: unrecognised id "${l.id}" — skipped`)
          continue
        }
        const direction = linkDirection(l.direction)
        if (!direction) {
          this.warn(`${pkg.code} Links ${l.id}: unknown direction "${l.direction}" — skipped`)
          continue
        }
        const counterparties = this.peopleIn(l.counterparty, `${pkg.code} link ${l.id} counterparty`, false).filter((u) => u !== state.ownerId)
        const providers = direction === 'INBOUND' ? counterparties : [state.ownerId]
        const needers = direction === 'INBOUND' ? [state.ownerId] : counterparties
        const { links, unresolved } = this.packageLinkTargets(state, l.linked)
        const ref = `${pkg.code}-${l.id}`
        const dateOk = earliestDate(l.neededBy)
        await this.syncDependency({
          ref,
          title: l.item,
          depType: 'OTHER',
          neededByText: l.neededBy,
          unblocksText: l.linked,
          statusText: l.status,
          note: [`${direction === 'INBOUND' ? 'Inbound to' : 'Outbound from'} ${pkg.code} (${l.counterparty || '—'})`, !dateOk && l.neededBy ? `Needed by: ${l.neededBy}` : null]
            .filter(Boolean)
            .join('\n'),
          providers,
          needers,
          links,
          state,
        })
        this.review.add('Dependencies', {
          Id: ref,
          Source: `${pkg.code} Links (${direction.toLowerCase()})`,
          Title: truncate(l.item, 90),
          Type: 'OTHER',
          Providers: direction === 'INBOUND' ? l.counterparty : pkg.ownerName,
          'Provider users': providers.map((u) => this.userLabel(u)).join(', '),
          'Needed by (people)': direction === 'INBOUND' ? pkg.ownerName : l.counterparty,
          'Needer users': needers.map((u) => this.userLabel(u)).join(', '),
          'Needed by': l.neededBy,
          'Needed by date': isoDay(dateOk),
          'Linked items': links.map((x) => x.ref).join(', '),
          Unresolved: unresolved.join(', '),
        })
      }
    }

    // Tasks whose parent is a dependency ("DEP54") deliver it: link the task to the dependency.
    for (const { depRef, todoId } of this.dependencyTodoRefs) {
      const dep = this.depByRef.get(depRef)
      if (dep) await this.ensureDependencyLinks(dep.id, [{ entityType: 'TODO', entityId: todoId }])
    }
  }

  // ── Decisions (DEC) ──────────────────────────────────────────────────────

  private mergedDecisions(company: CompanyWorkbook, packages: PackageWorkbook[]): DecisionRow[] {
    const byId = new Map<string, DecisionRow>()
    for (const p of packages) for (const d of p.decisionLog) if (!byId.has(d.id)) byId.set(d.id, d)
    for (const d of company.decisions) {
      const prev = byId.get(d.id)
      if (!prev) {
        byId.set(d.id, d)
        continue
      }
      // The CEO log is the superset; the company sheet only fills blanks.
      for (const k of ['title', 'requestedBy', 'neededBy', 'batch', 'options', 'unblocks', 'status'] as const) {
        if (!prev[k] && d[k]) prev[k] = d[k]
      }
    }
    return Array.from(byId.values()).sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
  }

  private async importDecisions(company: CompanyWorkbook, packages: PackageWorkbook[]) {
    if (!this.ceoId) {
      this.warn('Decisions skipped: the CEO (decider) is unmatched')
      return
    }
    // USER links: decisions each package lists under "Decisions Needed".
    const userLinks = new Map<string, Set<string>>()
    for (const p of packages) {
      const state = this.packages.get(p.code)
      if (!state) continue
      for (const dn of p.decisionsNeeded) {
        for (const ref of extractDecisionRefs(dn.ids)) {
          const set = userLinks.get(ref) ?? new Set<string>()
          set.add(state.ownerId)
          userLinks.set(ref, set)
        }
      }
    }
    const decisionIds = new Map<string, string>()
    for (const d of this.mergedDecisions(company, packages)) {
      const requesters = this.peopleIn(d.requestedBy, `Decision ${d.id} requested by`, false)
      const status = decisionStatus(d.status)
      const decided = status === 'DECIDED'
      const optionsText = [textOrNull(d.options), textOrNull(d.note) ? `Note: ${d.note}` : null].filter(Boolean).join('\n') || null
      const decisionText = decided ? (/^yes\b/i.test(d.ceoDecision) ? `Approved as proposed (${d.ceoDecision}).` : textOrNull(d.ceoDecision) ?? textOrNull(d.options)) : null
      const decidedAt = decided ? earliestDate(d.dateDecided) ?? earliestDate(d.options) : null
      const existing = isDryId(this.tf.id)
        ? null
        : await this.prisma.decision.findUnique({ where: { timeframeId_externalRef: { timeframeId: this.tf.id, externalRef: d.id } } })
      const desired: Record<string, unknown> = {
        title: d.title,
        requestedById: requesters[0] ?? null,
        requestedByText: textOrNull(d.requestedBy),
        deciderId: this.ceoId,
        neededBy: earliestDate(d.neededBy),
        batch: textOrNull(d.batch),
        optionsText,
        unblocksText: textOrNull(d.unblocks),
      }
      const updateFields = Object.keys(desired)
      // Status only moves forward from OPEN (a decision recorded in the app is never re-opened by the import).
      if (existing && existing.status === 'OPEN' && status !== 'OPEN') {
        Object.assign(desired, { status, decisionText, decidedAt, decidedById: decided ? this.ceoId : null })
        updateFields.push('status', 'decisionText', 'decidedAt', 'decidedById')
      }
      const { id } = await this.sync({
        entity: 'Decision',
        key: d.id,
        existing,
        desired,
        updateFields,
        create: () =>
          this.prisma.decision.create({
            data: {
              externalRef: d.id,
              timeframeId: this.tf.id,
              title: d.title,
              requestedById: requesters[0] ?? null,
              requestedByText: textOrNull(d.requestedBy),
              deciderId: this.ceoId as string,
              neededBy: earliestDate(d.neededBy),
              batch: textOrNull(d.batch),
              optionsText,
              unblocksText: textOrNull(d.unblocks),
              status,
              decisionText,
              decidedAt,
              decidedById: decided ? this.ceoId : null,
            },
            select: { id: true },
          }),
        update: (did, data) => this.prisma.decision.update({ where: { id: did }, data: data as Prisma.DecisionUncheckedUpdateInput }),
        activity: (did, op, changes) => ({
          entityType: 'DECISION',
          action: op === 'create' ? 'CREATED' : 'UPDATED',
          actorId: this.actorId,
          changes,
          metadata: { entityId: did, timeframeId: this.tf.id, externalRef: d.id, title: truncate(d.title, 120), userId: this.ceoId },
        }),
      })
      decisionIds.set(d.id, id)

      // Links: affected users, OKR / KPI items and dependencies named in the decision.
      const links: Array<{ entityType: string; entityId: string; ref: string }> = []
      for (const userId of Array.from(userLinks.get(d.id) ?? [])) links.push({ entityType: 'USER', entityId: userId, ref: this.userLabel(userId) })
      const targets = this.globalLinkTargets(`${d.title} ${d.unblocks}`)
      links.push(...targets.links)
      for (const depRef of extractDependencyRefs(`${d.title} ${d.unblocks}`)) {
        const dep = this.depByRef.get(depRef)
        if (dep) links.push({ entityType: 'DEPENDENCY', entityId: dep.id, ref: depRef })
      }
      for (const dep of Array.from(this.depByRef.entries())) {
        const [depRef, info] = dep
        if (info.depType === 'DECISION' && extractDecisionRefs(`${info.title} ${info.unblocks}`).includes(d.id)) {
          links.push({ entityType: 'DEPENDENCY', entityId: info.id, ref: depRef })
        }
      }
      for (const t of this.decisionTodoRefs) if (t.decisionRef === d.id) links.push({ entityType: 'TODO', entityId: t.todoId, ref: 'task' })
      await this.ensureDecisionLinks(id, links)

      this.review.add('Decisions', {
        Id: d.id,
        Source: d.source,
        Title: truncate(d.title, 90),
        'Requested by': d.requestedBy,
        'Requester user': this.userLabel(requesters[0]),
        'Needed by': d.neededBy,
        'Needed by date': isoDay(earliestDate(d.neededBy)),
        Status: status,
        'Decided at': isoDay(decidedAt),
        'Linked users': Array.from(userLinks.get(d.id) ?? []).map((u) => this.userLabel(u)).join(', '),
        'Linked items': targets.links.map((l) => l.ref).join(', '),
        Unresolved: targets.unresolved.join(', '),
      })
    }

    // Dependencies of type DECISION point at the decision they wait on (first D-id named).
    for (const info of Array.from(this.depByRef.values())) {
      if (info.depType !== 'DECISION') continue
      const refs = extractDecisionRefs(`${info.title} ${info.unblocks}`)
      const decisionId = refs.map((r) => decisionIds.get(r)).find(Boolean) ?? null
      if (!decisionId || isDryId(info.id) || isDryId(decisionId)) continue
      const dep = await this.prisma.workDependency.findUnique({ where: { id: info.id }, select: { id: true, decisionId: true } })
      if (dep && !dep.decisionId) {
        this.counters.bump('WorkDependency.decisionId', 'update')
        if (this.apply) await this.prisma.workDependency.update({ where: { id: info.id }, data: { decisionId } })
      } else {
        this.counters.bump('WorkDependency.decisionId', 'unchanged')
      }
    }
  }

  private async ensureDecisionLinks(decisionId: string, links: Array<{ entityType: string; entityId: string }>) {
    const usable = links.filter((l) => !isDryId(l.entityId))
    const dry = new Set(links.filter((l) => isDryId(l.entityId)).map((l) => `${l.entityType}|${l.entityId}`)).size
    if (dry > 0) this.counters.bump('DecisionLink', 'create', dry)
    const existing = isDryId(decisionId)
      ? new Set<string>()
      : new Set((await this.prisma.decisionLink.findMany({ where: { decisionId } })).map((r) => `${r.entityType}|${r.entityId}`))
    const wanted = Array.from(new Set(usable.map((l) => `${l.entityType}|${l.entityId}`))).map((key) => ({ key }))
    await this.ensureJoins('DecisionLink', existing, wanted, (missing) =>
      this.prisma.decisionLink.createMany({
        data: missing.map((k) => {
          const [entityType, entityId] = k.split('|')
          return { decisionId, entityType, entityId }
        }),
        skipDuplicates: true,
      }),
    )
  }

  // ── Reviews (IMP-6) ──────────────────────────────────────────────────────

  private planReview(state: PackageState, entityType: string, entityId: string, cell: ReviewCell, where: string) {
    if (!cell.verdict) return
    this.reviews.push({
      packageId: state.packageId,
      reviewerId: state.ownerId,
      entityType,
      entityId,
      verdict: cell.verdict,
      comment: textOrNull(cell.comment) ?? (cell.verdict === 'DISPUTE' ? '(no comment in the workbook)' : null),
      where: `${state.pkg.code} ${where}`,
    })
  }

  private async importReviews() {
    for (const r of this.reviews) {
      const existing =
        isDryId(r.packageId) || isDryId(r.entityId)
          ? null
          : await this.prisma.packageItemReview.findUnique({
              where: { packageId_entityType_entityId_reviewerId: { packageId: r.packageId, entityType: r.entityType, entityId: r.entityId, reviewerId: r.reviewerId } },
            })
      const res = await this.sync({
        entity: 'PackageItemReview',
        key: `${r.packageId}:${r.entityType}:${r.entityId}`,
        existing,
        desired: { verdict: r.verdict, comment: r.comment },
        updateFields: ['verdict', 'comment'],
        create: () =>
          this.prisma.packageItemReview.create({
            data: { packageId: r.packageId, entityType: r.entityType, entityId: r.entityId, reviewerId: r.reviewerId, verdict: r.verdict, comment: r.comment },
            select: { id: true },
          }),
        update: (rid, data) => this.prisma.packageItemReview.update({ where: { id: rid }, data: data as Prisma.PackageItemReviewUncheckedUpdateInput }),
        activity: (rid, op) => ({
          entityType: 'OPERATING_PACKAGE',
          action: 'REVIEWED',
          actorId: r.reviewerId,
          metadata: { entityId: r.packageId, packageId: r.packageId, userId: r.reviewerId, reviewId: rid, itemType: r.entityType, itemId: r.entityId, verdict: r.verdict, op },
        }),
      })
      this.review.add('Reviews', { Where: r.where, Entity: r.entityType, Verdict: r.verdict, Comment: r.comment, Result: res.op })
    }
  }

  // ── Carry-forward SUCCEEDS (LNK) ─────────────────────────────────────────

  private async importCarryForward(rows: CarryForwardRow[]) {
    if (rows.length === 0) return
    const codes = Array.from(new Set(rows.map((r) => r.code)))
    type OldRow = { id: string; type: 'OBJECTIVE' | 'KEY_RESULT'; title: string; timeframeId: string; lineageRootId: string | null; lineageDepth: number; code: string }
    const found = await this.prisma.$queryRaw<OldRow[]>(Prisma.sql`
      SELECT o.id, 'OBJECTIVE' AS type, o.title, o."timeframeId", o."lineageRootId", o."lineageDepth", upper(right(o.id, 6)) AS code
        FROM objectives o WHERE upper(right(o.id, 6)) = ANY(${codes})
      UNION ALL
      SELECT k.id, 'KEY_RESULT' AS type, k.title, o."timeframeId", k."lineageRootId", k."lineageDepth", upper(right(k.id, 6)) AS code
        FROM key_results k JOIN objectives o ON o.id = k."objectiveId" WHERE upper(right(k.id, 6)) = ANY(${codes})
    `)
    const candidates = found.filter((r) => r.timeframeId !== this.tf.id)
    let oldTf = this.opts.oldTimeframeId
    if (!oldTf) {
      const tally = new Map<string, number>()
      for (const r of candidates) tally.set(r.timeframeId, (tally.get(r.timeframeId) ?? 0) + 1)
      oldTf = Array.from(tally.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    }

    const claimedPrimary = new Map<string, string>()
    for (const row of rows) {
      const subKind = succeedsSubKind(row.disposition)
      const matches = candidates.filter((c) => c.code === row.code && c.type === row.type)
      const inTf = matches.filter((c) => c.timeframeId === oldTf)
      const old = inTf.length === 1 ? inTf[0] : matches.length === 1 ? matches[0] : null
      const refs = extractOkrRefs(row.newHome)
      const initiativeRefs = extractInitiativeRefs(row.newHome)
      const groupRefs = initiativeRefs.filter((r) => r.kind === 'GROUP').map((r) => r.id)
      const nonOkr = [...extractKpiRefs(row.newHome), ...extractLocalRefs(row.newHome).duties, ...extractDecisionRefs(row.newHome), ...groupRefs]
      const reviewRow = {
        '#': row.rowNo,
        Code: row.code,
        Type: row.type,
        Disposition: row.dispositionRaw,
        'New home': row.newHome,
        'Old item': old ? `${old.title} (${old.id})` : matches.length > 1 ? `AMBIGUOUS: ${matches.length} matches` : 'NOT FOUND',
        'Old timeframe': old?.timeframeId ?? '',
        Targets: [...refs.map((r) => r.id), ...initiativeRefs.filter((r) => r.kind === 'INITIATIVE').map((r) => r.id)].join(', '),
        'Not linkable': nonOkr.join(', '),
        Primary: '',
        Unresolved: '',
        Result: '',
      }
      if (!subKind) {
        reviewRow.Result = `${row.disposition}: no successor link`
        this.review.add('Carry-forward', reviewRow)
        continue
      }
      if (!old) {
        reviewRow.Result = 'old item not matched — skipped'
        this.warn(`Carry-forward ${row.code}: ${matches.length > 1 ? 'ambiguous' : 'no'} FY25/26 ${row.type} matches upper(right(id, 6))`)
        this.counters.bump('OkrLink (SUCCEEDS)', 'skip', Math.max(1, refs.length + initiativeRefs.length - groupRefs.length))
        this.review.add('Carry-forward', reviewRow)
        continue
      }
      const oldNode: OkrNode = { id: old.id, type: old.type, ownerId: '', objectiveId: '', title: old.title, level: 'COMPANY' }
      const unresolved: string[] = []
      const results: string[] = []
      let primaryDone = false
      // SUCCEEDS links join objectives and KRs only: an initiative new home ("CIN5.1") links its supported
      // KR as a non-primary successor; a group ("CIG5") has no OKR item and is listed under "Not linkable".
      const targets: Array<{ ref: string; node: OkrNode | null; viaInitiative: boolean }> = refs.map((r) => ({ ref: r.id, node: this.nodeOf(r.id), viaInitiative: false }))
      for (const ir of initiativeRefs) {
        if (ir.kind !== 'INITIATIVE') continue
        const ini = this.initiativeByRef.get(ir.id)
        if (!ini) {
          targets.push({ ref: ir.id, node: null, viaInitiative: true })
          continue
        }
        const kr = ini.krRef ? this.krByRef.get(ini.krRef) ?? null : null
        if (!kr) {
          this.warn(`Carry-forward ${row.code}: ${ir.id} supports no imported key result — no SUCCEEDS link for it`)
          reviewRow['Not linkable'] = [reviewRow['Not linkable'], `${ir.id} (no KR)`].filter(Boolean).join(', ')
          continue
        }
        targets.push({ ref: `${ir.id}→${ini.krRef}`, node: kr, viaInitiative: true })
      }
      if (groupRefs.length) this.warn(`Carry-forward ${row.code}: initiative group(s) ${groupRefs.join(', ')} are not OKR items — no SUCCEEDS link`)
      const linked = new Set<string>()
      for (const { ref: refId, node, viaInitiative } of targets) {
        const ref = { id: refId }
        if (!node) {
          unresolved.push(ref.id)
          continue
        }
        if (linked.has(node.id)) continue
        linked.add(node.id)
        let isPrimary = false
        if (!viaInitiative && !primaryDone && node.type === old.type) {
          const claimed = claimedPrimary.get(node.id)
          let otherPrimary = false
          if (!isDryId(node.id)) {
            const other = await this.prisma.okrLink.findFirst({
              where: { fromType: node.type, fromId: node.id, kind: 'SUCCEEDS', isPrimary: true, NOT: { toId: old.id } },
              select: { id: true },
            })
            otherPrimary = !!other
          }
          if ((claimed && claimed !== old.id) || otherPrimary) {
            this.warn(`Carry-forward ${row.code}: ${ref.id} already has a primary predecessor — linked as non-primary`)
          } else {
            isPrimary = true
            primaryDone = true
            claimedPrimary.set(node.id, old.id)
            reviewRow.Primary = ref.id
          }
        }
        const note = truncate(`FY25/26 carry-forward (${row.dispositionRaw})${row.note ? `: ${row.note}` : ''}`, 500)
        const res = await this.upsertOkrLink({ from: node, to: oldNode, kind: 'SUCCEEDS', subKind, isPrimary, note, key: `${ref.id}->${row.code}` })
        results.push(`${ref.id}:${res.op}`)
        if (isPrimary) await this.mirrorLineage(node, old)
      }
      reviewRow.Unresolved = unresolved.join(', ')
      reviewRow.Result = results.join(', ') || 'no resolvable target'
      if (unresolved.length) this.warn(`Carry-forward ${row.code}: new-home id(s) ${unresolved.join(', ')} not imported`)
      this.review.add('Carry-forward', reviewRow)
    }
  }

  /** LNK-2: a primary SUCCEEDS between items of the same type mirrors rolledFromId / lineage on the newer item. */
  private async mirrorLineage(node: OkrNode, old: { id: string; lineageRootId: string | null; lineageDepth: number }) {
    const lineage = { rolledFromId: old.id, lineageRootId: old.lineageRootId || old.id, lineageDepth: (old.lineageDepth ?? 0) + 1 }
    if (isDryId(node.id)) {
      this.counters.bump('Lineage (rolledFromId)', 'create')
      return
    }
    const current =
      node.type === 'OBJECTIVE'
        ? await this.prisma.objective.findUnique({ where: { id: node.id }, select: { id: true, rolledFromId: true, lineageRootId: true, lineageDepth: true } })
        : await this.prisma.keyResult.findUnique({ where: { id: node.id }, select: { id: true, rolledFromId: true, lineageRootId: true, lineageDepth: true } })
    if (!current) return
    if (current.rolledFromId && current.rolledFromId !== old.id) {
      this.warn(`Lineage: ${node.title.slice(0, 60)} already rolls from ${current.rolledFromId} — not changed`)
      this.counters.bump('Lineage (rolledFromId)', 'skip')
      return
    }
    const changes = diffFields(current as unknown as Record<string, unknown>, lineage, ['rolledFromId', 'lineageRootId', 'lineageDepth'])
    if (!changes) {
      this.counters.bump('Lineage (rolledFromId)', 'unchanged')
      return
    }
    this.counters.bump('Lineage (rolledFromId)', current.rolledFromId ? 'update' : 'create')
    if (!this.apply) return
    if (node.type === 'OBJECTIVE') await this.prisma.objective.update({ where: { id: node.id }, data: lineage })
    else await this.prisma.keyResult.update({ where: { id: node.id }, data: lineage })
    this.activity.push({
      entityType: node.type,
      action: 'UPDATED',
      actorId: this.actorId,
      objectiveId: node.type === 'OBJECTIVE' ? node.id : null,
      keyResultId: node.type === 'KEY_RESULT' ? node.id : null,
      changes,
      metadata: { reason: 'carry-forward primary successor', predecessorId: old.id },
    })
  }

  // ── Notifications (IMP-4, --notify) ──────────────────────────────────────

  private async notifyOwners() {
    for (const state of Array.from(this.packages.values())) {
      if (isDryId(state.packageId)) {
        this.counters.bump('Notification', 'create')
        continue
      }
      const exists = await this.prisma.notification.findFirst({
        where: { userId: state.ownerId, eventKey: NOTIFY_EVENT_KEY, metadata: { contains: state.packageId } },
        select: { id: true },
      })
      if (exists) {
        this.counters.bump('Notification', 'unchanged')
        continue
      }
      this.counters.bump('Notification', 'create')
      if (!this.apply) continue
      await this.prisma.notification.create({
        data: {
          userId: state.ownerId,
          type: NOTIFY_EVENT_KEY,
          eventKey: NOTIFY_EVENT_KEY,
          category: 'PACKAGE',
          title: `Your ${TIMEFRAME.name} operating package is ready for review`,
          message: `Your ${TIMEFRAME.name} operating package (${state.pkg.version}) has been loaded from the workbook: OKRs, milestones, tasks, KPIs, recurring duties, role definition and development plan. Open your profile to review it.`,
          metadata: JSON.stringify({ userId: state.ownerId, packageId: state.packageId, timeframeId: this.tf.id, source: 'import' }),
        },
      })
    }
  }

  // ── Review workbook ──────────────────────────────────────────────────────

  private finishReview(company: CompanyWorkbook, packages: PackageWorkbook[]) {
    const blockers = this.blockers()
    this.review.add('Summary', { Item: 'Mode', Value: this.apply ? 'APPLY' : 'DRY RUN (no writes)' })
    this.review.add('Summary', { Item: 'Run at', Value: this.now.toISOString() })
    this.review.add('Summary', { Item: 'Timeframe', Value: `${TIMEFRAME.name} (${this.tf.exists ? 'exists' : 'will be created'}${this.tf.id && !isDryId(this.tf.id) ? `, ${this.tf.id}` : ''})` })
    this.review.add('Summary', { Item: 'Company workbook', Value: path.basename(company.file) })
    this.review.add('Summary', { Item: 'Packages', Value: packages.map((p) => `${p.code} ${p.version}`).join(', ') })
    this.review.add('Summary', { Item: 'Blockers for --apply', Value: blockers.length ? blockers.join(' || ') : 'none' })
    for (const [entity, c] of this.counters.entries()) {
      this.review.add('Summary', { Item: entity, Value: `create ${c.create} · update ${c.update} · unchanged ${c.unchanged} · skip ${c.skip}` })
    }
    for (const b of blockers) this.review.add('Warnings', { Level: 'BLOCKER', Message: b })
    for (const w of this.warnings) this.review.add('Warnings', { Level: 'WARNING', Message: w })
    if (this.opts.reviewOut) this.review.write(this.opts.reviewOut, REVIEW_SHEET_ORDER)
  }
}

/** Convenience wrapper used by the CLI. */
export async function runImport(prisma: PrismaClient, opts: ImportOptions): Promise<ImportResult & { importer: OperatingPackageImporter }> {
  const importer = new OperatingPackageImporter(prisma, opts)
  const result = await importer.run()
  return { ...result, importer }
}
