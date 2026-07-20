import type { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiLocked } from '@/lib/api'

/**
 * Period-close lock guard.
 *
 * A CLOSED Objective/Key Result is immutable — including its entire check-in
 * history — until explicitly reopened. This is the SERVER-SIDE source of truth:
 * every mutating OKR endpoint calls one of these guards at the top and returns
 * the response if non-null. Hiding a button in the UI is NOT locking.
 *
 * The KR guard is transitive: a Key Result whose parent Objective is locked is
 * itself locked, even if the KR's own `isLocked` is false.
 *
 * See docs/okr_period_close_and_rollover_requirements.md §6 (Epic C).
 */

const lockedMessage = (kind: 'objective' | 'key result') =>
  `This ${kind} is closed and locked. Reopen it to make changes.`

/**
 * Returns a 423 response if the objective is locked, otherwise null.
 * A missing objective returns null (let the route's own 404 handling run).
 */
export async function objectiveLockResponse(objectiveId: string): Promise<NextResponse | null> {
  const obj = await prisma.objective.findUnique({
    where: { id: objectiveId },
    select: { isLocked: true },
  })
  if (obj?.isLocked) {
    return apiLocked(lockedMessage('objective'), {
      entityType: 'objective',
      entityId: objectiveId,
      reopenUrl: `/dashboard/objectives/${objectiveId}`,
    })
  }
  return null
}

/**
 * Returns a 423 response if the key result OR its parent objective is locked
 * (transitive), otherwise null. Also used to guard check-in writes, since a
 * check-in belongs to a KR.
 */
export async function keyResultLockResponse(keyResultId: string): Promise<NextResponse | null> {
  const kr = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    select: {
      isLocked: true,
      objectiveId: true,
      objective: { select: { id: true, isLocked: true } },
    },
  })
  if (!kr) return null
  if (kr.isLocked) {
    return apiLocked(lockedMessage('key result'), {
      entityType: 'keyResult',
      entityId: keyResultId,
      reopenUrl: `/dashboard/objectives/${kr.objectiveId}`,
    })
  }
  if (kr.objective?.isLocked) {
    return apiLocked(lockedMessage('objective'), {
      entityType: 'objective',
      entityId: kr.objective.id,
      reopenUrl: `/dashboard/objectives/${kr.objective.id}`,
    })
  }
  return null
}
