import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  canEditKeyResultWithObjectiveContext,
  canViewKeyResult,
  redactKeyResult,
} from '@/lib/permissions'
import { krProgressPercent, normalizeKrDirection, parseStartAndTarget } from '@/lib/keyResultNumbers'
import { KR_EXTENSION_KEYS, parseKrExtensionFields, type KrExtensionFields } from '@/lib/okr/kr-commitment'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { keyResultLockResponse } from '@/lib/okr/lock-guard'
import { recordActivity, recordUpdateIfChanged, type ChangeMap } from '@/lib/activity-log'
import { normalizeCadence } from '@/lib/check-in-cadence'
import {
  apiSuccess,
  apiBadRequest,
  apiConflict,
  apiForbidden,
  apiLocked,
  apiNotFound,
  withAuth,
} from '@/lib/api'
import { filterFieldsByPermLevel } from '@/lib/field-filter'
import { broadcastKeyResultEvent, broadcastObjectiveEvent } from '@/lib/pusher'
import { cleanupOkrNodeReferences } from '@/lib/okr-links/cleanup'
import { OKR_REALTIME_EVENTS } from '@/lib/okr/realtime'

type KrxData = Partial<NonNullable<KrExtensionFields>>

/**
 * Change map for the KRX fields, which `recordUpdateIfChanged` does not track
 * (its field list lives in lib/activity-log.ts). Dates compare as ISO strings.
 */
function krxChanges(before: Record<string, unknown>, after: Record<string, unknown>): ChangeMap | null {
  const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v ?? null)
  const out: ChangeMap = {}
  for (const key of KR_EXTENSION_KEYS) {
    const from = norm(before[key])
    const to = norm(after[key])
    if (from !== to) out[key] = { from, to } as ChangeMap[string]
  }
  return Object.keys(out).length > 0 ? out : null
}

/** 409 when `externalRef` is already used by another KR on `objectiveId` (unique per objective). */
async function externalRefConflict(objectiveId: string, externalRef: string | null | undefined, selfId: string) {
  if (!externalRef) return null
  const clash = await prisma.keyResult.findFirst({
    where: { objectiveId, externalRef, NOT: { id: selfId } },
    select: { id: true },
  })
  return clash ? apiConflict(`External reference "${externalRef}" is already used on this objective`) : null
}

export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid key result id')

  const keyResult = await prisma.keyResult.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      objective: {
        select: {
          id: true,
          title: true,
          level: true,
          ownerId: true,
          departmentId: true,
          isPrivate: true,
          timeframe: { select: { name: true, startDate: true, endDate: true } },
        },
      },
      todos: {
        include: {
          assignee: { select: { id: true, name: true, avatar: true } },
        },
      },
    },
  })

  if (!keyResult) return apiNotFound('Key result not found')

  const visibility = await canViewKeyResult(
    session.user.role as any,
    session.user.id,
    {
      ownerId: keyResult.ownerId,
      objectiveId: keyResult.objectiveId,
      isPrivate: keyResult.isPrivate,
    }
  )

  if (!visibility.canView) return apiForbidden('Access denied')

  let processedKeyResult = keyResult
  if (visibility.isRedacted) {
    // Initiative titles are KR content — a redacted viewer must not get them
    // (the full page hides them too; see key-result-detail.server.ts).
    processedKeyResult = { ...redactKeyResult(keyResult), todos: [] } as any
  }

  const filtered = await filterFieldsByPermLevel(
    processedKeyResult as unknown as Record<string, unknown>,
    'key_result',
    session.user.id,
  )
  // `isRedacted` lets clients (quick-view modal) hide private-only sections.
  return apiSuccess({ ...filtered, isRedacted: visibility.isRedacted })
})

