import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { parseLabelInput } from './validate'

export const GET = withAuth(async () => {
  const labels = await prisma.todoLabelDef.findMany({ orderBy: { createdAt: 'asc' } })
  return apiSuccess(labels)
})

/**
 * Create a label in the shared palette. Any signed-in user may create one — the
 * Trello-parity spec keeps create/toggle in the card's label popover for every
 * board member (CDM-9); rename/recolor (PATCH) and delete stay privileged.
 */
export const POST = withAuth(async (request: NextRequest, { session }) => {
  const body = await request.json().catch(() => null)
  const parsed = parseLabelInput(body, { partial: false })
  if (!parsed.ok) return apiBadRequest(parsed.error)
  const name = parsed.value.name!

  const label = await prisma.todoLabelDef.create({
    data: { name, color: parsed.value.color ?? '#6366F1' },
  })
  // ActivityEntityType has no TODO_LABEL yet; filed under TODO with no todoId
  // and tagged in metadata so it never appears in a card's activity rail.
  await recordActivity({
    entityType: 'TODO',
    action: 'CREATED',
    actorId: session.user.id,
    metadata: { subject: 'TODO_LABEL_DEF', labelDefId: label.id, name: label.name, color: label.color },
  })
  return apiSuccess(label, { status: 201 })
})
