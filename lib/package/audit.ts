/**
 * Employee Operating Package — audit helpers (AUD-1 … AUD-3, PKG-3).
 *
 * `recordActivity` (lib/activity-log.ts) is the writer. These helpers add the
 * package metadata convention (`PackageActivityMetadata` in ./links) so every
 * row can be deep-linked to the right profile tab, and a field diff that works
 * for the package models (`diffEntity` in lib/activity-log.ts only knows the
 * Objective / KeyResult field lists).
 */
import { recordActivity, type ActivityAction, type ActivityEntityType, type ChangeMap } from '@/lib/activity-log'
import type { PackageActivityEntityType, PackageActivityMetadata } from './links'

type Snapshot = Record<string, unknown> | null | undefined

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (value === undefined) return null
  return value
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Pure: `{ field: { from, to } }` for every listed field that changed, or null. */
export function diffPackageFields(before: Snapshot, after: Snapshot, fields: readonly string[]): ChangeMap | null {
  if (!before || !after) return null
  const changes: ChangeMap = {}
  for (const field of fields) {
    const from = normalize(before[field])
    const to = normalize(after[field])
    if (!same(from, to)) changes[field] = { from, to }
  }
  return Object.keys(changes).length === 0 ? null : changes
}

export interface PackageActivityParams {
  entityType: PackageActivityEntityType
  action: ActivityAction
  /** The package entity's id (stored as metadata.entityId). */
  entityId: string
  /** The person whose package the entity belongs to (metadata.userId). */
  subjectUserId?: string | null
  timeframeId?: string | null
  packageId?: string | null
  actorId?: string | null
  changes?: ChangeMap | null
  /** PKG-3: set when the subject's package for the timeframe is APPROVED. */
  editedAfterApproval?: boolean
  /**
   * OKR item the entity hangs off. Written to the ActivityLog FK columns only
   * for OKR_LINK and KR_CHECKPOINT — the objective / KR activity panels list
   * rows by those columns, and package rows such as (sensitive) KPI readings
   * must not surface there. Other entity types keep the ids in metadata.
   */
  objectiveId?: string | null
  keyResultId?: string | null
  todoId?: string | null
  metadata?: Omit<PackageActivityMetadata, 'entityId' | 'userId'> | null
}

/** recordActivity's options: `client` (transaction) and `required`. */
type ActivityWriterOptions = NonNullable<Parameters<typeof recordActivity>[1]>

/** Entity types whose rows belong on the objective / KR activity panels. */
const OKR_SCOPED_TYPES: ReadonlySet<PackageActivityEntityType> = new Set<PackageActivityEntityType>(['OKR_LINK', 'KR_CHECKPOINT'])

/** Pure: the metadata object a package activity row stores. */
export function buildPackageActivityMetadata(params: PackageActivityParams): PackageActivityMetadata {
  const metadata: PackageActivityMetadata = { ...(params.metadata ?? {}), entityId: params.entityId }
  if (params.subjectUserId) metadata.userId = params.subjectUserId
  if (params.timeframeId) metadata.timeframeId = params.timeframeId
  if (params.packageId) metadata.packageId = params.packageId
  if (params.keyResultId && !metadata.keyResultId) metadata.keyResultId = params.keyResultId
  if (params.objectiveId && !metadata.objectiveId) metadata.objectiveId = params.objectiveId
  if (params.todoId && !metadata.todoId) metadata.todoId = params.todoId
  if (params.editedAfterApproval) metadata.editedAfterApproval = true
  return metadata
}

/** Append one package ActivityLog row with the shared metadata convention. */
export async function recordPackageActivity(
  params: PackageActivityParams,
  options: ActivityWriterOptions = {},
): Promise<void> {
  const okrScoped = OKR_SCOPED_TYPES.has(params.entityType)
  await recordActivity(
    {
      entityType: params.entityType as ActivityEntityType,
      action: params.action,
      actorId: params.actorId ?? null,
      objectiveId: okrScoped ? params.objectiveId ?? null : null,
      keyResultId: okrScoped ? params.keyResultId ?? null : null,
      todoId: okrScoped ? params.todoId ?? null : null,
      changes: params.changes ?? null,
      metadata: buildPackageActivityMetadata(params),
    },
    options,
  )
}

/**
 * Log an UPDATED (or STATUS_CHANGED when only `status` moved) row when any of
 * `fields` changed; no-op otherwise. Returns the change map it wrote.
 */
export async function recordPackageUpdateIfChanged(
  params: Omit<PackageActivityParams, 'action' | 'changes'> & {
    before: Snapshot
    after: Snapshot
    fields: readonly string[]
  },
  options: ActivityWriterOptions = {},
): Promise<ChangeMap | null> {
  const changes = diffPackageFields(params.before, params.after, params.fields)
  if (!changes) return null
  const keys = Object.keys(changes)
  const action: ActivityAction = keys.length === 1 && keys[0] === 'status' ? 'STATUS_CHANGED' : 'UPDATED'
  const { before: _before, after: _after, fields: _fields, ...rest } = params
  await recordPackageActivity({ ...rest, action, changes }, options)
  return changes
}