export const PUT = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id: keyResultId } = await resolveParams(params)
  if (!keyResultId) return apiBadRequest('Invalid key result id')

  const body = await request.json()
  const {
    title,
    description,
    ownerId,
    startValue,
    targetValue,
    unit,
    isPrivate,
    checkInCadence: rawCadence,
    // Reparent ("Move"). Undefined = leave where it is; the route previously
    // ignored this field entirely, so the Move menu item had nothing to call.
    objectiveId: rawTargetObjectiveId,
  } = body
  const cadencePatch = rawCadence !== undefined ? { checkInCadence: normalizeCadence(rawCadence) } : null

  if (!title || !ownerId || targetValue === undefined || targetValue === null || targetValue === '') {
    return apiBadRequest('Title, owner, and target value are required')
  }

  // KRX fields are optional on PUT: keys not sent stay unchanged.
  const ext = parseKrExtensionFields(body)
  if (!ext.ok) return apiBadRequest(ext.message)

  const existingKeyResult = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    include: {
      objective: {
        include: { owner: { select: { id: true, name: true } } },
      },
      owner: { select: { id: true, name: true } },
    },
  })

  if (!existingKeyResult) return apiNotFound('Key result not found')

  // KRX-1: validate the numbers against the (possibly new) direction.
  const direction = normalizeKrDirection(ext.data.direction ?? existingKeyResult.direction)
  const bounds = parseStartAndTarget(startValue, targetValue, direction)
  if (!bounds.ok) return apiBadRequest(bounds.message)

  const locked = await keyResultLockResponse(keyResultId)
  if (locked) return locked

  const canEdit = await canEditKeyResultWithObjectiveContext(
    session.user.role as any,
    session.user.id,
    {
      ownerId: existingKeyResult.ownerId,
      objectiveId: existingKeyResult.objectiveId,
    },
    {
      level: existingKeyResult.objective.level,
      ownerId: existingKeyResult.objective.ownerId,
      departmentId: existingKeyResult.objective.departmentId,
    }
  )

  if (!canEdit) {
    return apiForbidden('Insufficient permissions to edit this key result')
  }

  const owner = await prisma.user.findUnique({ where: { id: ownerId } })
  if (!owner) return apiBadRequest('Invalid owner')

  // ── Move to another objective ──────────────────────────────────────────────
  // Permission is checked against BOTH ends: being allowed to edit a key result
  // where it currently sits does not imply being allowed to file it under an
  // objective you could not otherwise touch.
  const targetObjectiveId =
    rawTargetObjectiveId === undefined || rawTargetObjectiveId === null || rawTargetObjectiveId === ''
      ? null
      : String(rawTargetObjectiveId)
  const isMove = targetObjectiveId !== null && targetObjectiveId !== existingKeyResult.objectiveId

  if (isMove) {
    const target = await prisma.objective.findUnique({
      where: { id: targetObjectiveId },
      select: {
        id: true, status: true, level: true, ownerId: true,
        departmentId: true, timeframeId: true, isLocked: true, closureStatus: true,
      },
    })
    if (!target) return apiBadRequest('Invalid target objective')
    // FND-2: a closed / closing objective cannot gain key results — by create or by move.
    if (target.isLocked || target.closureStatus !== 'OPEN') {
      return apiLocked('The target objective is closed and locked. Reopen it to move key results into it.', {
        entityType: 'objective',
        entityId: target.id,
        reopenUrl: `/dashboard/objectives/${target.id}`,
      })
    }
    if (target.status !== 'ACTIVE') {
      return apiBadRequest('Target objective must be active (not archived or closed)')
    }
    // Mirrors the constraint the objective route applies to re-parenting: a key
    // result that jumped timeframes would move its progress out of the period it
    // was committed in, and the rollup it feeds is per-timeframe.
    if (target.timeframeId !== existingKeyResult.objective.timeframeId) {
      return apiBadRequest('Target objective must be in the same timeframe')
    }
    const canEditTarget = await canEditKeyResultWithObjectiveContext(
      session.user.role as any,
      session.user.id,
      { ownerId: existingKeyResult.ownerId, objectiveId: target.id },
      { level: target.level, ownerId: target.ownerId, departmentId: target.departmentId },
    )
    if (!canEditTarget) {
      return apiForbidden('Insufficient permissions on the target objective')
    }
  }

  // externalRef is unique per objective — check where the KR will live after a move.
  const refTargetObjectiveId = isMove ? (targetObjectiveId as string) : existingKeyResult.objectiveId
  const refToCheck = ext.data.externalRef !== undefined ? ext.data.externalRef : (isMove ? existingKeyResult.externalRef : null)
  const refClash = await externalRefConflict(refTargetObjectiveId, refToCheck, keyResultId)
  if (refClash) return refClash

  // Start/target/direction drive KR progress — recompute it when any of them moves.
  const numbersChanged =
    bounds.start !== existingKeyResult.startValue ||
    bounds.target !== existingKeyResult.targetValue ||
    direction !== normalizeKrDirection(existingKeyResult.direction)

  const result = await prisma.$transaction(async (tx) => {
    const updatedKeyResult = await tx.keyResult.update({
      where: { id: keyResultId },
      data: {
        title,
        description: description || '',
        ownerId,
        startValue: bounds.start,
        targetValue: bounds.target,
        unit: unit || '%',
        ...(isPrivate !== undefined && { isPrivate }),
        ...(cadencePatch && cadencePatch),
        ...(isMove && { objectiveId: targetObjectiveId as string }),
        ...ext.data,
        direction,
        ...(numbersChanged && {
          progress: krProgressPercent({
            startValue: bounds.start,
            targetValue: bounds.target,
            currentValue: existingKeyResult.currentValue,
            direction,
          }),
        }),
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
      },
    })

    // Invariant #9 — rollup runs in the same transaction as the mutation. A move
    // changes two trees, so BOTH must be recalculated here: recomputing only the
    // old parent would leave the new one showing a percentage that does not
    // include the key result it now owns.
    await recalcNodeAndAncestors(tx, existingKeyResult.objectiveId)
    if (isMove) await recalcNodeAndAncestors(tx, targetObjectiveId as string)
    return updatedKeyResult
  })

  await recordUpdateIfChanged(
    'KEY_RESULT',
    { keyResultId, objectiveId: existingKeyResult.objectiveId },
    existingKeyResult as unknown as Record<string, unknown>,
    result as unknown as Record<string, unknown>,
    session.user.id,
  )
  const krx = krxChanges(
    existingKeyResult as unknown as Record<string, unknown>,
    result as unknown as Record<string, unknown>,
  )
  if (krx) {
    await recordActivity({
      entityType: 'KEY_RESULT',
      keyResultId,
      objectiveId: result.objectiveId,
      action: 'UPDATED',
      actorId: session.user.id,
      changes: krx,
    })
  }

  // Start/target/direction changes move the KR's progress; everything else is a plain update.
  const progressMoved = numbersChanged
  broadcastKeyResultEvent(keyResultId, result.objectiveId, progressMoved ? OKR_REALTIME_EVENTS.KR_PROGRESS_CHANGED : OKR_REALTIME_EVENTS.UPDATED, session.user.id)
  if (isMove) broadcastObjectiveEvent(existingKeyResult.objectiveId, OKR_REALTIME_EVENTS.UPDATED, session.user.id)
  return apiSuccess(result, { message: 'Key Result updated successfully.' })
})

