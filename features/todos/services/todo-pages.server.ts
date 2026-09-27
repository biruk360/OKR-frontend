// Server-only: imports Prisma. Do not re-export from the features/todos
// barrel, which client components import. (The `server-only` package is not
// installed; this comment is the marker.)
/**
 * Data loaders for the To-dos page (/dashboard/todos) and the Work Board
 * (/dashboard/work). Moved verbatim from the pages (CLAUDE.md: routes are thin
 * composition) — the same queries, the same caps and the same visibility rules
 * (lib/todos/visibility.ts, surfaces `todos` and `work`, CPM-2 + A6 record
 * scope). The client-portal check stays in the pages, before these run.
 */

import { prisma } from '@/lib/prisma'
import { findTodosSurfaceRows, findWorkSurfaceRows, type VisibilityUser } from '@/lib/todos/visibility'
import type { TodoRow, KrOption, ObjectiveOption, UserOption } from '@/components/todos-page/TodosPageClient'

// ─── /dashboard/todos ───

/**
 * Visibility comes from `lib/todos/visibility.ts` (surface `todos`, CPM-2): ADMIN
 * sees everything; everyone else sees to-dos they are assignee / creator of, or
 * whose KR or objective they own — always ANDed with the user's `todo` record
 * scope (A6). The client refresh (`todo-store.fetchTodos()` →
 * `GET /api/todos?surface=todos`) uses the same query, row shape and 500 cap.
 */
export async function loadTodosPage(user: VisibilityUser) {
  const [rows, users, keyResults, objectives] = await Promise.all([
    findTodosSurfaceRows(prisma, user, 'todos'),
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

  return {
    rows: rows satisfies TodoRow[],
    users: userOptions,
    keyResults: krOptions,
    objectives: objectiveOptions,
  }
}

// ─── /dashboard/work ───

/**
 * Visibility comes from lib/todos/visibility.ts (surface `work`, CPM-2):
 * ADMIN/EXECUTIVE see everything; everyone else sees cards they are assignee,
 * creator or member of — ANDed with the user's `todo` record scope (A6).
 * WorkBoardClient refreshes from GET /api/todos?surface=work, the same query
 * and include, so members/labels/checklists survive a card edit.
 */
export async function loadWorkBoard(user: VisibilityUser) {
  const todos = await findWorkSurfaceRows(prisma, user)

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  })

  const labelDefs = await prisma.todoLabelDef.findMany({ orderBy: { createdAt: 'asc' } })

  return { todos, users, labelDefs }
}
