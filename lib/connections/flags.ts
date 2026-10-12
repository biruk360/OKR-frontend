/**
 * Connections — pure helpers (no Prisma): DEP-2 timing flags, dependency direction,
 * ordering, de-duplication, hrefs and the CON-1 chip summary.
 *
 * Unit-tested in `flags.test.ts`. Safe to import from client code.
 */
import { addDays, startOfDay } from 'date-fns'
import { DEPENDENCY_CLOSED_STATUSES, profileTabHref } from '@/types/package'
import { decisionHref as packageDecisionHref, dependencyMapHref } from '@/lib/package/links'
import type {
  ConnectionDecision,
  ConnectionDependency,
  ConnectionItem,
  ConnectionItemType,
  ConnectionSummary,
  DependencyDirection,
  DependencyTiming,
} from './types'

/** DEP-2: "due soon" window in days (today counts as day 0). */
export const DUE_SOON_DAYS = 7

const CLOSED_DEPENDENCY = new Set<string>(DEPENDENCY_CLOSED_STATUSES)

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * DEP-2 flags for one dependency.
 *   late    — status ∉ {DONE, DROPPED} and neededByDate is before today (start of day);
 *   dueSoon — open, not late, and neededByDate falls before the start of day today + 7
 *             (i.e. due today … six days from now, inclusive);
 *   open    — status ∉ {DONE, DROPPED}.
 * A dependency with no needed-by date is never late or due soon.
 */
export function dependencyTiming(
  dep: { status: string; neededByDate: Date | string | null },
  now: Date = new Date(),
): DependencyTiming {
  const open = !CLOSED_DEPENDENCY.has(dep.status)
  const due = toDate(dep.neededByDate)
  if (!open || !due) return { late: false, dueSoon: false, open }
  const today = startOfDay(now)
  const late = due.getTime() < today.getTime()
  const dueSoon = !late && due.getTime() < addDays(today, DUE_SOON_DAYS).getTime()
  return { late, dueSoon, open }
}

