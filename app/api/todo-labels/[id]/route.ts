import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiForbidden, apiNotFound, withAuth } from '@/lib/api'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'
import { parseLabelInput } from '../validate'

// Role rules unchanged: PATCH is ADMIN/EXECUTIVE (loosening to sprint editors is
// decision A3 / API-11, still pending), DELETE is ADMIN only. The card modal
// hides the delete control for everyone else.

export const PATCH = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  if (session.user.role !== 'ADMIN' && session.user.role !== 'EXECUTIVE')
    return apiForbidden('Only admins can edit labels')
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid id')
  const body = await request.json().catch(() => null)
  const parsed = parseLabelInput(body, { partial: true })
  if (!parsed.ok) return apiBadRequest(parsed.error)
  const { name, color } = parsed.value

  const label = await prisma.todoLabelDef.findUnique({ where: { id } })
  if (!label) return apiNotFound('Label not found')

  const updated = await prisma.todoLabelDef.update({
    where: { id },
    data: { ...(name && { name }), ...(color && { color }) },
  })

  const changes: ChangeMap = {}
  if (updated.name !== label.name) changes.name = { from: label.name, to: updated.name }
  if (updated.color !== label.color) changes.color = { from: label.color, to: updated.color }
  if (Object.keys(changes).length > 0) {
    await recordActivity({
      entityType: 'TODO',
      action: 'UPDATED',
      actorId: session.user.id,
      changes,
      metadata: { subject: 'TODO_LABEL_DEF', labelDefId: id },
    })
  }
  return apiSuccess(updated)
})

export const DELETE = withAuth<RouteIdParams>(async (_req, { session, params }) => {
  if (session.user.role !== 'ADMIN') return apiForbidden('Only admins can delete labels')
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid id')
  const label = await prisma.todoLabelDef.findUnique({ where: { id } })
  if (!label) return apiNotFound('Label not found')
  const cardCount = await prisma.todoLabel.count({ where: { labelDefId: id } })
  await prisma.todoLabelDef.delete({ where: { id } })
  await recordActivity({
    entityType: 'TODO',
    action: 'DELETED',
    actorId: session.user.id,
    metadata: { subject: 'TODO_LABEL_DEF', labelDefId: id, name: label.name, color: label.color, cardCount },
  })
  return apiSuccess(null)
})
