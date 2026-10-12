/**
 * Operating-package importer (IMP-1, IMP-4) — create-or-update bookkeeping shared by every phase.
 *
 *  - `diffFields` decides create / update / unchanged, so a re-run with the same workbooks writes
 *    nothing and logs nothing (counts stay stable).
 *  - In a dry run nothing is written: creates return a stable placeholder id ("dry:…") so later
 *    phases can keep planning against it.
 *  - Every create / update in an apply run queues one ActivityLog row (metadata.source = 'import').
 */
import type { Prisma, PrismaClient } from '@prisma/client'

export type SyncOp = 'create' | 'update' | 'unchanged' | 'skip'

export const IMPORT_SOURCE = 'import'

export class Counters {
  private readonly data = new Map<string, Record<SyncOp, number>>()

  bump(entity: string, op: SyncOp, by = 1): void {
    const row = this.data.get(entity) ?? { create: 0, update: 0, unchanged: 0, skip: 0 }
    row[op] += by
    this.data.set(entity, row)
  }

  get(entity: string): Record<SyncOp, number> {
    return this.data.get(entity) ?? { create: 0, update: 0, unchanged: 0, skip: 0 }
  }

  entries(): Array<[string, Record<SyncOp, number>]> {
    return Array.from(this.data.entries())
  }

  /** Created + updated + unchanged — the number of workbook rows that map to a record. */
  total(entity: string): number {
    const r = this.get(entity)
    return r.create + r.update + r.unchanged
  }
}

function normalise(value: unknown): unknown {
  if (value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  return value
}

/** JSON with object keys sorted — jsonb does not keep key order, so plain stringify would always differ. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value === undefined ? null : value)
}

function same(a: unknown, b: unknown): boolean {
  const x = normalise(a)
  const y = normalise(b)
  if (x === y) return true
  if (x == null || y == null) return false
  if (typeof x === 'number' && typeof y === 'number') return Math.abs(x - y) < 1e-9
  if (typeof x === 'object' || typeof y === 'object') return stableJson(x) === stableJson(y)
  return false
}

export type ChangeMap = Record<string, { from: unknown; to: unknown }>

/** `{ field: { from, to } }` for each listed field whose desired value differs; null when none. */
export function diffFields(existing: Record<string, unknown>, desired: Record<string, unknown>, fields: readonly string[]): ChangeMap | null {
  const changes: ChangeMap = {}
  for (const f of fields) {
    if (!(f in desired)) continue
    if (!same(existing[f], desired[f])) changes[f] = { from: normalise(existing[f]), to: normalise(desired[f]) }
  }
  return Object.keys(changes).length > 0 ? changes : null
}

/** Pick the listed keys of an object (only keys present in it). */
export function pick(data: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) if (f in data) out[f] = data[f]
  return out
}

export interface ActivityRow {
  entityType: string
  action: string
  actorId: string | null
  objectiveId?: string | null
  keyResultId?: string | null
  todoId?: string | null
  changes?: ChangeMap | null
  metadata: Record<string, unknown>
}

export class ActivityBuffer {
  private rows: ActivityRow[] = []
  written = 0

  push(row: ActivityRow): void {
    if (row.objectiveId?.startsWith('dry:') || row.keyResultId?.startsWith('dry:') || row.todoId?.startsWith('dry:')) return
    this.rows.push({ ...row, metadata: { ...row.metadata, source: IMPORT_SOURCE } })
  }

  get pending(): number {
    return this.rows.length
  }

  /** Write the queued rows (apply runs) in chunks; a dry run just drops them. */
  async flush(prisma: PrismaClient, apply: boolean): Promise<void> {
    const rows = this.rows
    this.rows = []
    if (!apply || rows.length === 0) return
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      await prisma.activityLog.createMany({
        data: chunk.map(
          (r): Prisma.ActivityLogCreateManyInput => ({
            entityType: r.entityType,
            action: r.action,
            actorId: r.actorId,
            objectiveId: r.objectiveId ?? null,
            keyResultId: r.keyResultId ?? null,
            todoId: r.todoId ?? null,
            changes: (r.changes ?? undefined) as Prisma.InputJsonValue | undefined,
            metadata: r.metadata as Prisma.InputJsonValue,
          }),
        ),
      })
      this.written += chunk.length
    }
  }
}

/** Placeholder id for a record a dry run would create. */
export function dryId(entity: string, key: string): string {
  return `dry:${entity}:${key}`
}

export function isDryId(id: string | null | undefined): boolean {
  return !!id && id.startsWith('dry:')
}
