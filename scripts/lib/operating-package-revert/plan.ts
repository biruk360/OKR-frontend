/**
 * Operating-package revert — pure planning helpers (no database access).
 *
 *  - `classifyTodos`   which to-dos linked to the doomed OKRs / duties were made by the importer (and
 *                      are deleted) and which were made by a person in the UI (and are detached).
 *  - `metadataRefs`    which keys of a Notification / digest metadata JSON point at a doomed id.
 *  - `fkDisposition` / `auditForeignKeys`  what Postgres will do to rows outside the doomed set that
 *                      reference a doomed row, from the live pg_constraint rules.
 *  - `DELETE_STEPS` / `checkDeleteOrder`  the dependency-safe delete order and its validation.
 */

// ─── To-dos ─────────────────────────────────────────────────────────────────

export interface TodoCandidate {
  id: string
  externalRef: string | null
  dutyId: string | null
  recurrenceParentId: string | null
  keyResultId: string | null
  objectiveId: string | null
}

export type DoomReason = 'externalRef' | 'duty' | 'import-activity' | 'duty-head' | 'occurrence'

export interface TodoClassifyInput {
  candidates: TodoCandidate[]
  doomedKeyResultIds: ReadonlySet<string>
  doomedObjectiveIds: ReadonlySet<string>
  doomedDutyIds: ReadonlySet<string>
  /** To-dos the importer logged as created (ActivityLog metadata.source = 'import' for a doomed package). */
  importerTodoIds: ReadonlySet<string>
  /** RecurringDuty.todoHeadId of the doomed duties. */
  dutyHeadIds: ReadonlySet<string>
}

export interface TodoClassification {
  doomed: Map<string, DoomReason>
  /** Person-made to-dos linked to a doomed KR / objective: detached (keyResultId / objectiveId → null), kept. */
  preserved: TodoCandidate[]
  /** Candidates that are neither importer-made nor linked to a doomed OKR item (left alone). */
  untouched: TodoCandidate[]
}

/**
 * A to-do is importer-made when it carries an importer key (externalRef), belongs to a doomed duty,
 * was logged as created by the importer for a doomed package, is a doomed duty's head, or is a
 * generated recurrence occurrence of an importer-made to-do (recurrenceParentId, transitively).
 * Everything else that points at a doomed KR / objective was made by a person and is preserved.
 */
export function classifyTodos(input: TodoClassifyInput): TodoClassification {
  const doomed = new Map<string, DoomReason>()
  for (const c of input.candidates) {
    if (c.externalRef !== null && c.externalRef !== '') doomed.set(c.id, 'externalRef')
    else if (c.dutyId !== null && input.doomedDutyIds.has(c.dutyId)) doomed.set(c.id, 'duty')
    else if (input.dutyHeadIds.has(c.id)) doomed.set(c.id, 'duty-head')
    else if (input.importerTodoIds.has(c.id)) doomed.set(c.id, 'import-activity')
  }
  // Occurrences follow their recurrence root (fixed point: chains of any length).
  let grew = true
  while (grew) {
    grew = false
    for (const c of input.candidates) {
      if (doomed.has(c.id) || !c.recurrenceParentId) continue
      if (doomed.has(c.recurrenceParentId)) {
        doomed.set(c.id, 'occurrence')
        grew = true
      }
    }
  }
  const preserved: TodoCandidate[] = []
  const untouched: TodoCandidate[] = []
  for (const c of input.candidates) {
    if (doomed.has(c.id)) continue
    const linked =
      (c.keyResultId !== null && input.doomedKeyResultIds.has(c.keyResultId)) ||
      (c.objectiveId !== null && input.doomedObjectiveIds.has(c.objectiveId))
    if (linked) preserved.push(c)
    else untouched.push(c)
  }
  return { doomed, preserved, untouched }
}

// ─── Notification / digest metadata ─────────────────────────────────────────

/**
 * Keys of a metadata JSON (string or object) whose value is a doomed id. Top-level string values and
 * string arrays are checked (dispatcher rows carry `entityId`; importer and legacy rows carry
 * `packageId`, `objectiveId`, `keyResultId`, `todoId`, …). Unparseable metadata never matches.
 */