export const DELETE = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id: keyResultId } = await resolveParams(params)
  if (!keyResultId) return apiBadRequest('Invalid key result id')

  const existingKeyResult = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    include: {
      objective: {
        include: { owner: { select: { id: true, name: true } } },
      },
      owner: { select: { id: true, name: true } },
    },
  })

  if (!existingKeyResult) return apiNotFound('Key result not found')

  const locked = await keyResultLockResponse(keyResultId)
  if (locked) return locked

  // Only objective owner or admin can delete — KR owners cannot.
  const canDelete =
    session.user.role === 'ADMIN' ||
    session.user.id === existingKeyResult.objective.ownerId

  if (!canDelete) {
    return apiForbidden('Only objective owners and system administrators can delete key results')
  }

  const result = await prisma.$transaction(async (tx) => {
    // OkrLink / DecisionLink / WorkDependencyLink are polymorphic (no FKs), and
    // lineage (LNK-2) must be re-rooted: shared with the objective delete path.
    await cleanupOkrNodeReferences(tx, 'KEY_RESULT', [keyResultId])

    await tx.keyResult.delete({ where: { id: keyResultId } })
    await recalcNodeAndAncestors(tx, existingKeyResult.objectiveId)
    const remainingKeyResults = await tx.keyResult.count({
      where: {
        objectiveId: existingKeyResult.objectiveId,
        status: 'ACTIVE',
      },
    })
    return { remainingKeyResults }
  })

  await recordActivity({
    entityType: 'KEY_RESULT',
    objectiveId: existingKeyResult.objectiveId,
    action: 'DELETED',
    actorId: session.user.id,
    metadata: { keyResultId, title: existingKeyResult.title },
  })

  broadcastKeyResultEvent(keyResultId, existingKeyResult.objectiveId, OKR_REALTIME_EVENTS.DELETED, session.user.id)
  return apiSuccess(result, { message: 'Key Result deleted successfully.' })
})

