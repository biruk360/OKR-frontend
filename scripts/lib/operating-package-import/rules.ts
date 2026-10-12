/**
 * Operating-package importer (IMP) — pure mapping rules from workbook text to model values.
 * Every rule here is unit-tested (rules.test.ts) and surfaced in the dry-run review workbook.
 */
import { cellText, isBlank, mentionsMonth } from './text'

// ─── Clean single figures ("ETB 300M", "≥200", "≤15%", "≥8x") ──────────────

export interface CleanFigure {
  value: number
  /** '%', 'ETB', 'x', 'score' (n/10) or 'count'. */
  unit: string
  /** The target text reads as a reduction ("<5", "≤15%", "reduce …", or a zero target). */
  decrease: boolean
  comparator: string | null
}

const MAGNITUDE: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, bn: 1e9, million: 1e6, billion: 1e9 }

function normaliseMinus(text: string): string {
  return text.replace(/[−–—]/g, (ch) => (ch === '−' ? '-' : ch))
}

/**
 * A single clean figure, or null. Rejected: compound targets (";", "·", several numbers), dates,
 * and trailing text longer than a short unit phrase ("3 signed", "<5 a week" are accepted).
 */
export function parseCleanFigure(raw: string | null | undefined): CleanFigure | null {
  const text = normaliseMinus(cellText(raw))
  if (!text || isBlank(text)) return null
  if (/[;·]/.test(text)) return null
  if (mentionsMonth(text)) return null
  if (/\bQ[1-4]\b/i.test(text)) return null
  // "≥8/10" is one figure on a 10-point scale.
  const numbers = text.replace(/(\d+(?:\.\d+)?)\s*\/\s*10\b/g, '$1').match(/\d[\d,]*(?:\.\d+)?/g) ?? []
  if (numbers.length !== 1) return null

  const m = text.match(
    /^(≥|>=|>|≤|<=|<|~|≈|-|\+)?\s*(ETB\s*)?(\d[\d,]*(?:\.\d+)?)\s*(bn\b|million\b|billion\b|[KMB](?![a-z]))?\s*(%|x\b|\/\s*10\b)?\s*(.*)$/i,
  )
  if (!m) return null
  const comparator = m[1] ?? null
  const rest = (m[6] ?? '').trim()
  if (/\d/.test(rest) || rest.length > 32) return null
  if (comparator === '-' && !m[2]) {
    // "−30%" is a relative change, not a level; it needs a baseline to be numeric.
    return null
  }
  const base = Number(m[3].replace(/,/g, ''))
  if (!Number.isFinite(base)) return null
  const mag = m[4] ? MAGNITUDE[m[4].toLowerCase()] ?? 1 : 1
  const value = base * mag
  const suffix = (m[5] ?? '').replace(/\s+/g, '').toLowerCase()
  const restIsEtb = /^etb\b/i.test(rest)
  const unit = m[2] || restIsEtb ? 'ETB' : suffix === '%' ? '%' : suffix === 'x' ? 'x' : suffix === '/10' ? 'score' : 'count'
  const decrease =
    comparator === '<' ||
    comparator === '≤' ||
    comparator === '<=' ||
    /\b(reduce|reduced|cut|under|below|fewer|less than|at most|or less)\b/i.test(text) ||
    value === 0
  return { value, unit, decrease, comparator }
}

// ─── KR numeric plan (IMP-2) ────────────────────────────────────────────────

export type KrScoring = 'NUMERIC' | 'MILESTONE'

export interface KrNumericPlan {
  scoring: KrScoring
  startValue: number
  targetValue: number
  unit: string
  direction: 'INCREASE' | 'DECREASE'
  reason: string
}

/** Milestone-scored default: start 0, target 100, unit '%'; milestones carry 100/n each. */
export const MILESTONE_PLAN: Omit<KrNumericPlan, 'reason'> = {
  scoring: 'MILESTONE',
  startValue: 0,
  targetValue: 100,
  unit: '%',
  direction: 'INCREASE',
}

