/**
 * Server helpers for the KR checkpoint routes (KRX-3/4). Private to
 * `app/api/keyresults/[id]/checkpoints/**` (the `_lib` folder is not routed).
 *
 * Access:
 *  - view: `canViewKeyResult` (lib/permissions.ts). A redacted viewer gets no
 *    checkpoints and no definition — both are KR content (CON-8).
 *  - edit: `canEditKeyResultWithObjectiveContext` — KR owner, ADMIN/EXEC, a
 *    DEPARTMENT_LEAD for a direct report, the objective owner and objective
 *    managers. Same rule as PATCH /api/keyresults/[id] (definition edits).
 *  - The period-close lock (423) is enforced by the routes via lib/okr/lock-guard.
 */
import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { canEditKeyResultWithObjectiveContext, canViewKeyResult } from '@/lib/permissions'
import { filterFieldsByPermLevel } from '@/lib/field-filter'
import { recordPackageActivity, recordPackageUpdateIfChanged } from '@/lib/package/audit'
import type { ActivityAction } from '@/lib/activity-log'
import { isCheckpointStatus, isKrCommitment, type CheckpointStatus } from '@/types/package'
import { normalizeKrDirection } from '@/lib/keyResultNumbers'
import { findNextCheckpoint, sortCheckpoints } from '@/features/key-results/components/checkpoints/checkpoint-utils'
import type {
  KrCheckpointDTO,
  KrCheckpointsPayload,
  KrDefinitionDTO,
} from '@/features/key-results/components/checkpoints/checkpoint-types'

/** Checkpoint columns compared for the UPDATED / STATUS_CHANGED audit row. */
export const CHECKPOINT_AUDIT_FIELDS = [
  'label',
  'dueDate',
  'targetText',
  'targetValue',
  'actualValue',
  'status',
] as const

const KR_SELECT = {
  id: true,
  title: true,
  ownerId: true,
  objectiveId: true,
  isPrivate: true,
  isLocked: true,
  status: true,
  unit: true,
  startValue: true,
  targetValue: true,
  currentValue: true,
  commitment: true,
  direction: true,
  baselineText: true,
  targetText: true,
  measuredBy: true,
  dueText: true,
  dueDate: true,
  objective: {
    select: { level: true, ownerId: true, departmentId: true, isLocked: true, timeframeId: true },
  },
} as const

export type CheckpointKr = NonNullable<Awaited<ReturnType<typeof loadCheckpointKr>>>

export async function loadCheckpointKr(keyResultId: string) {
  return prisma.keyResult.findUnique({ where: { id: keyResultId }, select: KR_SELECT })
}

export interface CheckpointAccess {
  canView: boolean
  isRedacted: boolean
  /** KR edit permission, ignoring the lock. */
  canEdit: boolean
  isLocked: boolean
}

export async function resolveCheckpointAccess(session: Session, kr: CheckpointKr): Promise<CheckpointAccess> {
  const role = session.user.role as Parameters<typeof canViewKeyResult>[0]
  const userId = session.user.id
  const isLocked = kr.isLocked || kr.objective.isLocked
  const visibility = await canViewKeyResult(role, userId, {
    ownerId: kr.ownerId,
    objectiveId: kr.objectiveId,
    isPrivate: kr.isPrivate,
  })
  if (!visibility.canView) return { canView: false, isRedacted: true, canEdit: false, isLocked }
  const canEdit = await canEditKeyResultWithObjectiveContext(
    role,
    userId,
    { ownerId: kr.ownerId, objectiveId: kr.objectiveId },
    { level: kr.objective.level, ownerId: kr.objective.ownerId, departmentId: kr.objective.departmentId },
  )
  return { canView: true, isRedacted: visibility.isRedacted, canEdit, isLocked }
}

