#!/usr/bin/env -S npx tsx
/**
 * Close the FY25/26 company OKRs from the CEO carry-forward review (I1, Employee Operating Package).
 *
 * Source of truth: the "FY25-26 Carry-Forward" sheet of CEO-Operating-Package-Biruk-FY2026-27-v2.xlsx
 * (50 rows: 9 objectives + 41 KRs; a KR row belongs to the preceding Objective row). Each row's
 * "FY25/26 system ID" is the UI short code = upper(right(id, 6)) of the objective / KR cuid.
 *
 * Every close reproduces the writes of the existing routes, in one transaction per item:
 *   POST /api/{objectives|keyresults}/[id]/close/initiate   (outcome, grade snapped to 0.05, frozen
 *        finalProgress/finalValue, gradeDelta, confidences, preClose*, closureNote, retrospective row)
 *   PUT  /api/{objectives|keyresults}/[id]/retrospective     (reflection fields)
 *   POST /api/{objectives|keyresults}/[id]/close/commit      (evidence → autoStatsJson, reopen-log
 *        re-close, CLOSED + isLocked + lockedAt + closedAt + closedById, goalStatus CLOSED for objectives,
 *        ancestor progress recalculation)
 * KRs are closed before objectives. ActivityLog rows carry metadata.source = 'close-fy2526'.
 * No notifications and no realtime broadcasts are sent.
 *
 * Self-contained: plain PrismaClient, relative imports of pure / tx-scoped lib helpers only.
 *
 * Usage (run from the app root):
 *   npx tsx scripts/close-fy2526-okrs.ts                         # dry run (default) — no writes
 *   npx tsx scripts/close-fy2526-okrs.ts --apply                 # close
 *   Options:
 *     --workbook <path>        CEO operating package workbook (default: data-import/CEO-Operating-Package-Biruk-FY2026-27-v2.xlsx,
 *                              looked up in ./ and ../)
 *     --actor-email <email>    who closes (closedById / retrospective author / ActivityLog actor);
 *                              default: OrganizationSettings.companyCeoUserId
 *     --timeframe-id <id>      the FY25/26 timeframe (default: the timeframe most matched items belong to)
 *     --include-others         also close the other open OKRs in that timeframe (outcome from progress,
 *                              generic retrospective)
 *     --report <path>          write the JSON report there
 */

import * as fs from 'fs'
import * as path from 'path'
import * as XLSX from 'xlsx'
import { Prisma, PrismaClient } from '@prisma/client'
import {
  confidenceTierFromScore,
  firstConfidence,
  parseInitiateCloseInput,
  validateRetrospectiveForCommit,
  type OkrOutcome,
} from '../lib/okr/period-close'
import { recalcNodeAndAncestors } from '../lib/objectiveProgress'
import { buildKeyResultEvidence, buildObjectiveEvidence } from '../lib/okr/evidence'

// ─── Sheet model ────────────────────────────────────────────────────────────

export const SHEET_NAME = 'FY25-26 Carry-Forward'
export const DEFAULT_WORKBOOK = 'data-import/CEO-Operating-Package-Biruk-FY2026-27-v2.xlsx'
export const REVIEW_DATE_LABEL = '11 Oct 2026'
export const DEFAULT_GRADE_RATIONALE = `Graded in the FY25/26 carry-forward review (CEO operating package, ${REVIEW_DATE_LABEL})`
export const SOURCE = 'close-fy2526'

export const DISPOSITIONS = ['Carried', 'Reframed', 'Superseded', 'Merged', 'Completed', 'Retired', 'Deferred'] as const
export type Disposition = (typeof DISPOSITIONS)[number]
export type ItemType = 'OBJECTIVE' | 'KEY_RESULT'

export interface CarryForwardRow {
  rowNo: string
  code: string
  type: ItemType
  title: string
  ownerInitials: string
  finalStatus: string
  finalScore: number
  whyStalled: string
  disposition: Disposition
  dispositionRaw: string
  newHome: string
  note: string
  /** For KR rows: the code of the preceding Objective row. */
  parentCode: string | null
}

