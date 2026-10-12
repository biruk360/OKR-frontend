/**
 * Connections UI — pure display helpers (no React, no icons).
 *
 * Turns the `GET /api/connections` payload (lib/connections/types.ts) into the
 * CON-1 chip set and the CON-2 panel groups, and owns the CON-8 rule that a
 * redacted item is labelled "Private item" and never shows a title.
 *
 * Unit-tested in `connection-display.test.ts`. Safe to import from client code.
 */
import {
  DECISION_STATUS_LABELS,
  DEPENDENCY_STATUS_LABELS,
  DEVELOPMENT_STATUS_LABELS,
  DUTY_STATUS_LABELS,
  KPI_STATUS_LABELS,
  OKR_LINK_SUB_KIND_LABELS,
  type OkrLinkSubKind,
} from '@/types/package'
import type {
  ConnectionDecision,
  ConnectionDependency,
  ConnectionItem,
  ConnectionItemType,
  ConnectionsPayload,
  ConnectionVia,
} from '@/lib/connections/types'

/** CON-8: the only label a redacted item ever gets. */
export const PRIVATE_ITEM_LABEL = 'Private item'

/** Semantic tones; map onto `--ap-ok/-warn/-danger/-accent` tokens in the components. */
export type ConnectionTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger'

export const CONNECTION_ITEM_TYPE_LABELS: Record<ConnectionItemType, string> = {
  OBJECTIVE: 'Objective',
  KEY_RESULT: 'Key result',
  TODO: 'Task',
  KPI: 'KPI',
  DUTY: 'Duty',
  DEVELOPMENT: 'Development item',
  MILESTONE: 'Milestone',
  DEPENDENCY: 'Dependency',
  DECISION: 'Decision',
}

/** Short type code used when an item has no workbook ref (breadcrumbs, compact rows). */
export const CONNECTION_ITEM_TYPE_SHORT: Record<ConnectionItemType, string> = {
  OBJECTIVE: 'O',
  KEY_RESULT: 'KR',
  TODO: 'Task',
  KPI: 'KPI',
  DUTY: 'Duty',
  DEVELOPMENT: 'Dev',
  MILESTONE: 'MS',
  DEPENDENCY: 'DEP',
  DECISION: 'D',
}

const VIA_LABELS: Record<ConnectionVia, string> = {
  PARENT: 'Parent',
  CHILD: 'Child',
  CONTRIBUTES_TO: 'Contributes',
  SUCCEEDS: 'Succeeds',
  ROLLED_FROM: 'Rolled forward',
  ATTACHED: 'Linked',
}

/** Readable relation, e.g. "Contributes", "Carried · Primary", "Parent". */
export function connectionViaLabel(item: Pick<ConnectionItem, 'via' | 'subKind' | 'isPrimary'>): string {
  if (item.via === 'SUCCEEDS') {
    const sub = item.subKind ? OKR_LINK_SUB_KIND_LABELS[item.subKind as OkrLinkSubKind] ?? item.subKind : 'Succeeds'
    return item.isPrimary ? `${sub} · Primary` : sub
  }
  return VIA_LABELS[item.via] ?? item.via
}

