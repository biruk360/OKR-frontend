/**
 * Operating-package importer (IMP) — workbook item ids.
 *
 * Global ids (unique across the FY 2026/27 workbooks):
 *   company objectives  O1 … O6           company KRs   KR1.1 … KR6.4
 *   CEO package         C1 … C6, C1.1 …   other packages EDN-O1, EDN-KR1.1, EYO-…, YOG-…, YAR-…,
 *                                                         MEK-…, BET-…, ERP-…, MBL-…
 *   KPIs                EDN-K01, CEO-K03  dependencies  DEP01 … DEP80   decisions D01 … D87
 *   initiatives (v2)    EDN-IN1.1, CIN1.1 (CEO)  initiative groups EDN-IG1, CIG1 (CEO)
 * Package-local ids (unique only inside one workbook): milestones M1.1.1, tasks T01, duties RD-W1,
 * development items DV1, package links X01.
 */

export const PACKAGE_PREFIXES = ['EDN', 'EYO', 'YOG', 'YAR', 'MEK', 'BET', 'ERP', 'MBL'] as const

export type OkrRefKind = 'OBJECTIVE' | 'KEY_RESULT'

export interface OkrRef {
  /** Canonical id as written in the workbook ("KR1.3", "EDN-KR1.1", "C1.4", "O2"). */
  id: string
  kind: OkrRefKind
}

const PREFIX_ALT = PACKAGE_PREFIXES.join('|')

/** Matches one OKR id. Longest alternatives first so "MEK-KR3.2" is never read as "KR3.2". */
const OKR_REF_SOURCE = `\\b(?:(?:${PREFIX_ALT})-(?:KR\\d+(?:\\.\\d+)?|O\\d+)|KR\\d+\\.\\d+|O\\d+|C\\d+(?:\\.\\d+)?)\\b`

/** Kind of an OKR id, or null when the text is not one. */
export function okrRefKind(id: string): OkrRefKind | null {
  const t = id.trim().toUpperCase()
  if (!new RegExp(`^${OKR_REF_SOURCE}$`).test(t)) return null
  if (/^(?:[A-Z]+-)?KR\d/.test(t)) return 'KEY_RESULT'
  if (/^C\d+\.\d+$/.test(t)) return 'KEY_RESULT'
  return 'OBJECTIVE'
}

/**
 * Expand id ranges written with an en dash or hyphen: "KR6.1–KR6.4" → KR6.1, KR6.2, KR6.3, KR6.4;
 * "D01–D16" → D01 … D16. Only same-prefix ranges of at most 40 items are expanded.
 */
export function expandRanges(text: string): string {
  return text.replace(
    /\b([A-Z]+-)?(KR|D|DEP)(\d+)(?:\.(\d+))?\s*[–-]\s*\1?\2(\d+)(?:\.(\d+))?\b/g,
    (whole, pfx: string | undefined, kind: string, a1: string, a2: string | undefined, b1: string, b2: string | undefined) => {
      const prefix = pfx ?? ''
      if (a2 !== undefined && b2 !== undefined) {
        if (a1 !== b1) return whole
        const from = Number(a2)
        const to = Number(b2)
        if (to < from || to - from > 40) return whole
        const ids: string[] = []
        for (let i = from; i <= to; i++) ids.push(`${prefix}${kind}${a1}.${i}`)
        return ids.join(', ')
      }
      if (a2 === undefined && b2 === undefined) {
        const from = Number(a1)
        const to = Number(b1)
        if (to < from || to - from > 40) return whole
        const width = a1.length
        const ids: string[] = []
        for (let i = from; i <= to; i++) ids.push(`${prefix}${kind}${String(i).padStart(width, '0')}`)
        return ids.join(', ')
      }
      return whole
    },
  )
}

function unique<T>(items: T[]): T[] {
  return items.filter((x, i) => items.indexOf(x) === i)
}

function matchAll(text: string, source: string): string[] {
  const re = new RegExp(source, 'g')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out.push(m[0])
  return out
}