/**
 * Numeric only when the target is a single clean figure ("ETB 300M", "≥200", "3 signed");
 * otherwise milestone-scored 0 → 100 %. A decreasing figure ("<5 a week", "≤15%") is numeric
 * only when the baseline is a clean figure above it (start must exceed target, KRX-1).
 */
export function krNumericPlan(targetText: string | null | undefined, baselineText?: string | null): KrNumericPlan {
  const target = parseCleanFigure(targetText)
  if (!target) {
    return { ...MILESTONE_PLAN, reason: isBlank(targetText) ? 'no target' : 'compound or descriptive target' }
  }
  if (target.decrease) {
    const baseline = parseCleanFigure(baselineText)
    if (baseline && baseline.value > target.value) {
      return {
        scoring: 'NUMERIC',
        startValue: baseline.value,
        targetValue: target.value,
        unit: target.unit,
        direction: 'DECREASE',
        reason: 'single decreasing figure with a numeric baseline',
      }
    }
    return { ...MILESTONE_PLAN, reason: 'decreasing target without a numeric baseline above it' }
  }
  if (target.value <= 0) return { ...MILESTONE_PLAN, reason: 'zero target' }
  return {
    scoring: 'NUMERIC',
    startValue: 0,
    targetValue: target.value,
    unit: target.unit,
    direction: 'INCREASE',
    reason: 'single clean figure',
  }
}

/** Numeric value of a checkpoint cell for a numeric KR ("75M" with unit ETB → 75 000 000). */
export function checkpointValue(text: string | null | undefined, krUnit: string): number | null {
  const t = cellText(text)
  if (!t || isBlank(t)) return null
  const fig = parseCleanFigure(krUnit === 'ETB' && !/etb/i.test(t) ? `ETB ${t}` : t)
  return fig ? fig.value : null
}

// ─── C/A commitment ─────────────────────────────────────────────────────────

export function commitmentFromCa(raw: string | null | undefined): 'COMMITTED' | 'ASPIRATIONAL' | 'MIXED' | null {
  const t = cellText(raw).toUpperCase().replace(/\s+/g, '')
  if (t === 'C') return 'COMMITTED'
  if (t === 'A') return 'ASPIRATIONAL'
  if (t === 'C/A' || t === 'A/C') return 'MIXED'
  return null
}

// ─── KPIs ───────────────────────────────────────────────────────────────────

export interface KpiPlan {
  kpiType: 'LEADING' | 'LAGGING'
  frequency: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY'
  /** Workbook frequency text when it did not map 1:1 (kept in the KPI note). */
  frequencyNote: string | null
  unit: string
  direction: 'INCREASE' | 'DECREASE' | 'RANGE'
  targetValue: number | null
  targetMin: number | null
  targetMax: number | null
  baselineValue: number | null
  /** KPI-6: several sub-targets in one row — stored as one KPI, flagged for splitting. */
  compound: boolean
  isSensitive: boolean
}

export function kpiFrequency(raw: string | null | undefined): { frequency: KpiPlan['frequency']; note: string | null } {
  const t = cellText(raw).toLowerCase()
  if (/^weekly\b/.test(t)) return { frequency: 'WEEKLY', note: t === 'weekly' ? null : cellText(raw) }
  if (/^monthly\b/.test(t)) return { frequency: 'MONTHLY', note: t === 'monthly' ? null : cellText(raw) }
  if (/^quarterly\b/.test(t)) return { frequency: 'QUARTERLY', note: t === 'quarterly' ? null : cellText(raw) }
  return { frequency: 'MONTHLY', note: t ? cellText(raw) : null }
}

function guessUnit(text: string): string {
  if (/%/.test(text)) return '%'
  if (/\bETB\b/i.test(text)) return 'ETB'
  if (/\d\s*x\b/i.test(text)) return 'x'
  return ''
}

/** KPI-7: quota and commission-base KPIs are sensitive. */
export function isSensitiveKpi(name: string, definition: string, note = ''): boolean {
  return /\b(quota|commission)\b/i.test(`${name} ${definition} ${note}`)
}

