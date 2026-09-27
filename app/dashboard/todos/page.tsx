import { notFound, redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { isClientPortalUser } from '@/lib/todos/visibility'
import { loadTodosPage } from '@/features/todos/services/todo-pages.server'
import TodosPageClient from '@/components/todos-page/TodosPageClient'

/**
 * Dedicated To-dos page. Shows all todos visible to the current user with rich
 * context (KR, objective, timeframe, owner, due date, status). Supports inline
 * creation with optional KR / Objective linking.
 *
 * Data + visibility (surface `todos`, CPM-2 + A6 record scope) live in
 * `features/todos/services/todo-pages.server.ts`.
 */
export default async function TodosPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  // Client-portal sessions never see internal to-dos (project invariant 4).
  if (isClientPortalUser(session.user)) notFound()

  const { rows, users, keyResults, objectives } = await loadTodosPage(session.user)

  return (
    <TodosPageClient
      initialRows={rows}
      users={users}
      keyResults={keyResults}
      objectives={objectives}
      currentUserId={session.user.id}
    />
  )
}