/** Every OKR id in the text, in reading order, without duplicates (ranges expanded). */
export function extractOkrRefs(text: string | null | undefined): OkrRef[] {
  if (!text) return []
  const ids = unique(matchAll(expandRanges(text), OKR_REF_SOURCE).map((s) => s.toUpperCase()))
  const out: OkrRef[] = []
  for (const id of ids) {
    const kind = okrRefKind(id)
    if (kind) out.push({ id, kind })
  }
  return out
}

/** KPI ids ("EDN-K03", "CEO-K10"). */
export function extractKpiRefs(text: string | null | undefined): string[] {
  if (!text) return []
  return unique(matchAll(text, `\\b(?:${PREFIX_ALT}|CEO)-K\\d+\\b`).map((s) => s.toUpperCase()))
}

/** Decision ids ("D46", "D01–D16"). */
export function extractDecisionRefs(text: string | null | undefined): string[] {
  if (!text) return []
  return unique(matchAll(expandRanges(text), '\\bD\\d{2}\\b').map((s) => s.toUpperCase()))
}

/** Company dependency-map ids ("DEP14"). */
export function extractDependencyRefs(text: string | null | undefined): string[] {
  if (!text) return []
  return unique(matchAll(expandRanges(text), '\\bDEP\\d{2}\\b').map((s) => s.toUpperCase()))
}

/** Package-local refs: milestones, tasks, duties, development items, package links. */
export interface LocalRefs {
  milestones: string[]
  tasks: string[]
  duties: string[]
  development: string[]
  links: string[]
}

export function extractLocalRefs(text: string | null | undefined): LocalRefs {
  const t = text ?? ''
  return {
    milestones: unique(matchAll(t, '\\bM\\d+\\.\\d+\\.\\d+\\b')),
    tasks: unique(matchAll(t, '\\bT\\d{2}\\b')),
    duties: unique(matchAll(t, '\\bRD-[A-Z]\\d+\\b')),
    development: unique(matchAll(t, '\\bDV\\d+\\b')),
    links: unique(matchAll(t, '\\bX\\d{2}\\b')),
  }
}

/** Initiative (EDN-IN1.1, CIN6.4) and initiative-group (EDN-IG1, CIG5) ids — global across the v2 workbooks. */
const INITIATIVE_REF_SOURCE = `\\b(?:(?:${PREFIX_ALT})-I[NG]\\d+(?:\\.\\d+)?|CI[NG]\\d+(?:\\.\\d+)?)\\b`

export type InitiativeRefKind = 'INITIATIVE' | 'GROUP'

/** Kind of an initiative id, or null when the text is not one. */
export function initiativeRefKind(id: string): InitiativeRefKind | null {
  const t = id.trim().toUpperCase()
  if (!new RegExp(`^${INITIATIVE_REF_SOURCE}$`).test(t)) return null
  return /IG\d/.test(t) ? 'GROUP' : 'INITIATIVE'
}

/** Every initiative / group id in the text, in reading order, without duplicates. */
export function extractInitiativeRefs(text: string | null | undefined): Array<{ id: string; kind: InitiativeRefKind }> {
  if (!text) return []
  const out: Array<{ id: string; kind: InitiativeRefKind }> = []
  for (const id of unique(matchAll(text, INITIATIVE_REF_SOURCE).map((s) => s.toUpperCase()))) {
    const kind = initiativeRefKind(id)
    if (kind) out.push({ id, kind })
  }
  return out
}

/** Package code from its OKR ids: "EDN-KR1.1" → "EDN"; CEO ids ("C1.1") → "CEO". */
export function packageCodeFromId(id: string): string | null {
  const t = id.trim().toUpperCase()
  const m = t.match(new RegExp(`^(${PREFIX_ALT})-`))
  if (m) return m[1]
  if (/^C\d+/.test(t) || /^CI[NG]\d/.test(t)) return 'CEO'
  return null
}