/**
 * PATCH /api/keyresults/[id] — partial update of the KR extension fields (KRX):
 * commitment, direction, baselineText, targetText, measuredBy, dueText, dueDate,
 * externalRef, plus optional startValue / targetValue (needed when flipping
 * direction). Keys not sent stay unchanged; null / '' clears a text field.
 * Same lock guard and edit permission (KR owner + objective managers) as PUT.
 */
export const PATCH = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id: keyResultId } = await resolveParams(params)
  if (!keyResultId) return apiBadRequest('Invalid key result id')

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return apiBadRequest('Invalid request body')

  const ext = parseKrExtensionFields(body)
  if (!ext.ok) return apiBadRequest(ext.message)
  const data: KrxData = ext.data
  const sendsNumbers = 'startValue' in body || 'targetValue' in body
  if (Object.keys(data).length === 0 && !sendsNumbers) {
    return apiBadRequest('Nothing to update')
  }

  const existing = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    include: {
      objective: { select: { level: true, ownerId: true, departmentId: true } },
    },
  })
  if (!existing) return apiNotFound('Key result not found')

  const locked = await keyResultLockResponse(keyResultId)
  if (locked) return locked

  const canEdit = await canEditKeyResultWithObjectiveContext(
    session.user.role as any,
    session.user.id,
    { ownerId: existing.ownerId, objectiveId: existing.objectiveId },
    {
      level: existing.objective.level,
      ownerId: existing.objective.ownerId,
      departmentId: existing.objective.departmentId,
    },
  )
  if (!canEdit) return apiForbidden('Insufficient permissions to edit this key result')

  // KRX-1: start/target must stay consistent with the (possibly new) direction.
  const direction = normalizeKrDirection(data.direction ?? existing.direction)
  const rawBody = body as Record<string, unknown>
  const bounds = parseStartAndTarget(
    'startValue' in rawBody ? rawBody.startValue : existing.startValue,
    'targetValue' in rawBody ? rawBody.targetValue : existing.targetValue,
    direction,
  )
  if (!bounds.ok) return apiBadRequest(bounds.message)

  const refClash = await externalRefConflict(existing.objectiveId, data.externalRef, keyResultId)
  if (refClash) return refClash

  const numbersChanged =
    bounds.start !== existing.startValue ||
    bounds.target !== existing.targetValue ||
    direction !== normalizeKrDirection(existing.direction)

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.keyResult.update({
      where: { id: keyResultId },
      data: {
        ...data,
        direction,
        ...(numbersChanged && {
          startValue: bounds.start,
          targetValue: bounds.target,
          progress: krProgressPercent({
            startValue: bounds.start,
            targetValue: bounds.target,
            currentValue: existing.currentValue,
            direction,
          }),
        }),
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
      },
    })
    // Invariant #9 — rollup in the same transaction as the mutation.
    if (numbersChanged) await recalcNodeAndAncestors(tx, existing.objectiveId)
    return updated
  })

  // Core tracked fields (start/target/progress) via the shared diff, KRX fields on top.
  await recordUpdateIfChanged(
    'KEY_RESULT',
    { keyResultId, objectiveId: existing.objectiveId },
    existing as unknown as Record<string, unknown>,
    result as unknown as Record<string, unknown>,
    session.user.id,
  )
  const krx = krxChanges(existing as unknown as Record<string, unknown>, result as unknown as Record<string, unknown>)
  if (krx) {
    await recordActivity({
      entityType: 'KEY_RESULT',
      keyResultId,
      objectiveId: existing.objectiveId,
      action: 'UPDATED',
      actorId: session.user.id,
      changes: krx,
    })
  }

  broadcastKeyResultEvent(
    keyResultId,
    existing.objectiveId,
    numbersChanged ? OKR_REALTIME_EVENTS.KR_PROGRESS_CHANGED : OKR_REALTIME_EVENTS.UPDATED,
    session.user.id,
  )
  return apiSuccess(result, { message: 'Key Result updated successfully.' })
})
