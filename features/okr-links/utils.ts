/**
 * OKR links UI — pure helpers (no React, no fetch). Unit-tested in `utils.test.ts`.
 *
 *   - CON-5 alignment walk: which "up" item each step of the trail follows;
 *   - CON-6 lineage summary ("Continues 3 FY25/26 items");
 *   - LinkManagerModal: form schema, payload builder, option rules, link grouping,
 *     target mapping for /api/objectives/alignment-search and /api/keyresults.
 */
import { z } from 'zod'
import {
  OKR_LINK_ENTITY_TYPES,
  OKR_LINK_KINDS,
  OKR_LINK_SUB_KIND_LABELS,
  OKR_LINK_SUB_KINDS,
  isOkrLinkEntityType,
  type OkrLinkEntityType,
  type OkrLinkKind,
} from '@/types/package'
import { OKR_LINK_NOTE_MAX, validateOkrLinkShape } from '@/lib/okr-links/validation'
import type { ConnectionItem, ConnectionsPayload } from '@/lib/connections/types'
// Direct path (not the barrel) so this pure module stays loadable without React in node tests.
import { sharedTimeframeName } from '@/components/shared/connections/connection-display'
import type { CreateOkrLinkPayload, LinkTargetOption, OkrLinkSubject, OkrLinkViewDto } from './types'

// ---------------------------------------------------------------------------
// CON-5 alignment trail
// ---------------------------------------------------------------------------

export interface OkrRef {
  type: OkrLinkEntityType
  id: string
}

const refKey = (r: { type: string; id: string }) => `${r.type}:${r.id}`

function isOkrItem(item: ConnectionItem): item is ConnectionItem & { type: OkrLinkEntityType } {
  return isOkrLinkEntityType(item.type)
}

/**
 * The one item the trail climbs to from `payload.subject`
 * ("Company O1 › KR1.3 › EDN-O1 › EDN-KR1.1"):
 *   - a key result climbs to its own objective;
 *   - an objective prefers the KR it CONTRIBUTES_TO (the more specific anchor),
 *     then its parent objective, then any objective it contributes to;
 *   - anything else (task, KPI, duty …) climbs to its KR, then its objective.
 */
export function pickAlignmentParent(payload: ConnectionsPayload): (ConnectionItem & { type: OkrLinkEntityType }) | null {
  const okr = payload.alignsTo.filter(isOkrItem)
  if (okr.length === 0) return null
  const parentObjective = okr.find((i) => i.via === 'PARENT' && i.type === 'OBJECTIVE')
  const parentKr = okr.find((i) => i.via === 'PARENT' && i.type === 'KEY_RESULT')
  const contributesKr = okr.find((i) => i.type === 'KEY_RESULT' && (i.via === 'CONTRIBUTES_TO' || i.linkKind === 'CONTRIBUTES_TO'))
  const contributesAny = okr.find((i) => i.via === 'CONTRIBUTES_TO' || i.linkKind === 'CONTRIBUTES_TO')

  switch (payload.subject.type) {
    case 'KEY_RESULT':
      return parentObjective ?? contributesAny ?? okr[0]
    case 'OBJECTIVE':
      return contributesKr ?? parentObjective ?? contributesAny ?? okr[0]
    default:
      return parentKr ?? parentObjective ?? okr[0]
  }
}

/** Other OKR items the subject also aligns to (shown as "+n" next to the trail). */
export function otherAlignments(payload: ConnectionsPayload): ConnectionItem[] {
  const chosen = pickAlignmentParent(payload)
  return payload.alignsTo.filter((i) => isOkrItem(i) && (!chosen || refKey(i) !== refKey(chosen)))
}

export interface AlignmentWalk {
  /** Ancestors, nearest first. */
  ancestors: Array<ConnectionItem & { type: OkrLinkEntityType }>
  /** The next item whose connections must be loaded to climb further, if any. */
  next: OkrRef | null
  /** True once the walk reached the top, a cycle, an unreadable step or `maxDepth`. */
  complete: boolean
}

