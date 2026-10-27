/**
 * Operating-package revert — write side. Runs inside ONE interactive transaction: any failure
 * (including the post-delete verification) rolls everything back, so a re-run starts from the same
 * state. Order:
 *   1. detach the person-made to-dos (keyResultId / objectiveId → null) + one ActivityLog row each
 *   2. null id columns without an FK that point at doomed rows (trip-plan links, KPI coverage, …)
 *   3. delete the polymorphic references (notifications, unsent digests, watchers, favorites,
 *      confidence snapshots, reopen logs, OKR links, dependency / decision links, item reviews,
 *      comment attachments)
 *   4. delete the roots in plan.DELETE_STEPS order; Postgres cascades the children
 *   5. verify every row of the simulated doomed set is gone
 *   6. one summary ActivityLog row (metadata.source = 'revert-operating-package-import')
 */
import type { Prisma } from '@prisma/client'
import { POLY_TABLE, REVERT_SOURCE, type Collected, type Db, type PolymorphicDeletes } from './collect'
import { DELETE_STEPS } from './plan'

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`

export interface ApplyResult {
  detachedTodos: number
  columnDetaches: Record<string, number>
  polymorphicDeleted: Record<string, number>
  rootDeleted: Record<string, number>
  verifiedTables: number
  summaryActivityId: string | null
}

async function exec(db: Db, sql: string, ...params: unknown[]): Promise<number> {
  return db.$executeRawUnsafe(sql, ...params)
}

export async function applyRevert(
  db: Db,
  c: Collected,
  opts: { actorId: string | null; snapshotPath: string; counts: Record<string, number> },
): Promise<ApplyResult> {
  const doomedKr = c.doomed.key_results ?? []
  const doomedObj = c.doomed.objectives ?? []
  const result: ApplyResult = { detachedTodos: 0, columnDetaches: {}, polymorphicDeleted: {}, rootDeleted: {}, verifiedTables: 0, summaryActivityId: null }

  // 1. Person-made to-dos: keep them, unlink from the doomed OKR items.
  if (c.preservedTodos.length) {
    const ids = c.preservedTodos.map((t) => t.id)
    await exec(db, `UPDATE initiatives SET "keyResultId" = NULL, "updatedAt" = now() WHERE id = ANY($1::text[]) AND "keyResultId" = ANY($2::text[])`, ids, doomedKr)
    await exec(db, `UPDATE initiatives SET "objectiveId" = NULL, "updatedAt" = now() WHERE id = ANY($1::text[]) AND "objectiveId" = ANY($2::text[])`, ids, doomedObj)
    result.detachedTodos = ids.length
    await db.activityLog.createMany({
      data: c.preservedTodos.map(
        (t): Prisma.ActivityLogCreateManyInput => ({
          entityType: 'TODO',
          action: 'UPDATED',
          actorId: opts.actorId,
          todoId: t.id,
          changes: {
            ...(t.keyResultId && doomedKr.includes(t.keyResultId) ? { keyResultId: { from: t.keyResultId, to: null } } : {}),
            ...(t.objectiveId && doomedObj.includes(t.objectiveId) ? { objectiveId: { from: t.objectiveId, to: null } } : {}),
          },
          metadata: { source: REVERT_SOURCE, reason: `detached: its key result / objective in ${c.timeframe.name} was removed by the operating-package revert`, timeframeId: c.timeframe.id },
        }),
      ),
    })
  }

  // 2. Id columns without an FK.
  for (const d of c.columnDetaches) {
    const n = await exec(db, `UPDATE ${q(d.table)} SET ${q(d.column)} = NULL WHERE id = ANY($1::text[])`, d.ids)
    result.columnDetaches[`${d.table}.${d.column}`] = n
  }

  // 3. Polymorphic references.
  for (const key of Object.keys(c.polymorphic) as Array<keyof PolymorphicDeletes>) {
    const ids = c.polymorphic[key]
    if (!ids.length) continue
    result.polymorphicDeleted[POLY_TABLE[key]] = (result.polymorphicDeleted[POLY_TABLE[key]] ?? 0) + (await exec(db, `DELETE FROM ${q(POLY_TABLE[key])} WHERE id = ANY($1::text[])`, ids))
  }

  // 4. Roots, children first.
  for (const table of DELETE_STEPS) {
    const ids = c.roots[table]
    if (!ids.length) continue
    result.rootDeleted[table] = await exec(db, `DELETE FROM ${q(table)} WHERE id = ANY($1::text[])`, ids)
  }

  // 5. Everything the simulation said would go is gone.
  const left: string[] = []
  for (const [table, ids] of Object.entries(c.doomed)) {
    if (!ids.length) continue
    const rows = await db.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM ${q(table)} WHERE id = ANY($1::text[])`, ids)
    if ((rows[0]?.n ?? 0) > 0) left.push(`${table}: ${rows[0].n}`)
    result.verifiedTables++
  }
  if (left.length) throw new Error(`Verification failed — rows still present after the delete (rolled back): ${left.join(', ')}`)

  // 6. Summary audit row.
  const total = Object.values(opts.counts).reduce((a, b) => a + b, 0)
  if (total > 0 || result.detachedTodos > 0) {
    const row = await db.activityLog.create({
      data: {
        entityType: 'OPERATING_PACKAGE',
        action: 'DELETED',
        actorId: opts.actorId,
        metadata: {
          source: REVERT_SOURCE,
          timeframeId: c.timeframe.id,
          timeframeName: c.timeframe.name,
          counts: opts.counts,
          rootDeleted: result.rootDeleted,
          detachedTodoIds: c.preservedTodos.map((t) => t.id),
          columnDetaches: result.columnDetaches,
          fkDetached: Object.fromEntries(Object.entries(c.fkDetached).map(([k, v]) => [k, v.length])),
          snapshot: opts.snapshotPath,
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    })
    result.summaryActivityId = row.id
  }
  return result
}
