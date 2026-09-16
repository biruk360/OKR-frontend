import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiConflict,
  apiNotFound,
  withAuth,
} from '@/lib/api'
import { sprintEditGuard } from '@/lib/sprints/guards'
import { isBoardStatusKey } from '@/lib/sprints/columns'
import { recordActivity } from '@/lib/activity-log'

type ColParams = { id: string; colId: string } | Promise<{ id: string; colId: string }>

/**
 * PATCH /api/sprints/[id]/columns/[colId] — rename, recolor, reposition, or
 * remap a lane's status.
 *
 * Repositioning renumbers every sibling inside one transaction. The previous
 * implementation wrote `position` on a single row with no transaction, which
 * left duplicate positions and a non-deterministic lane order.
 *
 * Changing `statusKey` bulk-updates the status of every card in the lane — the
 * lane's status is the contract its cards live under, so leaving them behind
 * would silently break completion maths.
 */
export const PATCH = withAuth<ColParams>(async (request: NextRequest, { session, params }) => {
  const { id: sprintId, colId } = await resolveParams(params)
  if (!sprintId || !colId) return apiBadRequest('Invalid id')

  const denied = await sprintEditGuard(
    sprintId,
    { id: session.user.id, role: session.user.role },
    'Insufficient permissions to edit this sprint’s columns',
  )
  if (denied) return denied

  // The column must belong to the sprint in the URL — otherwise edit rights on
  // one sprint would let a caller rename another sprint's columns by id.
  const existing = await prisma.sprintColumn.findFirst({
    where: { id: colId, sprintId },
    select: { id: true, name: true, statusKey: true, position: true, archivedAt: true },
  })
  if (!existing) return apiNotFound('Column not found in this sprint')

  const body = await request.json()
  const data: Record<string, unknown> = {}

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return apiBadRequest('Column name cannot be empty')
    if (name.length > 60) return apiBadRequest('Column name must be 60 characters or fewer')
    data.name = name
  }
  if (typeof body.color === 'string' || body.color === null) data.color = body.color

  if (body.statusKey !== undefined) {
    if (!isBoardStatusKey(body.statusKey)) {
      return apiBadRequest('statusKey must be one of PENDING, IN_PROGRESS, IN_REVIEW, STUCK, COMPLETED')
    }
    data.statusKey = body.statusKey
  }

  const nextPosition = typeof body.position === 'number' ? Math.max(0, Math.trunc(body.position)) : null

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Remap cards first so no card is ever left pointing at a lane whose
      // status no longer matches its own.
      let remappedCards = 0
      if (data.statusKey && data.statusKey !== existing.statusKey) {
        const { count } = await tx.todo.updateMany({
          where: { sprintId, columnId: colId },
          data: { status: data.statusKey as string },
        })
        remappedCards = count
      }

      if (nextPosition !== null && nextPosition !== existing.position) {
        // Pull the lane out of the order, reinsert it at the target index, then
        // renumber the whole sprint so positions stay dense and unambiguous.
        const siblings = await tx.sprintColumn.findMany({
          where: { sprintId, archivedAt: null },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          select: { id: true },
        })
        const ordered = siblings.filter((c) => c.id !== colId).map((c) => c.id)
        ordered.splice(Math.min(nextPosition, ordered.length), 0, colId)
        for (let i = 0; i < ordered.length; i++) {
          await tx.sprintColumn.update({ where: { id: ordered[i] }, data: { position: i } })
        }
      }

      const column = Object.keys(data).length
        ? await tx.sprintColumn.update({ where: { id: colId }, data })
        : await tx.sprintColumn.findUniqueOrThrow({ where: { id: colId } })

      return { column, remappedCards }
    })

    if (data.name && data.name !== existing.name) {
      await recordActivity({
        entityType: 'SPRINT', sprintId, action: 'SPRINT_COLUMN_RENAMED',
        actorId: session.user.id,
        changes: { name: { from: existing.name, to: data.name } },
        metadata: { columnId: colId },
      })
    }
    if (data.statusKey && data.statusKey !== existing.statusKey) {
      await recordActivity({
        entityType: 'SPRINT', sprintId, action: 'SPRINT_COLUMN_STATUS_CHANGED',
        actorId: session.user.id,
        changes: { statusKey: { from: existing.statusKey, to: data.statusKey } },
        metadata: { columnId: colId, remappedCards: result.remappedCards },
      })
    }
    if (nextPosition !== null && nextPosition !== existing.position) {
      await recordActivity({
        entityType: 'SPRINT', sprintId, action: 'SPRINT_COLUMN_REORDERED',
        actorId: session.user.id,
        changes: { position: { from: existing.position, to: nextPosition } },
        metadata: { columnId: colId },
      })
    }

    return apiSuccess({ ...result.column, remappedCards: result.remappedCards })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return apiConflict('A column with that name already exists in this sprint')
    }
    throw err
  }
})