/** An OPEN decision whose neededBy is before today. */
export function decisionOverdue(
  decision: { status: string; neededBy: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (decision.status !== 'OPEN') return false
  const due = toDate(decision.neededBy)
  return !!due && due.getTime() < startOfDay(now).getTime()
}

/**
 * Direction of a dependency as seen from an item owned by `ownerId`:
 * OUTBOUND when the owner provides it and does not also need it, else INBOUND.
 */
export function dependencyDirection(
  ownerId: string | null | undefined,
  parties: ReadonlyArray<{ userId: string; role: string }>,
): DependencyDirection {
  if (!ownerId) return 'INBOUND'
  const provides = parties.some((p) => p.userId === ownerId && p.role === 'PROVIDER')
  const needs = parties.some((p) => p.userId === ownerId && p.role === 'NEEDER')
  return provides && !needs ? 'OUTBOUND' : 'INBOUND'
}

/** Rank for PRF-16 ordering: late → due soon → open → done. */
function dependencyRank(dep: DependencyTiming): number {
  if (dep.late) return 0
  if (dep.dueSoon) return 1
  if (dep.open) return 2
  return 3
}

/** Sort late → due soon → open → done, then by needed-by date (undated last), then ref/title. */
export function sortDependencies<T extends DependencyTiming & { neededByDate: string | null; ref?: string | null; title: string }>(
  deps: readonly T[],
): T[] {
  return [...deps].sort((a, b) => {
    const r = dependencyRank(a) - dependencyRank(b)
    if (r !== 0) return r
    const ad = a.neededByDate ? Date.parse(a.neededByDate) : Number.POSITIVE_INFINITY
    const bd = b.neededByDate ? Date.parse(b.neededByDate) : Number.POSITIVE_INFINITY
    if (ad !== bd) return ad - bd
    return (a.ref ?? a.title).localeCompare(b.ref ?? b.title)
  })
}

/** Split into inbound / outbound, each sorted with `sortDependencies`. */
export function groupDependencies(deps: readonly ConnectionDependency[]): {
  inbound: ConnectionDependency[]
  outbound: ConnectionDependency[]
} {
  return {
    inbound: sortDependencies(deps.filter((d) => d.direction === 'INBOUND')),
    outbound: sortDependencies(deps.filter((d) => d.direction === 'OUTBOUND')),
  }
}

function itemKey(item: { type: ConnectionItemType; id: string }): string {
  return `${item.type}:${item.id}`
}

/**
 * Drop repeated items (same type + id) within a group, keeping the first one. When
 * a later duplicate carries an OkrLink (e.g. a parent objective that is also a
 * CONTRIBUTES_TO target), its link fields are copied onto the kept item so the UI
 * can still remove the link.
 */
export function dedupeConnectionItems(items: readonly ConnectionItem[]): ConnectionItem[] {
  const out: ConnectionItem[] = []
  const index = new Map<string, number>()
  for (const item of items) {
    const key = itemKey(item)
    const at = index.get(key)
    if (at === undefined) {
      index.set(key, out.length)
      out.push(item)
      continue
    }
    const kept = out[at]
    if (!kept.linkId && item.linkId) {
      out[at] = {
        ...kept,
        linkId: item.linkId,
        linkKind: item.linkKind,
        subKind: item.subKind,
        isPrimary: item.isPrimary,
      }
    }
  }
  return out
}

/** CON-1 chip counts from an assembled payload. */
export function buildConnectionSummary(parts: {
  alignsTo: readonly ConnectionItem[]
  supportedBy: readonly ConnectionItem[]
  predecessors: readonly ConnectionItem[]
  successors: readonly ConnectionItem[]
  dependencies: { inbound: readonly ConnectionDependency[]; outbound: readonly ConnectionDependency[] }
  decisions: readonly ConnectionDecision[]
  kpis: readonly ConnectionItem[]
  duties: readonly ConnectionItem[]
  development: readonly ConnectionItem[]
  milestones: readonly ConnectionItem[]
}): ConnectionSummary {
  const lateInbound = parts.dependencies.inbound.filter((d) => d.late)
  const openOutbound = parts.dependencies.outbound.filter((d) => d.open)
  return {
    alignsTo: parts.alignsTo.length,
    supportedBy: parts.supportedBy.length,
    predecessors: parts.predecessors.length,
    successors: parts.successors.length,
    blockedBy: lateInbound.length,
    blockedByRefs: lateInbound.map((d) => d.ref ?? d.title),
    waitingOn: parts.dependencies.inbound.filter((d) => d.open).length,
    waitingOnThis: openOutbound.length,
    outboundDueSoon: openOutbound.filter((d) => d.dueSoon || d.late).length,
    openDecisions: parts.decisions.length,
    kpis: parts.kpis.length,
    duties: parts.duties.length,
    development: parts.development.length,
    milestones: parts.milestones.length,
  }
}

// ---------------------------------------------------------------------------
// Hrefs
// ---------------------------------------------------------------------------

export function objectiveHref(id: string): string {
  return `/dashboard/objectives/${encodeURIComponent(id)}`
}
export function keyResultHref(id: string): string {
  return `/dashboard/key-results/${encodeURIComponent(id)}`
}
export function todoHref(id: string): string {
  return `/dashboard/todos?open=${encodeURIComponent(id)}`
}
export function kpiHref(ownerId: string): string {
  return profileTabHref(ownerId, 'kpis')
}
export function dutyHref(ownerId: string): string {
  return profileTabHref(ownerId, 'role')
}
export function developmentHref(ownerId: string): string {
  return profileTabHref(ownerId, 'development')
}
/** Canonical deep links live in lib/package/links (?dependency= / ?decision=). */
export function dependencyHref(id: string): string {
  return dependencyMapHref(id)
}
export function decisionHref(id: string): string {
  return packageDecisionHref(id)
}
export function projectHref(projectId: string): string {
  return `/dashboard/projects/${encodeURIComponent(projectId)}`
}

/** ISO string or null. */
export function isoOrNull(value: Date | string | null | undefined): string | null {
  const d = toDate(value)
  return d ? d.toISOString() : null
}
