import { prisma } from '@/lib/prisma'

export type ActivityEntityType = 'OBJECTIVE' | 'KEY_RESULT'

export type ActivityAction =
  | 'CREATED'
  | 'UPDATED'
  | 'STATUS_CHANGED'
  | 'PROGRESS_UPDATED'
  | 'CHECKIN'
  | 'CHECKIN_REQUESTED'
  | 'COMPLETED'
  | 'ARCHIVED'
  | 'UNARCHIVED'
  | 'DELETED'
  | 'COMMENTED'
  | 'INITIATIVE_ADDED'
  | 'INITIATIVE_UPDATED'
  | 'INITIATIVE_REMOVED'
  | 'VIEWED'

export interface FieldChange {
  from: unknown
  to: unknown
}

export type ChangeMap = Record<string, FieldChange>

interface RecordParams {
  entityType: ActivityEntityType
  objectiveId?: string | null
  keyResultId?: string | null
  action: ActivityAction
  actorId?: string | null
  changes?: ChangeMap | null
  metadata?: Record<string, unknown> | null
}

/**
 * Append an activity log entry. Failures are swallowed and logged so logging never breaks
 * the calling mutation — the audit trail is best-effort.
 */
export async function recordActivity(params: RecordParams): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        entityType: params.entityType,
        objectiveId: params.objectiveId ?? null,
        keyResultId: params.keyResultId ?? null,
        action: params.action,
        actorId: params.actorId ?? null,
        // JSONB columns — Prisma stores the object directly. No JSON.stringify.
        changes: (params.changes ?? undefined) as any,
        metadata: (params.metadata ?? undefined) as any,
      },
    })
  } catch (err) {
    console.error('[activity-log] failed to record', { params, err })
  }
}

const TRACKED_OBJECTIVE_FIELDS = [
  'title',
  'description',
  'level',
  'status',
  'goalStatus',
  'progress',
  'isPrivate',
  'startDate',
  'endDate',
  'ownerId',
  'timeframeId',
  'departmentId',
  'parentObjectiveId',
  'alignmentType',
  'rollupCalculation',
  'checkInCadence',
] as const

const TRACKED_KEY_RESULT_FIELDS = [
  'title',
  'description',
  'startValue',
  'targetValue',
  'currentValue',
  'unit',
  'confidence',
  'progress',
  'status',
  'isPrivate',
  'ownerId',
  'objectiveId',
  'checkInCadence',
] as const

/**
 * Compute a change map between a "before" snapshot and an "after" snapshot.
 * Only fields in the tracked list are considered. Date values are normalized via toISOString
 * for stable comparison. Returns null if there are no changes.
 */
export function diffEntity(
  entityType: ActivityEntityType,
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): ChangeMap | null {
  if (!before || !after) return null
  const fields = entityType === 'OBJECTIVE' ? TRACKED_OBJECTIVE_FIELDS : TRACKED_KEY_RESULT_FIELDS
  const changes: ChangeMap = {}

  for (const field of fields) {
    const fromVal = normalizeValue(before[field])
    const toVal = normalizeValue(after[field])
    if (!isEqual(fromVal, toVal)) {
      changes[field] = { from: fromVal, to: toVal }
    }
  }
  return Object.keys(changes).length === 0 ? null : changes
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (value === undefined) return null
  return value
}

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Convenience: log an UPDATED activity if the diff produces any changes; otherwise no-op.
 */
export async function recordUpdateIfChanged(
  entityType: ActivityEntityType,
  ids: { objectiveId?: string | null; keyResultId?: string | null },
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  actorId: string | null,
): Promise<void> {
  const changes = diffEntity(entityType, before, after)
  if (!changes) return

  // Specialise: status / progress changes get their own action so the UI can highlight them.
  let action: ActivityAction = 'UPDATED'
  if ('status' in changes && Object.keys(changes).length === 1) action = 'STATUS_CHANGED'
  else if ('progress' in changes && Object.keys(changes).length === 1) action = 'PROGRESS_UPDATED'

  await recordActivity({
    entityType,
    objectiveId: ids.objectiveId,
    keyResultId: ids.keyResultId,
    action,
    actorId,
    changes,
  })
}

/**
 * Delete activity log rows older than `retentionDays` (default 540 = ~18 months).
 * Runs in batches so the table can be pruned without long lock contention.
 * Returns total rows deleted.
 */
export async function pruneActivityLog(opts: { retentionDays?: number; batchSize?: number } = {}): Promise<{
  deleted: number
  cutoff: string
}> {
  const retentionDays = opts.retentionDays ?? 540
  const batchSize = opts.batchSize ?? 5000
  const cutoff = new Date(Date.now() - retentionDays * 86400_000)
  let deleted = 0
  // Loop deleting in chunks (Prisma deleteMany doesn't take a LIMIT, so use raw SQL).
  for (;;) {
    const rows = await prisma.$executeRaw`
      DELETE FROM activity_logs
       WHERE id IN (
         SELECT id FROM activity_logs WHERE "createdAt" < ${cutoff} LIMIT ${batchSize}
       )
    `
    if (rows === 0) break
    deleted += rows
    if (rows < batchSize) break
  }
  return { deleted, cutoff: cutoff.toISOString() }
}