function cellText(value: unknown): string {
  if (value == null) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

function parseScore(value: unknown): number {
  if (typeof value === 'number') return value
  const text = cellText(value)
  if (!text) return 0
  const pct = text.endsWith('%')
  const n = Number(text.replace('%', ''))
  if (!Number.isFinite(n)) return NaN
  return pct || n > 1 ? n / 100 : n
}

export function normaliseDisposition(raw: string): Disposition | null {
  const first = raw.trim().split(/[\s—–-]+/)[0]?.toLowerCase() ?? ''
  return DISPOSITIONS.find((d) => d.toLowerCase() === first) ?? null
}

/** Parse the carry-forward sheet rows. Throws on a structurally broken sheet; per-row problems go to `errors`. */
export function parseCarryForwardSheet(rows: unknown[][]): { rows: CarryForwardRow[]; errors: string[] } {
  const headerIdx = rows.findIndex((r) => cellText(r[0]) === '#' && /system id/i.test(cellText(r[1])))
  if (headerIdx < 0) throw new Error(`"${SHEET_NAME}": header row ("#", "FY25/26 system ID", …) not found`)
  const header = rows[headerIdx].map((h) => cellText(h).toLowerCase())
  const col = (re: RegExp) => {
    const i = header.findIndex((h) => re.test(h))
    if (i < 0) throw new Error(`"${SHEET_NAME}": column ${re} not found`)
    return i
  }
  const c = {
    no: 0,
    code: col(/system id/),
    type: col(/^type$/),
    title: col(/objective \/ kr/),
    owner: col(/owner/),
    status: col(/final status/),
    score: col(/final score/),
    why: col(/why it stalled/),
    disposition: col(/disposition/),
    newHome: col(/new home/),
    note: col(/^note$/),
  }

  const out: CarryForwardRow[] = []
  const errors: string[] = []
  let parentCode: string | null = null
  for (const r of rows.slice(headerIdx + 1)) {
    const code = cellText(r[c.code]).toUpperCase()
    if (!code) continue
    const rowNo = cellText(r[c.no])
    const typeText = cellText(r[c.type]).toLowerCase()
    const type: ItemType | null = typeText === 'objective' ? 'OBJECTIVE' : typeText === 'kr' ? 'KEY_RESULT' : null
    const dispositionRaw = cellText(r[c.disposition])
    const disposition = normaliseDisposition(dispositionRaw)
    const finalScore = parseScore(r[c.score])
    if (!/^[A-Z0-9]{6}$/.test(code)) errors.push(`row ${rowNo}: system ID "${code}" is not a 6-character code`)
    if (!type) errors.push(`row ${rowNo} (${code}): unknown type "${cellText(r[c.type])}"`)
    if (!disposition) errors.push(`row ${rowNo} (${code}): unknown disposition "${dispositionRaw}"`)
    if (!Number.isFinite(finalScore) || finalScore < 0 || finalScore > 1) {
      errors.push(`row ${rowNo} (${code}): final score "${cellText(r[c.score])}" is not between 0 and 1`)
    }
    if (!type || !disposition || !Number.isFinite(finalScore)) continue
    if (type === 'OBJECTIVE') parentCode = code
    out.push({
      rowNo,
      code,
      type,
      title: cellText(r[c.title]),
      ownerInitials: cellText(r[c.owner]).toUpperCase(),
      finalStatus: cellText(r[c.status]),
      finalScore,
      whyStalled: cellText(r[c.why]),
      disposition,
      dispositionRaw,
      newHome: cellText(r[c.newHome]),
      note: cellText(r[c.note]),
      parentCode: type === 'KEY_RESULT' ? parentCode : null,
    })
  }
  return { rows: out, errors }
}

export function readCarryForwardWorkbook(workbookPath: string) {
  const wb = XLSX.readFile(workbookPath)
  const sheet = wb.Sheets[SHEET_NAME]
  if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" not found in ${workbookPath}`)
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
  return parseCarryForwardSheet(rows)
}

export function resolveWorkbookPath(explicit: string | null): string {
  const candidates = explicit
    ? [explicit]
    : [DEFAULT_WORKBOOK, path.join('..', DEFAULT_WORKBOOK), path.join('..', '..', DEFAULT_WORKBOOK), path.join('..', '..', '..', DEFAULT_WORKBOOK)]
  for (const candidate of candidates) {
    const abs = path.resolve(candidate)
    if (fs.existsSync(abs)) return abs
  }
  throw new Error(`Workbook not found (${candidates.join(', ')}). Pass --workbook <path>.`)
}

// ─── Mapping (pure) ─────────────────────────────────────────────────────────

export function statusToConfidence(finalStatus: string): 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' {
  const s = finalStatus.toLowerCase()
  if (s.includes('on track')) return 'ON_TRACK'
  if (s.includes('risk')) return 'AT_RISK'
  return 'OFF_TRACK'
}

export function outcomeForRow(row: Pick<CarryForwardRow, 'disposition' | 'finalScore'>): OkrOutcome {
  if (row.disposition === 'Completed' || row.finalScore >= 1) return 'ACHIEVED'
  if (row.disposition === 'Retired' || row.disposition === 'Deferred') return 'ABANDONED'
  if (row.finalScore > 0) return 'PARTIAL'
  return 'MISSED'
}

export function recommendedActionFor(disposition: Disposition): string {
  switch (disposition) {
    case 'Carried':
      return 'ROLL_FORWARD'
    case 'Reframed':
    case 'Superseded':
    case 'Merged':
      return 'ROLL_FORWARD_MODIFIED'
    case 'Retired':
    case 'Deferred':
      return 'ABANDON'
    case 'Completed':
      return 'COMPLETE_NO_ROLLOVER'
  }
}

/**
 * Heuristic primary blocker from the "Why it stalled" text, in the order the close plan fixes:
 * unmeasurable → UNCLEAR_GOAL; unrealistic / no milestones → POOR_ESTIMATION;
 * no owner / founder-held / no team → CAPACITY; otherwise OTHER (NONE for a completed item).
 */
export function primaryBlockerFor(row: Pick<CarryForwardRow, 'whyStalled' | 'disposition'>): string {
  if (row.disposition === 'Completed') return 'NONE'
  const t = row.whyStalled.toLowerCase()
  if (t.includes('unmeasurable')) return 'UNCLEAR_GOAL'
  if (t.includes('unrealistic') || t.includes('no milestones')) return 'POOR_ESTIMATION'
  if (t.includes('no owner') || t.includes('founder-held') || t.includes('no team')) return 'CAPACITY'
  return 'OTHER'
}

const NOTE_MAX = 500

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

