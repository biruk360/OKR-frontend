/**
 * Recipient resolvers — one function per "role column" of the email matrix
 * (owner, manager, parent-owner, admins, watchers). The dispatcher composes
 * these per event.
 */

import { prisma } from '@/lib/prisma'

export async function resolveOwnersOfObjective(objectiveId: string): Promise<string[]> {
  const obj = await prisma.objective.findUnique({
    where: { id: objectiveId },
    select: { ownerId: true, contributors: { select: { userId: true } } },
  })
  if (!obj) return []
  return Array.from(new Set([obj.ownerId, ...obj.contributors.map((c) => c.userId)]))
}

export async function resolveOwnerOfKeyResult(keyResultId: string): Promise<string | null> {
  const kr = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    select: { ownerId: true },
  })
  return kr?.ownerId ?? null
}

export async function resolveManagersOf(userId: string): Promise<string[]> {
  const rels = await prisma.managerRelationship.findMany({
    where: { directReportId: userId, endedAt: null },
    select: { managerId: true },
  })
  return rels.map((r) => r.managerId)
}

export async function resolveParentObjectiveOwner(objectiveId: string): Promise<string | null> {
  const child = await prisma.objective.findUnique({
    where: { id: objectiveId },
    select: { parentObjectiveId: true },
  })
  if (!child?.parentObjectiveId) return null
  const parent = await prisma.objective.findUnique({
    where: { id: child.parentObjectiveId },
    select: { ownerId: true },
  })
  return parent?.ownerId ?? null
}

export async function resolveWatchers(entityType: 'OBJECTIVE' | 'KEY_RESULT' | 'TODO', entityId: string): Promise<string[]> {
  const rows = await prisma.watcher.findMany({
    where: { entityType, entityId },
    select: { userId: true },
  })
  return rows.map((r) => r.userId)
}

export async function resolveAdmins(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { isActive: true, role: { in: ['ADMIN', 'EXECUTIVE'] } },
    select: { id: true },
  })
  return rows.map((r) => r.id)
}

export async function resolveTeamMembers(departmentId: string): Promise<string[]> {
  const rows = await prisma.departmentMembership.findMany({
    where: { departmentId },
    select: { userId: true },
  })
  return rows.map((r) => r.userId)
}

export async function resolveAllActiveUsers(): Promise<string[]> {
  const rows = await prisma.user.findMany({ where: { isActive: true }, select: { id: true } })
  return rows.map((r) => r.id)
}

/** Unique, non-empty string array. */
export function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return Array.from(new Set(ids.filter((x): x is string => !!x)))
}

/**
 * Everyone who has interacted with a todo: current assignee, current members,
 * creator, comment authors, and @mention targets. Used to fan out
 * "activity on this card" notifications (date change, attachment, edit).
 */
export async function resolveTodoStakeholders(todoId: string): Promise<string[]> {
  const todo = await prisma.todo.findUnique({
    where: { id: todoId },
    select: {
      assigneeId: true,
      creatorId: true,
      members: { select: { userId: true } },
      todoComments: { select: { authorId: true } },
    },
  })
  if (!todo) return []
  const ids: Array<string | null | undefined> = [
    todo.assigneeId,
    todo.creatorId,
    ...todo.members.map((m: { userId: string }) => m.userId),
    ...todo.todoComments.map((c: { authorId: string }) => c.authorId),
  ]
  for (const w of await resolveWatchers('TODO', todoId)) ids.push(w)
  return uniqueIds(ids)
}