/**
 * Walks up from `subject`. `payloads[i]` is the connections payload of the i-th
 * step (0 = subject, i = ancestors[i-1]); `undefined` = still loading, `null` =
 * failed (the walk stops there).
 */
export function walkAlignment(
  subject: OkrRef,
  payloads: ReadonlyArray<ConnectionsPayload | null | undefined>,
  maxDepth = 6,
): AlignmentWalk {
  const visited = new Set([refKey(subject)])
  const ancestors: AlignmentWalk['ancestors'] = []
  for (const payload of payloads) {
    if (payload === undefined) return { ancestors, next: null, complete: false }
    if (payload === null) return { ancestors, next: null, complete: true }
    const parent = pickAlignmentParent(payload)
    if (!parent || visited.has(refKey(parent))) return { ancestors, next: null, complete: true }
    visited.add(refKey(parent))
    ancestors.push(parent)
    if (ancestors.length >= maxDepth) return { ancestors, next: null, complete: true }
  }
  // Every loaded step had a parent: climb from the last one (or start at the subject).
  const last = ancestors[ancestors.length - 1]
  return { ancestors, next: last ? { type: last.type, id: last.id } : subject, complete: false }
}

// ---------------------------------------------------------------------------
// CON-6 lineage
// ---------------------------------------------------------------------------

function itemsNoun(n: number, timeframe: string | null): string {
  const noun = n === 1 ? 'item' : 'items'
  return timeframe ? `${n} ${timeframe} ${noun}` : `${n} earlier ${noun}`
}

/** "Continues 3 FY25/26 items" / "Continues 2 earlier items"; null when empty. */
export function lineageSummary(predecessors: readonly ConnectionItem[]): string | null {
  if (predecessors.length === 0) return null
  return `Continues ${itemsNoun(predecessors.length, sharedTimeframeName(predecessors))}`
}

/** "Continued as 2 FY26/27 items" / "Continued as 1 later item"; null when empty. */
export function successorSummary(successors: readonly ConnectionItem[]): string | null {
  if (successors.length === 0) return null
  const tf = sharedTimeframeName(successors)
  const noun = successors.length === 1 ? 'item' : 'items'
  return `Continued as ${tf ? `${successors.length} ${tf} ${noun}` : `${successors.length} later ${noun}`}`
}

// ---------------------------------------------------------------------------
// Link list
// ---------------------------------------------------------------------------

/** "Contributes to" / "Supported by" / "Succeeds · Carried · Primary" / "Succeeded by". */
export function linkRelationLabel(link: Pick<OkrLinkViewDto, 'kind' | 'direction' | 'subKind' | 'isPrimary'>): string {
  const base =
    link.kind === 'CONTRIBUTES_TO'
      ? link.direction === 'OUTGOING' ? 'Contributes to' : 'Supported by'
      : link.direction === 'OUTGOING' ? 'Succeeds' : 'Succeeded by'
  const parts = [base]
  if (link.kind === 'SUCCEEDS' && link.subKind) parts.push(OKR_LINK_SUB_KIND_LABELS[link.subKind] ?? link.subKind)
  if (link.isPrimary) parts.push('Primary')
  return parts.join(' · ')
}

export interface OkrLinkGroups {
  contributesTo: OkrLinkViewDto[]
  supportedBy: OkrLinkViewDto[]
  succeeds: OkrLinkViewDto[]
  succeededBy: OkrLinkViewDto[]
}

export function groupOkrLinks(links: readonly OkrLinkViewDto[]): OkrLinkGroups {
  const groups: OkrLinkGroups = { contributesTo: [], supportedBy: [], succeeds: [], succeededBy: [] }
  for (const link of links) {
    if (link.kind === 'CONTRIBUTES_TO') (link.direction === 'OUTGOING' ? groups.contributesTo : groups.supportedBy).push(link)
    else (link.direction === 'OUTGOING' ? groups.succeeds : groups.succeededBy).push(link)
  }
  // Primary predecessor first, then by creation.
  groups.succeeds.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.createdAt.localeCompare(b.createdAt))
  return groups
}