export function kpiPlan(input: {
  name: string
  type: string
  definition: string
  target: string
  baseline: string
  frequency: string
  note?: string
}): KpiPlan {
  const { frequency, note } = kpiFrequency(input.frequency)
  const targetText = normaliseMinus(cellText(input.target))
  const range = targetText.match(/^(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*(%)?$/)
  const fig = parseCleanFigure(targetText)
  const base = parseCleanFigure(input.baseline)
  const numbers = targetText.match(/\d[\d,]*(?:\.\d+)?/g) ?? []
  const compound = /[;·]/.test(targetText) || (!fig && !range && numbers.length > 1)
  return {
    kpiType: /lag/i.test(input.type) ? 'LAGGING' : 'LEADING',
    frequency,
    frequencyNote: note,
    unit: range ? (range[3] ? '%' : '') : fig ? (fig.unit === 'count' ? 'count' : fig.unit) : guessUnit(targetText),
    direction: range ? 'RANGE' : fig?.decrease ? 'DECREASE' : 'INCREASE',
    targetValue: range ? null : fig ? fig.value : null,
    targetMin: range ? Number(range[1]) : null,
    targetMax: range ? Number(range[2]) : null,
    baselineValue: base ? base.value : null,
    compound,
    isSensitive: isSensitiveKpi(input.name, input.definition, input.note ?? ''),
  }
}

// ─── Recurring duties (DUT-1, DUT-2, DUT-3) ─────────────────────────────────

export type DutyCadence =
  | 'DAILY'
  | 'WEEKDAYS'
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'SEMIANNUAL'
  | 'YEARLY'
  | 'EVERY_SPRINT'
  | 'EVENT'

export interface CadenceMapping {
  cadence: DutyCadence
  eventLabel: string | null
  /** Set when the mapping is a judgement call the reviewer should confirm. */
  note: string | null
}

/** Words that make a "Daily" duty a working-day duty (→ WEEKDAYS). */
const WORKING_DAY_HINTS = /\b(scrum|stand-?up|working day|business day|weekday|office|start of (the )?day|end of (the )?day|morning|fixed (time|block)|by \d{1,2}[:.]\d{2})\b/i

export function mapCadence(cadenceText: string, title = '', timing = ''): CadenceMapping {
  const raw = cellText(cadenceText)
  const t = raw.toLowerCase()
  if (/^daily\b/.test(t)) {
    const working = WORKING_DAY_HINTS.test(`${title} ${timing}`)
    return { cadence: working ? 'WEEKDAYS' : 'DAILY', eventLabel: null, note: working ? 'Daily on working days (Mon–Fri)' : null }
  }
  if (/\b(biweekly|bi-weekly|every two weeks|fortnight)/.test(t)) return { cadence: 'BIWEEKLY', eventLabel: null, note: null }
  if (/^weekly\b/.test(t)) return { cadence: 'WEEKLY', eventLabel: null, note: t === 'weekly' ? null : `Workbook cadence "${raw}"` }
  if (/\bevery sprint\b|\bper sprint\b/.test(t)) return { cadence: 'EVERY_SPRINT', eventLabel: null, note: null }
  if (/\b(every two months|bi-?monthly|every 2 months)\b/.test(t)) {
    return { cadence: 'EVENT', eventLabel: t, note: 'No two-monthly recurrence rule — logged by hand (EVENT)' }
  }
  if (/^monthly\b/.test(t)) return { cadence: 'MONTHLY', eventLabel: null, note: null }
  if (/\bquarterly\b/.test(t)) return { cadence: 'QUARTERLY', eventLabel: null, note: null }
  if (/\b(twice a year|semi-?annual(ly)?|every six months|every 6 months|half-?yearly)\b/.test(t)) {
    return { cadence: 'SEMIANNUAL', eventLabel: null, note: null }
  }
  if (/\b(annual(ly)?|yearly|every year|once a year)\b/.test(t)) return { cadence: 'YEARLY', eventLabel: null, note: null }
  if (/^per\b|\bper (request|event)\b/.test(t)) return { cadence: 'EVENT', eventLabel: t, note: null }
  return { cadence: 'EVENT', eventLabel: t || 'as needed', note: `Unrecognised cadence "${raw}" — logged by hand (EVENT)` }
}

/** "Yes", "Yes (automatic)" → true. */
export function parseYes(raw: string | null | undefined): boolean {
  return /^y(es)?\b/i.test(cellText(raw))
}

// ─── Development plan (DEV) ─────────────────────────────────────────────────

export type DevelopmentKind = 'CERTIFICATION' | 'COURSE' | 'TRAINING_HOURS' | 'MENTORING' | 'OTHER'

export function developmentKind(title: string, target = ''): DevelopmentKind {
  const t = `${title} ${target}`.toLowerCase()
  if (/certif/.test(title.toLowerCase())) return 'CERTIFICATION'
  if (/training hours|hours logged|≥\s*\d+\s*(training )?hours/.test(t) && !/certif|course/.test(title.toLowerCase())) return 'TRAINING_HOURS'
  if (/\b(mentor|mentoring|coach|coaching)\b/.test(t)) return 'MENTORING'
  if (/\b(course|programme|program|training|workshop|class)\b/.test(t)) return 'COURSE'
  if (/certif/.test(t)) return 'CERTIFICATION'
  return 'OTHER'
}

/** "≥40 hours", "40 hours" → 40. */
export function targetHours(...texts: string[]): number | null {
  for (const text of texts) {
    const m = cellText(text).match(/(\d+(?:\.\d+)?)\s*(?:training\s+)?hours?\b/i)
    if (m) return Number(m[1])
  }
  return null
}

export function developmentStatus(raw: string): 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'DROPPED' {
  const t = cellText(raw).toLowerCase()
  if (/^(done|complete|completed)\b/.test(t)) return 'DONE'
  if (/^in progress\b/.test(t)) return 'IN_PROGRESS'
  if (/^(dropped|cancel)/.test(t)) return 'DROPPED'
  return 'NOT_STARTED'
}

// ─── Role definition (ROL) ──────────────────────────────────────────────────

export type RoleItemSection = 'ACCOUNTABILITY' | 'DIRECT_REPORT_SEAT' | 'DECISION_RIGHT' | 'INTERFACE' | 'OTHER'

export type RoleRowKind =
  | { kind: 'SEAT' }
  | { kind: 'REPORTS_TO' }
  | { kind: 'PURPOSE' }
  | { kind: 'ITEM'; section: RoleItemSection; split: boolean }

/** Map a "Section" cell of the Role Definition sheet. Direct-report seats are split per "·" (ROL-4). */
export function roleRowKind(section: string): RoleRowKind {
  const s = cellText(section).toLowerCase()
  if (s === 'seat') return { kind: 'SEAT' }
  if (s.startsWith('reports to')) return { kind: 'REPORTS_TO' }
  if (s === 'purpose') return { kind: 'PURPOSE' }
  if (s.startsWith('direct report')) return { kind: 'ITEM', section: 'DIRECT_REPORT_SEAT', split: true }
  if (s.startsWith('accountability')) return { kind: 'ITEM', section: 'ACCOUNTABILITY', split: false }
  if (s.startsWith('decision right') || s.startsWith('escalates')) return { kind: 'ITEM', section: 'DECISION_RIGHT', split: false }
  if (s.startsWith('key interface') || s.startsWith('interfaces')) return { kind: 'ITEM', section: 'INTERFACE', split: false }
  return { kind: 'ITEM', section: 'OTHER', split: false }
}

// ─── Dependencies (DEP) and decisions (DEC) ─────────────────────────────────

export type DependencyType = 'DECISION' | 'POLICY' | 'HIRE' | 'ASSET' | 'DATA' | 'SYSTEM' | 'BUDGET' | 'OTHER'

export function dependencyType(raw: string | null | undefined): DependencyType {
  const t = cellText(raw).toLowerCase()
  if (t.startsWith('decision')) return 'DECISION'
  if (t.startsWith('policy')) return 'POLICY'
  if (t.startsWith('hire') || t.startsWith('hiring')) return 'HIRE'
  if (t.startsWith('asset')) return 'ASSET'
  if (t.startsWith('data')) return 'DATA'
  if (t.startsWith('system')) return 'SYSTEM'
  if (t.startsWith('finance') || t.startsWith('budget')) return 'BUDGET'
  return 'OTHER'
}

export function dependencyStatus(raw: string | null | undefined): 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' | 'DROPPED' {
  const t = cellText(raw).toLowerCase()
  if (/^(done|complete|closed)/.test(t)) return 'DONE'
  if (/^in progress/.test(t)) return 'IN_PROGRESS'
  if (/^blocked/.test(t)) return 'BLOCKED'
  if (/^(dropped|cancel|withdrawn)/.test(t)) return 'DROPPED'
  return 'OPEN'
}

