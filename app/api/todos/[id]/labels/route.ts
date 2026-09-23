import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiForbidden, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import type { UserRole } from '@/types'
import { canAccessAttachmentScope } from '@/lib/attachments/access'

/**
 * Single-label add/remove (API-9). Same reasoning as members: the `labelIds`
 * full-array PATCH loses concurrent edits, because each client sends the whole
 * list as it last saw it.
 */
async function guard(todoId: string, session: { user: { id: string; role: string } }) {
  const allowed = await canAccessAttachmentScope('TODO', todoId, {
    id: session.user.id,
    role: session.user.role as UserRole,
  })
  return allowed ? null : apiForbidden('You do not have access to this card')
}

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')
  const denied = await guard(todoId, session)
  if (denied) return denied

  const { labelDefId } = await request.json().catch(() => ({})) as { labelDefId?: string }
  if (!labelDefId) return apiBadRequest('labelDefId is required')

  const def = await prisma.todoLabelDef.findUnique({ where: { id: labelDefId }, select: { id: true, name: true } })
  if (!def) return apiBadRequest('Unknown label')

  await prisma.todoLabel.upsert({
    where: { todoId_labelDefId: { todoId, labelDefId } },
    create: { todoId, labelDefId },
    update: {},
  })
  await recordActivity({
    entityType: 'TODO', todoId, action: 'INITIATIVE_LABEL_ADDED',
    actorId: session.user.id,
    metadata: { labelDefId, name: def.name },
  })
  return apiSuccess({ labelDefId: def.id, name: def.name })
})

export const DELETE = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')
  const denied = await guard(todoId, session)
  if (denied) return denied

  const labelDefId = new URL(request.url).searchParams.get('labelDefId')
  if (!labelDefId) return apiBadRequest('labelDefId is required')

  await prisma.todoLabel.deleteMany({ where: { todoId, labelDefId } })
  await recordActivity({
    entityType: 'TODO', todoId, action: 'INITIATIVE_LABEL_REMOVED',
    actorId: session.user.id,
    metadata: { labelDefId },
  })
  return apiSuccess({ removed: true })
})