export function metadataRefs(metadata: unknown, doomed: ReadonlySet<string>): string[] {
  let obj: unknown = metadata
  if (typeof metadata === 'string') {
    try {
      obj = JSON.parse(metadata)
    } catch {
      return []
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return []
  const hits: string[] = []
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof value === 'string' && doomed.has(value)) hits.push(key)
    else if (Array.isArray(value) && value.some((v) => typeof v === 'string' && doomed.has(v))) hits.push(key)
  }
  return hits
}

// ─── Foreign keys ───────────────────────────────────────────────────────────

/** pg_constraint.confdeltype → what a DELETE of the referenced row does. */
export type FkDisposition = 'CASCADE' | 'SET_NULL' | 'SET_DEFAULT' | 'BLOCK'

export function fkDisposition(confdeltype: string): FkDisposition {
  switch (confdeltype) {
    case 'c':
      return 'CASCADE'
    case 'n':
      return 'SET_NULL'
    case 'd':
      return 'SET_DEFAULT'
    default:
      return 'BLOCK' // 'a' NO ACTION, 'r' RESTRICT
  }
}

export interface ForeignKey {
  /** Referencing table (e.g. "initiatives"). */
  table: string
  column: string
  /** Referenced table (e.g. "key_results"). */
  refTable: string
  confdeltype: string
}

export interface FkAuditRow extends ForeignKey {
  disposition: FkDisposition
  /** Rows outside the doomed set that reference a doomed row through this FK. */
  rows: number
  /** Set when an explicit step handles these rows before the delete (detach / delete). */
  handledBy: string | null
}

/**
 * Classify live FK counts. A BLOCK FK with rows that no step handles is a blocker (the delete would
 * fail); a SET_NULL FK detaches the rows; a CASCADE FK deletes them with the doomed row.
 */
export function auditForeignKeys(
  fks: ReadonlyArray<ForeignKey & { rows: number }>,
  handled: ReadonlyMap<string, string>,
): { rows: FkAuditRow[]; blockers: string[] } {
  const rows: FkAuditRow[] = fks.map((fk) => ({
    ...fk,
    disposition: fkDisposition(fk.confdeltype),
    handledBy: handled.get(`${fk.table}.${fk.column}`) ?? null,
  }))
  const blockers = rows
    .filter((r) => r.disposition === 'BLOCK' && r.rows > 0 && !r.handledBy)
    .map((r) => `${r.table}.${r.column} → ${r.refTable}: ${r.rows} row(s) would block the delete (ON DELETE RESTRICT / NO ACTION)`)
  return { rows, blockers }
}

// ─── Delete order ───────────────────────────────────────────────────────────

/** Tables deleted by id, in this order (detaches and polymorphic clean-up run before step 1). */
export const DELETE_STEPS = [
  'initiatives',
  'recurring_duties',
  'kpis',
  'development_items',
  'role_definitions',
  'work_dependencies',
  'decisions',
  'operating_packages',
  'key_results',
  'objectives',
] as const
export type DeleteTable = (typeof DELETE_STEPS)[number]

/**
 * A blocking FK (RESTRICT / NO ACTION) from one doomed table to another requires the referencing
 * table to be deleted first. Returns one message per violation (self-references are fine: one
 * DELETE removes parent and child together).
 */
export function checkDeleteOrder(order: readonly string[], fks: readonly ForeignKey[]): string[] {
  const pos = new Map(order.map((t, i) => [t, i] as const))
  const out: string[] = []
  for (const fk of fks) {
    if (fk.table === fk.refTable) continue
    const child = pos.get(fk.table)
    const parent = pos.get(fk.refTable)
    if (child === undefined || parent === undefined) continue
    if (fkDisposition(fk.confdeltype) === 'BLOCK' && child > parent) {
      out.push(`${fk.table}.${fk.column} blocks deleting ${fk.refTable}, but ${fk.table} is deleted after it`)
    }
  }
  return out
}

// ─── Misc ───────────────────────────────────────────────────────────────────

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk size must be positive')
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Order-independent fingerprint of an id manifest (used to detect changes between plan and apply). */
export function manifestFingerprint(manifest: Record<string, readonly string[]>): string {
  return Object.keys(manifest)
    .sort()
    .map((k) => `${k}:${[...manifest[k]].sort().join(',')}`)
    .join('|')
}

/** Default snapshot path in the working directory: operating-package-revert-snapshot-YYYYMMDD-HHMMSS.json. */
export function defaultSnapshotName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`
  return `operating-package-revert-snapshot-${stamp}.json`
}
