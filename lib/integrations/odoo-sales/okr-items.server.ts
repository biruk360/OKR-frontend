/**
 * Odoo sales sync — load each salesperson's OKR action items (server only).
 *
 *   TASK        open Todos the person is assignee or member of, due within 14 days (or overdue
 *               since the fiscal-year start — older leftovers belong to a closed year)
 *   CHECKPOINT  PENDING checkpoints due within 30 days (or overdue) on KRs the person owns
 *   KR_AT_RISK  active KRs the person owns with confidence AT_RISK or OFF_TRACK
 *
 * Private, archived and deleted OKRs (and Todos hanging off them) are left out,
 * so nothing private ever leaves the app in the Odoo payload.
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { absoluteUrl } from '@/lib/notifications/deep-link'
import { keyResultHref, todoHref } from '@/lib/connections/flags'
import { addDaysToKey, compareDateKeys, dateKeyInZone, storedDateKey } from '@/lib/kpi/periods'
import {
  CHECKPOINT_HORIZON_DAYS,
  dueStatus,
  rankOkrItems,
  TASK_HORIZON_DAYS,
  truncateTitle,
  type OkrActionItem,
} from './okr-items'

const VISIBLE_KR = { isPrivate: false, status: 'ACTIVE', archivedAt: null } satisfies Prisma.KeyResultWhereInput
const VISIBLE_OBJECTIVE = { isPrivate: false, status: 'ACTIVE', archivedAt: null } satisfies Prisma.ObjectiveWhereInput

/** Upper bound for a DB pre-filter: the day after `key`, 00:00Z plus a day of slack for timezones. */
function before(key: string): Date {
  return new Date(`${addDaysToKey(key, 2)}T00:00:00.000Z`)
}

export async function loadOkrActionItems(
  userIds: readonly string[],
  todayKey: string,
  timeZone: string,
  /** Ignore tasks due before this day (the fiscal-year start). */
  sinceKey: string,
): Promise<Map<string, OkrActionItem[]>> {
  const ids = [...new Set(userIds)]
  const out = new Map<string, OkrActionItem[]>(ids.map((id) => [id, []]))
  if (ids.length === 0) return out

  const taskLimitKey = addDaysToKey(todayKey, TASK_HORIZON_DAYS)
  const checkpointLimitKey = addDaysToKey(todayKey, CHECKPOINT_HORIZON_DAYS)

  const [todos, checkpoints, atRisk] = await Promise.all([
    prisma.todo.findMany({
      where: {
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        archivedAt: null,
        dueDate: { not: null, gte: new Date(`${addDaysToKey(sinceKey, -1)}T00:00:00.000Z`), lt: before(taskLimitKey) },
        OR: [{ assigneeId: { in: ids } }, { members: { some: { userId: { in: ids } } } }],
        AND: [
          { OR: [{ keyResultId: null }, { keyResult: { ...VISIBLE_KR, objective: VISIBLE_OBJECTIVE } }] },
          { OR: [{ objectiveId: null }, { objective: VISIBLE_OBJECTIVE }] },
        ],
      },
      select: { id: true, title: true, dueDate: true, assigneeId: true, members: { select: { userId: true } } },
    }),
    prisma.keyResultCheckpoint.findMany({
      where: {
        status: 'PENDING',
        dueDate: { lt: before(checkpointLimitKey) },
        keyResult: { ...VISIBLE_KR, ownerId: { in: ids }, objective: VISIBLE_OBJECTIVE },
      },
      select: { label: true, dueDate: true, targetText: true, keyResult: { select: { id: true, title: true, ownerId: true } } },
    }),
    prisma.keyResult.findMany({
      where: {
        ...VISIBLE_KR,
        ownerId: { in: ids },
        confidence: { in: ['AT_RISK', 'OFF_TRACK'] },
        closureStatus: { not: 'CLOSED' },
        objective: VISIBLE_OBJECTIVE,
      },
      select: { id: true, title: true, ownerId: true, confidence: true },
    }),
  ])

  const push = (userId: string, item: OkrActionItem) => out.get(userId)?.push(item)

  for (const todo of todos) {
    if (!todo.dueDate) continue
    const dueKey = dateKeyInZone(todo.dueDate, timeZone)
    if (compareDateKeys(dueKey, taskLimitKey) > 0 || compareDateKeys(dueKey, sinceKey) < 0) continue
    const item: OkrActionItem = {
      type: 'TASK',
      title: truncateTitle(todo.title),
      dueDate: dueKey,
      status: dueStatus(dueKey, todayKey),
      url: absoluteUrl(todoHref(todo.id)),
    }
    const people = new Set([todo.assigneeId, ...todo.members.map((m) => m.userId)])
    for (const id of ids) if (people.has(id)) push(id, item)
  }

  for (const cp of checkpoints) {
    // Checkpoint due dates are stored at UTC day edges (date-only).
    const dueKey = storedDateKey(cp.dueDate)
    if (compareDateKeys(dueKey, checkpointLimitKey) > 0) continue
    push(cp.keyResult.ownerId, {
      type: 'CHECKPOINT',
      title: truncateTitle(`${cp.label} checkpoint (${cp.targetText}): ${cp.keyResult.title}`),
      dueDate: dueKey,
      status: dueStatus(dueKey, todayKey),
      url: absoluteUrl(keyResultHref(cp.keyResult.id)),
    })
  }

  for (const kr of atRisk) {
    push(kr.ownerId, {
      type: 'KR_AT_RISK',
      title: truncateTitle(kr.title),
      dueDate: null,
      status: kr.confidence === 'OFF_TRACK' ? 'OFF_TRACK' : 'AT_RISK',
      url: absoluteUrl(keyResultHref(kr.id)),
    })
  }

  for (const [id, items] of out) out.set(id, rankOkrItems(items))
  return out
}