/**
 * DELETE /api/sprints/[id]/columns/[colId] — archive a lane (soft delete).
 *
 * The row is kept and `archivedAt` set, so cards that still reference it are
 * never orphaned by a dangling FK. Cards are re-homed to `?moveTo=<columnId>`
 * first; when the lane is empty no destination is needed.
 */
export const DELETE = withAuth<ColParams>(async (request: NextRequest, { session, params }) => {
  const { id: sprintId, colId } = await resolveParams(params)
  if (!sprintId || !colId) return apiBadRequest('Invalid id')

  const denied = await sprintEditGuard(
    sprintId,
    { id: session.user.id, role: session.user.role },
    'Insufficient permissions to delete this sprint’s columns',
  )
  if (denied) return denied

  const existing = await prisma.sprintColumn.findFirst({
    where: { id: colId, sprintId },
    select: { id: true, name: true },
  })
  if (!existing) return apiNotFound('Column not found in this sprint')

  const active = await prisma.sprintColumn.findMany({
    where: { sprintId, archivedAt: null },
    select: { id: true, statusKey: true },
  })
  // Every sprint needs at least one place to put cards.
  if (active.length <= 1) {
    return apiBadRequest('A sprint must have at least one column')
  }
  // …and at least one COMPLETED lane, or completion % and the end-sprint
  // disposition flow lose the place they put finished work.
  const remaining = active.filter((c) => c.id !== colId)
  if (!remaining.some((c) => c.statusKey === 'COMPLETED')) {
    return apiBadRequest('A sprint must keep at least one column mapped to Done')
  }

  const cardCount = await prisma.todo.count({ where: { sprintId, columnId: colId } })

  const moveTo = new URL(request.url).searchParams.get('moveTo')
  if (cardCount > 0 && !moveTo) {
    return apiBadRequest(
      `This column still holds ${cardCount} card${cardCount === 1 ? '' : 's'}. Pass ?moveTo=<columnId> to choose where they go.`,
    )
  }

  const destination = moveTo ? remaining.find((c) => c.id === moveTo) : null
  if (cardCount > 0 && !destination) {
    return apiBadRequest('moveTo must be another active column in this sprint')
  }

  await prisma.$transaction(async (tx) => {
    if (cardCount > 0 && destination) {
      const last = await tx.todo.findFirst({
        where: { sprintId, columnId: destination.id },
        orderBy: { sprintPosition: 'desc' },
        select: { sprintPosition: true },
      })
      let position = (last?.sprintPosition ?? 0) + 1000

      const moving = await tx.todo.findMany({
        where: { sprintId, columnId: colId },
        orderBy: [{ sprintPosition: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      })
      for (const card of moving) {
        await tx.todo.update({
          where: { id: card.id },
          data: {
            columnId: destination.id,
            // Cards adopt the destination lane's status — the lane is the
            // contract, so a card cannot sit in "Done" still marked PENDING.
            ...(destination.statusKey ? { status: destination.statusKey } : {}),
            sprintPosition: position,
          },
        })
        position += 1000
      }
    }
    await tx.sprintColumn.update({ where: { id: colId }, data: { archivedAt: new Date() } })
  })

  await recordActivity({
    entityType: 'SPRINT', sprintId, action: 'SPRINT_COLUMN_ARCHIVED',
    actorId: session.user.id,
    metadata: { columnId: colId, name: existing.name, movedCards: cardCount, movedTo: destination?.id ?? null },
  })

  return apiSuccess({ archived: true, movedCards: cardCount, movedTo: destination?.id ?? null })
})
