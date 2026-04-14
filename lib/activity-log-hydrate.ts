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
 * Designed to be N+1 free: at most 4 SELECTs regardless of how many log rows.
 */

import { prisma } from '@/lib/prisma'

export type RefKind = 'user' | 'objective' | 'department' | 'timeframe'

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
}

function hrefFor(kind: RefKind, id: string): string {
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

interface BucketIds {
  user: Set<string>
  objective: Set<string>
  department: Set<string>
  timeframe: Set<string>
}

function emptyBuckets(): BucketIds {
  return { user: new Set(), objective: new Set(), department: new Set(), timeframe: new Set() }
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

function rewriteValue(value: unknown, kind: RefKind, dicts: Record<RefKind, Map<string, string>>): unknown {
  if (typeof value !== 'string') return value
  const label = dicts[kind].get(value)
  if (!label) return value
  const ref: Ref = { __ref: true, kind, id: value, label, href: hrefFor(kind, value) }
  return ref
}

function rewriteChanges(changes: unknown, dicts: Record<RefKind, Map<string, string>>): unknown {
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

/**
 * Walk the logs, batch-fetch all referenced entities, and return logs with
 * `changes` rewritten so reference ids carry their human label + URL.
 */
export async function hydrateActivityLogs<L extends RawLog>(logs: L[]): Promise<L[]> {
  if (logs.length === 0) return logs
  const buckets = emptyBuckets()
  for (const log of logs) walkChanges(log.changes, buckets)

  const [users, objectives, departments, timeframes] = await Promise.all([
    buckets.user.size > 0
      ? prisma.user.findMany({ where: { id: { in: Array.from(buckets.user) } }, select: { id: true, name: true } })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
    buckets.objective.size > 0
      ? prisma.objective.findMany({ where: { id: { in: Array.from(buckets.objective) } }, select: { id: true, title: true } })
      : Promise.resolve([] as Array<{ id: string; title: string }>),
    buckets.department.size > 0
      ? prisma.department.findMany({ where: { id: { in: Array.from(buckets.department) } }, select: { id: true, name: true } })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
    buckets.timeframe.size > 0
      ? prisma.timeframe.findMany({ where: { id: { in: Array.from(buckets.timeframe) } }, select: { id: true, name: true } })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
  ])

  const dicts = {
    user: new Map(users.map((u) => [u.id, u.name])),
    objective: new Map(objectives.map((o) => [o.id, o.title])),
    department: new Map(departments.map((d) => [d.id, d.name])),
    timeframe: new Map(timeframes.map((t) => [t.id, t.name])),
  } as Record<RefKind, Map<string, string>>

  return logs.map((log) => ({ ...log, changes: rewriteChanges(log.changes, dicts) }))
}