type CheckpointRow = {
  id: string
  keyResultId: string
  label: string
  dueDate: Date
  targetText: string
  targetValue: number | null
  actualValue: number | null
  status: string
  reviewedAt: Date | null
  reviewedById: string | null
  createdAt: Date
  updatedAt: Date
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

export function toCheckpointDTO(row: CheckpointRow, names: Map<string, string | null>): KrCheckpointDTO {
  const status: CheckpointStatus = isCheckpointStatus(row.status) ? row.status : 'PENDING'
  return {
    id: row.id,
    keyResultId: row.keyResultId,
    label: row.label,
    dueDate: row.dueDate.toISOString(),
    targetText: row.targetText,
    targetValue: row.targetValue,
    actualValue: row.actualValue,
    status,
    reviewedAt: iso(row.reviewedAt),
    reviewedBy: row.reviewedById ? { id: row.reviewedById, name: names.get(row.reviewedById) ?? null } : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Reviewer display names for a set of checkpoint rows (one query). */
export async function reviewerNames(rows: readonly CheckpointRow[]): Promise<Map<string, string | null>> {
  const ids = Array.from(new Set(rows.map((r) => r.reviewedById).filter((v): v is string => !!v)))
  if (ids.length === 0) return new Map()
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
  return new Map(users.map((u) => [u.id, u.name]))
}

export async function checkpointDTOs(rows: readonly CheckpointRow[]): Promise<KrCheckpointDTO[]> {
  const names = await reviewerNames(rows)
  return sortCheckpoints(rows.map((r) => toCheckpointDTO(r, names)))
}

async function definitionFor(kr: CheckpointKr, userId: string): Promise<KrDefinitionDTO> {
  const raw: KrDefinitionDTO = {
    commitment: isKrCommitment(kr.commitment) ? kr.commitment : null,
    direction: normalizeKrDirection(kr.direction),
    baselineText: kr.baselineText,
    targetText: kr.targetText,
    measuredBy: kr.measuredBy,
    dueText: kr.dueText,
    dueDate: iso(kr.dueDate),
    startValue: kr.startValue,
    targetValue: kr.targetValue,
    currentValue: kr.currentValue,
    unit: kr.unit,
  }
  // Field-level perms on the key_result doctype, same as GET /api/keyresults/[id].
  const filtered = await filterFieldsByPermLevel(raw as unknown as Record<string, unknown>, 'key_result', userId)
  const out = { ...raw }
  for (const key of Object.keys(raw) as Array<keyof KrDefinitionDTO>) {
    if (!(key in filtered)) (out as Record<string, unknown>)[key] = null
  }
  if (out.direction == null) out.direction = 'INCREASE'
  return out
}

/** The full GET payload for a KR the viewer may see. */
export async function buildCheckpointsPayload(
  session: Session,
  kr: CheckpointKr,
  access: CheckpointAccess,
): Promise<KrCheckpointsPayload> {
  if (access.isRedacted) {
    return {
      keyResultId: kr.id,
      isRedacted: true,
      isLocked: access.isLocked,
      checkpoints: [],
      nextCheckpointId: null,
      definition: null,
      permissions: { canCreate: false, canEdit: false, canDelete: false, canEditDefinition: false },
    }
  }
  const rows = await prisma.keyResultCheckpoint.findMany({
    where: { keyResultId: kr.id },
    orderBy: [{ dueDate: 'asc' }, { label: 'asc' }],
  })
  const checkpoints = await checkpointDTOs(rows)
  const writable = access.canEdit && !access.isLocked && kr.status === 'ACTIVE'
  return {
    keyResultId: kr.id,
    isRedacted: false,
    isLocked: access.isLocked,
    checkpoints,
    nextCheckpointId: findNextCheckpoint(checkpoints)?.id ?? null,
    definition: await definitionFor(kr, session.user.id),
    permissions: {
      canCreate: writable,
      canEdit: writable,
      canDelete: writable,
      // PATCH /api/keyresults/[id] does not check KR status, only lock + edit.
      canEditDefinition: access.canEdit && !access.isLocked,
    },
  }
}

/** PKG-3: is the KR owner's operating package for this timeframe APPROVED? */
async function packageState(ownerId: string, timeframeId: string | null) {
  if (!timeframeId) return { packageId: null, approved: false }
  const pkg = await prisma.operatingPackage.findUnique({
    where: { userId_timeframeId: { userId: ownerId, timeframeId } },
    select: { id: true, status: true },
  })
  return { packageId: pkg?.id ?? null, approved: pkg?.status === 'APPROVED' }
}

interface AuditBase {
  kr: CheckpointKr
  checkpointId: string
  label: string
  actorId: string
}

function auditParams(base: AuditBase, pkg: { packageId: string | null; approved: boolean }) {
  return {
    entityType: 'KR_CHECKPOINT' as const,
    entityId: base.checkpointId,
    subjectUserId: base.kr.ownerId,
    timeframeId: base.kr.objective.timeframeId,
    packageId: pkg.packageId,
    actorId: base.actorId,
    keyResultId: base.kr.id,
    objectiveId: base.kr.objectiveId,
    editedAfterApproval: pkg.approved,
    metadata: { title: base.label },
  }
}

/** CREATED / DELETED row on the KR + objective activity panels. */
export async function auditCheckpointEvent(base: AuditBase, action: Extract<ActivityAction, 'CREATED' | 'DELETED'>) {
  const pkg = await packageState(base.kr.ownerId, base.kr.objective.timeframeId)
  await recordPackageActivity({ ...auditParams(base, pkg), action })
}

/** UPDATED (or STATUS_CHANGED) row when a tracked field changed; no-op otherwise. */
export async function auditCheckpointUpdate(
  base: AuditBase,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const pkg = await packageState(base.kr.ownerId, base.kr.objective.timeframeId)
  await recordPackageUpdateIfChanged({
    ...auditParams(base, pkg),
    before,
    after,
    fields: CHECKPOINT_AUDIT_FIELDS,
  })
}