// ---------------------------------------------------------------------------
// Link form (LinkManagerModal)
// ---------------------------------------------------------------------------

const targetSchema = z.object({
  type: z.enum(OKR_LINK_ENTITY_TYPES),
  id: z.string().min(1),
  title: z.string(),
})

export const linkFormSchema = z
  .object({
    kind: z.enum(OKR_LINK_KINDS),
    targetType: z.enum(OKR_LINK_ENTITY_TYPES),
    timeframeId: z.string().optional(),
    target: targetSchema.nullable(),
    subKind: z.enum(OKR_LINK_SUB_KINDS).nullable(),
    isPrimary: z.boolean(),
    setParent: z.boolean(),
    note: z.string().max(OKR_LINK_NOTE_MAX, `Note must be ${OKR_LINK_NOTE_MAX} characters or fewer.`),
  })
  .superRefine((v, ctx) => {
    if (!v.target) ctx.addIssue({ code: 'custom', path: ['target'], message: 'Pick the item to link to.' })
  })

export type LinkFormValues = z.infer<typeof linkFormSchema>

export const KIND_DESCRIPTIONS: Record<OkrLinkKind, string> = {
  CONTRIBUTES_TO:
    'This item contributes to a higher item in the same timeframe (e.g. an individual objective to a company KR). Progress roll-up does not change.',
  SUCCEEDS:
    'This item continues an earlier one, usually from a previous timeframe (carried, reframed, merged …).',
}

/** Default target type for a kind: KRs for "contributes to", the same type for "succeeds". */
export function defaultTargetType(kind: OkrLinkKind, subjectType: OkrLinkEntityType): OkrLinkEntityType {
  return kind === 'CONTRIBUTES_TO' ? 'KEY_RESULT' : subjectType
}

/** isPrimary applies to a SUCCEEDS between two items of the same type (LNK-2). */
export function canSetPrimary(kind: OkrLinkKind, subjectType: OkrLinkEntityType, targetType: OkrLinkEntityType): boolean {
  return kind === 'SUCCEEDS' && subjectType === targetType
}

/** LNK-4: an objective contributing to a KR may take that KR's objective as its parent. */
export function canSetParent(kind: OkrLinkKind, subjectType: OkrLinkEntityType, targetType: OkrLinkEntityType): boolean {
  return kind === 'CONTRIBUTES_TO' && subjectType === 'OBJECTIVE' && targetType === 'KEY_RESULT'
}

export function defaultLinkFormValues(subject: OkrLinkSubject, kind: OkrLinkKind = 'CONTRIBUTES_TO'): LinkFormValues {
  return {
    kind,
    targetType: defaultTargetType(kind, subject.type),
    timeframeId: subject.timeframeId ?? undefined,
    target: null,
    subKind: kind === 'SUCCEEDS' ? 'CARRIED' : null,
    isPrimary: false,
    setParent: false,
    note: '',
  }
}

/**
 * Builds the POST body; the subject is always the FROM end. Returns an error
 * message instead when the shape is invalid (same checks as the server).
 */
export function buildCreateLinkPayload(
  subject: OkrLinkSubject,
  values: LinkFormValues,
): { ok: true; payload: CreateOkrLinkPayload } | { ok: false; message: string } {
  if (!values.target) return { ok: false, message: 'Pick the item to link to.' }
  const note = values.note.trim()
  const payload: CreateOkrLinkPayload = {
    fromType: subject.type,
    fromId: subject.id,
    toType: values.target.type,
    toId: values.target.id,
    kind: values.kind,
    subKind: values.kind === 'SUCCEEDS' ? values.subKind ?? null : null,
    isPrimary: canSetPrimary(values.kind, subject.type, values.target.type) ? values.isPrimary : false,
    note: note || null,
  }
  if (canSetParent(values.kind, subject.type, values.target.type) && values.setParent) payload.setParent = true
  const violation = validateOkrLinkShape(payload)
  if (violation) return { ok: false, message: violation.message }
  return { ok: true, payload }
}

