import { prisma } from '@/lib/prisma'
import { canViewObjective, canViewKeyResult } from '@/lib/permissions'
import type { UserRole } from '@/types'

/**
 * Comments are part of an OKR's content, so reading or posting them needs a
 * full (unredacted) view of the objective / key result. A redacted viewer sees
 * only that a private OKR exists — never its discussion. Missing, deleted and
 * unviewable entities all answer "not found" so ids can't be probed.
 */
export async function canAccessOkrComments(
  actor: { id: string; role: string },
  entity: 'OBJECTIVE' | 'KEY_RESULT',
  id: string,
): Promise<boolean> {
  if (entity === 'OBJECTIVE') {
    const objective = await prisma.objective.findUnique({
      where: { id },
      select: { level: true, ownerId: true, departmentId: true, isPrivate: true, status: true },
    })
    if (!objective || objective.status === 'DELETED') return false
    const v = await canViewObjective(actor.role as UserRole, actor.id, objective)
    return v.canView && !v.isRedacted
  }
  const keyResult = await prisma.keyResult.findUnique({
    where: { id },
    select: { ownerId: true, objectiveId: true, isPrivate: true },
  })
  if (!keyResult) return false
  const v = await canViewKeyResult(actor.role as UserRole, actor.id, keyResult)
  return v.canView && !v.isRedacted
}
