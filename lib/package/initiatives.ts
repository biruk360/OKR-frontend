/**
 * Employee Operating Package v2 — KR initiatives (Todo kind = INITIATIVE).
 *
 * An initiative is the work behind a KR (`keyResultId`) or, with no KR, behind
 * a KPI. The importer writes its workbook fields into the Todo description as
 * a "Label: value" block:
 *
 *   Group: Revenue
 *   Type: C            (C | A | C/A)
 *   Baseline: 0
 *   Target: 12 signed MoUs
 *   Due: 2026-12-31
 *   Measured by: CRM pipeline report
 *   Supports: KR1.1, KPI-3
 *   Dependencies: Finance sign-off
 *
 * Milestones (kind = MILESTONE) under the same KR name their initiative on the
 * description's first line — "Initiative: EDN-IN1.1 — Partner outreach" — and
 * are grouped under the initiative whose `externalRef` matches.
 *
 * Pure and client-safe; unit-tested in `initiatives.test.ts`.
 */
import { TODO_KIND_ORDER, isTodoKind, type KrCommitment } from '@/types/package'

export interface InitiativeMeta {
  group: string | null
  /** Parsed from "Type" (C / A / C/A, or the words). Null when absent or unparseable. */
  commitment: KrCommitment | null
  baseline: string | null
  target: string | null
  /** Raw due text from the block (the Todo's own `dueDate` is authoritative). */
  due: string | null
  measuredBy: string | null
  supports: string | null
  dependencies: string | null
}

const EMPTY_META: InitiativeMeta = {
  group: null,
  commitment: null,
  baseline: null,
  target: null,
  due: null,
  measuredBy: null,
  supports: null,
  dependencies: null,
}

/** Normalised label → field. Labels are matched lower-case with non-letters removed. */
const LABEL_FIELD: Record<string, keyof InitiativeMeta> = {
  group: 'group',
  type: 'commitment',
  typeca: 'commitment',
  ca: 'commitment',
  commitment: 'commitment',
  baseline: 'baseline',
  target: 'target',
  due: 'due',
  duedate: 'due',
  measuredby: 'measuredBy',
  measure: 'measuredBy',
  supports: 'supports',
  dependencies: 'dependencies',
  dependson: 'dependencies',
}

/** "C" / "A" / "C/A" (or the words) → KrCommitment. */
export function parseCommitmentCode(raw: string | null | undefined): KrCommitment | null {
  const t = (raw ?? '').toUpperCase().replace(/\s+/g, '')
  if (!t) return null
  if (t === 'C' || t === 'COMMITTED') return 'COMMITTED'
  if (t === 'A' || t === 'ASPIRATIONAL') return 'ASPIRATIONAL'
  if (t === 'C/A' || t === 'A/C' || t === 'MIXED' || t === 'COMMITTED/ASPIRATIONAL') return 'MIXED'
  // "C (committed)" and similar: take the leading code.
  const lead = /^(C\/A|A\/C|C|A)(?![A-Z])/.exec(t)
  if (!lead) return null
  return lead[1] === 'C' ? 'COMMITTED' : lead[1] === 'A' ? 'ASPIRATIONAL' : 'MIXED'
}

function blank(v: string): boolean {
  return v === '' || v === '-' || v === '—' || v === '–' || /^n\/?a$/i.test(v)
}

/** Parse the initiative's "Label: value" description block. Unknown lines are ignored. */
export function parseInitiativeMeta(description: string | null | undefined): InitiativeMeta {
  const meta: InitiativeMeta = { ...EMPTY_META }
  if (!description) return meta
  for (const rawLine of description.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*(?:[-*•·]\s+)?/, '')
    const m = /^([A-Za-z][A-Za-z /()-]{0,30}?)\s*:\s*(.*)$/.exec(line)
    if (!m) continue
    const field = LABEL_FIELD[m[1].toLowerCase().replace(/[^a-z]/g, '')]
    if (!field || meta[field] !== null) continue
    const value = m[2].trim()
    if (blank(value)) continue
    if (field === 'commitment') meta.commitment = parseCommitmentCode(value)
    else meta[field] = value
  }
  return meta
}

/**
 * The initiative ref a milestone names on its description's first non-empty
 * line ("Initiative: EDN-IN1.1 — Partner outreach"), or null.
 */
export function milestoneInitiativeRef(description: string | null | undefined): string | null {
  if (!description) return null
  const first = description.split(/\r?\n/).find((l) => l.trim() !== '')
  if (!first) return null
  const m = /^\s*Initiative\s*:\s*([^\s—–]+)/i.exec(first)
  if (!m) return null
  const ref = m[1].replace(/[,;:.]+$/, '').trim()
  return ref || null
}

function refKey(ref: string | null | undefined): string | null {
  const k = ref?.trim().toLowerCase()
  return k ? k : null
}

/**
 * Group milestones under the initiative whose `externalRef` matches their
 * `initiativeRef` (case-insensitive). Milestones with no ref, or a ref that
 * matches no initiative, come back in `ungrouped`. Input order is kept.
 */
export function groupMilestonesByInitiative<
  I extends { id: string; externalRef: string | null },
  M extends { initiativeRef: string | null },
>(initiatives: readonly I[], milestones: readonly M[]): { byInitiative: Map<string, M[]>; ungrouped: M[] } {
  const idByRef = new Map<string, string>()
  for (const i of initiatives) {
    const k = refKey(i.externalRef)
    if (k && !idByRef.has(k)) idByRef.set(k, i.id)
  }
  const byInitiative = new Map<string, M[]>()
  const ungrouped: M[] = []
  for (const m of milestones) {
    const k = refKey(m.initiativeRef)
    const id = k ? idByRef.get(k) : undefined
    if (!id) {
      ungrouped.push(m)
      continue
    }
    const list = byInitiative.get(id) ?? []
    list.push(m)
    byInitiative.set(id, list)
  }
  return { byInitiative, ungrouped }
}

/** Rank for sorting a KR's todos: initiatives, then milestones, then the rest. */
export function todoKindRank(kind: string | null | undefined): number {
  return isTodoKind(kind) ? TODO_KIND_ORDER[kind] : TODO_KIND_ORDER.TASK
}
