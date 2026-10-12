/**
 * Hydration helper for activity logs.
 *
 * Raw `changes` rows look like `{ ownerId: { from: "cmnxa6w16…", to: "cmnxa01zg…" } }`.
 * We collect every reference id across all logs in a single pass, batch-fetch the
 * matching User / Objective / Department / Timeframe records, and rewrite each
 * value into a `Ref` envelope `{ id, label, kind, href }` the UI can render as a
 * clickable name. Plain values (strings, numbers, booleans, dates) are passed
 * through unchanged.
 *
 * Employee Operating Package rows (AUD-3): references to KPIs, duties,
 * development items, dependencies, decisions, packages, role definitions and
 * key results hydrate to the owner's profile tab (/dashboard/org/users/<id>?tab=…)
 * or the item's page, and every package row gains a top-level `deepLink`
 * (lib/package/links.ts → packageActivityHref) so the panel can open it.
 *
 * Designed to be N+1 free: one SELECT per reference kind that appears (at most
 * 12) regardless of how many log rows.
 */

import { prisma } from '@/lib/prisma'
import {
  decisionHref,
  dependencyMapHref,
  keyResultHref,
  packageActivityHref,
  profileTabHref,
} from '@/lib/package/links'

export type RefKind =
  | 'user'
  | 'objective'
  | 'department'
  | 'timeframe'
  // Employee Operating Package references (AUD-3).
  | 'keyResult'
  | 'kpi'
  | 'duty'
  | 'development'
  | 'dependency'
  | 'decision'
  | 'package'
  | 'roleDefinition'

const REF_KINDS: RefKind[] = [
  'user', 'objective', 'department', 'timeframe',
  'keyResult', 'kpi', 'duty', 'development', 'dependency', 'decision', 'package', 'roleDefinition',
]

export interface Ref {
  __ref: true
  kind: RefKind
  id: string
  label: string
  href: string
}

/** Fields whose value is a reference id we should hydrate. */
const FIELD_KIND: Record<string, RefKind> = {
  ownerId: 'user',
  assigneeId: 'user',
  creatorId: 'user',
  authorId: 'user',
  actorId: 'user',
  managerId: 'user',
  directReportId: 'user',
  parentObjectiveId: 'objective',
  objectiveId: 'objective',
  departmentId: 'department',
  timeframeId: 'timeframe',
  // Employee Operating Package fields.
  userId: 'user',
  reportsToId: 'user',
  deciderId: 'user',
  requestedById: 'user',
  approvedById: 'user',
  decidedById: 'user',
  reviewerId: 'user',
  enteredById: 'user',
  keyResultId: 'keyResult',
  kpiId: 'kpi',
  dutyId: 'duty',
  developmentItemId: 'development',
  dependencyId: 'dependency',
  decisionId: 'decision',
  packageId: 'package',
  roleDefinitionId: 'roleDefinition',
}

/** Label + link for one hydrated id. */
interface RefTarget {
  label: string
  href: string
}

function hrefFor(kind: 'user' | 'objective' | 'department' | 'timeframe', id: string): string {
  switch (kind) {
    case 'user': return `/dashboard/org/users/${id}`
    case 'objective': return `/dashboard/objectives/${id}`
    case 'department': return `/dashboard/org/teams/${id}`
    case 'timeframe': return `/dashboard/settings/timeframes`
  }
}

interface RawLog {
  id: string
  changes: unknown
  metadata: unknown
  [k: string]: unknown
}

type BucketIds = Record<RefKind, Set<string>>

function emptyBuckets(): BucketIds {
  return Object.fromEntries(REF_KINDS.map((k) => [k, new Set<string>()])) as BucketIds
}

function collectFromValue(value: unknown, kind: RefKind, buckets: BucketIds) {
  if (typeof value === 'string' && value.length > 0 && value.length < 64) {
    buckets[kind].add(value)
  }
}

function walkChanges(changes: unknown, buckets: BucketIds) {
  if (!changes || typeof changes !== 'object') return
  for (const [field, diff] of Object.entries(changes as Record<string, unknown>)) {
    const kind = FIELD_KIND[field]
    if (!kind) continue
    if (diff && typeof diff === 'object') {
      const { from, to } = diff as { from?: unknown; to?: unknown }
      collectFromValue(from, kind, buckets)
      collectFromValue(to, kind, buckets)
    }
  }
}

type Dicts = Record<RefKind, Map<string, RefTarget>>

function rewriteValue(value: unknown, kind: RefKind, dicts: Dicts): unknown {
  if (typeof value !== 'string') return value
  const target = dicts[kind].get(value)
  if (!target) return value
  const ref: Ref = { __ref: true, kind, id: value, label: target.label, href: target.href }
  return ref
}