/** Links sheet direction: Inbound / "The CEO needs" → INBOUND; Outbound / "Others need from the CEO" → OUTBOUND. */
export function linkDirection(raw: string | null | undefined): 'INBOUND' | 'OUTBOUND' | null {
  const t = cellText(raw).toLowerCase()
  if (t.startsWith('inbound') || /\bneeds$/.test(t)) return 'INBOUND'
  if (t.startsWith('outbound') || /need from/.test(t)) return 'OUTBOUND'
  return null
}

export function decisionStatus(raw: string | null | undefined): 'OPEN' | 'DECIDED' | 'DEFERRED' | 'WITHDRAWN' {
  const t = cellText(raw).toLowerCase()
  if (t.startsWith('decided')) return 'DECIDED'
  if (t.startsWith('deferred')) return 'DEFERRED'
  if (t.startsWith('withdrawn')) return 'WITHDRAWN'
  return 'OPEN'
}

/** Milestone / task "Status" → Todo status. */
export function todoStatus(raw: string | null | undefined): 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' {
  const t = cellText(raw).toLowerCase()
  if (/^(done|complete|completed)\b/.test(t)) return 'COMPLETED'
  if (/^in progress\b/.test(t)) return 'IN_PROGRESS'
  if (/^(cancel|dropped)/.test(t)) return 'CANCELLED'
  return 'PENDING'
}