export function closureNoteFor(row: Pick<CarryForwardRow, 'disposition' | 'newHome'>): string {
  const home = row.newHome.trim()
  if (row.disposition === 'Retired') {
    const where = home.replace(/^retired\s*[—–-]\s*/i, '').trim()
    return clip(`Retired in the FY26/27 plan — ${where || 'no successor'}`, NOTE_MAX)
  }
  if (row.disposition === 'Deferred') {
    const rest = home.replace(/^deferred to fy27\/28\s*[—–-]?\s*/i, '').trim()
    return clip(rest ? `Deferred to FY27/28 — ${rest}` : 'Deferred to FY27/28', NOTE_MAX)
  }
  return clip(
    `Closed in the FY25/26 carry-forward review (${REVIEW_DATE_LABEL}). FY26/27: ${row.disposition}${home ? ` → ${home}` : ''}`,
    NOTE_MAX,
  )
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function paragraphs(...lines: Array<string | null | undefined>): string {
  return lines
    .filter((l): l is string => !!l && l.trim().length > 0)
    .map((l) => `<p>${escapeHtml(l.trim())}</p>`)
    .join('')
}

export function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

export interface RetrospectivePlan {
  whatWasAchieved: string
  whatWentWell: string | null
  whatBlockedUs: string | null
  whatWeLearned: string
  primaryBlocker: string | null
  wouldSetAgain: boolean | null
  wasAmbitious: boolean | null
  recommendedAction: string
}

export function retrospectiveForRow(row: CarryForwardRow): RetrospectivePlan {
  const achievement =
    row.finalScore >= 1
      ? 'Target met.'
      : row.finalScore > 0
        ? `Partial progress: ${pct(row.finalScore)} of the target was reached.`
        : 'No measurable progress was recorded against this target.'
  const why = row.whyStalled || 'No cause was recorded in the carry-forward review.'
  return {
    whatWasAchieved: paragraphs(
      `Final status: ${row.finalStatus || 'n/a'} · final score ${pct(row.finalScore)}. ${achievement}`,
      `FY26/27 disposition: ${row.dispositionRaw}${row.newHome ? ` → ${row.newHome}` : ''}.`,
      row.note ? `Note: ${row.note}` : null,
    ),
    whatWentWell: null,
    whatBlockedUs: paragraphs(why),
    whatWeLearned: paragraphs(why),
    primaryBlocker: primaryBlockerFor(row),
    wouldSetAgain: null,
    wasAmbitious: null,
    recommendedAction: recommendedActionFor(row.disposition),
  }
}

/** Grade-rationale rule of parseInitiateCloseInput: required when |snapped grade − progress/100| > 0.15. */
export function needsGradeRationale(finalGrade: number | null, progress: number): boolean {
  if (finalGrade == null) return false
  const snapped = Math.round(finalGrade * 20) / 20
  return Math.abs(snapped - Math.min(100, Math.max(0, progress)) / 100) > 0.15
}

export interface ClosePlan {
  outcome: OkrOutcome
  finalGrade: number | null
  closureNote: string | null
  gradeRationale: string | null
  retrospective: RetrospectivePlan
}

export function closePlanForRow(row: CarryForwardRow, currentProgress: number): ClosePlan {
  const outcome = outcomeForRow(row)
  const finalGrade = outcome === 'ABANDONED' ? null : row.finalScore
  return {
    outcome,
    finalGrade,
    closureNote: closureNoteFor(row),
    gradeRationale: needsGradeRationale(finalGrade, currentProgress) ? clip(row.note || DEFAULT_GRADE_RATIONALE, 2000) : null,
    retrospective: retrospectiveForRow(row),
  }
}

/** Generic plan for an open OKR in the timeframe that the sheet does not list (--include-others). */
export function closePlanForOther(progress: number): ClosePlan {
  const p = Math.min(100, Math.max(0, progress))
  const outcome: OkrOutcome = p >= 100 ? 'ACHIEVED' : p > 0 ? 'PARTIAL' : 'MISSED'
  const finalGrade = Math.round((p / 100) * 20) / 20
  return {
    outcome,
    finalGrade,
    closureNote: 'Closed at the FY25/26 year-end close; not listed in the CEO carry-forward review.',
    gradeRationale: null,
    retrospective: {
      whatWasAchieved: paragraphs(`Final progress ${Math.round(p)}% at the FY25/26 year-end close.`),
      whatWentWell: null,
      whatBlockedUs: null,
      whatWeLearned: paragraphs(
        'Closed in bulk at the FY25/26 year-end. This item was not reviewed individually in the CEO carry-forward review and is not carried into the FY26/27 plan.',
      ),
      primaryBlocker: outcome === 'ACHIEVED' ? 'NONE' : 'OTHER',
      wouldSetAgain: null,
      wasAmbitious: null,
      recommendedAction: outcome === 'ACHIEVED' ? 'COMPLETE_NO_ROLLOVER' : 'ABANDON',
    },
  }
}

// ─── CLI args ───────────────────────────────────────────────────────────────

interface CliArgs {
  apply: boolean
  workbook: string | null
  actorEmail: string | null
  timeframeId: string | null
  includeOthers: boolean
  report: string | null
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { apply: false, workbook: null, actorEmail: null, timeframeId: null, includeOthers: false, report: null }
  const value = (i: number, flag: string) => {
    const v = argv[i + 1]
    if (!v || v.startsWith('--')) throw new Error(`${flag} needs a value`)
    return v
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    const [flag, inline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, null]
    const take = () => {
      if (inline != null) return inline
      const v = value(i, flag)
      i += 1
      return v
    }
    switch (flag) {
      case '--apply':
        args.apply = true
        break
      case '--dry-run':
        args.apply = false
        break
      case '--workbook':
        args.workbook = take()
        break
      case '--actor-email':
        args.actorEmail = take()
        break
      case '--timeframe-id':
        args.timeframeId = take()
        break
      case '--include-others':
        args.includeOthers = true
        break
      case '--report':
        args.report = take()
        break
      case '--help':
      case '-h':
        console.log('Usage: npx tsx scripts/close-fy2526-okrs.ts [--dry-run|--apply] [--workbook p] [--actor-email e] [--timeframe-id id] [--include-others] [--report p]')
        process.exit(0)
        break
      default:
        throw new Error(`Unknown argument: ${a}`)
    }
  }
  return args
}

// ─── DB matching ────────────────────────────────────────────────────────────

interface MatchedObjective {
  id: string
  code: string
  title: string
  timeframeId: string
  status: string
  closureStatus: string
  isLocked: boolean
  progress: number
}

interface MatchedKeyResult {
  id: string
  code: string
  title: string
  objectiveId: string
  timeframeId: string
  status: string
  closureStatus: string
  isLocked: boolean
  progress: number
  objectiveIsLocked: boolean
}

async function matchByCode(prisma: PrismaClient, codes: string[]) {
  if (codes.length === 0) return { objectives: [] as MatchedObjective[], keyResults: [] as MatchedKeyResult[] }
  const objectives = await prisma.$queryRaw<MatchedObjective[]>(Prisma.sql`
    SELECT o.id, upper(right(o.id, 6)) AS code, o.title, o."timeframeId", o.status, o."closureStatus",
           o."isLocked", o.progress
      FROM objectives o
     WHERE upper(right(o.id, 6)) = ANY(${codes}::text[])`)
  const keyResults = await prisma.$queryRaw<MatchedKeyResult[]>(Prisma.sql`
    SELECT k.id, upper(right(k.id, 6)) AS code, k.title, k."objectiveId", o."timeframeId", k.status,
           k."closureStatus", k."isLocked", k.progress, o."isLocked" AS "objectiveIsLocked"
      FROM key_results k
      JOIN objectives o ON o.id = k."objectiveId"
     WHERE upper(right(k.id, 6)) = ANY(${codes}::text[])`)
  return { objectives, keyResults }
}

// ─── Close (reproduces initiate + retrospective PUT + commit) ───────────────

type Tx = Prisma.TransactionClient

async function writeActivity(
  tx: Tx,
  entry: {
    entityType: ItemType
    objectiveId: string
    keyResultId?: string | null
    action: 'CLOSURE_INITIATED' | 'UPDATED' | 'CLOSED'
    actorId: string
    metadata: Record<string, unknown>
  },
) {
  await tx.activityLog.create({
    data: {
      entityType: entry.entityType,
      objectiveId: entry.objectiveId,
      keyResultId: entry.keyResultId ?? null,
      action: entry.action,
      actorId: entry.actorId,
      metadata: { ...entry.metadata, source: SOURCE } as Prisma.InputJsonValue,
    },
  })
}

function retroData(plan: ClosePlan) {
  return {
    whatWasAchieved: plan.retrospective.whatWasAchieved,
    whatWentWell: plan.retrospective.whatWentWell,
    whatBlockedUs: plan.retrospective.whatBlockedUs,
    whatWeLearned: plan.retrospective.whatWeLearned,
    primaryBlocker: plan.retrospective.primaryBlocker,
    wouldSetAgain: plan.retrospective.wouldSetAgain,
    wasAmbitious: plan.retrospective.wasAmbitious,
    recommendedAction: plan.retrospective.recommendedAction,
    gradeRationale: plan.gradeRationale,
  }
}

interface CloseOutcome {
  closed: boolean
  skipped?: string
  finalGrade: number | null
  finalProgress: number | null
  outcome: string | null
}

async function closeKeyResult(
  prisma: PrismaClient,
  id: string,
  makePlan: (progress: number) => ClosePlan,
  actorId: string,
  meta: Record<string, unknown>,
): Promise<CloseOutcome> {
  return prisma.$transaction(
    async (tx) => {
      const kr = await tx.keyResult.findUniqueOrThrow({
        where: { id },
        include: {
          objective: { select: { isLocked: true } },
          checkIns: { select: { confidence: true, asOfDate: true }, orderBy: { asOfDate: 'asc' } },
        },
      })
      if (kr.closureStatus === 'CLOSED') return { closed: false, skipped: 'already CLOSED', finalGrade: kr.finalGrade, finalProgress: kr.finalProgress, outcome: kr.outcome }
      if (kr.objective.isLocked) return { closed: false, skipped: 'parent objective is locked', finalGrade: null, finalProgress: null, outcome: null }

      // ── initiate ──
      const plan = makePlan(kr.progress)
      const parsed = parseInitiateCloseInput(
        { outcome: plan.outcome, finalGrade: plan.finalGrade, closureNote: plan.closureNote, gradeRationale: plan.gradeRationale },
        kr.progress,
      )
      if (!parsed.ok) throw new Error(`KR ${id}: ${parsed.error}`)
      await tx.keyResult.update({
        where: { id },
        data: {
          closureStatus: 'CLOSING',
          outcome: parsed.data.outcome,
          finalGrade: parsed.data.finalGrade,
          finalValue: kr.currentValue,
          finalProgress: kr.progress,
          gradeDelta: parsed.data.finalGrade == null ? null : parsed.data.finalGrade - kr.progress / 100,
          finalConfidence: kr.confidence,
          initialConfidence: firstConfidence(kr.checkIns),
          preCloseConfidence: kr.confidence,
          closureNote: parsed.data.closureNote,
          isLocked: false,
        },
      })
      // initiate's upsert + the retrospective PUT, merged.
      const retro = await tx.okrRetrospective.upsert({
        where: { keyResultId: id },
        create: { keyResultId: id, entityType: 'KEY_RESULT', ...retroData(plan), gradeRationale: parsed.data.gradeRationale, autoStatsJson: {}, authorId: actorId },
        update: { ...retroData(plan), gradeRationale: parsed.data.gradeRationale, authorId: actorId },
      })
      await recalcNodeAndAncestors(tx, kr.objectiveId)
      await writeActivity(tx, { entityType: 'KEY_RESULT', objectiveId: kr.objectiveId, keyResultId: id, action: 'CLOSURE_INITIATED', actorId, metadata: { ...meta, outcome: parsed.data.outcome, finalGrade: parsed.data.finalGrade } })
      await writeActivity(tx, { entityType: 'KEY_RESULT', objectiveId: kr.objectiveId, keyResultId: id, action: 'UPDATED', actorId, metadata: { ...meta, area: 'retrospective' } })

      // ── commit ──
      const validationError = validateRetrospectiveForCommit(retro)
      if (validationError) throw new Error(`KR ${id}: ${validationError}`)
      const closedAt = new Date()
      const evidence = await buildKeyResultEvidence(tx, id)
      await tx.okrRetrospective.update({ where: { keyResultId: id }, data: { autoStatsJson: evidence as Prisma.InputJsonValue } })
      await tx.okrReopenLog.updateMany({
        where: { entityType: 'KEY_RESULT', entityId: id, reclosedAt: null },
        data: { reclosedAt: closedAt },
      })
      await tx.keyResult.update({
        where: { id },
        data: {
          closureStatus: 'CLOSED',
          isLocked: true,
          closedAt,
          lockedAt: closedAt,
          closedById: actorId,
          currentValue: kr.currentValue,
          progress: kr.progress,
        },
      })
      await recalcNodeAndAncestors(tx, kr.objectiveId)
      await writeActivity(tx, { entityType: 'KEY_RESULT', objectiveId: kr.objectiveId, keyResultId: id, action: 'CLOSED', actorId, metadata: { ...meta, outcome: parsed.data.outcome, finalGrade: parsed.data.finalGrade } })
      return { closed: true, finalGrade: parsed.data.finalGrade, finalProgress: kr.progress, outcome: parsed.data.outcome }
    },
    { timeout: 60_000, maxWait: 30_000 },
  )
}

async function closeObjective(
  prisma: PrismaClient,
  id: string,
  makePlan: (progress: number) => ClosePlan,
  actorId: string,
  meta: Record<string, unknown>,
): Promise<CloseOutcome> {
  return prisma.$transaction(
    async (tx) => {
      const objective = await tx.objective.findUniqueOrThrow({
        where: { id },
        include: {
          keyResults: {
            where: { status: 'ACTIVE' },
            select: {
              id: true,
              closureStatus: true,
              confidence: true,
              checkIns: { select: { confidence: true, asOfDate: true }, orderBy: { asOfDate: 'asc' } },
            },
          },
        },
      })
      if (objective.closureStatus === 'CLOSED') return { closed: false, skipped: 'already CLOSED', finalGrade: objective.finalGrade, finalProgress: objective.finalProgress, outcome: objective.outcome }
      const unfinished = objective.keyResults.filter((kr) => kr.closureStatus !== 'CLOSED')
      if (unfinished.length > 0) {
        return { closed: false, skipped: `${unfinished.length} active KR(s) still open (${unfinished.map((k) => k.id.slice(-6).toUpperCase()).join(', ')})`, finalGrade: null, finalProgress: null, outcome: null }
      }

      // ── initiate ──
      const plan = makePlan(objective.progress)
      const parsed = parseInitiateCloseInput(
        { outcome: plan.outcome, finalGrade: plan.finalGrade, closureNote: plan.closureNote, gradeRationale: plan.gradeRationale },
        objective.progress,
      )
      if (!parsed.ok) throw new Error(`Objective ${id}: ${parsed.error}`)
      const initialConfidence = firstConfidence(objective.keyResults.flatMap((kr) => kr.checkIns))
      const finalConfidence = objective.keyResults.some((kr) => kr.confidence === 'OFF_TRACK')
        ? 'OFF_TRACK'
        : objective.keyResults.some((kr) => kr.confidence === 'AT_RISK')
          ? 'AT_RISK'
          : objective.keyResults.length > 0
            ? 'ON_TRACK'
            : confidenceTierFromScore(objective.confidence)
      const finalProgress = objective.progress
      await recalcNodeAndAncestors(tx, id)
      const current = await tx.objective.findUniqueOrThrow({ where: { id }, select: { goalStatus: true } })
      await tx.objective.update({
        where: { id },
        data: {
          closureStatus: 'CLOSING',
          outcome: parsed.data.outcome,
          finalGrade: parsed.data.finalGrade,
          finalProgress,
          gradeDelta: parsed.data.finalGrade == null ? null : parsed.data.finalGrade - finalProgress / 100,
          finalConfidence,
          initialConfidence,
          preCloseGoalStatus: current.goalStatus,
          closureNote: parsed.data.closureNote,
          isLocked: false,
          progress: finalProgress,
        },
      })
      const retro = await tx.okrRetrospective.upsert({
        where: { objectiveId: id },
        create: { objectiveId: id, entityType: 'OBJECTIVE', ...retroData(plan), gradeRationale: parsed.data.gradeRationale, autoStatsJson: {}, authorId: actorId },
        update: { ...retroData(plan), gradeRationale: parsed.data.gradeRationale, authorId: actorId },
      })
      await writeActivity(tx, { entityType: 'OBJECTIVE', objectiveId: id, action: 'CLOSURE_INITIATED', actorId, metadata: { ...meta, outcome: parsed.data.outcome, finalGrade: parsed.data.finalGrade } })
      await writeActivity(tx, { entityType: 'OBJECTIVE', objectiveId: id, action: 'UPDATED', actorId, metadata: { ...meta, area: 'retrospective' } })

      // ── commit ──
      const validationError = validateRetrospectiveForCommit(retro)
      if (validationError) throw new Error(`Objective ${id}: ${validationError}`)
      const closedAt = new Date()
      const evidence = await buildObjectiveEvidence(tx, id)
      await tx.okrRetrospective.update({ where: { objectiveId: id }, data: { autoStatsJson: evidence as Prisma.InputJsonValue } })
      await tx.okrReopenLog.updateMany({
        where: { entityType: 'OBJECTIVE', entityId: id, reclosedAt: null },
        data: { reclosedAt: closedAt },
      })
      await tx.objective.update({
        where: { id },
        data: {
          closureStatus: 'CLOSED',
          isLocked: true,
          closedAt,
          lockedAt: closedAt,
          closedById: actorId,
          goalStatus: 'CLOSED',
          progress: finalProgress,
        },
      })
      await recalcNodeAndAncestors(tx, id)
      await writeActivity(tx, { entityType: 'OBJECTIVE', objectiveId: id, action: 'CLOSED', actorId, metadata: { ...meta, outcome: parsed.data.outcome, finalGrade: parsed.data.finalGrade } })
      return { closed: true, finalGrade: parsed.data.finalGrade, finalProgress, outcome: parsed.data.outcome }
    },
    { timeout: 60_000, maxWait: 30_000 },
  )
}

// ─── Planning + report ──────────────────────────────────────────────────────

type RowStatus =
  | 'WOULD_CLOSE'
  | 'CLOSED_NOW'
  | 'ALREADY_CLOSED'
  | 'UNMATCHED'
  | 'AMBIGUOUS'
  | 'TYPE_MISMATCH'
  | 'DELETED'
  | 'WRONG_TIMEFRAME'
  | 'BLOCKED'
  | 'ERROR'

interface RowReport {
  rowNo: string
  code: string
  type: ItemType
  title: string
  disposition: string
  finalScore: number
  status: RowStatus
  detail: string | null
  id: string | null
  dbTitle: string | null
  timeframeId: string | null
  closureStatusBefore: string | null
  progress: number | null
  outcome: string | null
  finalGrade: number | null
  gradeRationale: string | null
  primaryBlocker: string | null
  recommendedAction: string | null
  closureNote: string | null
  warnings: string[]
}

interface OtherReport {
  type: ItemType
  code: string
  id: string
  title: string
  objectiveId: string | null
  closureStatus: string
  status: string
  progress: number
  owner: string | null
  action: 'LISTED' | 'WOULD_CLOSE' | 'CLOSED_NOW' | 'BLOCKED' | 'ERROR'
  outcome: string | null
  finalGrade: number | null
  detail: string | null
}

function pad(text: string, width: number): string {
  const t = text.length > width ? `${text.slice(0, width - 1)}…` : text
  return t.padEnd(width)
}

function printRowTable(rows: RowReport[]) {
  const head = `${pad('#', 3)} ${pad('Code', 6)} ${pad('Type', 4)} ${pad('Disposition', 11)} ${pad('Score', 5)} ${pad('Prog', 5)} ${pad('Outcome', 9)} ${pad('Grade', 5)} ${pad('Blocker', 15)} ${pad('Status', 14)} Detail`
  console.log(head)
  console.log('-'.repeat(head.length + 20))
  for (const r of rows) {
    console.log(
      `${pad(r.rowNo, 3)} ${pad(r.code, 6)} ${pad(r.type === 'OBJECTIVE' ? 'Obj' : 'KR', 4)} ${pad(r.disposition, 11)} ${pad(pct(r.finalScore), 5)} ${pad(r.progress == null ? '-' : `${Math.round(r.progress)}%`, 5)} ${pad(r.outcome ?? '-', 9)} ${pad(r.finalGrade == null ? '-' : r.finalGrade.toFixed(2), 5)} ${pad(r.primaryBlocker ?? '-', 15)} ${pad(r.status, 14)} ${[r.detail, r.gradeRationale ? 'rationale' : null, ...r.warnings].filter(Boolean).join('; ')}`,
    )
  }
}

export async function run(argv: string[]) {
  const args = parseArgs(argv)
  const prisma = new PrismaClient()
  try {
    const workbookPath = resolveWorkbookPath(args.workbook)
    const parsedSheet = readCarryForwardWorkbook(workbookPath)
    const sheetRows = parsedSheet.rows
    const mode = args.apply ? 'APPLY' : 'DRY RUN'
    console.log(`\nFY25/26 close — ${mode}`)
    console.log(`Workbook: ${workbookPath}`)
    console.log(`Sheet rows: ${sheetRows.length} (${sheetRows.filter((r) => r.type === 'OBJECTIVE').length} objectives, ${sheetRows.filter((r) => r.type === 'KEY_RESULT').length} KRs)`)
    for (const e of parsedSheet.errors) console.warn(`  sheet warning: ${e}`)
    const dupCodes = sheetRows.map((r) => r.code).filter((c, i, all) => all.indexOf(c) !== i)
    if (dupCodes.length) console.warn(`  sheet warning: duplicate codes ${[...new Set(dupCodes)].join(', ')}`)

    // Actor
    let actor: { id: string; email: string; name: string } | null = null
    if (args.actorEmail) {
      actor = await prisma.user.findUnique({ where: { email: args.actorEmail }, select: { id: true, email: true, name: true } })
      if (!actor) throw new Error(`--actor-email ${args.actorEmail}: no such user`)
    } else {
      const settings = await prisma.organizationSettings.findUnique({ where: { id: 'singleton' }, select: { ceo: { select: { id: true, email: true, name: true } } } })
      actor = settings?.ceo ?? null
      if (!actor) throw new Error('No company CEO set in OrganizationSettings.companyCeoUserId — pass --actor-email')
    }
    console.log(`Actor: ${actor.name} <${actor.email}>`)

    // Match
    const codes = [...new Set(sheetRows.map((r) => r.code))]
    const matches = await matchByCode(prisma, codes)

    // Timeframe: explicit, else the one most matched (non-deleted) items belong to.
    let timeframeId = args.timeframeId
    if (!timeframeId) {
      const counts = new Map<string, number>()
      for (const m of [...matches.objectives, ...matches.keyResults]) {
        if (m.status === 'DELETED') continue
        counts.set(m.timeframeId, (counts.get(m.timeframeId) ?? 0) + 1)
      }
      timeframeId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    }
    const timeframe = timeframeId ? await prisma.timeframe.findUnique({ where: { id: timeframeId } }) : null
    if (args.timeframeId && !timeframe) throw new Error(`--timeframe-id ${args.timeframeId}: no such timeframe`)
    console.log(
      timeframe
        ? `Timeframe: ${timeframe.name} (${timeframe.id}) ${timeframe.startDate.toISOString().slice(0, 10)} → ${timeframe.endDate.toISOString().slice(0, 10)}`
        : 'Timeframe: none matched',
    )

    // Build per-row reports
    const reports: RowReport[] = sheetRows.map((row) => {
      const sameType = (row.type === 'OBJECTIVE' ? matches.objectives : matches.keyResults).filter((m) => m.code === row.code)
      const otherType = (row.type === 'OBJECTIVE' ? matches.keyResults : matches.objectives).filter((m) => m.code === row.code)
      const base: RowReport = {
        rowNo: row.rowNo,
        code: row.code,
        type: row.type,
        title: row.title,
        disposition: row.disposition,
        finalScore: row.finalScore,
        status: 'UNMATCHED',
        detail: null,
        id: null,
        dbTitle: null,
        timeframeId: null,
        closureStatusBefore: null,
        progress: null,
        outcome: null,
        finalGrade: null,
        gradeRationale: null,
        primaryBlocker: null,
        recommendedAction: null,
        closureNote: null,
        warnings: [],
      }
      const live = sameType.filter((m) => m.status !== 'DELETED')
      if (sameType.length === 0) {
        if (otherType.length > 0) return { ...base, status: 'TYPE_MISMATCH', detail: `code matches a ${row.type === 'OBJECTIVE' ? 'KR' : 'objective'} (${otherType.map((m) => m.id).join(', ')})` }
        return { ...base, detail: 'no objective/KR with this short code' }
      }
      if (live.length === 0) return { ...base, status: 'DELETED', id: sameType[0].id, detail: 'only a DELETED item has this code' }
      // Prefer the candidate in the resolved timeframe when the code collides.
      const inTf = live.filter((m) => m.timeframeId === timeframeId)
      const pool = inTf.length > 0 ? inTf : live
      if (pool.length > 1) return { ...base, status: 'AMBIGUOUS', detail: `${pool.length} items share this code: ${pool.map((m) => m.id).join(', ')}` }
      const m = pool[0]
      const report: RowReport = {
        ...base,
        id: m.id,
        dbTitle: m.title,
        timeframeId: m.timeframeId,
        closureStatusBefore: m.closureStatus,
        progress: Number(m.progress),
      }
      if (m.status !== 'ACTIVE') report.warnings.push(`status ${m.status}`)
      if (m.timeframeId !== timeframeId) return { ...report, status: 'WRONG_TIMEFRAME', detail: `item is in timeframe ${m.timeframeId}` }
      if (m.closureStatus === 'CLOSED') return { ...report, status: 'ALREADY_CLOSED' }
      if (row.type === 'KEY_RESULT') {
        const kr = m as MatchedKeyResult
        if (kr.objectiveIsLocked) return { ...report, status: 'BLOCKED', detail: 'parent objective is already locked (CLOSED) — reopen it first' }
        const parentRow = row.parentCode ? sheetRows.find((r) => r.code === row.parentCode) : null
        if (parentRow && kr.objectiveId.slice(-6).toUpperCase() !== parentRow.code) {
          report.warnings.push(`parent in DB is ${kr.objectiveId.slice(-6).toUpperCase()}, sheet says ${parentRow.code}`)
        }
      }
      if (m.closureStatus === 'CLOSING') report.warnings.push('was CLOSING — close is completed with the sheet values')
      const plan = closePlanForRow(row, Number(m.progress))
      return {
        ...report,
        status: 'WOULD_CLOSE',
        outcome: plan.outcome,
        finalGrade: plan.finalGrade == null ? null : Math.round(plan.finalGrade * 20) / 20,
        gradeRationale: plan.gradeRationale,
        primaryBlocker: plan.retrospective.primaryBlocker,
        recommendedAction: plan.retrospective.recommendedAction,
        closureNote: plan.closureNote,
      }
    })

    // Other open OKRs in the timeframe that the sheet does not list.
    const sheetIds = new Set(reports.map((r) => r.id).filter((x): x is string => !!x))
    const others: OtherReport[] = []
    if (timeframeId) {
      const objs = await prisma.objective.findMany({
        where: { timeframeId, status: { not: 'DELETED' }, closureStatus: { not: 'CLOSED' } },
        select: { id: true, title: true, closureStatus: true, status: true, progress: true, owner: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      })
      const krs = await prisma.keyResult.findMany({
        where: { objective: { timeframeId }, status: 'ACTIVE', closureStatus: { not: 'CLOSED' } },
        select: { id: true, title: true, objectiveId: true, closureStatus: true, status: true, progress: true, owner: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      })
      for (const k of krs) {
        if (sheetIds.has(k.id)) continue
        others.push({ type: 'KEY_RESULT', code: k.id.slice(-6).toUpperCase(), id: k.id, title: k.title, objectiveId: k.objectiveId, closureStatus: k.closureStatus, status: k.status, progress: k.progress, owner: k.owner?.name ?? null, action: args.includeOthers ? 'WOULD_CLOSE' : 'LISTED', outcome: null, finalGrade: null, detail: null })
      }
      for (const o of objs) {
        if (sheetIds.has(o.id)) continue
        others.push({ type: 'OBJECTIVE', code: o.id.slice(-6).toUpperCase(), id: o.id, title: o.title, objectiveId: null, closureStatus: o.closureStatus, status: o.status, progress: o.progress, owner: o.owner?.name ?? null, action: args.includeOthers ? 'WOULD_CLOSE' : 'LISTED', outcome: null, finalGrade: null, detail: null })
      }
      if (args.includeOthers) {
        for (const o of others) {
          const plan = closePlanForOther(o.progress)
          o.outcome = plan.outcome
          o.finalGrade = plan.finalGrade
        }
      }
    }

    // Predict blocked objectives (open ACTIVE KRs that this run will not close).
    const krToClose = new Set<string>([
      ...reports.filter((r) => r.type === 'KEY_RESULT' && r.status === 'WOULD_CLOSE').map((r) => r.id as string),
      ...(args.includeOthers ? others.filter((o) => o.type === 'KEY_RESULT').map((o) => o.id) : []),
    ])
    const objectiveIdsToClose = [
      ...reports.filter((r) => r.type === 'OBJECTIVE' && r.status === 'WOULD_CLOSE').map((r) => r.id as string),
      ...(args.includeOthers ? others.filter((o) => o.type === 'OBJECTIVE').map((o) => o.id) : []),
    ]
    const openKrs = objectiveIdsToClose.length
      ? await prisma.keyResult.findMany({
          where: { objectiveId: { in: objectiveIdsToClose }, status: 'ACTIVE', closureStatus: { not: 'CLOSED' } },
          select: { id: true, objectiveId: true },
        })
      : []
    const blockersByObjective = new Map<string, string[]>()
    for (const k of openKrs) {
      if (krToClose.has(k.id)) continue
      blockersByObjective.set(k.objectiveId, [...(blockersByObjective.get(k.objectiveId) ?? []), k.id.slice(-6).toUpperCase()])
    }
    for (const r of reports) {
      if (r.type === 'OBJECTIVE' && r.status === 'WOULD_CLOSE' && r.id && blockersByObjective.has(r.id)) {
        r.status = 'BLOCKED'
        r.detail = `open active KR(s) not in the sheet: ${blockersByObjective.get(r.id)!.join(', ')} — use --include-others`
      }
    }
    for (const o of others) {
      if (o.type === 'OBJECTIVE' && o.action === 'WOULD_CLOSE' && blockersByObjective.has(o.id)) {
        o.action = 'BLOCKED'
        o.detail = `open active KR(s): ${blockersByObjective.get(o.id)!.join(', ')}`
      }
    }

    // Apply: KRs first, then objectives.
    if (args.apply) {
      const meta = (row: RowReport | null) => (row ? { code: row.code, sheetRow: row.rowNo, disposition: row.disposition, finalScore: row.finalScore } : { scope: 'other-open-okr' })
      const rowByCode = new Map(sheetRows.map((r) => [r.code, r]))
      const applyOne = async (
        type: ItemType,
        id: string,
        makePlan: (progress: number) => ClosePlan,
        metadata: Record<string, unknown>,
      ): Promise<CloseOutcome | { error: string }> => {
        try {
          return type === 'KEY_RESULT'
            ? await closeKeyResult(prisma, id, makePlan, actor!.id, metadata)
            : await closeObjective(prisma, id, makePlan, actor!.id, metadata)
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) }
        }
      }
      for (const phase of ['KEY_RESULT', 'OBJECTIVE'] as const) {
        for (const r of reports.filter((x) => x.type === phase && x.status === 'WOULD_CLOSE')) {
          const row = rowByCode.get(r.code)!
          const res = await applyOne(phase, r.id!, (progress) => closePlanForRow(row, progress), meta(r))
          if ('error' in res) {
            r.status = 'ERROR'
            r.detail = res.error
          } else if (res.closed) {
            r.status = 'CLOSED_NOW'
            r.finalGrade = res.finalGrade
            r.outcome = res.outcome
            r.progress = res.finalProgress
          } else {
            r.status = res.skipped === 'already CLOSED' ? 'ALREADY_CLOSED' : 'BLOCKED'
            r.detail = res.skipped ?? null
          }
        }
        if (args.includeOthers) {
          for (const o of others.filter((x) => x.type === phase && x.action === 'WOULD_CLOSE')) {
            const res = await applyOne(phase, o.id, (progress) => closePlanForOther(progress), meta(null))
            if ('error' in res) {
              o.action = 'ERROR'
              o.detail = res.error
            } else if (res.closed) {
              o.action = 'CLOSED_NOW'
              o.outcome = res.outcome
              o.finalGrade = res.finalGrade
            } else {
              o.action = 'BLOCKED'
              o.detail = res.skipped ?? null
            }
          }
        }
      }
    }

    // Output
    console.log('')
    printRowTable(reports)
    const tally = (status: RowStatus) => reports.filter((r) => r.status === status).length
    const summary = {
      sheetRows: reports.length,
      wouldClose: tally('WOULD_CLOSE'),
      closedNow: tally('CLOSED_NOW'),
      alreadyClosed: tally('ALREADY_CLOSED'),
      unmatched: tally('UNMATCHED'),
      ambiguous: tally('AMBIGUOUS'),
      typeMismatch: tally('TYPE_MISMATCH'),
      deleted: tally('DELETED'),
      wrongTimeframe: tally('WRONG_TIMEFRAME'),
      blocked: tally('BLOCKED'),
      errors: tally('ERROR'),
      outcomes: Object.fromEntries(
        ['ACHIEVED', 'PARTIAL', 'MISSED', 'ABANDONED'].map((o) => [o, reports.filter((r) => r.outcome === o && (r.status === 'WOULD_CLOSE' || r.status === 'CLOSED_NOW')).length]),
      ),
      withGradeRationale: reports.filter((r) => r.gradeRationale && (r.status === 'WOULD_CLOSE' || r.status === 'CLOSED_NOW')).length,
      otherOpenOkrs: others.length,
      otherClosedNow: others.filter((o) => o.action === 'CLOSED_NOW').length,
    }
    console.log('')
    console.log(
      `Summary: ${summary.sheetRows} rows · would close ${summary.wouldClose} · closed now ${summary.closedNow} · already closed ${summary.alreadyClosed} · unmatched ${summary.unmatched} · ambiguous ${summary.ambiguous} · type mismatch ${summary.typeMismatch} · deleted ${summary.deleted} · wrong timeframe ${summary.wrongTimeframe} · blocked ${summary.blocked} · errors ${summary.errors}`,
    )
    console.log(`Outcomes: ${Object.entries(summary.outcomes).map(([k, v]) => `${k} ${v}`).join(' · ')} · grade rationale on ${summary.withGradeRationale}`)
    console.log('')
    if (others.length === 0) {
      console.log('Other open OKRs in the timeframe (not in the sheet): none')
    } else {
      console.log(`Other open OKRs in the timeframe (not in the sheet): ${others.length}${args.includeOthers ? '' : ' — report only; pass --include-others to close them'}`)
      for (const o of others) {
        console.log(`  ${pad(o.type === 'OBJECTIVE' ? 'Obj' : 'KR', 4)} ${pad(o.code, 6)} ${pad(`${Math.round(o.progress)}%`, 5)} ${pad(o.closureStatus, 8)} ${pad(o.action, 11)} ${pad(o.outcome ?? '-', 9)} ${pad(o.owner ?? '-', 20)} ${pad(o.title, 60)} ${o.detail ?? ''}`)
      }
    }
    if (!args.apply) console.log('\nDry run — nothing was written. Re-run with --apply to close.')

    const report = {
      generatedAt: new Date().toISOString(),
      mode: args.apply ? 'apply' : 'dry-run',
      source: SOURCE,
      workbook: workbookPath,
      sheet: SHEET_NAME,
      sheetWarnings: parsedSheet.errors,
      actor,
      timeframe: timeframe ? { id: timeframe.id, name: timeframe.name, startDate: timeframe.startDate, endDate: timeframe.endDate } : null,
      includeOthers: args.includeOthers,
      summary,
      rows: reports,
      others,
    }
    if (args.report) {
      const out = path.resolve(args.report)
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)
      console.log(`Report written: ${out}`)
    }
    const failed = summary.errors > 0
    return { report, failed }
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && /close-fy2526-okrs\.ts$/.test(process.argv[1])) {
  run(process.argv.slice(2))
    .then(({ failed }) => process.exit(failed ? 1 : 0))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err)
      process.exit(1)
    })
}