/** Full title for a row; "Private item" when redacted (CON-8). */
export function connectionItemTitle(item: ConnectionItem): string {
  return item.redacted ? PRIVATE_ITEM_LABEL : item.title
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…` : text
}

/** Short label for chips and breadcrumbs: the workbook ref, else a truncated title. */
export function connectionItemShortLabel(item: ConnectionItem, max = 32): string {
  if (item.redacted) return PRIVATE_ITEM_LABEL
  return item.ref?.trim() ? item.ref.trim() : truncate(item.title, max)
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

const STATUS_DISPLAY: Record<string, { label: string; tone: ConnectionTone }> = {
  // Objective goalStatus / KR confidence
  ON_TRACK: { label: 'On track', tone: 'ok' },
  AT_RISK: { label: 'At risk', tone: 'warn' },
  OFF_TRACK: { label: 'Off track', tone: 'danger' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
  // Shared / project
  COMPLETED: { label: 'Completed', tone: 'ok' },
  NOT_STARTED: { label: 'Not started', tone: 'neutral' },
  IN_PROGRESS: { label: 'In progress', tone: 'accent' },
  DELAYED: { label: 'Delayed', tone: 'danger' },
  // Todo
  PENDING: { label: 'Pending', tone: 'neutral' },
  IN_REVIEW: { label: 'In review', tone: 'accent' },
  STUCK: { label: 'Stuck', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
}

const STATUS_TONES: Record<string, ConnectionTone> = {
  ACTIVE: 'ok',
  PAUSED: 'warn',
  RETIRED: 'neutral',
  DONE: 'ok',
  DROPPED: 'neutral',
  BLOCKED: 'danger',
  OPEN: 'accent',
  DECIDED: 'ok',
  DEFERRED: 'warn',
  WITHDRAWN: 'neutral',
}

const PACKAGE_STATUS_LABELS: Record<string, string> = {
  ...KPI_STATUS_LABELS,
  ...DUTY_STATUS_LABELS,
  ...DEVELOPMENT_STATUS_LABELS,
  ...DEPENDENCY_STATUS_LABELS,
  ...DECISION_STATUS_LABELS,
}

/** "IN_PROGRESS" → "In progress" for values with no explicit label. */
export function humanizeEnum(value: string): string {
  const words = value.toLowerCase().split('_').filter(Boolean)
  if (words.length === 0) return value
  return [words[0][0].toUpperCase() + words[0].slice(1), ...words.slice(1)].join(' ')
}

export function connectionStatusDisplay(status: string | null | undefined): { label: string; tone: ConnectionTone } | null {
  if (!status) return null
  const known = STATUS_DISPLAY[status]
  if (known) return known
  return {
    label: PACKAGE_STATUS_LABELS[status] ?? humanizeEnum(status),
    tone: STATUS_TONES[status] ?? 'neutral',
  }
}

/** DEP-2 tone of a dependency row: late = danger, due soon = warn, done = ok. */
export function dependencyTone(dep: Pick<ConnectionDependency, 'late' | 'dueSoon' | 'open' | 'status'>): ConnectionTone {
  if (dep.late) return 'danger'
  if (dep.dueSoon) return 'warn'
  if (dep.status === 'BLOCKED') return 'danger'
  if (!dep.open) return 'ok'
  return 'neutral'
}

export function dependencyStatusLabel(dep: Pick<ConnectionDependency, 'late' | 'dueSoon' | 'status'>): string {
  if (dep.late) return 'Late'
  if (dep.dueSoon) return 'Due soon'
  return connectionStatusDisplay(dep.status)?.label ?? dep.status
}

/** Final grade 0–1 → "0.70"; null → "—". */
export function formatGrade(grade: number | null | undefined): string {
  return typeof grade === 'number' && Number.isFinite(grade) ? grade.toFixed(2) : '—'
}

export function formatPercent(value: number | null | undefined): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}%` : null
}

/** ISO date → "12 Oct 2026" (UTC, so a date-only value never shifts a day). */
export function formatShortDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

// ---------------------------------------------------------------------------
// CON-1 chips
// ---------------------------------------------------------------------------

export const CONNECTION_CHIP_KINDS = [
  'alignsTo',
  'supportedBy',
  'predecessors',
  'successors',
  'blockedBy',
  'waitingOn',
  'waitingOnThis',
  'decisions',
  'kpis',
  'duties',
  'development',
  'milestones',
] as const
export type ConnectionChipKind = (typeof CONNECTION_CHIP_KINDS)[number]