/**
 * Default timeframe to search for a SUCCEEDS target: the latest timeframe that
 * starts before the subject's (the "previous period"); else the subject's own.
 */
export function previousTimeframeId(
  timeframes: ReadonlyArray<{ id: string; startDate: string | Date }>,
  subjectTimeframeId: string | null | undefined,
): string | undefined {
  if (!subjectTimeframeId) return undefined
  const current = timeframes.find((t) => t.id === subjectTimeframeId)
  if (!current) return subjectTimeframeId
  const start = new Date(current.startDate).getTime()
  let best: { id: string; start: number } | null = null
  for (const t of timeframes) {
    const s = new Date(t.startDate).getTime()
    if (t.id === current.id || !(s < start)) continue
    if (!best || s > best.start) best = { id: t.id, start: s }
  }
  return best?.id ?? subjectTimeframeId
}

// ---------------------------------------------------------------------------
// Target search
// ---------------------------------------------------------------------------

/** Row of GET /api/objectives/alignment-search. */
export interface ObjectiveSearchRow {
  id: string
  title: string | null
  level?: string | null
  progress?: number | null
  owner?: { name?: string | null } | null
  timeframe?: { id: string; name: string } | null
}

/** Row of GET /api/keyresults. */
export interface KeyResultSearchRow {
  id: string
  title: string | null
  progress?: number | null
  owner?: { name?: string | null } | null
  objective?: {
    id: string
    title: string | null
    level?: string | null
    timeframeId?: string | null
    timeframe?: { id: string; name: string } | null
  } | null
}

export function objectiveRowToTarget(row: ObjectiveSearchRow): LinkTargetOption {
  return {
    type: 'OBJECTIVE',
    id: row.id,
    title: row.title ?? 'Untitled objective',
    level: row.level ?? null,
    timeframeId: row.timeframe?.id ?? null,
    timeframeName: row.timeframe?.name ?? null,
    progress: typeof row.progress === 'number' ? row.progress : null,
    ownerName: row.owner?.name ?? null,
    objectiveId: null,
    objectiveTitle: null,
  }
}

export function keyResultRowToTarget(row: KeyResultSearchRow): LinkTargetOption {
  return {
    type: 'KEY_RESULT',
    id: row.id,
    title: row.title ?? 'Untitled key result',
    level: row.objective?.level ?? null,
    timeframeId: row.objective?.timeframeId ?? row.objective?.timeframe?.id ?? null,
    timeframeName: row.objective?.timeframe?.name ?? null,
    progress: typeof row.progress === 'number' ? row.progress : null,
    ownerName: row.owner?.name ?? null,
    objectiveId: row.objective?.id ?? null,
    objectiveTitle: row.objective?.title ?? null,
  }
}

/**
 * Drops the subject itself, items already linked with the same kind from the
 * subject, and (when given) targets outside `timeframeId`.
 */
export function filterLinkTargets(
  options: readonly LinkTargetOption[],
  opts: {
    subject: OkrRef
    kind: OkrLinkKind
    existing: readonly OkrLinkViewDto[]
    timeframeId?: string | null
  },
): LinkTargetOption[] {
  const taken = new Set(
    opts.existing
      .filter((l) => l.kind === opts.kind)
      .map((l) => refKey(l.counterpart)),
  )
  taken.add(refKey(opts.subject))
  return options.filter(
    (o) => !taken.has(refKey(o)) && (!opts.timeframeId || !o.timeframeId || o.timeframeId === opts.timeframeId),
  )
}
