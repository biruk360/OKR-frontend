/**
 * Operating-package revert — read side: what goes, what stays, and what people did with it.
 *
 * 1. Roots: everything the importer creates for the timeframe — objectives with an externalRef (and
 *    their KRs), operating packages, recurring duties, role definitions, KPIs, development items,
 *    work dependencies, decisions — plus the importer-made to-dos (see plan.classifyTodos).
 * 2. Cascade simulation: walks the live pg_constraint FKs breadth-first from the roots, so every row
 *    Postgres will remove (ON DELETE CASCADE, at any depth), detach (SET NULL) or refuse to delete
 *    (RESTRICT / NO ACTION) is known — and listed — before anything is written.
 * 3. Polymorphic references (no FK): notifications, unsent digest rows, watchers, favorites,
 *    confidence snapshots, reopen logs, OKR links, dependency / decision links, item reviews,
 *    comment attachments, and id columns without an FK (trip-plan links, KPI coverage, …).
 * 4. Snapshot: the user-generated activity on the doomed rows, so it can be re-entered.
 *
 * Read-only. Works with a PrismaClient or an interactive-transaction client.
 */
import type { Prisma } from '@prisma/client'
import {
  auditForeignKeys,
  checkDeleteOrder,
  classifyTodos,
  DELETE_STEPS,
  metadataRefs,
  type DoomReason,
  type FkAuditRow,
  type ForeignKey,
  type TodoCandidate,
} from './plan'

export type Db = Prisma.TransactionClient

export const REVERT_SOURCE = 'revert-operating-package-import'
export const IMPORT_SOURCE = 'import'
export const DEFAULT_TIMEFRAME_NAME = 'FY 2026/27'

/** Root tables, in the order the apply step deletes them (plan.DELETE_STEPS). */
export type RootTable = (typeof DELETE_STEPS)[number]

export interface TimeframeRow {
  id: string
  name: string
  isActive: boolean
  startDate: Date
  endDate: Date
}

export interface PolymorphicDeletes {
  notifications: string[]
  emailDigestQueue: string[]
  watchers: string[]
  favorites: string[]
  confidenceSnapshots: string[]
  okrReopenLogs: string[]
  okrLinks: string[]
  workDependencyLinks: string[]
  decisionLinks: string[]
  packageItemReviews: string[]
  commentAttachments: string[]
}

/** Id columns without an FK that point at a doomed row: set to null. */
export interface ColumnDetach {
  table: string
  column: string
  ids: string[]
}

export interface Collected {
  timeframe: TimeframeRow
  roots: Record<RootTable, string[]>
  todoReasons: Record<string, DoomReason>
  preservedTodos: Array<{ id: string; title: string; status: string; keyResultId: string | null; objectiveId: string | null; assignee: string | null; creator: string | null; createdAt: Date }>
  /** Objectives in the timeframe without an externalRef (made in the UI) — kept unless --include-manual-objectives. */
  manualObjectives: Array<{ id: string; title: string; level: string; owner: string | null; createdAt: Date; included: boolean }>
  /** Every row that disappears, by table (roots + cascades). */
  doomed: Record<string, string[]>
  /** FK SET NULL detaches done by Postgres: "table.column" → row ids. */
  fkDetached: Record<string, string[]>
  fkAudit: FkAuditRow[]
  polymorphic: PolymorphicDeletes
  columnDetaches: ColumnDetach[]
  /** ActivityLog rows without an FK that mention a doomed id in metadata (kept as audit trail). */
  metadataOnlyActivityLogs: number
  sentDigestRowsKept: number
  blockers: string[]
  warnings: string[]
}

// ─── Small SQL helpers ──────────────────────────────────────────────────────

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`

async function idsWhere(db: Db, table: string, column: string, values: readonly string[]): Promise<string[]> {
  if (values.length === 0) return []
  const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM ${q(table)} WHERE ${q(column)} = ANY($1::text[])`, values)
  return rows.map((r) => r.id)
}

