import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import TodosPageClient, { type TodoRow, type KrOption, type ObjectiveOption, type UserOption } from '@/components/todos-page/TodosPageClient'

/**
 * Dedicated To-dos page. Shows all todos visible to the current user with rich
 * context (KR, objective, timeframe, owner, due date, status). Supports inline
 * creation with optional KR / Objective linking.
 *
 * Visibility: a todo is visible to the user when any of the following is true:
 *   - user is the assignee
 *   - user is the creator
 *   - user owns the KR the todo is linked to
 *   - user owns the objective the todo is linked to (directly or via KR)
 *   - user is ADMIN
 *
 * Non-admin non-self view is scoped at the DB level with an OR filter to avoid
 * shipping every row across the wire.
 */
export default async function TodosPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const userId = session.user.id
  const isAdmin = session.user.role === 'ADMIN'

  const visibilityWhere = isAdmin
    ? {}
    : {
        OR: [
          { assigneeId: userId },
          { creatorId: userId },
          { keyResult: { ownerId: userId } },
          { keyResult: { objective: { ownerId: userId } } },
          { objective: { ownerId: userId } },
        ],
      }

  const [todos, users, keyResults, objectives] = await Promise.all([
    prisma.todo.findMany({
      where: visibilityWhere,
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        creator: { select: { id: true, name: true, avatar: true } },
        keyResult: {
          select: {
            id: true,
            title: true,
            objective: {
              select: {
                id: true,
                title: true,
                level: true,
                timeframe: { select: { id: true, name: true } },
              },
            },
          },
        },
        objective: {
          select: {
            id: true,
            title: true,
            level: true,
            timeframe: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { updatedAt: 'desc' }],
      take: 500,
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, avatar: true },
      orderBy: { name: 'asc' },
    }),
    prisma.keyResult.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        title: true,
        objective: { select: { id: true, title: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    }),
    prisma.objective.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, title: true, level: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    }),
  ])

  const rows: TodoRow[] = todos.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    assignee: t.assignee,
    creator: t.creator,
    keyResultId: t.keyResultId,
    keyResult: t.keyResult
      ? {
          id: t.keyResult.id,
          title: t.keyResult.title,
          objective: {
            id: t.keyResult.objective.id,
            title: t.keyResult.objective.title,
            level: t.keyResult.objective.level,
            timeframeName: t.keyResult.objective.timeframe.name,
          },
        }
      : null,
    objectiveId: t.objectiveId,
    objective: t.objective
      ? {
          id: t.objective.id,
          title: t.objective.title,
          level: t.objective.level,
          timeframeName: t.objective.timeframe.name,
        }
      : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }))

  const userOptions: UserOption[] = users.map((u) => ({ id: u.id, name: u.name, avatar: u.avatar }))
  const krOptions: KrOption[] = keyResults.map((k) => ({
    id: k.id,
    title: k.title,
    objective: { id: k.objective.id, title: k.objective.title },
  }))
  const objectiveOptions: ObjectiveOption[] = objectives.map((o) => ({
    id: o.id,
    title: o.title,
    level: o.level,
  }))

  return (
    <TodosPageClient
      initialRows={rows}
      users={userOptions}
      keyResults={krOptions}
      objectives={objectiveOptions}
      currentUserId={userId}
    />
  )
}
