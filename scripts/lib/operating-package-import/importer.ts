/**
 * Operating-package importer (IMP-1 … IMP-6) — orchestration.
 *
 * Phases (IMP-3): timeframe → Company OKR (objectives, KRs, checkpoints) → per package (header,
 * objectives, KRs, milestones, tasks, duties + heads, role definition, KPIs, development) →
 * CONTRIBUTES_TO links → company Dependency Map + package X-links → Decisions (+ links) →
 * Agree/Dispute reviews → FY25/26 carry-forward SUCCEEDS links → optional summary notifications.
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
import { earliestDate, isBlank, isoDay, latestDate, parseDurationMinutes, textOrNull, truncate, utcDate } from './text'

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

interface PackageState {
  pkg: PackageWorkbook
  ownerId: string
  packageId: string
  milestones: Map<string, { todoId: string; keyResultId: string; title: string }>
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
    for (const pkg of packages) {
      await this.importPackage(pkg)
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
    const plan = krNumericPlan(row.target, row.baseline)
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
      const targetValue = scoring === 'NUMERIC' ? checkpointValue(text, final.unit) : null
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

  private async importPackage(pkg: PackageWorkbook) {
    const ownerId = this.ownerIn(pkg.ownerName, `${pkg.code} package owner (README)`, true)
    const ownerSkipped = this.resolver.resolveList(pkg.ownerName).some(({ resolution }) => resolution.status === 'SKIPPED')
    if (!ownerId && ownerSkipped) {
      this.warn(`${pkg.code}: package owner "${pkg.ownerName}" is marked skip in the user map — package not imported`)
      this.counters.bump('OperatingPackage', 'skip')
      return
    }
    if (!ownerId) {
      this.warn(`${pkg.code}: package owner "${pkg.ownerName}" is unmatched — package skipped`)
      this.counters.bump('OperatingPackage', 'skip')
      return
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
      'Parsed rows': `OKR ${pkg.okr.length} · milestones ${pkg.milestones.length} · tasks ${pkg.tasks.length} · KPIs ${pkg.kpis.length} · duties ${pkg.duties.length} · dev ${pkg.development.length} · links ${pkg.links.length}`,
    })

    await this.importPackageOkr(state)
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

  private async importMilestones(state: PackageState) {
    const { pkg, ownerId } = state
    const byKr = new Map<string, number>()
    for (const m of pkg.milestones) byKr.set(m.parentKr, (byKr.get(m.parentKr) ?? 0) + 1)
    const seen = new Map<string, number>()
    for (const m of pkg.milestones) {
      const kr = this.krByRef.get(m.parentKr)
      if (!kr) {
        this.warn(`${pkg.code} milestone ${m.id}: parent KR "${m.parentKr}" not found — skipped`)
        this.counters.bump('Todo (milestone)', 'skip')
        continue
      }
      const index = seen.get(m.parentKr) ?? 0
      seen.set(m.parentKr, index + 1)
      const shares = this.milestoneShares(byKr.get(m.parentKr) ?? 1)
      const progressValue = kr.scoring === 'MILESTONE' ? shares[index] : null
      const dueDate = latestDate(m.due)
      const description = [
        m.title,
        '',
        `Milestone ${m.id} · ${m.parentKr}${m.quarter ? ` · ${m.quarter}` : ''}`,
        textOrNull(m.due) ? `Due: ${m.due}` : null,
        textOrNull(m.dependsOn) ? `Depends on: ${m.dependsOn}` : null,
      ]
        .filter((l) => l !== null)
        .join('\n')
      const title = truncate(m.title, 180)
      const existing = isDryId(kr.id) ? null : await this.prisma.todo.findUnique({ where: { keyResultId_externalRef: { keyResultId: kr.id, externalRef: m.id } } })
      const desired = { title, description, dueDate, assigneeId: ownerId, progressValue, kind: 'MILESTONE' }
      const { id } = await this.sync({
        entity: 'Todo (milestone)',
        key: `${pkg.code}:${m.id}`,
        existing,
        desired,
        updateFields: ['title', 'description', 'dueDate', 'assigneeId', 'progressValue', 'kind'],
        create: () =>
          this.prisma.todo.create({
            data: { ...desired, status: todoStatus(m.status), priority: 'MEDIUM', creatorId: ownerId, keyResultId: kr.id, externalRef: m.id },
            select: { id: true },
          }),
        update: (tid, data) => this.prisma.todo.update({ where: { id: tid }, data: data as Prisma.TodoUncheckedUpdateInput }),
        activity: (tid, op, changes) => ({
          entityType: 'TODO',
          action: op === 'create' ? 'INITIATIVE_CREATED' : 'INITIATIVE_UPDATED',
          actorId: this.actorId,
          todoId: tid,
          changes,
          metadata: { externalRef: m.id, kind: 'MILESTONE', keyResultId: kr.id, packageId: state.packageId, userId: ownerId, title },
        }),
      })
      await this.ensureTodoMembers(id, [ownerId])
      state.milestones.set(m.id, { todoId: id, keyResultId: kr.id, title })
      for (const d of extractDecisionRefs(`${m.dependsOn}`)) this.decisionTodoRefs.push({ decisionRef: d, todoId: id })
      if (m.review.verdict) this.planReview(state, 'TODO', id, m.review, `Milestones ${m.id}`)
      this.review.add('Milestones & tasks', {
        Package: pkg.code,
        Kind: 'MILESTONE',
        Id: m.id,
        Parent: m.parentKr,
        'KR scoring': kr.scoring ?? '',
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
      let milestone: { todoId: string; keyResultId: string; title: string } | undefined
      for (const mid of local.milestones) {
        milestone = state.milestones.get(mid)
        if (milestone) break
      }
      if (milestone) keyResultId = milestone.keyResultId
      else if (okr.length > 0) keyResultId = this.krByRef.get(okr[0].id)?.id ?? null
      if (!milestone && local.milestones.length > 0) this.warn(`${pkg.code} task ${t.id}: milestone ${local.milestones.join(', ')} not found`)

      const dueDate = latestDate(t.due)
      const description = [
        t.title,
        '',
        `Task ${t.id}${t.sprint ? ` · Sprint ${t.sprint}` : ''}`,
        milestone ? `Milestone: ${local.milestones[0]} — ${milestone.title}` : null,
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
          metadata: { externalRef: t.id, kind: 'TASK', keyResultId, packageId: state.packageId, userId: ownerId, title },
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
        'KR scoring': keyResultId ? (milestone ? `via ${local.milestones[0]}` : 'direct KR') : 'no KR',
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
      const { id } = await this.sync({
        entity: 'Kpi',
        key: k.id,
        existing,
        desired,
        updateFields: Object.keys(desired),
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
        'Linked KR': keyResultId ? this.krRefOf(keyResultId) : '',
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
      const keyResultId = krRef ? this.krByRef.get(krRef.id)!.id : null
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
        'Linked KR': krRef?.id ?? '',
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
      const nonOkr = [...extractKpiRefs(row.newHome), ...extractLocalRefs(row.newHome).duties, ...extractDecisionRefs(row.newHome)]
      const reviewRow = {
        '#': row.rowNo,
        Code: row.code,
        Type: row.type,
        Disposition: row.dispositionRaw,
        'New home': row.newHome,
        'Old item': old ? `${old.title} (${old.id})` : matches.length > 1 ? `AMBIGUOUS: ${matches.length} matches` : 'NOT FOUND',
        'Old timeframe': old?.timeframeId ?? '',
        Targets: refs.map((r) => r.id).join(', '),
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
        this.counters.bump('OkrLink (SUCCEEDS)', 'skip', Math.max(1, refs.length))
        this.review.add('Carry-forward', reviewRow)
        continue
      }
      const oldNode: OkrNode = { id: old.id, type: old.type, ownerId: '', objectiveId: '', title: old.title, level: 'COMPANY' }
      const unresolved: string[] = []
      const results: string[] = []
      let primaryDone = false
      for (const ref of refs) {
        const node = this.nodeOf(ref.id)
        if (!node) {
          unresolved.push(ref.id)
          continue
        }
        let isPrimary = false
        if (!primaryDone && node.type === old.type) {
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