export interface ConnectionChipModel {
  kind: ConnectionChipKind
  /** Visible label in the full chip ("Aligns to KR1.3", "Blocked by DEP12"). */
  label: string
  /** Number shown in compact mode. */
  count: number
  /** Accessible / hover description (always the full sentence). */
  description: string
  tone: ConnectionTone
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

function namedOrCount(items: readonly ConnectionItem[], prefix: string, noun: string, many?: string): string {
  if (items.length === 1) return `${prefix} ${connectionItemShortLabel(items[0])}`
  return `${prefix} ${plural(items.length, noun, many)}`
}

/** Timeframe name shared by every visible item, or null. */
export function sharedTimeframeName(items: readonly ConnectionItem[]): string | null {
  let name: string | null = null
  for (const item of items) {
    if (item.redacted || !item.timeframe?.name) return null
    if (name === null) name = item.timeframe.name
    else if (name !== item.timeframe.name) return null
  }
  return name
}

function refsLabel(refs: readonly string[], max = 2): string {
  const shown = refs.slice(0, max).join(', ')
  return refs.length > max ? `${shown} +${refs.length - max}` : shown
}

function openDecisions(decisions: readonly ConnectionDecision[]): ConnectionDecision[] {
  return decisions.filter((d) => d.redacted || d.status === 'OPEN')
}

/**
 * The CON-1 chip set for one item, in display order. Empty groups produce no chip.
 * `hide` drops kinds a surface already shows elsewhere (e.g. the tree hides "Supported by").
 */
export function buildConnectionChips(
  payload: ConnectionsPayload,
  opts: { hide?: readonly ConnectionChipKind[] } = {},
): ConnectionChipModel[] {
  const hide = new Set(opts.hide ?? [])
  const s = payload.summary
  const chips: ConnectionChipModel[] = []
  const push = (chip: ConnectionChipModel) => {
    if (!hide.has(chip.kind) && chip.count > 0) chips.push(chip)
  }

  const { alignsTo, supportedBy, predecessors, successors } = payload
  push({
    kind: 'alignsTo',
    label: namedOrCount(alignsTo, 'Aligns to', 'item'),
    count: alignsTo.length,
    description: `Aligns to ${plural(alignsTo.length, 'item')}`,
    tone: 'accent',
  })
  push({
    kind: 'supportedBy',
    label: `Supported by ${supportedBy.length}`,
    count: supportedBy.length,
    description: `Supported by ${plural(supportedBy.length, 'item')}`,
    tone: 'neutral',
  })
  const fromTf = sharedTimeframeName(predecessors)
  push({
    kind: 'predecessors',
    label: fromTf ? `From ${fromTf}` : namedOrCount(predecessors, 'From', 'earlier item'),
    count: predecessors.length,
    description: `Continues ${plural(predecessors.length, 'earlier item')}${fromTf ? ` from ${fromTf}` : ''}`,
    tone: 'neutral',
  })
  push({
    kind: 'successors',
    label: namedOrCount(successors, 'Continued as', 'item'),
    count: successors.length,
    description: `Continued as ${plural(successors.length, 'later item')}`,
    tone: 'neutral',
  })

  const blocked = s.blockedBy
  push({
    kind: 'blockedBy',
    label: blocked > 0 ? `Blocked by ${refsLabel(s.blockedByRefs)}` : '',
    count: blocked,
    description: `Blocked by ${plural(blocked, 'late dependency', 'late dependencies')}`,
    tone: 'danger',
  })
  // Late inbound dependencies already have the "Blocked by" chip — count the rest here.
  const waiting = Math.max(0, s.waitingOn - (hide.has('blockedBy') ? 0 : blocked))
  push({
    kind: 'waitingOn',
    label: `Waiting on ${waiting}`,
    count: waiting,
    description: `Waiting on ${plural(waiting, 'open dependency', 'open dependencies')}`,
    tone: 'warn',
  })
  push({
    kind: 'waitingOnThis',
    label: `${s.waitingOnThis} waiting on this`,
    count: s.waitingOnThis,
    description: `${plural(s.waitingOnThis, 'dependency', 'dependencies')} waiting on this${
      s.outboundDueSoon > 0 ? ` (${s.outboundDueSoon} due soon or late)` : ''
    }`,
    tone: s.outboundDueSoon > 0 ? 'warn' : 'neutral',
  })

  const decisions = openDecisions(payload.decisions)
  const firstDecision = decisions[0]
  const overdue = decisions.some((d) => !d.redacted && d.overdue)
  push({
    kind: 'decisions',
    label:
      decisions.length === 1 && firstDecision && !firstDecision.redacted && firstDecision.ref
        ? `Decision ${firstDecision.ref}`
        : decisions.length === 1
          ? 'Decision'
          : `${decisions.length} decisions`,
    count: decisions.length,
    description: `${plural(decisions.length, 'open decision')} linked${overdue ? ', overdue' : ''}`,
    tone: overdue ? 'danger' : 'warn',
  })

  push({
    kind: 'kpis',
    label: payload.kpis.length === 1 ? 'KPI' : `${payload.kpis.length} KPIs`,
    count: payload.kpis.length,
    description: `${plural(payload.kpis.length, 'KPI')} linked`,
    tone: 'accent',
  })
  push({
    kind: 'duties',
    label: plural(payload.duties.length, 'duty', 'duties'),
    count: payload.duties.length,
    description: `${plural(payload.duties.length, 'recurring duty', 'recurring duties')} linked`,
    tone: 'neutral',
  })
  push({
    kind: 'development',
    label: plural(payload.development.length, 'dev item'),
    count: payload.development.length,
    description: `${plural(payload.development.length, 'development item')} linked`,
    tone: 'neutral',
  })
  push({
    kind: 'milestones',
    label: plural(payload.milestones.length, 'milestone'),
    count: payload.milestones.length,
    description: `${plural(payload.milestones.length, 'project milestone')} driving this`,
    tone: 'neutral',
  })
  return chips
}

// ---------------------------------------------------------------------------
// CON-2 panel groups
// ---------------------------------------------------------------------------

export type ConnectionGroupKey =
  | 'alignsTo'
  | 'supportedBy'
  | 'predecessors'
  | 'successors'
  | 'inbound'
  | 'outbound'
  | 'decisions'
  | 'kpis'
  | 'duties'
  | 'development'
  | 'milestones'

export type ConnectionGroup =
  | { key: ConnectionGroupKey; title: string; hint: string; kind: 'items'; items: ConnectionItem[] }
  | { key: 'inbound' | 'outbound'; title: string; hint: string; kind: 'dependencies'; items: ConnectionDependency[] }
  | { key: 'decisions'; title: string; hint: string; kind: 'decisions'; items: ConnectionDecision[] }

/** Which chip a panel group belongs to (chips open the matching group). */
export const CHIP_GROUP: Record<ConnectionChipKind, ConnectionGroupKey> = {
  alignsTo: 'alignsTo',
  supportedBy: 'supportedBy',
  predecessors: 'predecessors',
  successors: 'successors',
  blockedBy: 'inbound',
  waitingOn: 'inbound',
  waitingOnThis: 'outbound',
  decisions: 'decisions',
  kpis: 'kpis',
  duties: 'duties',
  development: 'development',
  milestones: 'milestones',
}

/** Non-empty CON-2 groups in display order. */
export function buildConnectionGroups(payload: ConnectionsPayload): ConnectionGroup[] {
  const groups: ConnectionGroup[] = [
    { key: 'alignsTo', kind: 'items', title: 'Aligns to', hint: 'Parent objective, own KR or objective, and the items this contributes to.', items: payload.alignsTo },
    { key: 'supportedBy', kind: 'items', title: 'Supported by', hint: 'Child objectives and items that contribute to this one.', items: payload.supportedBy },
    { key: 'predecessors', kind: 'items', title: 'Continues from', hint: 'Earlier items this one succeeds.', items: payload.predecessors },
    { key: 'successors', kind: 'items', title: 'Continued as', hint: 'Later items that succeed this one.', items: payload.successors },
    { key: 'inbound', kind: 'dependencies', title: 'Inbound — clear first', hint: 'Dependencies this item waits on.', items: payload.dependencies.inbound },
    { key: 'outbound', kind: 'dependencies', title: 'Outbound — others wait on this', hint: 'Dependencies others wait on.', items: payload.dependencies.outbound },
    { key: 'decisions', kind: 'decisions', title: 'Open decisions', hint: 'Decisions linked to this item.', items: payload.decisions },
    { key: 'kpis', kind: 'items', title: 'KPIs', hint: 'KPIs linked to this item.', items: payload.kpis },
    { key: 'duties', kind: 'items', title: 'Recurring duties', hint: 'Duties that feed this item.', items: payload.duties },
    { key: 'development', kind: 'items', title: 'Development', hint: 'Development items linked to this item.', items: payload.development },
    { key: 'milestones', kind: 'items', title: 'Project milestones', hint: 'Project milestones driving this key result.', items: payload.milestones },
  ]
  return groups.filter((g) => g.items.length > 0)
}

export function isConnectionsPayloadEmpty(payload: ConnectionsPayload): boolean {
  return buildConnectionGroups(payload).length === 0
}