async function countWhere(db: Db, table: string, column: string, values: readonly string[]): Promise<number> {
  if (values.length === 0) return 0
  const rows = await db.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM ${q(table)} WHERE ${q(column)} = ANY($1::text[])`, values)
  return rows[0]?.n ?? 0
}

export async function loadForeignKeys(db: Db): Promise<ForeignKey[]> {
  return db.$queryRawUnsafe<ForeignKey[]>(`
    SELECT src.relname AS "table", a.attname AS "column", dst.relname AS "refTable", c.confdeltype::text AS confdeltype
      FROM pg_constraint c
      JOIN pg_class src ON src.oid = c.conrelid
      JOIN pg_class dst ON dst.oid = c.confrelid
      JOIN pg_namespace n ON n.oid = src.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND n.nspname = current_schema() AND array_length(c.conkey, 1) = 1
     ORDER BY 1, 2`)
}

async function tablesWithId(db: Db): Promise<Set<string>> {
  const rows = await db.$queryRawUnsafe<Array<{ t: string }>>(
    `SELECT table_name AS t FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'id'`,
  )
  return new Set(rows.map((r) => r.t))
}

function uniq(values: Iterable<string | null | undefined>): string[] {
  const out = new Set<string>()
  for (const v of Array.from(values)) if (v) out.add(v)
  return Array.from(out)
}

// ─── Timeframe ──────────────────────────────────────────────────────────────

export async function findTimeframe(db: Db, opts: { timeframeId: string | null; timeframeName: string }): Promise<TimeframeRow> {
  const tf = opts.timeframeId
    ? await db.timeframe.findUnique({ where: { id: opts.timeframeId } })
    : await db.timeframe.findUnique({ where: { name: opts.timeframeName } })
  if (!tf) throw new Error(opts.timeframeId ? `No timeframe with id ${opts.timeframeId}` : `No timeframe named "${opts.timeframeName}"`)
  if (opts.timeframeId && tf.name !== opts.timeframeName) {
    // An explicit id wins; the name is only reported.
  }
  return { id: tf.id, name: tf.name, isActive: tf.isActive, startDate: tf.startDate, endDate: tf.endDate }
}

// ─── Roots ──────────────────────────────────────────────────────────────────

async function collectRoots(db: Db, tf: TimeframeRow, includeManualObjectives: boolean) {
  const objectives = await db.objective.findMany({
    where: { timeframeId: tf.id },
    select: { id: true, title: true, level: true, externalRef: true, createdAt: true, owner: { select: { name: true } } },
  })
  const manualObjectives = objectives
    .filter((o) => !o.externalRef)
    .map((o) => ({ id: o.id, title: o.title, level: o.level, owner: o.owner?.name ?? null, createdAt: o.createdAt, included: includeManualObjectives }))
  const objectiveIds = objectives.filter((o) => o.externalRef || includeManualObjectives).map((o) => o.id)
  const keyResultIds = (await db.keyResult.findMany({ where: { objectiveId: { in: objectiveIds } }, select: { id: true } })).map((k) => k.id)

  const packages = await db.operatingPackage.findMany({ where: { timeframeId: tf.id }, select: { id: true, userId: true, createdAt: true } })
  const packageIds = packages.map((p) => p.id)
  const duties = await db.recurringDuty.findMany({ where: { timeframeId: tf.id }, select: { id: true, todoHeadId: true } })
  const roleDefinitionIds = (
    await db.roleDefinition.findMany({ where: { OR: [{ timeframeId: tf.id }, { packageId: { in: packageIds } }] }, select: { id: true } })
  ).map((r) => r.id)
  const kpiIds = (await db.kpi.findMany({ where: { timeframeId: tf.id }, select: { id: true } })).map((k) => k.id)
  const developmentItemIds = (await db.developmentItem.findMany({ where: { timeframeId: tf.id }, select: { id: true } })).map((d) => d.id)
  const workDependencyIds = (await db.workDependency.findMany({ where: { timeframeId: tf.id }, select: { id: true } })).map((d) => d.id)
  const decisionIds = (await db.decision.findMany({ where: { timeframeId: tf.id }, select: { id: true } })).map((d) => d.id)

  return {
    manualObjectives,
    objectiveIds,
    keyResultIds,
    packages,
    packageIds,
    dutyIds: duties.map((d) => d.id),
    dutyHeadIds: uniq(duties.map((d) => d.todoHeadId)),
    roleDefinitionIds,
    kpiIds,
    developmentItemIds,
    workDependencyIds,
    decisionIds,
  }
}

/**
 * To-dos: the candidates are everything linked to a doomed KR / objective / duty, the duty heads, the
 * to-dos the importer logged for a doomed package, KR-less importer tasks (externalRef set, owned by
 * a package owner, created after the first package), and — transitively — their recurrence
 * occurrences.
 */
async function collectTodos(db: Db, r: Awaited<ReturnType<typeof collectRoots>>) {
  const importerTodoIds = r.packageIds.length
    ? (
        await db.$queryRawUnsafe<Array<{ todoId: string }>>(
          `SELECT DISTINCT "todoId" FROM activity_logs
            WHERE "todoId" IS NOT NULL AND metadata->>'source' = $1 AND metadata->>'packageId' = ANY($2::text[])`,
          IMPORT_SOURCE,
          r.packageIds,
        )
      ).map((x) => x.todoId)
    : []
  const firstPackageAt = r.packages.length ? new Date(Math.min(...r.packages.map((p) => p.createdAt.getTime())) - 60 * 60 * 1000) : null
  const owners = uniq(r.packages.map((p) => p.userId))

  const select = { id: true, externalRef: true, dutyId: true, recurrenceParentId: true, keyResultId: true, objectiveId: true } as const
  const or: Prisma.TodoWhereInput[] = [
    { keyResultId: { in: r.keyResultIds } },
    { objectiveId: { in: r.objectiveIds } },
    { dutyId: { in: r.dutyIds } },
    { id: { in: [...r.dutyHeadIds, ...importerTodoIds] } },
  ]
  if (firstPackageAt && owners.length) {
    or.push({ externalRef: { not: null }, keyResultId: null, kind: { in: ['TASK', 'MILESTONE'] }, assigneeId: { in: owners }, createdAt: { gte: firstPackageAt } })
  }
  const byId = new Map<string, TodoCandidate>()
  for (const t of await db.todo.findMany({ where: { OR: or }, select })) byId.set(t.id, t)
  // Recurrence occurrences of any candidate (fixed point).
  let frontier = Array.from(byId.keys())
  while (frontier.length) {
    const occ = await db.todo.findMany({ where: { recurrenceParentId: { in: frontier }, id: { notIn: Array.from(byId.keys()) } }, select })
    frontier = []
    for (const t of occ) {
      if (byId.has(t.id)) continue
      byId.set(t.id, t)
      frontier.push(t.id)
    }
  }
  const cls = classifyTodos({
    candidates: Array.from(byId.values()),
    doomedKeyResultIds: new Set(r.keyResultIds),
    doomedObjectiveIds: new Set(r.objectiveIds),
    doomedDutyIds: new Set(r.dutyIds),
    importerTodoIds: new Set(importerTodoIds),
    dutyHeadIds: new Set(r.dutyHeadIds),
  })
  return { cls, importerTodoIds }
}

// ─── Cascade simulation ─────────────────────────────────────────────────────

async function simulate(
  db: Db,
  roots: Record<RootTable, string[]>,
  fks: ForeignKey[],
  preDetached: Map<string, { ids: Set<string>; by: string }>,
) {
  const idTables = await tablesWithId(db)
  const doomed = new Map<string, Set<string>>()
  for (const t of DELETE_STEPS) doomed.set(t, new Set(roots[t]))
  const detached = new Map<string, Set<string>>()
  const blocked = new Map<string, Set<string>>()
  const counts = new Map<string, number>()
  const countOnly = new Map<string, number>()
  const preHits = new Map<string, number>()
  let frontier = new Map<string, string[]>(DELETE_STEPS.map((t) => [t, roots[t]] as [string, string[]]).filter(([, ids]) => ids.length > 0))

  while (frontier.size > 0) {
    const next = new Map<string, Set<string>>()
    for (const [refTable, ids] of Array.from(frontier.entries())) {
      for (const fk of fks.filter((f) => f.refTable === refTable)) {
        const key = `${fk.table}.${fk.column}`
        if (!idTables.has(fk.table)) {
          const n = await countWhere(db, fk.table, fk.column, ids)
          countOnly.set(key, (countOnly.get(key) ?? 0) + n)
          counts.set(key, (counts.get(key) ?? 0) + n)
          continue
        }
        const found = await idsWhere(db, fk.table, fk.column, ids)
        const already = doomed.get(fk.table) ?? new Set<string>()
        const pre = preDetached.get(key)?.ids
        const preHit = pre ? found.filter((id) => pre.has(id) && !already.has(id)).length : 0
        if (preHit) preHits.set(key, (preHits.get(key) ?? 0) + preHit)
        const fresh = found.filter((id) => !already.has(id) && !(pre && pre.has(id)))
        counts.set(key, (counts.get(key) ?? 0) + fresh.length)
        if (fresh.length === 0) continue
        const kind = fk.confdeltype
        const bucket = kind === 'c' ? null : kind === 'n' || kind === 'd' ? detached : blocked
        if (bucket) {
          const set = bucket.get(key) ?? new Set<string>()
          for (const id of fresh) set.add(id)
          bucket.set(key, set)
          continue
        }
        const set = doomed.get(fk.table) ?? new Set<string>()
        const add = next.get(fk.table) ?? new Set<string>()
        for (const id of fresh) {
          if (!set.has(id)) {
            set.add(id)
            add.add(id)
          }
        }
        doomed.set(fk.table, set)
        if (add.size) next.set(fk.table, add)
      }
    }
    frontier = new Map(Array.from(next.entries()).map(([t, s]) => [t, Array.from(s)] as [string, string[]]))
  }

  // A row that is detached / blocked through one FK but deleted through another just goes.
  const strip = (m: Map<string, Set<string>>) => {
    const out: Record<string, string[]> = {}
    for (const [key, set] of Array.from(m.entries())) {
      const table = key.split('.')[0]
      const gone = doomed.get(table) ?? new Set<string>()
      const left = Array.from(set).filter((id) => !gone.has(id))
      if (left.length) out[key] = left
    }
    return out
  }
  const fkDetached = strip(detached)
  const fkBlocked = strip(blocked)
  const handled = new Map<string, string>()
  for (const [key, v] of Array.from(preDetached.entries())) handled.set(key, v.by)
  // Rows per FK: cascaded (deleted), detached, blocked, or pre-handled by an explicit detach.
  const fkRows = fks
    .map((f) => {
      const key = `${f.table}.${f.column}`
      const own = f.confdeltype === 'c' ? counts.get(key) ?? 0 : fkDetached[key]?.length ?? fkBlocked[key]?.length ?? countOnly.get(key) ?? 0
      return { ...f, rows: own + (preHits.get(key) ?? 0) }
    })
    .filter((f) => f.rows > 0)
  // Blocking rows that an explicit step handles are not blockers; others are.
  const audit = auditForeignKeys(fkRows, new Map(Array.from(handled.entries()).filter(([k]) => (preHits.get(k) ?? 0) > 0)))
  const doomedOut: Record<string, string[]> = {}
  for (const [t, s] of Array.from(doomed.entries())) if (s.size) doomedOut[t] = Array.from(s)
  return { doomed: doomedOut, fkDetached, fkBlocked, audit }
}

// ─── Polymorphic references ─────────────────────────────────────────────────

async function collectPolymorphic(db: Db, doomed: Record<string, string[]>, since: Date | null) {
  const all = new Set<string>()
  for (const ids of Object.values(doomed)) for (const id of ids) all.add(id)
  const allIds = Array.from(all)
  const okrIds = [...(doomed.objectives ?? []), ...(doomed.key_results ?? [])]
  const commentIds = [...(doomed.comments ?? []), ...(doomed.todo_comments ?? [])]

  let notifications: string[] = []
  let emailDigestQueue: string[] = []
  let sentDigestRowsKept = 0
  if (since && all.size) {
    const notes = await db.notification.findMany({ where: { createdAt: { gte: since }, metadata: { not: null } }, select: { id: true, metadata: true } })
    notifications = notes.filter((n) => metadataRefs(n.metadata, all).length > 0).map((n) => n.id)
    const digest = await db.emailDigestQueue.findMany({ where: { queuedAt: { gte: since }, metadata: { not: null } }, select: { id: true, metadata: true, sentAt: true } })
    const hits = digest.filter((d) => metadataRefs(d.metadata, all).length > 0)
    emailDigestQueue = hits.filter((d) => !d.sentAt).map((d) => d.id)
    sentDigestRowsKept = hits.length - emailDigestQueue.length
  }

  // Every polymorphic table / column is checked against the live schema first (a missing one is a warning).
  const cols = new Set(
    (
      await db.$queryRawUnsafe<Array<{ c: string }>>(
        `SELECT table_name || '.' || column_name AS c FROM information_schema.columns WHERE table_schema = current_schema()`,
      )
    ).map((r) => r.c),
  )
  const missing: string[] = []
  const idsWhereSafe = async (table: string, column: string, values: readonly string[]) => {
    if (!cols.has(`${table}.${column}`)) {
      missing.push(`${table}.${column}`)
      return []
    }
    return idsWhere(db, table, column, values)
  }
  const byEntity = async (table: string, column = 'entityId') => idsWhereSafe(table, column, allIds)
  const okrLinks = uniq([...(await idsWhereSafe('okr_links', 'fromId', okrIds)), ...(await idsWhereSafe('okr_links', 'toId', okrIds))])
  const doomedDeps = new Set(doomed.work_dependency_links ?? [])
  const doomedDecLinks = new Set(doomed.decision_links ?? [])
  const doomedReviews = new Set(doomed.package_item_reviews ?? [])
  const polymorphic: PolymorphicDeletes = {
    notifications,
    emailDigestQueue,
    watchers: await byEntity('watchers'),
    favorites: await byEntity('favorites'),
    confidenceSnapshots: await byEntity('confidence_snapshots'),
    okrReopenLogs: await byEntity('okr_reopen_logs'),
    okrLinks,
    // Links / reviews owned by a doomed dependency / decision / package already cascade.
    workDependencyLinks: (await byEntity('work_dependency_links')).filter((id) => !doomedDeps.has(id)),
    decisionLinks: (await byEntity('decision_links')).filter((id) => !doomedDecLinks.has(id)),
    packageItemReviews: (await byEntity('package_item_reviews')).filter((id) => !doomedReviews.has(id)),
    commentAttachments: uniq([...(await idsWhereSafe('comment_attachments', 'commentId', commentIds)), ...(await byEntity('comment_attachments'))]),
  }

  // Id columns with no FK.
  const todoIds = doomed.initiatives ?? []
  const columnDetaches: ColumnDetach[] = []
  const add = async (table: string, column: string, values: string[], exclude: string[] = []) => {
    const ex = new Set(exclude)
    const ids = (await idsWhereSafe(table, column, values)).filter((id) => !ex.has(id))
    if (ids.length) columnDetaches.push({ table, column, ids })
  }
  await add('dtp_plans', 'linkedObjectiveId', doomed.objectives ?? [])
  await add('dtp_plans', 'linkedKeyResultId', doomed.key_results ?? [])
  await add('dtp_plans', 'linkedInitiativeId', todoIds)
  await add('kpis', 'coverageOfKpiId', doomed.kpis ?? [], doomed.kpis ?? [])
  await add('work_dependencies', 'deliveryTodoId', todoIds, doomed.work_dependencies ?? [])
  await add('recurring_duties', 'todoHeadId', todoIds, doomed.recurring_duties ?? [])
  await add('initiatives', 'carryoverReplacedById', todoIds, todoIds)
  await add('initiatives', 'recurrenceParentId', todoIds, todoIds)

  const metaOnly = allIds.length
    ? (
        await db.$queryRawUnsafe<Array<{ n: number }>>(
          `SELECT count(*)::int AS n FROM activity_logs
            WHERE "objectiveId" IS NULL AND "keyResultId" IS NULL AND "todoId" IS NULL
              AND (metadata->>'entityId' = ANY($1::text[]) OR metadata->>'packageId' = ANY($1::text[]))`,
          allIds,
        )
      )[0]?.n ?? 0
    : 0
  return { polymorphic, columnDetaches, sentDigestRowsKept, metadataOnlyActivityLogs: metaOnly, missingColumns: missing }
}

// ─── Entry ──────────────────────────────────────────────────────────────────

export async function collect(db: Db, opts: { timeframeId: string | null; timeframeName: string; includeManualObjectives: boolean }): Promise<Collected> {
  const timeframe = await findTimeframe(db, opts)
  const blockers: string[] = []
  const warnings: string[] = []
  const r = await collectRoots(db, timeframe, opts.includeManualObjectives)
  const { cls } = await collectTodos(db, r)

  const roots: Record<RootTable, string[]> = {
    initiatives: Array.from(cls.doomed.keys()),
    recurring_duties: r.dutyIds,
    kpis: r.kpiIds,
    development_items: r.developmentItemIds,
    role_definitions: r.roleDefinitionIds,
    work_dependencies: r.workDependencyIds,
    decisions: r.decisionIds,
    operating_packages: r.packageIds,
    key_results: r.keyResultIds,
    objectives: r.objectiveIds,
  }

  const fks = await loadForeignKeys(db)
  const orderProblems = checkDeleteOrder(DELETE_STEPS, fks)
  blockers.push(...orderProblems)

  const preservedIds = new Set(cls.preserved.map((t) => t.id))
  const preDetached = new Map<string, { ids: Set<string>; by: string }>([
    ['initiatives.keyResultId', { ids: preservedIds, by: 'detach person-made to-dos (keyResultId → null)' }],
    ['initiatives.objectiveId', { ids: preservedIds, by: 'detach person-made to-dos (objectiveId → null)' }],
  ])
  const sim = await simulate(db, roots, fks, preDetached)
  blockers.push(...sim.audit.blockers)

  // Never modify another timeframe: no OKR item outside the doomed set may point at a doomed one.
  const okrDetachKeys = Object.keys(sim.fkDetached).filter((k) => k.startsWith('objectives.') || k.startsWith('key_results.'))
  for (const key of okrDetachKeys) {
    const ids = sim.fkDetached[key]
    const rows =
      key.startsWith('objectives.')
        ? await db.objective.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, timeframeId: true } })
        : await db.keyResult.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, objective: { select: { timeframeId: true } } } })
    for (const row of rows) {
      const tfId = 'timeframeId' in row ? row.timeframeId : row.objective.timeframeId
      const msg = `${key}: ${row.id} "${row.title.slice(0, 60)}" (timeframe ${tfId}) points at a doomed item and would be detached`
      if (tfId !== timeframe.id) blockers.push(`Another timeframe would change — ${msg}`)
      else warnings.push(msg)
    }
  }
  const allOkr = [...(sim.doomed.objectives ?? []), ...(sim.doomed.key_results ?? [])]
  if (allOkr.length) {
    const lineage = await db.$queryRawUnsafe<Array<{ id: string; kind: string }>>(
      `SELECT o.id, 'objective' AS kind FROM objectives o WHERE o."lineageRootId" = ANY($1::text[]) AND NOT (o.id = ANY($1::text[]))
       UNION ALL
       SELECT k.id, 'key_result' AS kind FROM key_results k WHERE k."lineageRootId" = ANY($1::text[]) AND NOT (k.id = ANY($1::text[]))`,
      allOkr,
    )
    for (const l of lineage) blockers.push(`${l.kind} ${l.id} outside the doomed set has lineageRootId pointing at a doomed item`)
  }

  const createdAts = await db.$queryRawUnsafe<Array<{ m: Date | null }>>(
    `SELECT min(m) AS m FROM (
       SELECT min("createdAt") AS m FROM objectives WHERE id = ANY($1::text[])
       UNION ALL SELECT min("createdAt") FROM operating_packages WHERE id = ANY($2::text[])
       UNION ALL SELECT min("createdAt") FROM initiatives WHERE id = ANY($3::text[])) x`,
    roots.objectives,
    roots.operating_packages,
    roots.initiatives,
  )
  const since = createdAts[0]?.m ? new Date(createdAts[0].m.getTime() - 24 * 60 * 60 * 1000) : null
  const poly = await collectPolymorphic(db, sim.doomed, since)
  for (const m of poly.missingColumns) warnings.push(`Column ${m} not found in the database — skipped`)

  const preservedRows = preservedIds.size
    ? await db.todo.findMany({
        where: { id: { in: Array.from(preservedIds) } },
        select: {
          id: true,
          title: true,
          status: true,
          keyResultId: true,
          objectiveId: true,
          createdAt: true,
          assignee: { select: { name: true } },
          creator: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      })
    : []

  const unmanual = r.manualObjectives.filter((o) => !o.included)
  if (unmanual.length) {
    warnings.push(
      `${unmanual.length} objective(s) in ${timeframe.name} have no externalRef (made in the UI) and are kept — pass --include-manual-objectives to delete them too`,
    )
  }

  const todoReasons: Record<string, DoomReason> = {}
  for (const [id, reason] of Array.from(cls.doomed.entries())) todoReasons[id] = reason

  return {
    timeframe,
    roots,
    todoReasons,
    preservedTodos: preservedRows.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      keyResultId: t.keyResultId,
      objectiveId: t.objectiveId,
      assignee: t.assignee?.name ?? null,
      creator: t.creator?.name ?? null,
      createdAt: t.createdAt,
    })),
    manualObjectives: r.manualObjectives,
    doomed: sim.doomed,
    fkDetached: sim.fkDetached,
    fkAudit: sim.audit.rows,
    polymorphic: poly.polymorphic,
    columnDetaches: poly.columnDetaches,
    metadataOnlyActivityLogs: poly.metadataOnlyActivityLogs,
    sentDigestRowsKept: poly.sentDigestRowsKept,
    blockers,
    warnings,
  }
}

/** Rows that disappear, per table (cascades included) plus the polymorphic deletes. */
export function deleteCounts(c: Collected): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [t, ids] of Object.entries(c.doomed)) out[t] = ids.length
  for (const [k, ids] of Object.entries(c.polymorphic)) {
    const table = POLY_TABLE[k as keyof PolymorphicDeletes]
    // Ids already counted through a cascade are not counted twice.
    const already = new Set(c.doomed[table] ?? [])
    const extra = (ids as string[]).filter((id) => !already.has(id)).length
    if (extra) out[table] = (out[table] ?? 0) + extra
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
}

export const POLY_TABLE: Record<keyof PolymorphicDeletes, string> = {
  notifications: 'notifications',
  emailDigestQueue: 'email_digest_queue',
  watchers: 'watchers',
  favorites: 'favorites',
  confidenceSnapshots: 'confidence_snapshots',
  okrReopenLogs: 'okr_reopen_logs',
  okrLinks: 'okr_links',
  workDependencyLinks: 'work_dependency_links',
  decisionLinks: 'decision_links',
  packageItemReviews: 'package_item_reviews',
  commentAttachments: 'comment_attachments',
}
