import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiForbidden, apiNotFound, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import {
  canEditKeyResultWithObjectiveContext,
  canEditObjective,
  canViewKeyResult,
  canViewObjective,
  type UserRole,
} from '@/lib/permissions'

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
const SEVERITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }

interface RiskActor {
  id: string
  role: string
}

/**
 * Object-level access to the risk's parent (objective or KR), resolved through
 * lib/permissions.ts. `canView` means viewable *without redaction* — a redacted
 * viewer sees neither risk details nor reporters. `canEdit` is the same edit
 * rule the objective / KR routes use. `found: false` for a missing parent.
 */
async function riskParentAccess(
  actor: RiskActor,
  parent: { objectiveId?: string; keyResultId?: string },
): Promise<{ found: boolean; canView: boolean; canEdit: boolean }> {
  const role = actor.role as UserRole
  if (parent.objectiveId) {
    const obj = await prisma.objective.findUnique({
      where: { id: parent.objectiveId },
      select: { level: true, ownerId: true, departmentId: true, isPrivate: true, status: true },
    })
    if (!obj || obj.status === 'DELETED') return { found: false, canView: false, canEdit: false }
    const v = await canViewObjective(role, actor.id, obj)
    const canView = v.canView && !v.isRedacted
    const canEdit = canView && (await canEditObjective(role, actor.id, obj))
    return { found: true, canView, canEdit }
  }
  if (parent.keyResultId) {
    const kr = await prisma.keyResult.findUnique({
      where: { id: parent.keyResultId },
      select: {
        ownerId: true, objectiveId: true, isPrivate: true, status: true,
        objective: { select: { level: true, ownerId: true, departmentId: true } },
      },
    })
    if (!kr || kr.status === 'DELETED') return { found: false, canView: false, canEdit: false }
    const v = await canViewKeyResult(role, actor.id, {
      ownerId: kr.ownerId, objectiveId: kr.objectiveId, isPrivate: kr.isPrivate,
    })
    const canView = v.canView && !v.isRedacted
    const canEdit =
      canView &&
      (await canEditKeyResultWithObjectiveContext(
        role, actor.id, { ownerId: kr.ownerId, objectiveId: kr.objectiveId }, kr.objective,
      ))
    return { found: true, canView, canEdit }
  }
  return { found: false, canView: false, canEdit: false }
}

export const GET = withAuth(async (req: NextRequest, { session }) => {
  const url = new URL(req.url)
  const objectiveId = url.searchParams.get('objectiveId') || undefined
  const keyResultId = url.searchParams.get('keyResultId') || undefined
  if (!objectiveId && !keyResultId) return apiBadRequest('objectiveId or keyResultId required')
  if (objectiveId && keyResultId) return apiBadRequest('Provide only one of objectiveId or keyResultId')

  // Unviewable (or redacted) parents answer like missing ones — no id probing.
  const access = await riskParentAccess(session.user, { objectiveId, keyResultId })
  if (!access.canView) return apiNotFound(objectiveId ? 'Objective not found' : 'Key result not found')

  const risks = await prisma.risk.findMany({
    where: { objectiveId, keyResultId },
    include: { reporter: { select: { id: true, name: true, avatar: true, email: true } } },
    orderBy: [{ createdAt: 'desc' }],
  })
  // Severity-rank sort (DESC), then createdAt DESC — done in JS since severity is stringly-typed
  risks.sort((a, b) => {
    const r = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0)
    if (r !== 0) return r
    return b.createdAt.getTime() - a.createdAt.getTime()
  })
  return apiSuccess(risks)
})

export const POST = withAuth(async (req: NextRequest, { session }) => {
  const body = await req.json()
  const { title, description, severity, mitigation, objectiveId, keyResultId } = body ?? {}

  if (!title?.trim()) return apiBadRequest('Title is required')
  if (!SEVERITIES.includes(severity)) return apiBadRequest('Invalid severity')
  if ((!objectiveId && !keyResultId) || (objectiveId && keyResultId)) {
    return apiBadRequest('Provide exactly one of objectiveId or keyResultId')
  }

  if (objectiveId != null && typeof objectiveId !== 'string') return apiBadRequest('Invalid objectiveId')
  if (keyResultId != null && typeof keyResultId !== 'string') return apiBadRequest('Invalid keyResultId')

  const access = await riskParentAccess(session.user, {
    objectiveId: objectiveId || undefined,
    keyResultId: keyResultId || undefined,
  })
  if (!access.canView) return apiNotFound(objectiveId ? 'Objective not found' : 'Key result not found')
  if (!access.canEdit) {
    return apiForbidden(`You cannot report risks on this ${objectiveId ? 'objective' : 'key result'}`)
  }

  const risk = await prisma.risk.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      severity,
      mitigation: mitigation?.trim() || null,
      objectiveId: objectiveId ?? null,
      keyResultId: keyResultId ?? null,
      reporterId: session.user.id,
    },
    include: { reporter: { select: { id: true, name: true, avatar: true, email: true } } },
  })

  await recordActivity({
    entityType: objectiveId ? 'OBJECTIVE' : 'KEY_RESULT',
    objectiveId: objectiveId ?? null,
    keyResultId: keyResultId ?? null,
    action: 'RISK_REPORTED',
    actorId: session.user.id,
    metadata: { riskId: risk.id, title: risk.title, severity: risk.severity },
  })

  return apiSuccess(risk, { status: 201 })
})