function rewriteChanges(changes: unknown, dicts: Dicts): unknown {
  if (!changes || typeof changes !== 'object') return changes
  const out: Record<string, unknown> = {}
  for (const [field, diff] of Object.entries(changes as Record<string, unknown>)) {
    const kind = FIELD_KIND[field]
    if (!kind || !diff || typeof diff !== 'object') {
      out[field] = diff
      continue
    }
    const { from, to } = diff as { from?: unknown; to?: unknown }
    out[field] = { from: rewriteValue(from, kind, dicts), to: rewriteValue(to, kind, dicts) }
  }
  return out
}

type Row<T> = Promise<T[]>

function fetchIf<T>(ids: Set<string>, query: (ids: string[]) => Row<T>): Row<T> {
  return ids.size > 0 ? query(Array.from(ids)) : Promise.resolve([] as T[])
}

/**
 * Walk the logs, batch-fetch all referenced entities, and return logs with
 * `changes` rewritten so reference ids carry their human label + URL. Package
 * rows (AUD-1 entity types) also get a top-level `deepLink`.
 */
export async function hydrateActivityLogs<L extends RawLog>(logs: L[]): Promise<L[]> {
  if (logs.length === 0) return logs
  const buckets = emptyBuckets()
  for (const log of logs) walkChanges(log.changes, buckets)

  const [
    users, objectives, departments, timeframes,
    keyResults, kpis, duties, developmentItems, dependencies, decisions, packages, roleDefinitions,
  ] = await Promise.all([
    fetchIf(buckets.user, (ids) => prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })),
    fetchIf(buckets.objective, (ids) => prisma.objective.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } })),
    fetchIf(buckets.department, (ids) => prisma.department.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })),
    fetchIf(buckets.timeframe, (ids) => prisma.timeframe.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })),
    fetchIf(buckets.keyResult, (ids) => prisma.keyResult.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } })),
    fetchIf(buckets.kpi, (ids) => prisma.kpi.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, ownerId: true } })),
    fetchIf(buckets.duty, (ids) => prisma.recurringDuty.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, ownerId: true } })),
    fetchIf(buckets.development, (ids) => prisma.developmentItem.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, ownerId: true } })),
    fetchIf(buckets.dependency, (ids) => prisma.workDependency.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, externalRef: true } })),
    fetchIf(buckets.decision, (ids) => prisma.decision.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, externalRef: true } })),
    fetchIf(buckets.package, (ids) => prisma.operatingPackage.findMany({ where: { id: { in: ids } }, select: { id: true, version: true, userId: true } })),
    fetchIf(buckets.roleDefinition, (ids) => prisma.roleDefinition.findMany({ where: { id: { in: ids } }, select: { id: true, seatTitle: true, userId: true } })),
  ])

  const withRef = (ref: string | null, title: string) => (ref ? `${ref} · ${title}` : title)
  const dicts: Dicts = {
    user: new Map(users.map((u) => [u.id, { label: u.name, href: hrefFor('user', u.id) }])),
    objective: new Map(objectives.map((o) => [o.id, { label: o.title, href: hrefFor('objective', o.id) }])),
    department: new Map(departments.map((d) => [d.id, { label: d.name, href: hrefFor('department', d.id) }])),
    timeframe: new Map(timeframes.map((t) => [t.id, { label: t.name, href: hrefFor('timeframe', t.id) }])),
    keyResult: new Map(keyResults.map((k) => [k.id, { label: k.title, href: keyResultHref(k.id) }])),
    kpi: new Map(kpis.map((k) => [k.id, { label: k.name, href: profileTabHref(k.ownerId, 'kpis') }])),
    duty: new Map(duties.map((d) => [d.id, { label: d.title, href: profileTabHref(d.ownerId, 'role') }])),
    development: new Map(developmentItems.map((d) => [d.id, { label: d.title, href: profileTabHref(d.ownerId, 'development') }])),
    dependency: new Map(dependencies.map((d) => [d.id, { label: withRef(d.externalRef, d.title), href: dependencyMapHref(d.id) }])),
    decision: new Map(decisions.map((d) => [d.id, { label: withRef(d.externalRef, d.title), href: decisionHref(d.id) }])),
    package: new Map(packages.map((p) => [p.id, { label: `Operating package ${p.version}`, href: profileTabHref(p.userId) }])),
    roleDefinition: new Map(roleDefinitions.map((r) => [r.id, { label: r.seatTitle, href: profileTabHref(r.userId, 'role') }])),
  }

  return logs.map((log) => {
    const hydrated = { ...log, changes: rewriteChanges(log.changes, dicts) }
    const deepLink = packageActivityHref(
      typeof log.entityType === 'string' ? log.entityType : null,
      log.metadata,
      {
        objectiveId: typeof log.objectiveId === 'string' ? log.objectiveId : null,
        keyResultId: typeof log.keyResultId === 'string' ? log.keyResultId : null,
      },
    )
    return deepLink ? { ...hydrated, deepLink } : hydrated
  })
}