/** "Agree" / "Dispute" review cell → verdict, or null when empty or unrecognised. */
export function reviewVerdict(raw: string | null | undefined): 'AGREE' | 'DISPUTE' | null {
  const t = cellText(raw).toLowerCase()
  if (t.startsWith('agree')) return 'AGREE'
  if (t.startsWith('dispute') || t.startsWith('disagree')) return 'DISPUTE'
  return null
}

/** Carry-forward disposition → OkrLink SUCCEEDS subKind; null for dispositions that get no link. */
export function succeedsSubKind(disposition: string): 'CARRIED' | 'REFRAMED' | 'SUPERSEDED' | 'MERGED' | null {
  switch (disposition) {
    case 'Carried':
      return 'CARRIED'
    case 'Reframed':
      return 'REFRAMED'
    case 'Superseded':
      return 'SUPERSEDED'
    case 'Merged':
      return 'MERGED'
    default:
      return null
  }
}

/** "Role KPIs" → kpis, "Values and A-Player behaviours" → values, "OKR contribution" → okr, "Development…" → development. */
export function weightKey(component: string): string | null {
  const t = cellText(component).toLowerCase()
  if (/\bkpi/.test(t)) return 'kpis'
  if (/\bvalues?\b/.test(t)) return 'values'
  if (/\bokr\b/.test(t)) return 'okr'
  if (/\bdevelopment\b/.test(t)) return 'development'
  return null
}

/** "50%" → 50. */
export function parsePercent(raw: string | null | undefined): number | null {
  const m = cellText(raw).match(/^(\d+(?:\.\d+)?)\s*%?$/)
  if (!m) return null
  const n = Number(m[1])
  // xlsx may hand back 0.5 for a cell formatted as 50%.
  return n > 0 && n <= 1 && !cellText(raw).includes('%') ? n * 100 : n
}
